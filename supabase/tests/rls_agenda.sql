-- =====================================================================
-- Teste da AGENDA: trava de horário e segurança do perfil profissional.
-- Simula a Di (profissional) logada e DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/rls_agenda.sql
-- =====================================================================
do $$
declare
  v_usuario uuid := gen_random_uuid();
  v_prof uuid;
  v_outra uuid;
  v_cliente uuid;
  v_servico uuid;
  v_ag_di uuid;
  v_dia timestamptz := '2030-01-07 10:00-03';
  n int;
  r text := '';
  falhou boolean := false;
begin
  select id into v_prof from public.profissionais where nome = 'Di';
  select id into v_outra from public.profissionais where nome = 'Valdete Costa';
  select id into v_cliente from public.clientes limit 1;
  select id into v_servico from public.servicos limit 1;

  -- Trava (como administrador): dois horários sobrepostos da mesma profissional
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim)
  values (v_outra, v_cliente, v_dia, v_dia + interval '1 hour') returning id into v_ag_di;
  begin
    insert into public.agendamentos (profissional_id, cliente_id, inicio, fim)
    values (v_outra, v_cliente, v_dia + interval '30 min', v_dia + interval '90 min');
    r := r || ' sobreposição: FALHA (permitiu);'; falhou := true;
  exception when exclusion_violation then r := r || ' sobreposição bloqueada OK;';
  end;
  -- Encostado (11:00 em diante) pode
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
  values (v_outra, v_cliente, v_dia + interval '1 hour', v_dia + interval '2 hours', 'cancelado');
  update public.agendamentos set status = 'aguardando' where inicio = v_dia + interval '1 hour' and profissional_id = v_outra;
  r := r || ' horário encostado OK;';

  -- Usa o login real da profissional sob teste (só simulação; tudo é desfeito no final)
  select usuario_id into v_usuario from public.profissionais where id = v_prof;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

  select count(*) into n from public.agendamentos where profissional_id <> v_prof;
  r := r || format(' vê agenda de outras=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  begin
    insert into public.agendamentos (profissional_id, cliente_id, inicio, fim)
    values (v_outra, v_cliente, v_dia + interval '5 hours', v_dia + interval '6 hours');
    r := r || ' agendar na coluna da outra: FALHA (permitiu);'; falhou := true;
  exception when insufficient_privilege then r := r || ' agendar na coluna da outra bloqueado OK;';
  end;

  update public.agendamentos set status = 'cancelado' where id = v_ag_di;
  get diagnostics n = row_count;
  r := r || format(' alterar agendamento da outra=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  perform public.salvar_agendamento(null, v_prof, v_cliente, v_dia, 60, array[v_servico], 'teste');
  r := r || ' agendar na própria coluna OK;';

  select count(*) into n from public.agendamento_servicos s join public.agendamentos a on a.id = s.agendamento_id where a.profissional_id = v_outra;
  r := r || format(' vê serviços da agenda da outra=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  begin
    update public.agendamentos set profissional_id = v_outra where profissional_id = v_prof and inicio = v_dia;
    get diagnostics n = row_count;
    if n = 0 then r := r || ' mover para a outra bloqueado OK;';
    else r := r || ' mover para a outra: FALHA;'; falhou := true; end if;
  exception when insufficient_privilege then r := r || ' mover para a outra bloqueado OK;';
  end;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
