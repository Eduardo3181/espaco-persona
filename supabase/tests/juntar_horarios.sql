-- =====================================================================
-- Teste: horários da mesma cliente no mesmo dia viram uma comanda só. DESFAZ TUDO.
-- Rodar:  npx supabase db query --linked -f supabase/tests/juntar_horarios.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_val uuid; v_di uuid; v_edu uuid; v_cliente uuid; v_outra uuid; v_escova uuid; v_mao uuid; v_pe uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; c1 uuid; c2 uuid; n int; v_preco int;
  r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where nome = 'Eduardo Persan';
  select id into v_edu from public.profissionais where nome = 'Eduardo Persan';
  select id into v_val from public.profissionais where nome = 'Valdete Costa';
  select id into v_di from public.profissionais where nome = 'Di';
  select id into v_escova from public.servicos where nome = 'Escova 1';
  select id into v_mao from public.servicos where nome = 'Mão';
  select id into v_pe from public.servicos where nome = 'Pé';
  insert into public.clientes (nome) values ('ZZ Teste Juntar') returning id into v_cliente;
  insert into public.clientes (nome) values ('ZZ Teste Juntar Outra') returning id into v_outra;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  -- Dois horários agendados separados; outra cliente e outro dia não entram
  a1 := public.salvar_agendamento(null, v_val, v_cliente, '2030-04-01T14:00:00-03:00', 30, array[v_escova], null);
  a2 := public.salvar_agendamento(null, v_di, v_cliente, '2030-04-01T14:00:00-03:00', 30, array[v_mao], null);
  a3 := public.salvar_agendamento(null, v_edu, v_outra, '2030-04-01T14:00:00-03:00', 30, array[v_escova], null);
  a4 := public.salvar_agendamento(null, v_di, v_cliente, '2030-04-02T14:00:00-03:00', 30, array[v_mao], null);

  c1 := public.abrir_comanda(null, a1);
  select count(*) into n from public.comanda_itens where comanda_id = c1;
  r := r || format(' dois horários=%s itens %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  select count(*) into n from public.agendamentos where id in (a1, a2) and status = 'em_atendimento' and grupo_atendimento is not null;
  r := r || format(' ambos em atendimento e ligados %s;', case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  select count(*) into n from public.agendamentos where id in (a3, a4) and status = 'aguardando' and grupo_atendimento is null;
  r := r || format(' outra cliente e outro dia ficam de fora %s;', case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  c2 := public.abrir_comanda(null, a2);
  select count(*) into n from public.comanda_itens where comanda_id = c1;
  r := r || format(' abrir pelo outro = mesma comanda sem duplicar %s;', case when c1 = c2 and n = 2 then 'OK' else 'FALHA' end);
  if c1 <> c2 or n <> 2 then falhou := true; end if;

  -- Horário criado depois, com a comanda aberta, entra nela
  a3 := public.salvar_agendamento(null, v_edu, v_cliente, '2030-04-01T16:00:00-03:00', 30, array[v_pe], null);
  c2 := public.abrir_comanda(null, a3);
  select count(*) into n from public.comanda_itens where comanda_id = c1;
  r := r || format(' horário novo entra na comanda aberta %s;', case when c1 = c2 and n = 3 then 'OK' else 'FALHA' end);
  if c1 <> c2 or n <> 3 then falhou := true; end if;

  -- Serviço já lançado à mão não duplica
  a3 := public.salvar_agendamento(null, v_di, v_cliente, '2030-04-01T17:00:00-03:00', 30, array[v_mao], null);
  c2 := public.abrir_comanda(null, a1);
  select count(*) into n from public.comanda_itens where comanda_id = c1 and servico_id = v_mao and profissional_id = v_di;
  r := r || format(' serviço igual não duplica=%s %s;', n, case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  -- Fechar conclui todos; horário depois disso abre outra comanda
  select sum(valor_total_centavos) into v_preco from public.comanda_itens where comanda_id = c1;
  perform public.fechar_comanda(c1, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor_centavos', v_preco)));
  select count(*) into n from public.agendamentos where cliente_id = v_cliente and inicio < '2030-04-02' and status = 'concluido';
  r := r || format(' fechar conclui os %s horários %s;', n, case when n = 4 then 'OK' else 'FALHA' end);
  if n <> 4 then falhou := true; end if;

  a3 := public.salvar_agendamento(null, v_val, v_cliente, '2030-04-01T18:00:00-03:00', 30, array[v_escova], null);
  c2 := public.abrir_comanda(null, a3);
  select count(*) into n from public.comanda_itens where comanda_id = c2;
  r := r || format(' depois de fechada abre outra %s;', case when c2 <> c1 and n = 1 then 'OK' else 'FALHA' end);
  if c2 = c1 or n <> 1 then falhou := true; end if;

  -- Horário desmarcado não entra
  a1 := public.salvar_agendamento(null, v_val, v_cliente, '2030-04-03T10:00:00-03:00', 30, array[v_escova], null);
  a2 := public.salvar_agendamento(null, v_di, v_cliente, '2030-04-03T10:00:00-03:00', 30, array[v_mao], null);
  update public.agendamentos set status = 'cancelado' where id = a2;
  c2 := public.abrir_comanda(null, a1);
  select count(*) into n from public.comanda_itens where comanda_id = c2;
  r := r || format(' desmarcado fica de fora %s;', case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;
  select count(*) into n from public.agendamentos where id = a1 and grupo_atendimento is null;
  r := r || format(' horário sozinho não cria grupo %s;', case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  -- Cancelar a comanda devolve todos os horários; abrir de novo junta outra vez
  a1 := public.salvar_agendamento(null, v_val, v_cliente, '2030-04-04T10:00:00-03:00', 30, array[v_escova], null);
  a2 := public.salvar_agendamento(null, v_di, v_cliente, '2030-04-04T10:00:00-03:00', 30, array[v_mao], null);
  c1 := public.abrir_comanda(null, a1);
  perform public.cancelar_comanda(c1, 'teste');
  select count(*) into n from public.agendamentos where id in (a1, a2) and status = 'confirmado';
  r := r || format(' cancelar devolve os 2 horários=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;
  c2 := public.abrir_comanda(null, a2);
  select count(*) into n from public.comanda_itens where comanda_id = c2;
  r := r || format(' abrir de novo junta %s;', case when c2 <> c1 and n = 2 then 'OK' else 'FALHA' end);
  if c2 = c1 or n <> 2 then falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
