-- =====================================================================
-- Teste: crédito parcelado com taxa por opção. DESFAZ TUDO.
-- Rodar:  npx supabase db query --linked -f supabase/tests/parcelamento.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_prof uuid; v_cliente uuid; v_escova uuid; v_preco int; v_c1 uuid; v_c2 uuid;
  v_taxa1 numeric; v_pct numeric; v_tx int; v_parc int; v_com1 int; v_com2 int;
  r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select id into v_prof from public.profissionais where nome = 'Di';
  select id, preco_centavos into v_escova, v_preco from public.servicos where nome = 'Escova 1';
  insert into public.clientes (nome) values ('ZZ Teste Parcelas') returning id into v_cliente;
  update public.configuracoes set taxa_credito = 3.00, taxa_credito_2x = null, taxa_credito_3x = 5.00, taxa_credito_4x = null;
  v_taxa1 := 3.00;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);
  v_c1 := public.abrir_comanda(v_cliente, null);
  perform public.lancar_item(v_c1, 'servico', v_escova, 1, v_prof);

  -- 2x sem taxa cadastrada não fecha
  begin
    perform public.fechar_comanda(v_c1, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'credito', 'valor_centavos', v_preco, 'parcelas', 2)));
    r := r || ' 2x sem taxa: FALHA (fechou);'; falhou := true;
  exception when others then r := r || ' 2x sem taxa recusado OK;';
  end;

  -- 5x não existe
  begin
    perform public.salvar_caixinhas_pagamentos(v_c1, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'credito', 'valor_centavos', v_preco, 'parcelas', 5)));
    r := r || ' 5x: FALHA (aceitou);'; falhou := true;
  exception when others then r := r || ' 5x recusado OK;';
  end;

  -- Manter aberta guarda as parcelas
  perform public.salvar_caixinhas_pagamentos(v_c1, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'credito', 'valor_centavos', v_preco, 'parcelas', 3)));
  select parcelas into v_parc from public.comanda_pagamentos where comanda_id = v_c1;
  r := r || format(' rascunho guarda 3x %s;', case when v_parc = 3 then 'OK' else 'FALHA' end);
  if v_parc <> 3 then falhou := true; end if;

  -- 3x usa a taxa de 3x, sobre o total que a cliente paga
  perform public.fechar_comanda(v_c1, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'credito', 'valor_centavos', v_preco, 'parcelas', 3)));
  select taxa_percentual, taxa_centavos, parcelas into v_pct, v_tx, v_parc from public.comanda_pagamentos where comanda_id = v_c1;
  r := r || format(' 3x taxa=%s centavos=%s %s;', v_pct, v_tx, case when v_pct = 5 and v_tx = round(v_preco * 0.05) and v_parc = 3 then 'OK' else 'FALHA' end);
  if v_pct <> 5 or v_tx <> round(v_preco * 0.05) or v_parc <> 3 then falhou := true; end if;
  select coalesce(total_comissoes_centavos, 0) into v_com1 from public.comandas where id = v_c1;

  -- Mudar a taxa depois não altera a comanda fechada
  perform set_config('role', 'postgres', true);
  update public.configuracoes set taxa_credito_3x = 9.00;
  perform set_config('role', 'authenticated', true);
  select taxa_percentual into v_pct from public.comanda_pagamentos where comanda_id = v_c1;
  r := r || format(' comanda fechada mantém taxa %s;', case when v_pct = 5 then 'OK' else 'FALHA' end);
  if v_pct <> 5 then falhou := true; end if;

  -- 1x usa a taxa antiga; Pix ignora parcelas; comissão não muda com o parcelamento
  v_c2 := public.abrir_comanda(v_cliente, null);
  perform public.lancar_item(v_c2, 'servico', v_escova, 1, v_prof);
  perform public.fechar_comanda(v_c2, '[]'::jsonb, jsonb_build_array(
    jsonb_build_object('forma', 'pix', 'valor_centavos', 1000, 'parcelas', 4),
    jsonb_build_object('forma', 'credito', 'valor_centavos', v_preco - 1000)));
  select taxa_percentual, parcelas into v_pct, v_parc from public.comanda_pagamentos where comanda_id = v_c2 and forma = 'credito';
  r := r || format(' 1x usa taxa de crédito %s;', case when v_pct = v_taxa1 and v_parc = 1 then 'OK' else 'FALHA' end);
  if v_pct <> v_taxa1 or v_parc <> 1 then falhou := true; end if;
  select parcelas into v_parc from public.comanda_pagamentos where comanda_id = v_c2 and forma = 'pix';
  r := r || format(' Pix fica 1x %s;', case when v_parc = 1 then 'OK' else 'FALHA' end);
  if v_parc <> 1 then falhou := true; end if;
  select coalesce(total_comissoes_centavos, 0) into v_com2 from public.comandas where id = v_c2;
  r := r || format(' comissão igual %s;', case when v_com1 = v_com2 then 'OK' else 'FALHA' end);
  if v_com1 <> v_com2 then falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
