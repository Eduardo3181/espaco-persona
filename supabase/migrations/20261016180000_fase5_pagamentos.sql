-- =====================================================================
-- Espaço Persona — Fase 5 (Pagamento de comissões)
-- O salão não usa vales: paga comissões + caixinhas por período
-- (1–15, pago no dia 16; 16–fim do mês, pago no dia 1).
-- =====================================================================

create table public.pagamentos_profissional (
  id                       uuid primary key default gen_random_uuid(),
  profissional_id          uuid not null references public.profissionais (id) on delete restrict,
  periodo_inicio           date not null,
  periodo_fim              date not null,
  data_pagamento           date not null default public.hoje_sp(),
  forma                    text not null check (forma in ('pix', 'dinheiro', 'transferencia')),
  total_comissoes_centavos integer not null,
  total_caixinhas_centavos integer not null,
  total_pago_centavos      integer not null,
  observacao               text,
  pago_por                 uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em                timestamptz not null default now(),
  constraint pagamentos_periodo check (periodo_fim >= periodo_inicio)
);
create index pagamentos_profissional_idx on public.pagamentos_profissional (profissional_id, periodo_inicio desc);

alter table public.lancamentos_profissional
  add constraint lancamentos_pagamento_fk foreign key (pagamento_id)
  references public.pagamentos_profissional (id) on delete set null;
create index lancamentos_pendentes_idx on public.lancamentos_profissional (data) where pagamento_id is null;

create trigger pagamentos_profissional_auditoria
  after insert or update or delete on public.pagamentos_profissional
  for each row execute function public.registrar_auditoria();

alter table public.pagamentos_profissional enable row level security;
revoke all on public.pagamentos_profissional from anon;

create policy "pagamentos: dono tudo, profissional os próprios" on public.pagamentos_profissional
  for select to authenticated using (public.eh_dono() or profissional_id = public.meu_profissional_id());
create policy "pagamentos: só o dono registra" on public.pagamentos_profissional
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

-- ---------------------------------------------------------------------
-- Registrar pagamento: dá baixa em tudo o que está pendente no período.
-- ---------------------------------------------------------------------
create function public.registrar_pagamento(
  p_profissional_id uuid, p_inicio date, p_fim date, p_data date, p_forma text, p_observacao text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_com integer; v_cx integer; v_id uuid;
begin
  if not public.eh_dono() then raise exception 'Só o dono registra pagamentos.' using errcode = 'P0001'; end if;

  select coalesce(sum(valor_centavos) filter (where tipo = 'comissao'), 0),
         coalesce(sum(valor_centavos) filter (where tipo = 'caixinha'), 0)
    into v_com, v_cx
    from public.lancamentos_profissional
   where profissional_id = p_profissional_id and pagamento_id is null and data between p_inicio and p_fim;

  if v_com = 0 and v_cx = 0 then
    raise exception 'Não há nada pendente neste período para esta profissional.' using errcode = 'P0001';
  end if;

  insert into public.pagamentos_profissional
    (profissional_id, periodo_inicio, periodo_fim, data_pagamento, forma,
     total_comissoes_centavos, total_caixinhas_centavos, total_pago_centavos, observacao)
  values (p_profissional_id, p_inicio, p_fim, coalesce(p_data, public.hoje_sp()), p_forma,
          v_com, v_cx, v_com + v_cx, nullif(trim(p_observacao), ''))
  returning id into v_id;

  update public.lancamentos_profissional set pagamento_id = v_id
   where profissional_id = p_profissional_id and pagamento_id is null and data between p_inicio and p_fim;

  return v_id;
end;
$$;

-- Desfazer pagamento lançado por engano (fica no log de auditoria)
create function public.desfazer_pagamento(p_pagamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.eh_dono() then raise exception 'Só o dono pode desfazer pagamentos.' using errcode = 'P0001'; end if;
  update public.lancamentos_profissional set pagamento_id = null where pagamento_id = p_pagamento_id;
  delete from public.pagamentos_profissional where id = p_pagamento_id;
  if not found then raise exception 'Pagamento não encontrado.' using errcode = 'P0001'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Extrato com o nome da cliente. A profissional só consulta o próprio.
-- ---------------------------------------------------------------------
create function public.extrato_profissional(p_profissional_id uuid, p_inicio date, p_fim date)
returns table (
  id uuid, data date, tipo public.tipo_lancamento, descricao text, valor_centavos integer,
  cliente_nome text, comanda_numero integer, pagamento_id uuid, data_pagamento date
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.data, l.tipo, l.descricao, l.valor_centavos, cl.nome, c.numero, l.pagamento_id, pg.data_pagamento
    from public.lancamentos_profissional l
    left join public.comandas c on c.id = l.comanda_id
    left join public.clientes cl on cl.id = c.cliente_id
    left join public.pagamentos_profissional pg on pg.id = l.pagamento_id
   where l.profissional_id = p_profissional_id
     and l.data between p_inicio and p_fim
     and (public.eh_dono() or p_profissional_id = public.meu_profissional_id())
   order by l.data, l.criado_em
$$;

-- Extrato de um pagamento já feito
create function public.extrato_pagamento(p_pagamento_id uuid)
returns table (
  id uuid, data date, tipo public.tipo_lancamento, descricao text, valor_centavos integer,
  cliente_nome text, comanda_numero integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.data, l.tipo, l.descricao, l.valor_centavos, cl.nome, c.numero
    from public.lancamentos_profissional l
    left join public.comandas c on c.id = l.comanda_id
    left join public.clientes cl on cl.id = c.cliente_id
   where l.pagamento_id = p_pagamento_id
     and (public.eh_dono() or l.profissional_id = public.meu_profissional_id())
   order by l.data, l.criado_em
$$;

revoke execute on function public.registrar_pagamento(uuid, date, date, date, text, text) from public, anon;
revoke execute on function public.desfazer_pagamento(uuid) from public, anon;
revoke execute on function public.extrato_profissional(uuid, date, date) from public, anon;
revoke execute on function public.extrato_pagamento(uuid) from public, anon;
grant execute on function public.registrar_pagamento(uuid, date, date, date, text, text) to authenticated;
grant execute on function public.desfazer_pagamento(uuid) to authenticated;
grant execute on function public.extrato_profissional(uuid, date, date) to authenticated;
grant execute on function public.extrato_pagamento(uuid) to authenticated;
