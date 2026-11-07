-- =====================================================================
-- Teste do PREVISTO dos agendamentos em Relatórios. DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/previsto.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid; v_prof uuid; v_cliente uuid; v_serv1 uuid; v_serv2 uuid; v_cat uuid; v_ag uuid;
  v jsonb; n int; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select usuario_id, id into v_di_user, v_prof from public.profissionais where nome = 'Di';
  select id into v_cat from public.categorias where tipo = 'servico' limit 1;
  insert into public.clientes (nome) values ('ZZ Teste Previsto') returning id into v_cliente;
  insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos) values ('ZZ A', v_cat, 30, 10000) returning id into v_serv1;
  insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos) values ('ZZ B', v_cat, 30, 5000) returning id into v_serv2;

  -- Dois serviços num horário agendado: conta 150,00
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_prof, v_cliente, '2031-03-10 12:00-03', '2031-03-10 13:00-03', 'aguardando') returning id into v_ag;
  insert into public.agendamento_servicos values (v_ag, 1, v_serv1, 30), (v_ag, 2, v_serv2, 30);
  -- Confirmado: conta 100,00
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_prof, v_cliente, '2031-03-11 12:00-03', '2031-03-11 13:00-03', 'confirmado') returning id into v_ag;
  insert into public.agendamento_servicos values (v_ag, 1, v_serv1, 30);
  -- Não contam: comanda aberta, concluído e cancelado
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_prof, v_cliente, '2031-03-12 12:00-03', '2031-03-12 13:00-03', 'em_atendimento') returning id into v_ag;
  insert into public.agendamento_servicos values (v_ag, 1, v_serv1, 30);
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_prof, v_cliente, '2031-03-13 12:00-03', '2031-03-13 13:00-03', 'concluido') returning id into v_ag;
  insert into public.agendamento_servicos values (v_ag, 1, v_serv1, 30);
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_prof, v_cliente, '2031-03-14 12:00-03', '2031-03-14 13:00-03', 'cancelado') returning id into v_ag;
  insert into public.agendamento_servicos values (v_ag, 1, v_serv1, 30);
  -- Fora do período
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_prof, v_cliente, '2031-04-10 12:00-03', '2031-04-10 13:00-03', 'aguardando') returning id into v_ag;
  insert into public.agendamento_servicos values (v_ag, 1, v_serv1, 30);
  -- Dia que já passou e ficou sem comanda: não entra na previsão
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_prof, v_cliente, '2020-03-10 12:00-03', '2020-03-10 13:00-03', 'aguardando') returning id into v_ag;
  insert into public.agendamento_servicos values (v_ag, 1, v_serv1, 30);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  v := public.previsto_agendamentos('2031-03-01', '2031-03-31');
  n := (v ->> 'valor')::int;
  r := r || format(' valor=%s %s;', n, case when n = 25000 then 'OK' else 'FALHA (esperado 25000)' end);
  if n <> 25000 then falhou := true; end if;
  n := (v ->> 'atendimentos')::int;
  r := r || format(' atendimentos=%s %s;', n, case when n = 2 then 'OK' else 'FALHA (esperado 2)' end);
  if n <> 2 then falhou := true; end if;

  v := public.previsto_agendamentos('2020-03-01', '2020-03-31');
  n := (v ->> 'valor')::int;
  r := r || format(' passado=%s %s;', n, case when n = 0 then 'OK' else 'FALHA (esperado 0)' end);
  if n <> 0 then falhou := true; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  begin
    perform public.previsto_agendamentos('2031-03-01', '2031-03-31');
    r := r || ' profissional leu: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' profissional bloqueada OK;';
  end;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
