-- =====================================================================
-- Espaço Persona — Fase 6 (Relatórios)
-- O salão não controla despesas no sistema: o resultado é
-- faturamento − comissões − taxas da maquininha.
-- Faturamento = itens das comandas FECHADAS (sem caixinhas),
-- pela data de fechamento (fuso de São Paulo). Só o dono.
-- =====================================================================

create function public.relatorio_vendas(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.eh_dono() then
    raise exception 'Relatórios são só para o dono.' using errcode = 'P0001';
  end if;

  with cmd as (
    select c.*, (c.fechada_em at time zone 'America/Sao_Paulo')::date as dia
      from public.comandas c
     where c.status = 'fechada'
       and (c.fechada_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  ),
  itens as (
    select i.*, c.dia from public.comanda_itens i join cmd c on c.id = i.comanda_id
  )
  select jsonb_build_object(
    'totais', (select jsonb_build_object(
        'faturamento', coalesce(sum(total_itens_centavos), 0),
        'caixinhas',   coalesce(sum(total_caixinhas_centavos), 0),
        'taxas',       coalesce(sum(total_taxas_centavos), 0),
        'comissoes',   coalesce(sum(total_comissoes_centavos), 0),
        'comandas',    count(*),
        'clientes',    count(distinct cliente_id)
      ) from cmd),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'valor', valor) order by dia)
        from (select dia, sum(total_itens_centavos) as valor from cmd group by dia) d), '[]'),
    'por_item', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'descricao', descricao, 'quantidade', qtd, 'valor', valor) order by valor desc)
        from (select tipo, descricao, sum(quantidade) as qtd, sum(valor_total_centavos) as valor
                from itens group by tipo, descricao) x), '[]'),
    'por_forma', coalesce((select jsonb_agg(jsonb_build_object('forma', forma, 'valor', valor, 'taxa', taxa) order by valor desc)
        from (select g.forma, sum(g.valor_centavos) as valor, sum(coalesce(g.taxa_centavos, 0)) as taxa
                from public.comanda_pagamentos g join cmd c on c.id = g.comanda_id group by g.forma) f), '[]'),
    'por_profissional', coalesce((select jsonb_agg(jsonb_build_object(
          'profissional_id', p.id, 'nome', p.nome, 'cor', p.cor,
          'faturamento', x.valor, 'comissao', x.comissao, 'atendimentos', x.atendimentos,
          'caixinhas', coalesce((select sum(cx.valor_centavos) from public.comanda_caixinhas cx join cmd c on c.id = cx.comanda_id
                                  where cx.profissional_id = p.id), 0)) order by x.valor desc)
        from (select profissional_id, sum(valor_total_centavos) as valor, sum(coalesce(comissao_centavos, 0)) as comissao,
                     count(distinct comanda_id) as atendimentos
                from itens group by profissional_id) x
        join public.profissionais p on p.id = x.profissional_id), '[]')
  ) into v;

  return v;
end;
$$;

revoke execute on function public.relatorio_vendas(date, date) from public, anon;
grant execute on function public.relatorio_vendas(date, date) to authenticated;
