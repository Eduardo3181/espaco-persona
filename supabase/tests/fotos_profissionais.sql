-- =====================================================================
-- Teste: quem pode ver e alterar as fotos da equipe. DESFAZ TUDO.
-- Rodar:  npx supabase db query --linked -f supabase/tests/fotos_profissionais.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid; n int; v_publico boolean;
  r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where nome = 'Eduardo Persan';
  select usuario_id into v_di_user from public.profissionais where nome = 'Di';

  select public into v_publico from storage.buckets where id = 'fotos-profissionais';
  r := r || format(' espaço privado %s;', case when v_publico = false then 'OK' else 'FALHA' end);
  if v_publico is distinct from false then falhou := true; end if;

  perform set_config('role', 'authenticated', true);

  -- Dono envia
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name) values ('fotos-profissionais', 'zz-teste/a.jpg');
  r := r || ' dono envia OK;';

  -- Profissional vê, mas não envia, não troca e não remove
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'fotos-profissionais' and name = 'zz-teste/a.jpg';
  r := r || format(' profissional vê %s;', case when n = 1 then 'OK' else 'FALHA' end);
  if n <> 1 then falhou := true; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('fotos-profissionais', 'zz-teste/b.jpg');
    r := r || ' profissional enviar: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' profissional enviar bloqueado OK;';
  end;
  update storage.objects set name = 'zz-teste/c.jpg' where bucket_id = 'fotos-profissionais' and name = 'zz-teste/a.jpg';
  get diagnostics n = row_count;
  r := r || format(' profissional trocar bloqueado %s;', case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  -- Sem login: nada
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from storage.objects where bucket_id = 'fotos-profissionais';
  r := r || format(' sem login não vê %s;', case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
