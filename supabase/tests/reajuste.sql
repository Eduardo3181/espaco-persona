-- =====================================================================
-- Teste do REAJUSTE EM MASSA dos preços dos serviços.
-- DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/reajuste.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid;
  v_cat uuid; v_outra_cat uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_inativo uuid; v_fora uuid;
  n int; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select usuario_id into v_di_user from public.profissionais where nome = 'Di';

  insert into public.categorias (nome, tipo) values ('ZZ Teste reajuste', 'servico') returning id into v_cat;
  insert into public.categorias (nome, tipo) values ('ZZ Outra categoria', 'servico') returning id into v_outra_cat;
  insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos) values ('ZZ A', v_cat, 30, 8000) returning id into v_s1;
  insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos) values ('ZZ B', v_cat, 30, 4550) returning id into v_s2;
  insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos) values ('ZZ C', v_cat, 30, 0) returning id into v_s3;
  insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos, ativo) values ('ZZ Inativo', v_cat, 30, 8000, false) returning id into v_inativo;
  insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos) values ('ZZ Fora', v_outra_cat, 30, 8000) returning id into v_fora;

  -- ================= PROFISSIONAL (Di): não pode reajustar
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  begin
    perform public.reajustar_precos_servicos(10, v_cat);
    r := r || ' profissional reajustar: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' profissional bloqueada OK;';
  end;

  -- ================= DONO: 7,5% só na categoria de teste
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);
  n := public.reajustar_precos_servicos(7.5, v_cat);
  r := r || format(' alterados=%s %s;', n, case when n = 2 then 'OK' else 'FALHA (esperado 2)' end);
  if n <> 2 then falhou := true; end if;

  select preco_centavos into n from public.servicos where id = v_s1;   -- 80,00 + 7,5% = 86,00
  r := r || format(' R$80→%s %s;', n, case when n = 8600 then 'OK' else 'FALHA (esperado 8600)' end);
  if n <> 8600 then falhou := true; end if;

  select preco_centavos into n from public.servicos where id = v_s2;   -- 45,50 + 7,5% = 48,91 → 49,00
  r := r || format(' R$45,50→%s %s;', n, case when n = 4900 then 'OK' else 'FALHA (esperado 4900)' end);
  if n <> 4900 then falhou := true; end if;

  select preco_centavos into n from public.servicos where id = v_s3;
  r := r || format(' zero continua zero=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  select preco_centavos into n from public.servicos where id = v_inativo;
  r := r || format(' inativo não muda=%s %s;', n, case when n = 8000 then 'OK' else 'FALHA' end);
  if n <> 8000 then falhou := true; end if;

  select preco_centavos into n from public.servicos where id = v_fora;
  r := r || format(' outra categoria não muda=%s %s;', n, case when n = 8000 then 'OK' else 'FALHA' end);
  if n <> 8000 then falhou := true; end if;

  -- Percentual inválido é recusado
  begin
    perform public.reajustar_precos_servicos(0, v_cat);
    r := r || ' percentual zero: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' percentual zero recusado OK;';
  end;

  perform set_config('role', 'postgres', true);
  select count(*) into n from public.log_auditoria where tabela = 'servicos' and acao = 'REAJUSTE' and registro_id = v_cat::text;
  r := r || format(' registro na auditoria=%s %s;', n, case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
