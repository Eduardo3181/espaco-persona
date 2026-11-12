-- A trava "fórmula só muda com a comanda aberta" impedia apagar uma comanda
-- ou uma cliente (LGPD) que tivesse fórmula: na exclusão em cascata a comanda
-- já não existe. Agora a exclusão só é barrada quando a comanda existe e está
-- fechada ou cancelada.
create or replace function public.conferir_formula_comanda_aberta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.comanda_itens i join public.comandas c on c.id = i.comanda_id
                where i.id = old.comanda_item_id and c.status <> 'aberta') then
      raise exception 'A comanda não está aberta.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if not exists (select 1 from public.comanda_itens i join public.comandas c on c.id = i.comanda_id
                  where i.id = new.comanda_item_id and c.status = 'aberta') then
    raise exception 'A comanda não está aberta.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.conferir_formula_comanda_aberta() from public, anon, authenticated;
