-- =====================================================================
-- Teste da GESTÃO FINANCEIRA: contas do dinheiro disponível e do
-- resultado, e bloqueio para a profissional. DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/gestao.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_di_user uuid; v_prof uuid;
  v_conta uuid; v_desp uuid; v_rec uuid; v_comanda uuid; v_lanc uuid;
  v_base bigint; v_saldo bigint; v_auto jsonb; n int; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select usuario_id, id into v_di_user, v_prof from public.profissionais where nome = 'Di';

  update public.configuracoes set fin_data_inicio = '2031-02-01';
  insert into public.fin_contas (nome, saldo_inicial_centavos) values ('ZZ Banco', 100000) returning id into v_conta;
  insert into public.fin_categorias (nome, grupo) values ('ZZ Aluguel', 'despesa_fixa') returning id into v_desp;
  insert into public.fin_categorias (nome, grupo) values ('ZZ Rendimento', 'receita_nao_operacional') returning id into v_rec;

  insert into public.fin_lancamentos (categoria_id, conta_id, valor_centavos, vencimento, pagamento) values
    (v_desp, v_conta, 20000, '2031-02-10', '2031-02-10'),   -- saiu
    (v_rec,  v_conta,  5000, '2031-02-11', '2031-02-11'),   -- entrou
    (v_desp, v_conta,  7000, '2031-02-20', null),           -- em aberto: não mexe no dinheiro
    (v_desp, v_conta,  9000, '2031-01-20', '2031-01-20');   -- antes do início: não conta

  insert into public.comandas (status, data_atendimento, total_itens_centavos, total_taxas_centavos, total_comissoes_centavos)
    values ('fechada', '2031-02-05', 50000, 1000, 20000) returning id into v_comanda;
  insert into public.comanda_pagamentos (comanda_id, forma, valor_centavos) values
    (v_comanda, 'pix', 40000), (v_comanda, 'saldo', 15000);  -- saldo na casa não é dinheiro novo; 5000 é caixinha no total
  insert into public.pagamentos_profissional (profissional_id, periodo_inicio, periodo_fim, data_pagamento, forma,
      total_comissoes_centavos, total_caixinhas_centavos, total_pago_centavos)
    values (v_prof, '2031-02-01', '2031-02-15', '2031-02-16', 'pix', 20000, 0, 20000);

  -- ================= DONO
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  v_base := (public.gestao_posicao('2031-02-01') ->> 'saldo')::bigint;  -- só saldos iniciais (nada aconteceu em 01/02)
  v_saldo := (public.gestao_posicao('2031-02-28') ->> 'saldo')::bigint;
  -- +400,00 pix − 10,00 taxa − 200,00 profissional − 200,00 aluguel + 50,00 rendimento = +40,00
  r := r || format(' dinheiro no mês=%s %s;', v_saldo - v_base, case when v_saldo - v_base = 4000 then 'OK' else 'FALHA (esperado 4000)' end);
  if v_saldo - v_base <> 4000 then falhou := true; end if;

  v_auto := public.gestao_automaticos('2031-02-01', '2031-02-28') -> 0;
  n := (v_auto ->> 'faturamento')::int;
  r := r || format(' faturamento=%s %s;', n, case when n = 50000 then 'OK' else 'FALHA' end);
  if n <> 50000 then falhou := true; end if;
  n := (v_auto ->> 'recebido')::int;
  r := r || format(' recebido sem saldo na casa=%s %s;', n, case when n = 40000 then 'OK' else 'FALHA' end);
  if n <> 40000 then falhou := true; end if;
  n := (v_auto ->> 'comissoes')::int + (v_auto ->> 'taxas')::int + (v_auto ->> 'pago_profissionais')::int;
  r := r || format(' comissão+taxa+pago=%s %s;', n, case when n = 41000 then 'OK' else 'FALHA' end);
  if n <> 41000 then falhou := true; end if;

  -- ================= PROFISSIONAL (Di): não vê nem grava nada
  perform set_config('request.jwt.claims', json_build_object('sub', v_di_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.fin_lancamentos;
  r := r || format(' prof vê lançamentos=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  select count(*) into n from public.fin_contas;
  r := r || format(' prof vê contas=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  select count(*) into n from public.fin_categorias;
  r := r || format(' prof vê categorias=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  select count(*) into n from public.fin_metas;
  r := r || format(' prof vê metas=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;

  begin
    insert into public.fin_lancamentos (categoria_id, valor_centavos, vencimento) values (v_desp, 100, '2031-02-01') returning id into v_lanc;
    r := r || ' prof grava lançamento: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' prof grava bloqueado OK;';
  end;
  begin
    perform public.gestao_posicao('2031-02-28');
    r := r || ' prof lê posição: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' prof posição bloqueada OK;';
  end;
  begin
    perform public.gestao_automaticos('2031-02-01', '2031-02-28');
    r := r || ' prof lê automáticos: FALHA (permitiu);'; falhou := true;
  exception when others then r := r || ' prof automáticos bloqueado OK;';
  end;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
