-- =====================================================================
-- Gestão: Visão (quanto se espera pagar) e Realidade (quanto foi de fato).
-- valor_centavos é a Visão. Com Realidade preenchida, é ela que conta no
-- resultado e no dinheiro disponível; vazia, conta a Visão.
-- =====================================================================
alter table public.fin_lancamentos
  add column valor_real_centavos integer check (valor_real_centavos >= 0);

create or replace function public.gestao_posicao(p_data date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde date;
  v_saldo bigint := 0;
begin
  if not public.eh_dono() then
    raise exception 'A gestão financeira é só para o dono.' using errcode = 'P0001';
  end if;
  select fin_data_inicio into v_desde from public.configuracoes;

  if v_desde is not null then
    select coalesce(sum(saldo_inicial_centavos), 0) into v_saldo from public.fin_contas where ativo;

    if p_data >= v_desde then
      v_saldo := v_saldo
        + coalesce((select sum(g.valor_centavos) from public.comanda_pagamentos g join public.comandas c on c.id = g.comanda_id
                     where c.status = 'fechada' and g.forma <> 'saldo' and c.data_atendimento between v_desde and p_data), 0)
        - coalesce((select sum(c.total_taxas_centavos) from public.comandas c
                     where c.status = 'fechada' and c.data_atendimento between v_desde and p_data), 0)
        + coalesce((select sum(m.valor_centavos) from public.movimentos_saldo m
                     where m.comanda_id is null and m.valor_centavos > 0
                       and (m.criado_em at time zone 'America/Sao_Paulo')::date between v_desde and p_data), 0)
        - coalesce((select sum(p.total_pago_centavos) from public.pagamentos_profissional p
                     where p.data_pagamento between v_desde and p_data), 0)
        + coalesce((select sum(case when k.grupo in ('receita', 'receita_nao_operacional')
                                    then coalesce(l.valor_real_centavos, l.valor_centavos)
                                    else -coalesce(l.valor_real_centavos, l.valor_centavos) end)
                      from public.fin_lancamentos l join public.fin_categorias k on k.id = l.categoria_id
                     where l.pagamento between v_desde and p_data), 0);
    end if;
  end if;

  return jsonb_build_object(
    'inicio', v_desde,
    'saldo', v_saldo,
    'clientes_devendo', coalesce((select -sum(saldo_centavos) from public.saldos_clientes where saldo_centavos < 0), 0),
    'comissoes_a_pagar', coalesce((select sum(valor_centavos) from public.lancamentos_profissional where pagamento_id is null), 0)
  );
end;
$$;
