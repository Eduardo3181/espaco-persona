-- Mensagem do bloqueio de categoria com texto neutro.
create or replace function public.exigir_categoria_permitida(p_profissional_id uuid, p_categoria_id uuid, p_item text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_categoria text;
begin
  if p_categoria_id is null then return; end if;
  select p.nome, k.nome into v_nome, v_categoria
    from public.profissional_categorias_bloqueadas b
    join public.profissionais p on p.id = b.profissional_id
    join public.categorias k on k.id = b.categoria_id
   where b.profissional_id = p_profissional_id and b.categoria_id = p_categoria_id;
  if found then
    raise exception '% não pode lançar "%": a categoria % está bloqueada em Equipe.', split_part(v_nome, ' ', 1), p_item, v_categoria
      using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.exigir_categoria_permitida(uuid, uuid, text) from public, anon, authenticated;
