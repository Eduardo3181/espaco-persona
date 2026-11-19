-- Produtos à venda sem comissão (pedido do dono em 19/11/2026): todos ficam com 0%,
-- produto novo começa com 0%, e as comissões de produto ainda não pagas são retiradas.
-- Comissões de produto já pagas não mudam.
alter table public.produtos alter column comissao_percentual set default 0;
update public.produtos set comissao_percentual = 0 where comissao_percentual <> 0;

delete from public.lancamentos_profissional l
 using public.comanda_itens i
 where i.id = l.comanda_item_id and i.tipo = 'produto' and l.tipo = 'comissao' and l.pagamento_id is null;

update public.comanda_itens i set comissao_percentual = 0, comissao_centavos = 0
 where i.tipo = 'produto' and coalesce(i.comissao_centavos, 0) <> 0
   and not exists (select 1 from public.lancamentos_profissional l where l.comanda_item_id = i.id);

update public.comandas c
   set total_comissoes_centavos = (select coalesce(sum(i.comissao_centavos), 0) from public.comanda_itens i where i.comanda_id = c.id)
 where c.status = 'fechada'
   and c.total_comissoes_centavos is distinct from (select coalesce(sum(i.comissao_centavos), 0) from public.comanda_itens i where i.comanda_id = c.id);
