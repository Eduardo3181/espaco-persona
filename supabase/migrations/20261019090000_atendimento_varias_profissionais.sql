-- =====================================================================
-- Um atendimento com várias profissionais (ex.: cabelo + manicure).
-- Cada profissional tem o próprio agendamento (na própria coluna e
-- horário); eles ficam ligados por "grupo_atendimento" e geram UMA comanda.
-- =====================================================================

alter table public.agendamentos add column grupo_atendimento uuid;
create index agendamentos_grupo_atendimento_idx on public.agendamentos (grupo_atendimento) where grupo_atendimento is not null;

alter table public.comandas add column grupo_atendimento uuid;
create index comandas_grupo_atendimento_idx on public.comandas (grupo_atendimento) where grupo_atendimento is not null;

-- ---------------------------------------------------------------------
-- Criar o atendimento com um ou mais blocos (profissional + hora + serviços)
-- p_blocos: [{"profissional_id": "...", "inicio": "2026-10-20T10:00:00-03:00",
--             "duracao_min": 60, "servicos": ["uuid", ...]}, ...]
-- Roda com as permissões de quem chama: a profissional só cria na própria coluna.
-- ---------------------------------------------------------------------
create function public.criar_atendimento(p_cliente_id uuid, p_observacao text, p_blocos jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bloco jsonb;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_grupo uuid;
begin
  if coalesce(jsonb_array_length(p_blocos), 0) = 0 then
    raise exception 'Inclua pelo menos uma profissional.' using errcode = 'P0001';
  end if;

  for v_bloco in select * from jsonb_array_elements(p_blocos) loop
    v_id := public.salvar_agendamento(
      null,
      (v_bloco->>'profissional_id')::uuid,
      p_cliente_id,
      (v_bloco->>'inicio')::timestamptz,
      (v_bloco->>'duracao_min')::integer,
      array(select jsonb_array_elements_text(v_bloco->'servicos'))::uuid[],
      p_observacao
    );
    v_ids := v_ids || v_id;
  end loop;

  if array_length(v_ids, 1) > 1 then
    v_grupo := gen_random_uuid();
    update public.agendamentos set grupo_atendimento = v_grupo where id = any(v_ids);
  end if;
  return v_ids;
end;
$$;
revoke execute on function public.criar_atendimento(uuid, text, jsonb) from public, anon;
grant execute on function public.criar_atendimento(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Abrir comanda: se o agendamento faz parte de um atendimento ligado,
-- a comanda é única e recebe os serviços de todas as profissionais.
-- ---------------------------------------------------------------------
create or replace function public.abrir_comanda(p_cliente_id uuid, p_agendamento_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos;
  v_id uuid;
begin
  if not public.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = 'P0001';
  end if;

  if p_agendamento_id is null then
    insert into public.comandas (cliente_id) values (p_cliente_id) returning id into v_id;
    return v_id;
  end if;

  select * into v_ag from public.agendamentos where id = p_agendamento_id and tipo = 'atendimento' for update;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0001';
  end if;
  if not public.eh_dono() and v_ag.profissional_id is distinct from public.meu_profissional_id() then
    raise exception 'Este agendamento é de outra profissional.' using errcode = 'P0001';
  end if;

  -- Comanda já aberta para este agendamento ou para o mesmo atendimento
  select id into v_id from public.comandas
   where status <> 'cancelada'
     and (agendamento_id = p_agendamento_id
          or (v_ag.grupo_atendimento is not null and grupo_atendimento = v_ag.grupo_atendimento))
   order by aberta_em limit 1;
  if found then
    update public.agendamentos set status = 'em_atendimento'
     where id = p_agendamento_id and status in ('aguardando', 'confirmado');
    return v_id;
  end if;

  if v_ag.status in ('cancelado', 'faltou') then
    raise exception 'Agendamento desmarcado: reative antes de abrir a comanda.' using errcode = 'P0001';
  end if;

  insert into public.comandas (cliente_id, agendamento_id, grupo_atendimento)
  values (v_ag.cliente_id, v_ag.id, v_ag.grupo_atendimento) returning id into v_id;

  -- Serviços deste agendamento e dos agendamentos ligados (que não foram desmarcados)
  insert into public.comanda_itens (comanda_id, tipo, servico_id, descricao, profissional_id, quantidade, valor_unitario_centavos)
  select v_id, 'servico', s.id, s.nome, a.profissional_id, 1, s.preco_centavos
    from public.agendamentos a
    join public.agendamento_servicos x on x.agendamento_id = a.id
    join public.servicos s on s.id = x.servico_id
   where (a.id = v_ag.id
          or (v_ag.grupo_atendimento is not null and a.grupo_atendimento = v_ag.grupo_atendimento
              and a.status in ('aguardando', 'confirmado', 'em_atendimento')))
   order by a.inicio, x.ordem;

  update public.agendamentos set status = 'em_atendimento'
   where id = v_ag.id
      or (v_ag.grupo_atendimento is not null and grupo_atendimento = v_ag.grupo_atendimento
          and status in ('aguardando', 'confirmado'));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Ao fechar / reabrir / cancelar a comanda, os outros horários do
-- mesmo atendimento acompanham o status.
-- ---------------------------------------------------------------------
create function public.sincronizar_agendamentos_do_grupo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.grupo_atendimento is null then return null; end if;

  if new.status = 'fechada' then
    update public.agendamentos set status = 'concluido'
     where grupo_atendimento = new.grupo_atendimento and status = 'em_atendimento';
  elsif old.status = 'fechada' and new.status = 'aberta' then
    update public.agendamentos set status = 'em_atendimento'
     where grupo_atendimento = new.grupo_atendimento and status = 'concluido';
  elsif new.status = 'cancelada' then
    update public.agendamentos set status = 'confirmado'
     where grupo_atendimento = new.grupo_atendimento and status = 'em_atendimento';
  end if;
  return null;
end;
$$;
revoke execute on function public.sincronizar_agendamentos_do_grupo() from public, anon, authenticated;

create trigger comandas_sincronizar_grupo
  after update of status on public.comandas
  for each row when (old.status is distinct from new.status)
  execute function public.sincronizar_agendamentos_do_grupo();
