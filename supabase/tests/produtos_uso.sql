-- =====================================================================
-- Teste dos PRODUTOS DE USO: custo gravado e baixa de estoque ao fechar,
-- volta ao reabrir, consumo e segurança. DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/produtos_uso.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid; v_edu uuid; v_cliente uuid; v_serv uuid; v_comanda uuid; v_item uuid;
  v_cor uuid; v_oxi uuid; n numeric; v jsonb; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select usuario_id into v_di_user from public.profissionais where nome = 'Di';
  select id into v_edu from public.profissionais where nome = 'Eduardo Persan';
  select s.id into v_serv from public.servicos s join public.categorias k on k.id = s.categoria_id where k.nome = 'Coloração e reflexo' and s.ativo limit 1;
  insert into public.clientes (nome) values ('ZZ Teste Fórmula') returning id into v_cliente;
  -- Tubo de 60 g a R$ 30,00 (R$ 0,50/g) com 2 tubos; oxidante 1000 g a R$ 40,00 (R$ 0,04/g) com 1 frasco
  insert into public.produtos_uso (tipo, numero, nome, embalagem_qtd, valor_compra_centavos, estoque_qtd)
    values ('coloracao', 'ZZ9.9', 'Coloração ZZ9.9', 60, 3000, 120) returning id into v_cor;
  insert into public.produtos_uso (tipo, nome, embalagem_qtd, valor_compra_centavos, estoque_qtd)
    values ('oxidante', 'ZZ Oxidante', 1000, 4000, 1000) returning id into v_oxi;
  update public.configuracoes set desconto_pix = 0;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);
  v_comanda := public.abrir_comanda(v_cliente, null);
  v_item := public.lancar_item(v_comanda, 'servico', v_serv, 1, v_edu);
  insert into public.comanda_produtos_uso (comanda_item_id, produto_uso_id, quantidade) values (v_item, v_cor, 30), (v_item, v_oxi, 30);
  perform public.fechar_comanda(v_comanda, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor_centavos', (select sum(valor_total_centavos) from public.comanda_itens where comanda_id = v_comanda))));

  -- 30 g × 0,50 = 15,00 ; 30 g × 0,04 = 1,20 → 16,20
  select total_custo_produtos_centavos into n from public.comandas where id = v_comanda;
  r := r || format(' custo da comanda=%s %s;', n, case when n = 1620 then 'OK' else 'FALHA (esperado 1620)' end);
  if n <> 1620 then falhou := true; end if;
  select estoque_qtd into n from public.produtos_uso where id = v_cor;
  r := r || format(' estoque coloração=%s %s;', n, case when n = 90 then 'OK' else 'FALHA (esperado 90)' end);
  if n <> 90 then falhou := true; end if;

  -- Reajuste depois não muda o custo gravado
  update public.produtos_uso set valor_compra_centavos = 6000 where id = v_cor;
  select custo_centavos into n from public.comanda_produtos_uso where comanda_item_id = v_item and produto_uso_id = v_cor;
  r := r || format(' custo gravado não muda=%s %s;', n, case when n = 1500 then 'OK' else 'FALHA' end);
  if n <> 1500 then falhou := true; end if;

  -- Fórmula de comanda fechada não muda
  begin
    insert into public.comanda_produtos_uso (comanda_item_id, produto_uso_id, quantidade) values (v_item, v_cor, 10);
    r := r || ' mexer em comanda fechada: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' comanda fechada protegida OK;';
  end;

  -- Consumo e última fórmula
  select quantidade into n from public.consumo_produtos_uso((select data_atendimento from public.comandas where id = v_comanda), (select data_atendimento from public.comandas where id = v_comanda)) where produto_uso_id = v_cor;
  r := r || format(' consumo=%s g %s;', n, case when n = 30 then 'OK' else 'FALHA' end);
  if n <> 30 then falhou := true; end if;
  v := public.ultima_formula_cliente(v_cliente, v_serv);
  r := r || format(' última fórmula com %s produtos %s;', jsonb_array_length(v->'produtos'), case when jsonb_array_length(v->'produtos') = 2 then 'OK' else 'FALHA' end);
  if jsonb_array_length(v->'produtos') <> 2 then falhou := true; end if;

  -- Reabrir devolve ao estoque e zera o custo
  perform public.reabrir_comanda(v_comanda, 'teste');
  select estoque_qtd into n from public.produtos_uso where id = v_cor;
  r := r || format(' reabrir devolve estoque=%s %s;', n, case when n = 120 then 'OK' else 'FALHA' end);
  if n <> 120 then falhou := true; end if;
  select total_custo_produtos_centavos into n from public.comandas where id = v_comanda;
  if n <> 0 then r := r || ' custo após reabrir: FALHA;'; falhou := true; end if;

  -- Profissional: não vê produtos nem fórmulas; vê a última fórmula sem custo
  perform public.fechar_comanda(v_comanda, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor_centavos', (select sum(valor_total_centavos) from public.comanda_itens where comanda_id = v_comanda))));
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  select count(*) into n from public.produtos_uso;
  r := r || format(' prof vê produtos=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  select count(*) into n from public.comanda_produtos_uso;
  r := r || format(' prof vê fórmulas=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  select count(*) into n from public.historico_cliente(v_cliente) h, jsonb_array_elements(h.produtos) p where p->>'custo_centavos' is not null;
  r := r || format(' prof vê custo no histórico=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  begin
    perform public.consumo_produtos_uso('2020-01-01', '2040-01-01');
    r := r || ' prof vê consumo: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' prof consumo bloqueado OK;';
  end;

  -- Apagar a cliente (LGPD) com comanda aberta e fórmula: a cascata não pode ser barrada
  perform set_config('role', 'postgres', true);
  insert into public.clientes (nome) values ('ZZ Teste Exclusão') returning id into v_cliente;
  insert into public.comandas (cliente_id, status) values (v_cliente, 'aberta') returning id into v_comanda;
  insert into public.comanda_itens (comanda_id, tipo, servico_id, descricao, profissional_id, quantidade, valor_unitario_centavos)
    values (v_comanda, 'servico', v_serv, 'teste', v_edu, 1, 1000) returning id into v_item;
  insert into public.comanda_produtos_uso (comanda_item_id, produto_uso_id, quantidade) values (v_item, v_cor, 10);
  begin
    delete from public.comandas where id = v_comanda;
    r := r || ' apagar comanda aberta com fórmula OK;';
  exception when others then r := r || ' apagar comanda aberta com fórmula: FALHA;'; falhou := true;
  end;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
