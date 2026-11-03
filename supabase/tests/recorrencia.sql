-- =====================================================================
-- Teste: agendamentos recorrentes. DESFAZ TUDO.
-- Rodar:  npx supabase db query --linked -f supabase/tests/recorrencia.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid;
  v_valdete uuid; v_di uuid; v_cliente uuid; v_escova uuid; v_mao uuid;
  v_grupo uuid; v_a1 uuid; v_a2 uuid; v_a3 uuid;
  n int; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where nome = 'Eduardo Persan';
  select id into v_valdete from public.profissionais where nome = 'Valdete Costa';
  select id, usuario_id into v_di, v_di_user from public.profissionais where nome = 'Di';
  select id into v_escova from public.servicos where nome = 'Escova 1';
  select id into v_mao from public.servicos where nome = 'Mão';
  insert into public.clientes (nome) values ('ZZ Teste Recorrencia') returning id into v_cliente;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  -- Três semanas seguidas, com a Valdete
  n := public.criar_atendimentos_recorrentes(v_cliente, 'teste', jsonb_build_array(
    jsonb_build_array(jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-03-04T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_escova))),
    jsonb_build_array(jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-03-11T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_escova))),
    jsonb_build_array(jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-03-18T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_escova)))
  ));
  select count(distinct grupo_repeticao), min(grupo_repeticao::text)::uuid into n, v_grupo from public.agendamentos where cliente_id = v_cliente;
  r := r || format(' 3 datas no mesmo grupo %s;', case when n = 1 and v_grupo is not null then 'OK' else 'FALHA' end);
  if n <> 1 or v_grupo is null then falhou := true; end if;

  select id into v_a1 from public.agendamentos where cliente_id = v_cliente and inicio = '2030-03-04T10:00:00-03:00';
  select id into v_a2 from public.agendamentos where cliente_id = v_cliente and inicio = '2030-03-11T10:00:00-03:00';
  select id into v_a3 from public.agendamentos where cliente_id = v_cliente and inicio = '2030-03-18T10:00:00-03:00';

  -- Se uma data está ocupada, nada é gravado
  begin
    perform public.criar_atendimentos_recorrentes(v_cliente, null, jsonb_build_array(
      jsonb_build_array(jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-03-25T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_escova))),
      jsonb_build_array(jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-03-04T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_escova)))
    ));
    r := r || ' data ocupada: FALHA (permitiu);'; falhou := true;
  exception when exclusion_violation then
    select count(*) into n from public.agendamentos where cliente_id = v_cliente;
    r := r || format(' data ocupada desfaz tudo %s;', case when n = 3 then 'OK' else 'FALHA' end);
    if n <> 3 then falhou := true; end if;
  end;

  -- Duas profissionais por data: uma comanda por data, mesma recorrência
  perform public.criar_atendimentos_recorrentes(v_cliente, null, jsonb_build_array(
    jsonb_build_array(
      jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-05-06T10:00:00-03:00', 'duracao_min', 30, 'servicos', jsonb_build_array(v_escova)),
      jsonb_build_object('profissional_id', v_di,      'inicio', '2030-05-06T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_mao))),
    jsonb_build_array(
      jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-05-13T10:00:00-03:00', 'duracao_min', 30, 'servicos', jsonb_build_array(v_escova)),
      jsonb_build_object('profissional_id', v_di,      'inicio', '2030-05-13T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_mao)))
  ));
  select count(distinct grupo_atendimento) into n from public.agendamentos where cliente_id = v_cliente and inicio >= '2030-05-01';
  r := r || format(' duas profissionais: 2 grupos de atendimento %s;', case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  -- Alterar todos: andam 7 dias juntos, sem esbarrar uns nos outros
  n := public.alterar_agendamentos_serie(v_valdete, v_cliente, 90, array[v_escova], 'alterado', jsonb_build_array(
    jsonb_build_object('id', v_a3, 'inicio', '2030-03-25T14:00:00-03:00'),
    jsonb_build_object('id', v_a2, 'inicio', '2030-03-18T14:00:00-03:00'),
    jsonb_build_object('id', v_a1, 'inicio', '2030-03-11T14:00:00-03:00')
  ));
  select count(*) into n from public.agendamentos
   where id in (v_a1, v_a2, v_a3) and observacao = 'alterado' and fim - inicio = interval '90 minutes'
     and extract(hour from inicio at time zone 'America/Sao_Paulo') = 14;
  r := r || format(' alterar todos=%s %s;', n, case when n = 3 then 'OK' else 'FALHA' end);
  if n <> 3 then falhou := true; end if;

  -- Horário já atendido não muda
  update public.agendamentos set status = 'concluido' where id = v_a1;
  begin
    perform public.alterar_agendamentos_serie(v_valdete, v_cliente, 60, array[v_escova], null, jsonb_build_array(
      jsonb_build_object('id', v_a1, 'inicio', '2030-03-12T14:00:00-03:00')));
    r := r || ' concluído: FALHA (alterou);'; falhou := true;
  exception when others then r := r || ' concluído não muda OK;';
  end;

  -- A Di não altera nem cria na coluna da Valdete
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  begin
    perform public.alterar_agendamentos_serie(v_valdete, v_cliente, 60, array[v_escova], null, jsonb_build_array(
      jsonb_build_object('id', v_a2, 'inicio', '2030-03-19T14:00:00-03:00')));
    r := r || ' profissional altera a de outra: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' profissional altera a de outra bloqueado OK;';
  end;
  begin
    perform public.criar_atendimentos_recorrentes(v_cliente, null, jsonb_build_array(
      jsonb_build_array(jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-06-03T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_escova)))));
    r := r || ' profissional cria na coluna de outra: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' profissional cria na coluna de outra bloqueado OK;';
  end;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
