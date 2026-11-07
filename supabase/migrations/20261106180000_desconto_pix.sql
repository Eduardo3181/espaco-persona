-- =====================================================================
-- Desconto automático para pagamento em Pix (padrão 3%, em Configurações).
-- Vale só sobre a parte em Pix e não atinge a caixinha. A comissão continua
-- sobre o valor cheio do item: o desconto fica por conta do salão.
-- total_itens_centavos da comanda fechada já vem SEM o desconto (é o faturamento).
-- =====================================================================
alter table public.configuracoes
  add column desconto_pix numeric(5,2) not null default 3 check (desconto_pix >= 0 and desconto_pix < 100);
alter table public.comanda_pagamentos add column desconto_centavos integer not null default 0;
alter table public.comandas add column total_desconto_centavos integer not null default 0;

create or replace function public.fechar_comanda(p_comanda_id uuid, p_caixinhas jsonb, p_pagamentos jsonb, p_data_atendimento date default null)
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
  v_pix integer;
  v_desconto integer := 0;
  v_resto integer;
  v_parte integer;
  v_linha record;
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

  -- Desconto do Pix: só sobre a parte em Pix e sem a caixinha (fatia proporcional dos itens).
  -- O valor da linha passa a ser o que a cliente pagou; reabrir a comanda devolve o valor cheio.
  select coalesce(sum(valor_centavos), 0) into v_pix from public.comanda_pagamentos where comanda_id = p_comanda_id and forma = 'pix';
  if v_pix > 0 and v_cfg.desconto_pix > 0 then
    v_desconto := round(v_pix::numeric * v_itens * v_cfg.desconto_pix / (v_pago * 100.0));
    v_resto := v_desconto;
    for v_linha in
      select id, valor_centavos, row_number() over (order by ordem desc) as de_tras
        from public.comanda_pagamentos where comanda_id = p_comanda_id and forma = 'pix' order by ordem
    loop
      v_parte := case when v_linha.de_tras = 1 then v_resto else round(v_desconto::numeric * v_linha.valor_centavos / v_pix) end;
      update public.comanda_pagamentos set valor_centavos = valor_centavos - v_parte, desconto_centavos = v_parte where id = v_linha.id;
      v_resto := v_resto - v_parte;
    end loop;
    v_pago := v_pago - v_desconto;
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
    total_itens_centavos = v_itens - v_desconto, total_desconto_centavos = v_desconto, total_caixinhas_centavos = v_caixinhas, total_taxas_centavos = v_taxas,
    total_comissoes_centavos = (select coalesce(sum(comissao_centavos), 0) from public.comanda_itens where comanda_id = p_comanda_id)
  where id = p_comanda_id;

  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'concluido' where id = v_c.agendamento_id;
  end if;
end;
$$;

create or replace function public.reabrir_comanda(p_comanda_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_c public.comandas;
begin
  if not public.eh_dono() then raise exception 'Só o dono pode reabrir comandas.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001'; end if;
  select * into v_c from public.comandas where id = p_comanda_id for update;
  if v_c.status is distinct from 'fechada' then raise exception 'Só comandas fechadas podem ser reabertas.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.lancamentos_profissional where comanda_id = p_comanda_id and pagamento_id is not null) then
    raise exception 'As comissões desta comanda já foram pagas; não é possível reabrir.' using errcode = 'P0001';
  end if;

  delete from public.lancamentos_profissional where comanda_id = p_comanda_id;
  delete from public.movimentos_saldo where comanda_id = p_comanda_id;

  -- Devolve o estoque
  update public.produtos p set estoque = p.estoque - m.qtd
    from (select produto_id, sum(quantidade) as qtd from public.movimentos_estoque where comanda_id = p_comanda_id group by produto_id) m
   where p.id = m.produto_id;
  insert into public.movimentos_estoque (produto_id, quantidade, motivo, comanda_id)
  select produto_id, -sum(quantidade), format('Estorno — reabertura da comanda #%s', v_c.numero), p_comanda_id
    from public.movimentos_estoque where comanda_id = p_comanda_id group by produto_id having sum(quantidade) <> 0;

  update public.comanda_itens set comissao_percentual = null, comissao_centavos = null where comanda_id = p_comanda_id;
  update public.comanda_pagamentos set taxa_percentual = null, taxa_centavos = null,
         valor_centavos = valor_centavos + desconto_centavos, desconto_centavos = 0 where comanda_id = p_comanda_id;
  update public.comandas set
    status = 'aberta', reaberta_em = now(), motivo = trim(p_motivo), fechada_em = null, fechada_por = null,
    total_itens_centavos = null, total_desconto_centavos = 0, total_caixinhas_centavos = null, total_taxas_centavos = null, total_comissoes_centavos = null
  where id = p_comanda_id;

  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'em_atendimento' where id = v_c.agendamento_id;
  end if;
end;
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
        'descontos',   coalesce(sum(total_desconto_centavos), 0),
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
