-- =====================================================================
-- Teste do RETORNO DA CLIENTE: só o dono acessa. DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/retornos.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid; v_cliente uuid; v_serv uuid; v_id uuid;
  n int; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select usuario_id into v_di_user from public.profissionais where nome = 'Di';
  select id into v_serv from public.servicos limit 1;
  insert into public.clientes (nome) values ('ZZ Teste Retorno') returning id into v_cliente;

  -- ================= DONO
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);
  insert into public.retornos_clientes (cliente_id, servico_id, data_retorno) values (v_cliente, v_serv, '2031-05-01') returning id into v_id;
  select count(*) into n from public.retornos_clientes where id = v_id;
  r := r || format(' dono vê=%s %s;', n, case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  -- ================= PROFISSIONAL (Di)
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  select count(*) into n from public.retornos_clientes;
  r := r || format(' prof vê=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  begin
    insert into public.retornos_clientes (cliente_id, servico_id, data_retorno) values (v_cliente, v_serv, '2031-05-02');
    r := r || ' prof grava: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' prof grava bloqueado OK;';
  end;
  update public.retornos_clientes set avisado_em = now() where id = v_id;
  get diagnostics n = row_count;
  r := r || format(' prof altera=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  -- ================= LGPD: excluir a cliente apaga o retorno
  perform set_config('role', 'postgres', true);
  delete from public.clientes where id = v_cliente;
  select count(*) into n from public.retornos_clientes where id = v_id;
  r := r || format(' apagado com a cliente=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
