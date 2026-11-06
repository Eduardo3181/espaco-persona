-- =====================================================================
-- Gestão financeira (só dono): contas, plano de contas, lançamentos
-- (contas a pagar e a receber) e metas.
-- Vendas, taxas e comissões NÃO são lançadas aqui: vêm das comandas e dos
-- pagamentos às profissionais, calculadas nas funções abaixo.
--   Resultado (lucro): pelo dia do atendimento / vencimento.
--   Dinheiro disponível: pelo dia em que o dinheiro entrou ou saiu,
--   somente a partir da data de início do controle.
-- =====================================================================

create type public.fin_grupo as enum (
  'receita', 'custo_variavel', 'despesa_fixa', 'investimento',
  'receita_nao_operacional', 'despesa_nao_operacional'
);

-- Data a partir da qual o dinheiro disponível é contado
alter table public.configuracoes add column fin_data_inicio date;

create table public.fin_contas (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null unique check (length(trim(nome)) > 0),
  saldo_inicial_centavos integer not null default 0,   -- pode ser negativo (conta no vermelho)
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now()
);

create table public.fin_categorias (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (length(trim(nome)) > 0),
  grupo     public.fin_grupo not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint fin_categorias_nome_unico unique (nome, grupo)
);

create table public.fin_lancamentos (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   uuid not null references public.fin_categorias (id) on delete restrict,
  conta_id       uuid references public.fin_contas (id) on delete restrict,
  descricao      text,
  valor_centavos integer not null check (valor_centavos > 0),
  vencimento     date not null,
  pagamento      date,           -- vazio = ainda não pago/recebido
  repeticao_id   uuid,           -- liga as parcelas de uma conta que se repete
  criado_por     uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index fin_lancamentos_vencimento_idx on public.fin_lancamentos (vencimento);
create index fin_lancamentos_pagamento_idx on public.fin_lancamentos (pagamento);
create index fin_lancamentos_categoria_idx on public.fin_lancamentos (categoria_id);

create trigger fin_lancamentos_atualizado_em
  before update on public.fin_lancamentos
  for each row execute function public.tocar_atualizado_em();
create trigger fin_lancamentos_auditoria
  after update or delete on public.fin_lancamentos
  for each row execute function public.registrar_auditoria();

create table public.fin_metas (
  id                        uuid primary key default gen_random_uuid(),
  ano                       integer not null unique check (ano between 2000 and 2100),
  meta_vendas_centavos      integer not null check (meta_vendas_centavos > 0),
  lucro_desejado_percentual numeric(5,2) not null check (lucro_desejado_percentual between 0 and 100),
  atualizado_em             timestamptz not null default now()
);
create trigger fin_metas_atualizado_em
  before update on public.fin_metas
  for each row execute function public.tocar_atualizado_em();

-- RLS: tudo só para o dono
alter table public.fin_contas      enable row level security;
alter table public.fin_categorias  enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_metas       enable row level security;

revoke all on public.fin_contas, public.fin_categorias, public.fin_lancamentos, public.fin_metas from anon;

create policy "dono gerencia contas" on public.fin_contas
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono gerencia plano de contas" on public.fin_categorias
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono gerencia lançamentos" on public.fin_lancamentos
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono gerencia metas" on public.fin_metas
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

-- ---------------------------------------------------------------------
-- O que vem sozinho das comandas e dos pagamentos, mês a mês.
-- faturamento/taxas/comissoes: pelo dia do atendimento.
-- recebido/taxas_caixa/pago_profissionais: dinheiro, desde o início do controle.
-- ---------------------------------------------------------------------
create function public.gestao_automaticos(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde date;
  v jsonb;
begin
  if not public.eh_dono() then
    raise exception 'A gestão financeira é só para o dono.' using errcode = 'P0001';
  end if;
  select fin_data_inicio into v_desde from public.configuracoes;

  with cmd as (
    select c.id, c.data_atendimento as dia, c.total_itens_centavos, c.total_taxas_centavos, c.total_comissoes_centavos
      from public.comandas c
     where c.status = 'fechada' and c.data_atendimento between p_inicio and p_fim
  ),
  linhas as (
    select to_char(dia, 'YYYY-MM') as mes,
           coalesce(total_itens_centavos, 0) as faturamento, coalesce(total_taxas_centavos, 0) as taxas,
           coalesce(total_comissoes_centavos, 0) as comissoes,
           0 as recebido,
           case when dia >= v_desde then coalesce(total_taxas_centavos, 0) else 0 end as taxas_caixa,
           0 as pago_profissionais
      from cmd
    union all
    select to_char(c.dia, 'YYYY-MM'), 0, 0, 0, g.valor_centavos, 0, 0
      from public.comanda_pagamentos g join cmd c on c.id = g.comanda_id
     where g.forma <> 'saldo' and c.dia >= v_desde
    union all  -- cliente que paga a conta ou deixa crédito (lançamento manual no saldo na casa)
    select to_char((m.criado_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM'), 0, 0, 0, m.valor_centavos, 0, 0
      from public.movimentos_saldo m
     where m.comanda_id is null and m.valor_centavos > 0
       and (m.criado_em at time zone 'America/Sao_Paulo')::date between greatest(p_inicio, v_desde) and p_fim
    union all
    select to_char(p.data_pagamento, 'YYYY-MM'), 0, 0, 0, 0, 0, p.total_pago_centavos
      from public.pagamentos_profissional p
     where p.data_pagamento between greatest(p_inicio, v_desde) and p_fim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', mes, 'faturamento', faturamento, 'taxas', taxas, 'comissoes', comissoes,
           'recebido', recebido, 'taxas_caixa', taxas_caixa, 'pago_profissionais', pago_profissionais
         ) order by mes), '[]')
    into v
    from (select mes, sum(faturamento)::bigint as faturamento, sum(taxas)::bigint as taxas, sum(comissoes)::bigint as comissoes,
                 sum(recebido)::bigint as recebido, sum(taxas_caixa)::bigint as taxas_caixa,
                 sum(pago_profissionais)::bigint as pago_profissionais
            from linhas group by mes) x;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- Dinheiro disponível ao final de um dia, e o que está pendente hoje.
-- ---------------------------------------------------------------------
create function public.gestao_posicao(p_data date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde date;
  v_saldo bigint := 0;
begin
  if not public.eh_dono() then
    raise exception 'A gestão financeira é só para o dono.' using errcode = 'P0001';
  end if;
  select fin_data_inicio into v_desde from public.configuracoes;

  if v_desde is not null then
    select coalesce(sum(saldo_inicial_centavos), 0) into v_saldo from public.fin_contas where ativo;

    if p_data >= v_desde then
      v_saldo := v_saldo
        + coalesce((select sum(g.valor_centavos) from public.comanda_pagamentos g join public.comandas c on c.id = g.comanda_id
                     where c.status = 'fechada' and g.forma <> 'saldo' and c.data_atendimento between v_desde and p_data), 0)
        - coalesce((select sum(c.total_taxas_centavos) from public.comandas c
                     where c.status = 'fechada' and c.data_atendimento between v_desde and p_data), 0)
        + coalesce((select sum(m.valor_centavos) from public.movimentos_saldo m
                     where m.comanda_id is null and m.valor_centavos > 0
                       and (m.criado_em at time zone 'America/Sao_Paulo')::date between v_desde and p_data), 0)
        - coalesce((select sum(p.total_pago_centavos) from public.pagamentos_profissional p
                     where p.data_pagamento between v_desde and p_data), 0)
        + coalesce((select sum(case when k.grupo in ('receita', 'receita_nao_operacional') then l.valor_centavos else -l.valor_centavos end)
                      from public.fin_lancamentos l join public.fin_categorias k on k.id = l.categoria_id
                     where l.pagamento between v_desde and p_data), 0);
    end if;
  end if;

  return jsonb_build_object(
    'inicio', v_desde,
    'saldo', v_saldo,
    'clientes_devendo', coalesce((select -sum(saldo_centavos) from public.saldos_clientes where saldo_centavos < 0), 0),
    'comissoes_a_pagar', coalesce((select sum(valor_centavos) from public.lancamentos_profissional where pagamento_id is null), 0)
  );
end;
$$;

revoke execute on function public.gestao_automaticos(date, date) from public, anon;
revoke execute on function public.gestao_posicao(date) from public, anon;
grant execute on function public.gestao_automaticos(date, date) to authenticated;
grant execute on function public.gestao_posicao(date) to authenticated;

-- ---------------------------------------------------------------------
-- Ponto de partida (o dono pode editar tudo em Gestão → Plano de contas)
-- ---------------------------------------------------------------------
insert into public.fin_contas (nome) values ('Caixa (dinheiro)');

insert into public.fin_categorias (nome, grupo) values
  ('Outras receitas', 'receita'),
  ('Produtos usados nos atendimentos', 'custo_variavel'),
  ('Produtos para revenda', 'custo_variavel'),
  ('Aluguel', 'despesa_fixa'),
  ('Condomínio', 'despesa_fixa'),
  ('Energia', 'despesa_fixa'),
  ('Água', 'despesa_fixa'),
  ('Internet e telefone', 'despesa_fixa'),
  ('Salários e encargos', 'despesa_fixa'),
  ('Pró-labore', 'despesa_fixa'),
  ('Contador', 'despesa_fixa'),
  ('Impostos', 'despesa_fixa'),
  ('Sistemas e assinaturas', 'despesa_fixa'),
  ('Marketing', 'despesa_fixa'),
  ('Limpeza e copa', 'despesa_fixa'),
  ('Manutenção', 'despesa_fixa'),
  ('Outras despesas', 'despesa_fixa'),
  ('Equipamentos e móveis', 'investimento'),
  ('Reforma', 'investimento'),
  ('Rendimentos e outras entradas', 'receita_nao_operacional'),
  ('Juros, multas e tarifas', 'despesa_nao_operacional');
