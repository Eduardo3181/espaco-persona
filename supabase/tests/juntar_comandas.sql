-- =====================================================================
-- Teste: comandas abertas da mesma cliente no mesmo dia são cobradas juntas. DESFAZ TUDO.
-- Rodar:  npx supabase db query --linked -f supabase/tests/juntar_comandas.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid; v_val uuid; v_di uuid; v_cli uuid; v_homonima uuid; v_escova uuid; v_mao uuid;
  a1 uuid; a2 uuid; c1 uuid; c2 uuid; c3 uuid; v_j jsonb; n int; v_total int; v_txt text; v_st text;
  r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where nome = 'Eduardo Persan';
  select id into v_val from public.profissionais where nome = 'Valdete Costa';
  select id, usuario_id into v_di, v_di_user from public.profissionais where nome = 'Di';
  select id into v_escova from public.servicos where nome = 'Escova 1';
  select id into v_mao from public.servicos where nome = 'Mão';
  insert into public.clientes (nome) values ('ZZ Teste Cobranca') returning id into v_cli;
  insert into public.clientes (nome) values ('ZZ Teste Cobranca') returning id into v_homonima;

  -- Duas comandas já abertas separadas, no mesmo dia (como as criadas antes da junção)
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_val, v_cli, '2030-05-06T10:00:00-03:00', '2030-05-06T10:30:00-03:00', 'em_atendimento') returning id into a1;
  insert into public.agendamentos (profissional_id, cliente_id, inicio, fim, status)
    values (v_di, v_cli, '2030-05-06T11:00:00-03:00', '2030-05-06T11:30:00-03:00', 'em_atendimento') returning id into a2;
  insert into public.comandas (cliente_id, agendamento_id, aberta_em) values (v_cli, a1, now() - interval '2 minutes') returning id into c1;
  insert into public.comandas (cliente_id, agendamento_id, aberta_em) values (v_cli, a2, now() - interval '1 minute') returning id into c2;
  insert into public.comanda_itens (comanda_id, tipo, servico_id, descricao, profissional_id, valor_unitario_centavos)
    values (c1, 'servico', v_escova, 'Escova 1', v_val, 9000), (c2, 'servico', v_mao, 'Mão', v_di, 5300);
  insert into public.comanda_caixinhas (comanda_id, profissional_id, valor_centavos)
    values (c1, v_di, 500), (c2, v_di, 700), (c2, v_val, 1000);

  -- O desconto do Pix tem teste próprio (desconto_pix.sql)
  update public.configuracoes set desconto_pix = 0;
  perform set_config('role', 'authenticated', true);

  -- Profissional não junta
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  begin
    perform public.juntar_comandas_do_dia(c1);
    r := r || ' profissional: FALHA (juntou);'; falhou := true;
  exception when others then r := r || ' profissional bloqueada OK;';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  -- Abrindo pela comanda mais nova, vai para a mais antiga
  v_j := public.juntar_comandas_do_dia(c2);
  r := r || format(' fica a mais antiga %s;', case when (v_j->>'comanda_id')::uuid = c1 and (v_j->>'juntou')::boolean then 'OK' else 'FALHA' end);
  if (v_j->>'comanda_id')::uuid <> c1 or not (v_j->>'juntou')::boolean then falhou := true; end if;

  select count(*), count(distinct profissional_id) into n, v_total from public.comanda_itens where comanda_id = c1;
  r := r || format(' itens das 2 profissionais=%s/%s %s;', n, v_total, case when n = 2 and v_total = 2 then 'OK' else 'FALHA' end);
  if n <> 2 or v_total <> 2 then falhou := true; end if;

  select sum(valor_centavos) into v_total from public.comanda_caixinhas where comanda_id = c1;
  select valor_centavos into n from public.comanda_caixinhas where comanda_id = c1 and profissional_id = v_di;
  r := r || format(' caixinhas somadas=%s %s;', v_total, case when v_total = 2200 and n = 1200 then 'OK' else 'FALHA' end);
  if v_total <> 2200 or n <> 1200 then falhou := true; end if;

  select status::text, motivo into v_st, v_txt from public.comandas where id = c2;
  r := r || format(' outra fica como juntada %s;', case when v_st = 'cancelada' and v_txt like 'Juntada à comanda #%' then 'OK' else 'FALHA' end);
  if v_st <> 'cancelada' or v_txt not like 'Juntada à comanda #%' then falhou := true; end if;

  select count(*) into n from public.agendamentos where id in (a1, a2) and status = 'em_atendimento' and grupo_atendimento is not null;
  r := r || format(' horários seguem em atendimento e ligados %s;', case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  -- Rodar de novo não muda nada
  v_j := public.juntar_comandas_do_dia(c1);
  select count(*) into n from public.comanda_itens where comanda_id = c1;
  r := r || format(' repetir não duplica %s;', case when not (v_j->>'juntou')::boolean and n = 2 then 'OK' else 'FALHA' end);
  if (v_j->>'juntou')::boolean or n <> 2 then falhou := true; end if;

  -- Fechar cobra tudo e conclui os dois horários
  perform public.fechar_comanda(c1, ('[{"profissional_id":"' || v_di || '","valor_centavos":1200},{"profissional_id":"' || v_val || '","valor_centavos":1000}]')::jsonb, jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor_centavos', 14300 + 2200)));
  select count(*) into n from public.agendamentos where id in (a1, a2) and status = 'concluido';
  select total_itens_centavos into v_total from public.comandas where id = c1;
  r := r || format(' fechar: total=%s concluídos=%s %s;', v_total, n, case when v_total = 14300 and n = 2 then 'OK' else 'FALHA' end);
  if v_total <> 14300 or n <> 2 then falhou := true; end if;

  -- Avulsa da mesma cliente hoje usa a mesma; horário de hoje entra nela
  c1 := public.abrir_comanda(v_cli, null);
  c2 := public.abrir_comanda(v_cli, null);
  r := r || format(' segunda avulsa no dia = mesma %s;', case when c1 = c2 then 'OK' else 'FALHA' end);
  if c1 <> c2 then falhou := true; end if;
  a1 := public.salvar_agendamento(null, v_di, v_cli, (public.hoje_sp() + time '23:30') at time zone 'America/Sao_Paulo', 15, array[v_mao], null);
  v_j := public.juntar_comandas_do_dia(c1);
  select count(*) into n from public.comanda_itens where comanda_id = c1;
  select count(*) into v_total from public.comandas where id = c1 and agendamento_id = a1;
  r := r || format(' horário do dia entra na avulsa %s;', case when n = 1 and v_total = 1 and (v_j->>'juntou')::boolean then 'OK' else 'FALHA' end);
  if n <> 1 or v_total <> 1 or not (v_j->>'juntou')::boolean then falhou := true; end if;

  -- Mesmo nome com cadastro diferente não junta
  c3 := public.abrir_comanda(v_homonima, null);
  r := r || format(' homônima fica separada %s;', case when c3 <> c1 then 'OK' else 'FALHA' end);
  if c3 = c1 then falhou := true; end if;

  -- Outro dia não junta
  insert into public.comandas (cliente_id, data_atendimento, aberta_em) values (v_cli, '2030-01-10', '2030-01-10T12:00:00-03:00') returning id into c2;
  v_j := public.juntar_comandas_do_dia(c2);
  select status::text into v_st from public.comandas where id = c1;
  r := r || format(' outro dia fica separado %s;', case when (v_j->>'comanda_id')::uuid = c2 and not (v_j->>'juntou')::boolean and v_st = 'aberta' then 'OK' else 'FALHA' end);
  if (v_j->>'comanda_id')::uuid <> c2 or (v_j->>'juntou')::boolean or v_st <> 'aberta' then falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
