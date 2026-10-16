-- =====================================================================
-- Teste do PAGAMENTO DE COMISSÕES e da segurança do extrato.
-- DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/pagamentos.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_val_user uuid := gen_random_uuid();
  v_prof uuid; v_outra uuid; v_cliente uuid; v_comanda uuid; v_pag uuid;
  n int; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select id into v_prof from public.profissionais where nome = 'Di';
  select id into v_outra from public.profissionais where nome = 'Valdete Costa';

  -- Lançamentos de teste: 1ª quinzena de jan/2030 e um no dia 16 (outro período)
  insert into public.clientes (nome) values ('ZZ Cliente Extrato') returning id into v_cliente;
  insert into public.comandas (cliente_id, status) values (v_cliente, 'fechada') returning id into v_comanda;
  insert into public.lancamentos_profissional (profissional_id, tipo, valor_centavos, descricao, data, comanda_id) values
    (v_prof, 'comissao', 4000, 'Escova (40%) — comanda #0', '2030-01-05', v_comanda),
    (v_prof, 'caixinha', 1000, 'Caixinha — comanda #0', '2030-01-15', v_comanda),
    (v_prof, 'comissao', 7000, 'Corte (40%) — comanda #0', '2030-01-16', v_comanda),
    (v_outra,      'comissao', 2500, 'Manicure (50%) — comanda #0', '2030-01-10', v_comanda);

  -- ================= DONO
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  v_pag := public.registrar_pagamento(v_prof, '2030-01-01', '2030-01-15', '2030-01-16', 'pix', null);
  select total_pago_centavos into n from public.pagamentos_profissional where id = v_pag;
  r := r || format(' total pago=%s %s;', n, case when n = 5000 then 'OK' else 'FALHA (esperado 5000)' end);
  if n <> 5000 then falhou := true; end if;

  select count(*) into n from public.lancamentos_profissional where profissional_id = v_prof and pagamento_id is null and data between '2030-01-01' and '2030-01-31';
  r := r || format(' fora do período continua pendente=%s %s;', n, case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  begin
    perform public.registrar_pagamento(v_prof, '2030-01-01', '2030-01-15', '2030-01-16', 'pix', null);
    r := r || ' pagar 2 vezes: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' pagar 2 vezes bloqueado OK;';
  end;

  begin
    update public.comandas set status = 'fechada' where id = v_comanda;  -- (sem efeito)
    perform public.reabrir_comanda(v_comanda, 'teste');
    r := r || ' reabrir comanda já paga: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' reabrir comanda paga bloqueado OK;';
  end;

  perform public.desfazer_pagamento(v_pag);
  select count(*) into n from public.lancamentos_profissional where profissional_id = v_prof and pagamento_id is null and data between '2030-01-01' and '2030-01-15';
  r := r || format(' desfazer volta pendente=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;
  v_pag := public.registrar_pagamento(v_prof, '2030-01-01', '2030-01-15', '2030-01-16', 'pix', null);

  -- ================= PROFISSIONAL (Di)
  reset role;
  -- Usa o login real da profissional sob teste (só simulação; tudo é desfeito no final)
  select usuario_id into v_val_user from public.profissionais where id = v_prof;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_val_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.extrato_profissional(v_prof, '2030-01-01', '2030-01-31') e where e.cliente_nome = 'ZZ Cliente Extrato';
  r := r || format(' extrato próprio com nome da cliente=%s %s;', n, case when n = 3 then 'OK' else 'FALHA' end);
  if n <> 3 then falhou := true; end if;

  select count(*) into n from public.extrato_profissional(v_outra, '2030-01-01', '2030-01-31');
  r := r || format(' extrato da outra=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  select count(*) into n from public.lancamentos_profissional where profissional_id = v_outra;
  r := r || format(' lançamentos da outra=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  select count(*) into n from public.pagamentos_profissional where profissional_id <> v_prof;
  r := r || format(' pagamentos de outras=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  select count(*) into n from public.extrato_pagamento(v_pag);
  r := r || format(' extrato do próprio pagamento=%s %s;', n, case when n = 2 then 'OK' else 'FALHA' end);
  if n <> 2 then falhou := true; end if;

  begin
    perform public.registrar_pagamento(v_prof, '2030-01-16', '2030-01-31', '2030-02-01', 'pix', null);
    r := r || ' profissional registrar pagamento: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' profissional registrar bloqueado OK;';
  end;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
