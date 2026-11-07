-- =====================================================================
-- Teste do DESCONTO DO PIX ao fechar a comanda. DESFAZ TUDO no final.
-- Rodar:  npx supabase db query --linked -f supabase/tests/desconto_pix.sql
-- =====================================================================
do $$
declare
  v_dono_user uuid; v_prof uuid; v_cliente uuid; v_serv uuid; v_cat uuid; v_comanda uuid;
  n int; r text := ''; falhou boolean := false;
begin
  select usuario_id into v_dono_user from public.profissionais where papel = 'dono' and usuario_id is not null limit 1;
  select id into v_prof from public.profissionais where nome = 'Di';
  select id into v_cat from public.categorias where tipo = 'servico' limit 1;

  update public.configuracoes set desconto_pix = 3, taxa_pix = 0, taxa_credito = 2, caixinha_desconta_taxa = false;
  insert into public.clientes (nome) values ('ZZ Teste Pix') returning id into v_cliente;
  insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos) values ('ZZ Serviço', v_cat, 30, 10000) returning id into v_serv;
  delete from public.regras_comissao where profissional_id = v_prof;
  insert into public.regras_comissao (profissional_id, tipo, percentual) values (v_prof, 'padrao', 40);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_user, 'role', 'authenticated')::text, true);

  -- 1) Tudo em Pix, com caixinha: 100,00 + 10,00; desconto só sobre os 100,00
  v_comanda := public.abrir_comanda(v_cliente, null);
  perform public.lancar_item(v_comanda, 'servico', v_serv, 1, v_prof);
  perform public.fechar_comanda(v_comanda,
    ('[{"profissional_id":"' || v_prof || '","valor_centavos":1000}]')::jsonb,
    '[{"forma":"pix","valor_centavos":11000}]');

  select total_desconto_centavos into n from public.comandas where id = v_comanda;
  r := r || format(' desconto=%s %s;', n, case when n = 300 then 'OK' else 'FALHA (esperado 300)' end);
  if n <> 300 then falhou := true; end if;
  select valor_centavos into n from public.comanda_pagamentos where comanda_id = v_comanda;
  r := r || format(' pago em pix=%s %s;', n, case when n = 10700 then 'OK' else 'FALHA (esperado 10700)' end);
  if n <> 10700 then falhou := true; end if;
  select total_itens_centavos into n from public.comandas where id = v_comanda;
  r := r || format(' faturamento=%s %s;', n, case when n = 9700 then 'OK' else 'FALHA (esperado 9700)' end);
  if n <> 9700 then falhou := true; end if;
  select comissao_centavos into n from public.comanda_itens where comanda_id = v_comanda;
  r := r || format(' comissão no valor cheio=%s %s;', n, case when n = 4000 then 'OK' else 'FALHA (esperado 4000)' end);
  if n <> 4000 then falhou := true; end if;
  select valor_centavos into n from public.lancamentos_profissional where comanda_id = v_comanda and tipo = 'caixinha';
  r := r || format(' caixinha inteira=%s %s;', n, case when n = 1000 then 'OK' else 'FALHA' end);
  if n <> 1000 then falhou := true; end if;

  -- 2) Reabrir devolve o valor cheio
  perform public.reabrir_comanda(v_comanda, 'teste');
  select valor_centavos into n from public.comanda_pagamentos where comanda_id = v_comanda;
  r := r || format(' reaberta volta ao cheio=%s %s;', n, case when n = 11000 then 'OK' else 'FALHA' end);
  if n <> 11000 then falhou := true; end if;
  select total_desconto_centavos into n from public.comandas where id = v_comanda;
  if n <> 0 then r := r || ' reaberta com desconto: FALHA;'; falhou := true; end if;

  -- 3) Dividido, sem caixinha: 50,00 em Pix e 50,00 no crédito; crédito não muda; taxa sobre o valor pago
  perform public.fechar_comanda(v_comanda, '[]'::jsonb, '[{"forma":"pix","valor_centavos":5000},{"forma":"credito","valor_centavos":5000,"parcelas":1}]');
  select total_desconto_centavos into n from public.comandas where id = v_comanda;
  r := r || format(' dividido desconto=%s %s;', n, case when n = 150 then 'OK' else 'FALHA (esperado 150)' end);
  if n <> 150 then falhou := true; end if;
  select valor_centavos into n from public.comanda_pagamentos where comanda_id = v_comanda and forma = 'credito';
  r := r || format(' crédito inteiro=%s %s;', n, case when n = 5000 then 'OK' else 'FALHA' end);
  if n <> 5000 then falhou := true; end if;

  -- 4) Sem Pix: nenhum desconto
  perform public.reabrir_comanda(v_comanda, 'teste');
  perform public.fechar_comanda(v_comanda, '[]'::jsonb, '[{"forma":"dinheiro","valor_centavos":10000}]');
  select total_desconto_centavos into n from public.comandas where id = v_comanda;
  r := r || format(' dinheiro sem desconto=%s %s;', n, case when n = 0 then 'OK' else 'FALHA' end);
  if n <> 0 then falhou := true; end if;
  select total_itens_centavos into n from public.comandas where id = v_comanda;
  if n <> 10000 then r := r || ' faturamento em dinheiro: FALHA;'; falhou := true; end if;

  raise exception 'RESULTADO: %', case when falhou then 'HÁ FALHAS ->' else 'TUDO OK ->' end || r;
end;
$$;
