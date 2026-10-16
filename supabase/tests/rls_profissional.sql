-- =====================================================================
-- Teste de segurança (RLS) do perfil PROFISSIONAL.
-- Simula a Di (profissional) logada com o login real dela e,
-- no final, DESFAZ TUDO (a exceção final cancela a transação).
-- Rodar:  npx supabase db query --linked -f supabase/tests/rls_profissional.sql
-- Resultado esperado: mensagem "RESULTADO: ..." com todos os itens OK.
-- =====================================================================
do $$
declare
  v_usuario uuid := gen_random_uuid();
  v_prof uuid;
  v_eduardo uuid;
  v_cliente uuid;
  v_anotacao_eduardo uuid;
  n int;
  r text := '';
  falhou boolean := false;

begin
  select id into v_prof from public.profissionais where nome = 'Di';
  select id into v_eduardo from public.profissionais where papel = 'dono' limit 1;
  select id into v_cliente from public.clientes order by criado_em limit 1;

  -- Login temporário (ligado à Valdete) e uma anotação do dono para os testes
  -- Usa o login real da profissional sob teste (só simulação; tudo é desfeito no final)
  select usuario_id into v_usuario from public.profissionais where id = v_prof;
  insert into public.anotacoes_clientes (cliente_id, autor_id, texto)
  values (v_cliente, v_eduardo, 'anotação do dono (teste)') returning id into v_anotacao_eduardo;

  -- A partir daqui, age como a Valdete logada
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

  if public.eh_dono() or not public.eh_equipe() then falhou := true; r := r || ' [perfil ERRADO]'; end if;

  select count(*) into n from public.clientes;
  r := r || format(' clientes visíveis=%s %s;', n, case when n > 0 then 'OK' else 'FALHA' end);
  if n = 0 then falhou := true; end if;

  select count(*) into n from public.movimentos_saldo;
  r := r || format(' saldo visível=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  select count(*) into n from public.saldos_clientes;
  r := r || format(' view saldos=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  select count(*) into n from public.regras_comissao where profissional_id <> v_prof;
  r := r || format(' regras de outras=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  select count(*) into n from public.log_auditoria;
  r := r || format(' auditoria=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  begin
    insert into public.servicos (nome, categoria_id, duracao_min) select 'X', id, 30 from public.categorias limit 1;
    r := r || ' criar serviço: FALHA (permitiu);'; falhou := true;
  exception when insufficient_privilege then r := r || ' criar serviço bloqueado OK;';
  end;

  begin
    insert into public.movimentos_saldo (cliente_id, valor_centavos, descricao) values (v_cliente, 100, 'x');
    r := r || ' lançar saldo: FALHA (permitiu);'; falhou := true;
  exception when insufficient_privilege then r := r || ' lançar saldo bloqueado OK;';
  end;

  delete from public.clientes where id = v_cliente;
  get diagnostics n = row_count;
  r := r || format(' excluir cliente=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  update public.profissionais set papel = 'dono' where id = v_prof;
  get diagnostics n = row_count;
  r := r || format(' virar dono=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  insert into public.anotacoes_clientes (cliente_id, texto) values (v_cliente, 'anotação da Valdete (teste)');
  r := r || ' escrever anotação OK;';

  begin
    insert into public.anotacoes_clientes (cliente_id, autor_id, texto) values (v_cliente, v_eduardo, 'falsa');
    r := r || ' anotar em nome de outra: FALHA (permitiu);'; falhou := true;
  exception when insufficient_privilege then r := r || ' anotar em nome de outra bloqueado OK;';
  end;

  update public.anotacoes_clientes set texto = 'alterada' where id = v_anotacao_eduardo;
  get diagnostics n = row_count;
  r := r || format(' editar anotação do dono=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  delete from public.anotacoes_clientes where id = v_anotacao_eduardo;
  get diagnostics n = row_count;
  r := r || format(' apagar anotação do dono=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  update public.fichas_tecnicas set preferencias = preferencias where cliente_id = v_cliente;
  r := r || ' editar ficha técnica OK;';

  -- Desfaz tudo
  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
