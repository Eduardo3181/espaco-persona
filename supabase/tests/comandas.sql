-- =====================================================================
-- Teste das COMANDAS: cálculo de comissão, estoque, saldo, reabertura
-- e segurança do perfil profissional. DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/comandas.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid;
  v_val_user uuid := gen_random_uuid();
  v_prof uuid; v_outra uuid; v_cliente uuid;
  v_escova uuid; v_color uuid; v_cat_color uuid; v_cat_prod uuid; v_prod uuid;
  v_comanda uuid; v_item_di uuid; v_item_val uuid;
  v_json jsonb; n int; v_num numeric; v_txt text;
  r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select id into v_prof from public.profissionais where nome = 'Di';
  select id into v_outra from public.profissionais where nome = 'Valdete Costa';
  select id into v_escova from public.servicos where nome = 'Escova 1';
  select id, categoria_id into v_color, v_cat_color from public.servicos where nome = 'Coloração';
  select id into v_cat_prod from public.categorias where tipo = 'produto' limit 1;

  -- Dados temporários
  insert into public.clientes (nome) values ('ZZ Teste SQL') returning id into v_cliente;
  insert into public.movimentos_saldo (cliente_id, valor_centavos, descricao) values (v_cliente, 5000, 'crédito teste');
  insert into public.produtos (nome, categoria_id, preco_centavos, estoque, comissao_percentual)
  values ('ZZ Produto', v_cat_prod, 5000, 5, 10) returning id into v_prod;
  -- Regras reais da profissional ficam de lado durante o teste (tudo é desfeito no final)
  delete from public.regras_comissao where profissional_id in (v_prof, v_outra);
  insert into public.regras_comissao (profissional_id, tipo, percentual) values (v_prof, 'padrao', 40);
  insert into public.regras_comissao (profissional_id, tipo, categoria_id, percentual) values (v_prof, 'categoria', v_cat_color, 35);
  insert into public.regras_comissao (profissional_id, tipo, servico_id, percentual) values (v_prof, 'servico', v_escova, 45);

  -- ================= Como DONO
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  v_comanda := public.abrir_comanda(v_cliente, null);
  perform public.lancar_item(v_comanda, 'servico', v_escova, 1, v_prof);   -- 85,00 × 45% (exceção do serviço)
  perform public.lancar_item(v_comanda, 'servico', v_color, 1, v_prof);    -- 265,00 × 35% (categoria)
  perform public.lancar_item(v_comanda, 'produto', v_prod, 2, v_prof);     -- 2 × 50,00 × 10% (produto)
  v_item_di := public.lancar_item(v_comanda, 'servico', v_escova, 1, v_outra);   -- outra sem regra → 0%
  -- total itens = 85 + 265 + 100 + 85 = 535,00 ; caixinha 10,00 → total 545,00
  perform public.fechar_comanda(v_comanda,
    ('[{"profissional_id":"' || v_prof || '","valor_centavos":1000}]')::jsonb,
    '[{"forma":"saldo","valor_centavos":8000},{"forma":"credito","valor_centavos":46500}]');

  select sum(valor_centavos) into n from public.lancamentos_profissional where comanda_id = v_comanda and profissional_id = v_prof and tipo = 'comissao';
  -- 85×0,45=38,25 ; 265×0,35=92,75 ; 100×0,10=10,00 → 141,00
  r := r || format(' comissão da profissional=%s %s;', n, case when n = 14100 then 'OK' else 'FALHA (esperado 14100)' end);
  if n <> 14100 then falhou := true; end if;

  select comissao_percentual into v_num from public.comanda_itens where id = v_item_di;
  r := r || format(' outra sem regra=%s%% %s;', v_num, case when v_num = 0 then 'OK' else 'FALHA' end);
  if v_num <> 0 then falhou := true; end if;

  select valor_centavos into n from public.lancamentos_profissional where comanda_id = v_comanda and tipo = 'caixinha';
  r := r || format(' caixinha=%s %s;', n, case when n = 1000 then 'OK' else 'FALHA' end);
  if n <> 1000 then falhou := true; end if;

  select total_taxas_centavos into n from public.comandas where id = v_comanda;   -- 465,00 × 3,49% = 16,23
  r := r || format(' taxa=%s %s;', n, case when n = 1623 then 'OK' else 'FALHA (esperado 1623)' end);
  if n <> 1623 then falhou := true; end if;

  select estoque into n from public.produtos where id = v_prod;
  r := r || format(' estoque=%s %s;', n, case when n = 3 then 'OK' else 'FALHA' end);
  if n <> 3 then falhou := true; end if;

  select saldo_centavos into n from public.saldos_clientes where cliente_id = v_cliente;  -- 50 − 80 = −30
  r := r || format(' saldo=%s %s;', n, case when n = -3000 then 'OK' else 'FALHA' end);
  if n <> -3000 then falhou := true; end if;

  -- Regra muda depois: o histórico não muda
  update public.regras_comissao set percentual = 99 where profissional_id = v_prof and tipo = 'categoria';
  select comissao_percentual into v_num from public.comanda_itens where comanda_id = v_comanda and servico_id = v_color;
  r := r || format(' %% gravado não muda=%s %s;', v_num, case when v_num = 35 then 'OK' else 'FALHA' end);
  if v_num <> 35 then falhou := true; end if;

  -- Reabrir desfaz tudo
  perform public.reabrir_comanda(v_comanda, 'teste');
  select count(*) into n from public.lancamentos_profissional where comanda_id = v_comanda;
  r := r || format(' reabrir: lançamentos=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  select estoque into n from public.produtos where id = v_prod;
  r := r || format(' estoque devolvido=%s %s;', n, case when n = 5 then 'OK' else 'FALHA' end);
  if n <> 5 then falhou := true; end if;
  select saldo_centavos into n from public.saldos_clientes where cliente_id = v_cliente;
  r := r || format(' saldo devolvido=%s %s;', n, case when n = 5000 then 'OK' else 'FALHA' end);
  if n <> 5000 then falhou := true; end if;
  select count(*) into n from public.log_auditoria where tabela = 'comandas' and registro_id = v_comanda::text;
  r := r || format(' log=%s %s;', n, case when n >= 2 then 'OK' else 'FALHA' end);
  if n < 2 then falhou := true; end if;

  -- ================= Como a PROFISSIONAL (Di)
  perform set_config('role', 'postgres', true);
  reset role;
  -- Usa o login real da profissional sob teste (só simulação; tudo é desfeito no final)
  select usuario_id into v_val_user from public.profissionais where id = v_prof;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_val_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.comandas;
  r := r || format(' prof vê tabela comandas=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  select count(*) into n from public.comanda_itens;
  r := r || format(' prof vê itens com valor=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  v_json := public.comanda_equipe(v_comanda);
  v_txt := v_json::text;
  r := r || format(' comanda sem valores %s;', case when v_json is not null and v_txt not like '%%valor%%' then 'OK' else 'FALHA' end);
  if v_json is null or v_txt like '%%valor%%' then falhou := true; end if;

  v_item_val := public.lancar_item(v_comanda, 'servico', v_escova, 1, v_outra);   -- tenta lançar em nome da outra
  reset role;
  select profissional_id into v_txt from public.comanda_itens where id = v_item_val;
  perform set_config('role', 'authenticated', true);
  r := r || format(' lançar em nome de outra → %s;', case when v_txt = v_prof::text then 'fica no nome dela OK' else 'FALHA' end);
  if v_txt <> v_prof::text then falhou := true; end if;

  begin
    perform public.remover_item(v_item_di);
    r := r || ' remover item da outra: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' remover item da outra bloqueado OK;';
  end;

  begin
    perform public.fechar_comanda(v_comanda, '[]', '[]');
    r := r || ' fechar: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' fechar bloqueado OK;';
  end;

  select count(*) into n from public.historico_cliente(v_cliente) h where h.total_centavos is not null or h.pagamentos is not null or h.itens::text like '%%"valor_centavos": [0-9]%%';
  r := r || format(' histórico sem valores=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  v_json := public.resumo_cliente(v_cliente);
  r := r || format(' resumo sem total gasto %s;', case when v_json->>'total_gasto_centavos' is null then 'OK' else 'FALHA' end);
  if v_json->>'total_gasto_centavos' is not null then falhou := true; end if;

  select count(*) into n from public.configuracoes;
  r := r || format(' vê configurações=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
