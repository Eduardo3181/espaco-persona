-- =====================================================================
-- Teste das CATEGORIAS BLOQUEADAS: a Di não lança cabelo em comanda nem em
-- agendamento, nem pelo dono em nome dela. DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/categorias_bloqueadas.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid; v_di uuid; v_edu uuid; v_cliente uuid; v_comanda uuid;
  v_corte uuid; v_unha uuid; v_produto uuid; v_ag uuid; n int; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select usuario_id, id into v_di_user, v_di from public.profissionais where nome = 'Di';
  select id into v_edu from public.profissionais where nome = 'Eduardo Persan';
  select s.id into v_corte from public.servicos s join public.categorias k on k.id = s.categoria_id where k.nome = 'Cortes' and s.ativo limit 1;
  select s.id into v_unha from public.servicos s join public.categorias k on k.id = s.categoria_id where k.nome = 'Unhas' and s.ativo limit 1;
  select p.id into v_produto from public.produtos p join public.categorias k on k.id = p.categoria_id where k.nome = 'Produtos para cabelo' and p.ativo limit 1;
  insert into public.clientes (nome) values ('ZZ Teste Bloqueio') returning id into v_cliente;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);
  v_comanda := public.abrir_comanda(v_cliente, null);

  -- Comanda: dono em nome da Di
  begin
    perform public.lancar_item(v_comanda, 'servico', v_corte, 1, v_di);
    r := r || ' dono lança corte para Di: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || format(' corte bloqueado OK (%s);', sqlerrm);
  end;
  begin
    perform public.lancar_item(v_comanda, 'produto', v_produto, 1, v_di);
    r := r || ' produto de cabelo para Di: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' produto bloqueado OK;';
  end;
  -- Permitidos
  perform public.lancar_item(v_comanda, 'servico', v_unha, 1, v_di);
  perform public.lancar_item(v_comanda, 'servico', v_corte, 1, v_edu);
  select count(*) into n from public.comanda_itens where comanda_id = v_comanda;
  r := r || format(' unha da Di e corte do Eduardo=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  -- Trocar a profissional de um item para a Di também é bloqueado
  begin
    update public.comanda_itens set profissional_id = v_di where comanda_id = v_comanda and servico_id = v_corte;
    r := r || ' trocar corte para Di: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' troca bloqueada OK;';
  end;

  -- Agendamento
  begin
    perform public.salvar_agendamento(null, v_di, v_cliente, '2031-06-10 12:00-03', 30, array[v_corte], null);
    r := r || ' agendar corte para Di: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' agenda bloqueada OK;';
  end;
  v_ag := public.salvar_agendamento(null, v_di, v_cliente, '2031-06-10 12:00-03', 30, array[v_unha], null);
  r := r || format(' agendar unha para Di %s;', case when v_ag is not null then 'OK' else 'FALHA' end);
  if v_ag is null then falhou := true; end if;

  -- Como a própria Di
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  begin
    perform public.lancar_item(v_comanda, 'servico', v_corte, 1, v_di);
    r := r || ' Di lança corte: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' Di bloqueada OK;';
  end;
  begin
    delete from public.profissional_categorias_bloqueadas where profissional_id = v_di;
    get diagnostics n = row_count;
    r := r || format(' Di remove bloqueio=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
    if n <> 0 then falhou := true; end if;
  exception when others then r := r || ' Di remove bloqueio barrada OK;';
  end;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
