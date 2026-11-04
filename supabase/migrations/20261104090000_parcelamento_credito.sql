-- =====================================================================
-- Crédito parcelado: até 4x, com taxa própria para cada opção.
-- "taxa_credito" continua sendo a taxa de 1x (à vista); 2x a 4x sem taxa
-- cadastrada não aparecem na comanda. A taxa fica por conta do salão: a
-- cliente paga o mesmo total. As parcelas e a taxa usada ficam gravadas
-- no pagamento, e comandas já fechadas não mudam.
-- =====================================================================

alter table public.configuracoes
  add column taxa_credito_2x numeric(5,2) check (taxa_credito_2x between 0 and 100),
  add column taxa_credito_3x numeric(5,2) check (taxa_credito_3x between 0 and 100),
  add column taxa_credito_4x numeric(5,2) check (taxa_credito_4x between 0 and 100);

alter table public.comanda_pagamentos
  add column parcelas smallint not null default 1 check (parcelas between 1 and 4),
  add constraint comanda_pagamentos_parcelas_credito check (forma = 'credito' or parcelas = 1);

-- p_pagamentos: [{"forma": "credito", "valor_centavos": 5000, "parcelas": 3}, …]
create or replace function public.salvar_caixinhas_pagamentos(p_comanda_id uuid, p_caixinhas jsonb, p_pagamentos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.eh_dono() then raise exception 'Só o dono.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.comandas where id = p_comanda_id and status = 'aberta') then
    raise exception 'A comanda não está aberta.' using errcode = 'P0001';
  end if;

  delete from public.comanda_caixinhas where comanda_id = p_comanda_id;
  insert into public.comanda_caixinhas (comanda_id, profissional_id, valor_centavos)
  select p_comanda_id, (x->>'profissional_id')::uuid, sum((x->>'valor_centavos')::integer)
    from jsonb_array_elements(coalesce(p_caixinhas, '[]')) x
   where (x->>'valor_centavos')::integer > 0
   group by (x->>'profissional_id')::uuid;

  delete from public.comanda_pagamentos where comanda_id = p_comanda_id;
  insert into public.comanda_pagamentos (comanda_id, ordem, forma, valor_centavos, parcelas)
  select p_comanda_id, row_number() over (), (x->>'forma')::public.forma_pagamento, (x->>'valor_centavos')::integer,
         case when x->>'forma' = 'credito' then coalesce((x->>'parcelas')::smallint, 1) else 1 end
    from jsonb_array_elements(coalesce(p_pagamentos, '[]')) x
   where (x->>'valor_centavos')::integer > 0;
end;
$$;

create or replace function public.fechar_comanda(p_comanda_id uuid, p_caixinhas jsonb, p_pagamentos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_c public.comandas;
  v_cfg public.configuracoes;
  v_hoje date := public.hoje_sp();
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
              v_hoje, p_comanda_id, v_item.id);
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
         format('Caixinha — comanda #%s', v_c.numero), v_hoje, p_comanda_id
    from public.comanda_caixinhas x where x.comanda_id = p_comanda_id;

  -- Saldo na casa usado (ou pendurado)
  insert into public.movimentos_saldo (cliente_id, valor_centavos, descricao, comanda_id)
  select v_c.cliente_id, -g.valor_centavos, format('Usado na comanda #%s', v_c.numero), p_comanda_id
    from public.comanda_pagamentos g where g.comanda_id = p_comanda_id and g.forma = 'saldo';

  update public.comandas set
    status = 'fechada', fechada_em = now(), fechada_por = public.meu_profissional_id(),
    total_itens_centavos = v_itens, total_caixinhas_centavos = v_caixinhas, total_taxas_centavos = v_taxas,
    total_comissoes_centavos = (select coalesce(sum(comissao_centavos), 0) from public.comanda_itens where comanda_id = p_comanda_id)
  where id = p_comanda_id;

  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'concluido' where id = v_c.agendamento_id;
  end if;
end;
$$;
