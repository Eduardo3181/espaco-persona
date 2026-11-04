-- =====================================================================
-- Comanda lançada com atraso: faturamento, comissões e caixinhas valem
-- para o dia do atendimento, não para o dia em que a comanda foi fechada.
-- Com agendamento: o dia da agenda (nunca no futuro).
-- Avulsa: a data informada ao fechar (padrão: hoje).
-- =====================================================================

alter table public.comandas add column data_atendimento date;
update public.comandas
   set data_atendimento = (fechada_em at time zone 'America/Sao_Paulo')::date
 where status = 'fechada';
alter table public.comandas add constraint comandas_fechada_tem_data
  check (status <> 'fechada' or data_atendimento is not null);
create index comandas_data_atendimento_idx on public.comandas (data_atendimento) where status = 'fechada';

drop function public.fechar_comanda(uuid, jsonb, jsonb);

create function public.fechar_comanda(p_comanda_id uuid, p_caixinhas jsonb, p_pagamentos jsonb, p_data_atendimento date default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_c public.comandas;
  v_cfg public.configuracoes;
  v_hoje date := public.hoje_sp();
  v_dia date;
  v_itens integer;
  v_caixinhas integer;
  v_pago integer;
  v_taxas integer;
  v_taxa_cartao numeric;
  v_item record;
  v_pct numeric;
  v_com integer;
begin
  if not public.eh_dono() then raise exception 'Só o dono pode fechar a comanda.' using errcode = 'P0001'; end if;
  perform public.salvar_caixinhas_pagamentos(p_comanda_id, p_caixinhas, p_pagamentos);

  select * into v_c from public.comandas where id = p_comanda_id for update;
  select * into v_cfg from public.configuracoes limit 1;

  -- Dia do atendimento: o da agenda (nunca no futuro) ou o informado na comanda avulsa
  select least((a.inicio at time zone 'America/Sao_Paulo')::date, v_hoje) into v_dia
    from public.agendamentos a where a.id = v_c.agendamento_id;
  if v_dia is null then
    v_dia := coalesce(p_data_atendimento, v_c.data_atendimento, v_hoje);
    if v_dia > v_hoje then
      raise exception 'A data do atendimento não pode ser no futuro.' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(sum(valor_total_centavos), 0), count(*) into v_itens, v_com from public.comanda_itens where comanda_id = p_comanda_id;
  if v_com = 0 then raise exception 'A comanda não tem itens.' using errcode = 'P0001'; end if;
  select coalesce(sum(valor_centavos), 0) into v_caixinhas from public.comanda_caixinhas where comanda_id = p_comanda_id;
  select coalesce(sum(valor_centavos), 0) into v_pago from public.comanda_pagamentos where comanda_id = p_comanda_id;

  if v_pago <> v_itens + v_caixinhas then
    raise exception 'Os pagamentos (R$ %) não fecham com o total (R$ %).',
      replace(to_char(v_pago / 100.0, 'FM9999990.00'), '.', ','), replace(to_char((v_itens + v_caixinhas) / 100.0, 'FM9999990.00'), '.', ',')
      using errcode = 'P0001';
  end if;
  if v_c.cliente_id is null and exists (select 1 from public.comanda_pagamentos where comanda_id = p_comanda_id and forma = 'saldo') then
    raise exception 'Para usar o saldo na casa, a comanda precisa ter cliente.' using errcode = 'P0001';
  end if;

  -- Taxas da maquininha
  update public.comanda_pagamentos g
     set taxa_percentual = case g.forma
           when 'credito' then case g.parcelas
             when 1 then v_cfg.taxa_credito when 2 then v_cfg.taxa_credito_2x
             when 3 then v_cfg.taxa_credito_3x when 4 then v_cfg.taxa_credito_4x end
           when 'debito' then v_cfg.taxa_debito
           when 'pix' then v_cfg.taxa_pix else 0 end
   where g.comanda_id = p_comanda_id;
  if exists (select 1 from public.comanda_pagamentos where comanda_id = p_comanda_id and taxa_percentual is null) then
    raise exception 'Sem taxa cadastrada para esse parcelamento. Cadastre em Configurações ou escolha outra opção.' using errcode = 'P0001';
  end if;
  update public.comanda_pagamentos set taxa_centavos = round(valor_centavos * taxa_percentual / 100)
   where comanda_id = p_comanda_id;
  select coalesce(sum(taxa_centavos), 0) into v_taxas from public.comanda_pagamentos where comanda_id = p_comanda_id;

  -- Comissões: sobre o valor cheio do item; percentual gravado no item
  for v_item in
    select i.*, p.recebe_comissao from public.comanda_itens i
      join public.profissionais p on p.id = i.profissional_id
     where i.comanda_id = p_comanda_id
  loop
    v_pct := case
      when not v_item.recebe_comissao then 0
      when v_item.tipo = 'servico' then coalesce(public.comissao_servico(v_item.profissional_id, v_item.servico_id), 0)
      when v_item.tipo = 'produto' then coalesce((select comissao_percentual from public.produtos where id = v_item.produto_id), 0)
      else 0 end;
    v_com := round(v_item.valor_total_centavos * v_pct / 100);
    update public.comanda_itens set comissao_percentual = v_pct, comissao_centavos = v_com where id = v_item.id;
    if v_com > 0 then
      insert into public.lancamentos_profissional (profissional_id, tipo, valor_centavos, descricao, data, comanda_id, comanda_item_id)
      values (v_item.profissional_id, 'comissao', v_com,
              format('%s (%s%%) — comanda #%s', v_item.descricao, replace(rtrim(rtrim(v_pct::text, '0'), '.'), '.', ','), v_c.numero),
              v_dia, p_comanda_id, v_item.id);
    end if;
    -- Estoque
    if v_item.tipo = 'produto' then
      update public.produtos set estoque = estoque - v_item.quantidade where id = v_item.produto_id;
      insert into public.movimentos_estoque (produto_id, quantidade, motivo, comanda_id)
      values (v_item.produto_id, -v_item.quantidade, format('Venda — comanda #%s', v_c.numero), p_comanda_id);
    end if;
  end loop;

  -- Caixinhas: 100% da profissional (opcionalmente menos a taxa do cartão)
  v_taxa_cartao := case when v_cfg.caixinha_desconta_taxa and v_pago > 0 then v_taxas::numeric / v_pago else 0 end;
  insert into public.lancamentos_profissional (profissional_id, tipo, valor_centavos, descricao, data, comanda_id)
  select x.profissional_id, 'caixinha', round(x.valor_centavos * (1 - v_taxa_cartao)),
         format('Caixinha — comanda #%s', v_c.numero), v_dia, p_comanda_id
    from public.comanda_caixinhas x where x.comanda_id = p_comanda_id;

  -- Saldo na casa usado (ou pendurado)
  insert into public.movimentos_saldo (cliente_id, valor_centavos, descricao, comanda_id)
  select v_c.cliente_id, -g.valor_centavos, format('Usado na comanda #%s', v_c.numero), p_comanda_id
    from public.comanda_pagamentos g where g.comanda_id = p_comanda_id and g.forma = 'saldo';

  update public.comandas set
    status = 'fechada', fechada_em = now(), data_atendimento = v_dia, fechada_por = public.meu_profissional_id(),
    total_itens_centavos = v_itens, total_caixinhas_centavos = v_caixinhas, total_taxas_centavos = v_taxas,
    total_comissoes_centavos = (select coalesce(sum(comissao_centavos), 0) from public.comanda_itens where comanda_id = p_comanda_id)
  where id = p_comanda_id;

  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'concluido' where id = v_c.agendamento_id;
  end if;
end;
$$;

revoke execute on function public.fechar_comanda(uuid, jsonb, jsonb, date) from public, anon;
grant execute on function public.fechar_comanda(uuid, jsonb, jsonb, date) to authenticated;

create or replace function public.historico_cliente(p_cliente_id uuid)
returns table (
  comanda_id uuid, numero integer, data timestamptz, status public.status_comanda,
  itens jsonb, total_centavos integer, pagamentos jsonb, anotacoes jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.numero, case when c.status = 'fechada'
           then (c.data_atendimento + (c.fechada_em at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo'
           else c.aberta_em end, c.status,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'descricao', i.descricao, 'quantidade', i.quantidade, 'tipo', i.tipo,
                     'profissional_id', i.profissional_id, 'profissional_nome', p.nome,
                     'valor_centavos', case when public.eh_dono() then i.valor_total_centavos end) order by i.criado_em)
                     from public.comanda_itens i join public.profissionais p on p.id = i.profissional_id
                    where i.comanda_id = c.id), '[]'::jsonb),
         case when public.eh_dono() then c.total_itens_centavos end,
         case when public.eh_dono() then (
           select jsonb_agg(jsonb_build_object('forma', g.forma, 'valor_centavos', g.valor_centavos) order by g.ordem)
             from public.comanda_pagamentos g where g.comanda_id = c.id) end,
         coalesce((select jsonb_agg(jsonb_build_object('texto', a.texto, 'autor', pa.nome, 'criado_em', a.criado_em) order by a.criado_em)
                     from public.anotacoes_clientes a left join public.profissionais pa on pa.id = a.autor_id
                    where a.comanda_id = c.id), '[]'::jsonb)
    from public.comandas c
   where c.cliente_id = p_cliente_id and c.status <> 'cancelada' and public.eh_equipe()
   order by case when c.status = 'fechada'
           then (c.data_atendimento + (c.fechada_em at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo'
           else c.aberta_em end desc
$$;

create or replace function public.resumo_cliente(p_cliente_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visitas as (
    select c.data_atendimento as dia, c.total_itens_centavos
      from public.comandas c
     where c.cliente_id = p_cliente_id and c.status = 'fechada'
  ), dias as (
    select distinct dia from visitas
  )
  select case when not public.eh_equipe() then null else jsonb_build_object(
    'ultima_visita', (select max(dia) from dias),
    'visitas', (select count(*) from dias),
    'frequencia_dias', (select case when count(*) >= 2 then round((max(dia) - min(dia))::numeric / (count(*) - 1)) end from dias),
    'servico_mais_feito', (
      select i.descricao from public.comanda_itens i join public.comandas c on c.id = i.comanda_id
       where c.cliente_id = p_cliente_id and c.status = 'fechada' and i.tipo = 'servico'
       group by i.descricao order by sum(i.quantidade) desc, max(c.data_atendimento) desc limit 1),
    'total_gasto_centavos', case when public.eh_dono() then (select coalesce(sum(total_itens_centavos), 0) from visitas) end
  ) end
$$;

create or replace function public.relatorio_vendas(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.eh_dono() then
    raise exception 'Relatórios são só para o dono.' using errcode = 'P0001';
  end if;

  with cmd as (
    select c.*, c.data_atendimento as dia
      from public.comandas c
     where c.status = 'fechada'
       and c.data_atendimento between p_inicio and p_fim
  ),
  itens as (
    select i.*, c.dia from public.comanda_itens i join cmd c on c.id = i.comanda_id
  )
  select jsonb_build_object(
    'totais', (select jsonb_build_object(
        'faturamento', coalesce(sum(total_itens_centavos), 0),
        'caixinhas',   coalesce(sum(total_caixinhas_centavos), 0),
        'taxas',       coalesce(sum(total_taxas_centavos), 0),
        'comissoes',   coalesce(sum(total_comissoes_centavos), 0),
        'comandas',    count(*),
        'clientes',    count(distinct cliente_id)
      ) from cmd),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'valor', valor) order by dia)
        from (select dia, sum(total_itens_centavos) as valor from cmd group by dia) d), '[]'),
    'por_item', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'descricao', descricao, 'quantidade', qtd, 'valor', valor) order by valor desc)
        from (select tipo, descricao, sum(quantidade) as qtd, sum(valor_total_centavos) as valor
                from itens group by tipo, descricao) x), '[]'),
    'por_forma', coalesce((select jsonb_agg(jsonb_build_object('forma', forma, 'valor', valor, 'taxa', taxa) order by valor desc)
        from (select g.forma, sum(g.valor_centavos) as valor, sum(coalesce(g.taxa_centavos, 0)) as taxa
                from public.comanda_pagamentos g join cmd c on c.id = g.comanda_id group by g.forma) f), '[]'),
    'por_profissional', coalesce((select jsonb_agg(jsonb_build_object(
          'profissional_id', p.id, 'nome', p.nome, 'cor', p.cor,
          'faturamento', x.valor, 'comissao', x.comissao, 'atendimentos', x.atendimentos,
          'caixinhas', coalesce((select sum(cx.valor_centavos) from public.comanda_caixinhas cx join cmd c on c.id = cx.comanda_id
                                  where cx.profissional_id = p.id), 0)) order by x.valor desc)
        from (select profissional_id, sum(valor_total_centavos) as valor, sum(coalesce(comissao_centavos, 0)) as comissao,
                     count(distinct comanda_id) as atendimentos
                from itens group by profissional_id) x
        join public.profissionais p on p.id = x.profissional_id), '[]')
  ) into v;

  return v;
end;
$$;
