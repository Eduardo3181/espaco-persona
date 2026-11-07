-- =====================================================================
-- Teste das CONTAS RECORRENTES: a função mantém 12 meses à frente, respeita
-- o dia do mês e para quando a recorrência é encerrada. DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/gestao_recorrentes.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid; v_cat uuid; v_serie uuid := gen_random_uuid(); v_parada uuid := gen_random_uuid();
  v_base date; n int; v_d date; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select usuario_id into v_di_user from public.profissionais where nome = 'Di';
  select id into v_cat from public.fin_categorias limit 1;
  -- Dia 31 do mês passado (ou o último dia): prova que o dia não "encolhe"
  v_base := '2026-10-31';

  insert into public.fin_lancamentos (categoria_id, descricao, valor_centavos, vencimento, repeticao_id, repeticao_tipo)
  values (v_cat, 'ZZ recorrente', 10000, v_base, v_serie, 'recorrente');
  insert into public.fin_lancamentos (categoria_id, descricao, valor_centavos, vencimento, repeticao_id, repeticao_tipo, repeticao_encerrada)
  values (v_cat, 'ZZ encerrada', 10000, v_base, v_parada, 'recorrente', true);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  begin
    perform public.gestao_estender_recorrentes();
    r := r || ' profissional: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' profissional bloqueada OK;';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);
  perform public.gestao_estender_recorrentes();

  select max(vencimento) into v_d from public.fin_lancamentos where repeticao_id = v_serie;
  r := r || format(' lançada até 12 meses à frente=%s %s;', v_d,
    case when v_d > public.hoje_sp() + interval '11 months' and v_d <= public.hoje_sp() + interval '12 months' then 'OK' else 'FALHA' end);
  if not (v_d > public.hoje_sp() + interval '11 months' and v_d <= public.hoje_sp() + interval '12 months') then falhou := true; end if;

  select count(*) into n from public.fin_lancamentos where repeticao_id = v_serie and vencimento = '2027-02-28';
  r := r || format(' fevereiro no último dia=%s %s;', n, case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;
  select count(*) into n from public.fin_lancamentos where repeticao_id = v_serie and vencimento = '2027-03-31';
  r := r || format(' março volta ao dia 31=%s %s;', n, case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  select count(*) into n from public.fin_lancamentos where repeticao_id = v_parada;
  r := r || format(' encerrada não cresce=%s %s;', n, case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  -- Rodar de novo não duplica
  select count(*) into n from public.fin_lancamentos where repeticao_id = v_serie;
  perform public.gestao_estender_recorrentes();
  if n <> (select count(*) from public.fin_lancamentos where repeticao_id = v_serie) then
    r := r || ' segunda rodada duplicou: FALHA;'; falhou := true;
  else r := r || ' sem duplicar OK;';
  end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
