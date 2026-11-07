-- =====================================================================
-- Teste: comanda lançada com atraso entra no dia do atendimento. DESFAZ TUDO.
-- Rodar:  npx supabase db query --linked -f supabase/tests/data_atendimento.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_prof uuid; v_cliente uuid; v_escova uuid; v_preco int;
  v_ids uuid[]; v_c uuid; v_d date; v_j jsonb; n int;
  r text := ''; falhou boolean := false;
  v_hoje date := public.hoje_sp();
  v_pag jsonb;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select id into v_prof from public.profissionais where nome = 'Di';
  select id, preco_centavos into v_escova, v_preco from public.servicos where nome = 'Escova 1';
  insert into public.clientes (nome) values ('ZZ Teste Data') returning id into v_cliente;
  v_pag := jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor_centavos', v_preco + 1000));

  -- Estes testes usam a Di em qualquer serviço: o bloqueio fica de lado (tudo é desfeito no final)
  delete from public.profissional_categorias_bloqueadas where profissional_id = v_prof;
  -- O desconto do Pix tem teste próprio (desconto_pix.sql)
  update public.configuracoes set desconto_pix = 0;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  -- Agendamento em dia anterior, fechado hoje, com caixinha
  v_ids := public.criar_atendimento(v_cliente, null, jsonb_build_array(jsonb_build_object(
    'profissional_id', v_prof, 'inicio', '2020-01-15T10:00:00-03:00', 'duracao_min', 30, 'servicos', jsonb_build_array(v_escova))));
  v_c := public.abrir_comanda(null, v_ids[1]);
  perform public.fechar_comanda(v_c, jsonb_build_array(jsonb_build_object('profissional_id', v_prof, 'valor_centavos', 1000)), v_pag);
  select data_atendimento into v_d from public.comandas where id = v_c;
  r := r || format(' agenda 15/01/2020: dia=%s %s;', v_d, case when v_d = '2020-01-15' then 'OK' else 'FALHA' end);
  if v_d <> '2020-01-15' then falhou := true; end if;

  select count(*) into n from public.lancamentos_profissional where comanda_id = v_c and data = '2020-01-15';
  r := r || format(' comissão e caixinha no dia=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  v_j := public.relatorio_vendas('2020-01-15', '2020-01-15');
  n := (v_j->'totais'->>'faturamento')::int;
  r := r || format(' relatório no dia=%s %s;', n, case when n = v_preco then 'OK' else 'FALHA' end);
  if n <> v_preco then falhou := true; end if;

  v_j := public.resumo_cliente(v_cliente);
  r := r || format(' última visita=%s %s;', v_j->>'ultima_visita', case when v_j->>'ultima_visita' = '2020-01-15' then 'OK' else 'FALHA' end);
  if v_j->>'ultima_visita' <> '2020-01-15' then falhou := true; end if;

  select count(*) into n from public.historico_cliente(v_cliente) h
   where (h.data at time zone 'America/Sao_Paulo')::date = '2020-01-15';
  r := r || format(' histórico no dia %s;', case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  -- Reabrir e fechar de novo mantém o dia da agenda
  perform public.reabrir_comanda(v_c, 'teste');
  perform public.fechar_comanda(v_c, jsonb_build_array(jsonb_build_object('profissional_id', v_prof, 'valor_centavos', 1000)), v_pag);
  select data_atendimento into v_d from public.comandas where id = v_c;
  r := r || format(' reabrir mantém dia %s;', case when v_d = '2020-01-15' then 'OK' else 'FALHA' end);
  if v_d <> '2020-01-15' then falhou := true; end if;

  -- Agendamento no futuro fechado hoje entra hoje
  v_ids := public.criar_atendimento(v_cliente, null, jsonb_build_array(jsonb_build_object(
    'profissional_id', v_prof, 'inicio', '2032-01-15T10:00:00-03:00', 'duracao_min', 30, 'servicos', jsonb_build_array(v_escova))));
  v_c := public.abrir_comanda(null, v_ids[1]);
  perform public.fechar_comanda(v_c, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor_centavos', v_preco)));
  select data_atendimento into v_d from public.comandas where id = v_c;
  r := r || format(' agenda futura entra hoje %s;', case when v_d = v_hoje then 'OK' else 'FALHA' end);
  if v_d <> v_hoje then falhou := true; end if;

  -- Avulsa: data informada; sem data, hoje; futuro recusado
  v_c := public.abrir_comanda(v_cliente, null);
  perform public.lancar_item(v_c, 'servico', v_escova, 1, v_prof);
  begin
    perform public.fechar_comanda(v_c, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor_centavos', v_preco)), v_hoje + 1);
    r := r || ' avulsa no futuro: FALHA (aceitou);'; falhou := true;
  exception when others then r := r || ' avulsa no futuro recusada OK;';
  end;
  perform public.fechar_comanda(v_c, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor_centavos', v_preco)), '2020-02-10');
  select data_atendimento into v_d from public.comandas where id = v_c;
  r := r || format(' avulsa com data %s;', case when v_d = '2020-02-10' then 'OK' else 'FALHA' end);
  if v_d <> '2020-02-10' then falhou := true; end if;

  v_c := public.abrir_comanda(v_cliente, null);
  perform public.lancar_item(v_c, 'servico', v_escova, 1, v_prof);
  perform public.fechar_comanda(v_c, '[]'::jsonb, jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor_centavos', v_preco)));
  select data_atendimento into v_d from public.comandas where id = v_c;
  r := r || format(' avulsa sem data entra hoje %s;', case when v_d = v_hoje then 'OK' else 'FALHA' end);
  if v_d <> v_hoje then falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
