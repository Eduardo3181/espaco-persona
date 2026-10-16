-- =====================================================================
-- Teste: atendimento com duas profissionais (cabelo + manicure).
-- Uma comanda só, status acompanhando nos dois horários. DESFAZ TUDO.
-- Rodar:  npx supabase db query --linked -f supabase/tests/atendimento_grupo.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid;
  v_valdete uuid; v_di uuid; v_cliente uuid; v_escova uuid; v_mao uuid;
  v_ids uuid[]; v_ag_val uuid; v_ag_di uuid; v_cmd1 uuid; v_cmd2 uuid;
  n int; v_txt text; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where nome = 'Eduardo Persan';
  select id into v_valdete from public.profissionais where nome = 'Valdete Costa';
  select id, usuario_id into v_di, v_di_user from public.profissionais where nome = 'Di';
  select id into v_escova from public.servicos where nome = 'Escova 1';
  select id into v_mao from public.servicos where nome = 'Mão';
  insert into public.clientes (nome) values ('ZZ Teste Grupo') returning id into v_cliente;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  v_ids := public.criar_atendimento(v_cliente, 'teste', jsonb_build_array(
    jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-02-04T10:00:00-03:00', 'duracao_min', 30, 'servicos', jsonb_build_array(v_escova)),
    jsonb_build_object('profissional_id', v_di,      'inicio', '2030-02-04T10:00:00-03:00', 'duracao_min', 60, 'servicos', jsonb_build_array(v_mao))
  ));
  v_ag_val := v_ids[1]; v_ag_di := v_ids[2];

  select count(distinct grupo_atendimento) into n from public.agendamentos where id = any(v_ids) and grupo_atendimento is not null;
  r := r || format(' 2 horários ligados %s;', case when n = 1 and array_length(v_ids, 1) = 2 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  v_cmd1 := public.abrir_comanda(null, v_ag_di);
  select count(*), count(distinct profissional_id) into n, v_txt from public.comanda_itens where comanda_id = v_cmd1;
  r := r || format(' comanda com %s itens de %s profissionais %s;', n, v_txt, case when n = 2 and v_txt = '2' then 'OK' else 'FALHA' end);
  if n <> 2 or v_txt <> '2' then falhou := true; end if;

  v_cmd2 := public.abrir_comanda(null, v_ag_val);
  r := r || format(' abrir pelo outro horário = mesma comanda %s;', case when v_cmd1 = v_cmd2 then 'OK' else 'FALHA' end);
  if v_cmd1 <> v_cmd2 then falhou := true; end if;

  select count(*) into n from public.agendamentos where id = any(v_ids) and status = 'em_atendimento';
  r := r || format(' ambos em atendimento=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  perform public.fechar_comanda(v_cmd1, '[]'::jsonb, '[{"forma":"pix","valor_centavos":13500}]'::jsonb);
  select count(*) into n from public.agendamentos where id = any(v_ids) and status = 'concluido';
  r := r || format(' fechar: ambos concluídos=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  perform public.reabrir_comanda(v_cmd1, 'teste');
  select count(*) into n from public.agendamentos where id = any(v_ids) and status = 'em_atendimento';
  r := r || format(' reabrir: ambos em atendimento=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  perform public.cancelar_comanda(v_cmd1, 'teste');
  select count(*) into n from public.agendamentos where id = any(v_ids) and status = 'confirmado';
  r := r || format(' cancelar: ambos voltam a confirmado=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  -- A Di (profissional) não consegue criar um atendimento na coluna da Valdete
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  begin
    perform public.criar_atendimento(v_cliente, null, jsonb_build_array(
      jsonb_build_object('profissional_id', v_valdete, 'inicio', '2030-02-05T10:00:00-03:00', 'duracao_min', 30, 'servicos', jsonb_build_array(v_escova))));
    r := r || ' profissional agenda na coluna de outra: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' profissional agenda na coluna de outra bloqueado OK;';
  end;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
