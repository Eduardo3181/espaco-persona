-- =====================================================================
-- Reajuste em massa dos preços dos serviços (só o dono).
-- Aplica um percentual a todos os serviços ativos ou a uma categoria,
-- arredondando o resultado PARA CIMA até o real inteiro.
-- Comandas já lançadas guardam o próprio valor e não mudam.
-- A mesma conta é feita na prévia (src/lib/formato.ts → precoReajustado).
-- =====================================================================

create function public.reajustar_precos_servicos(p_percentual numeric, p_categoria_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_centesimos integer := round(p_percentual * 100);
  v_antes jsonb;
  v_qtd integer;
begin
  if not public.eh_dono() then
    raise exception 'Só o dono pode reajustar preços.' using errcode = 'P0001';
  end if;
  if p_percentual is null or p_percentual <= -100 or p_percentual > 100 or p_percentual = 0 then
    raise exception 'Percentual inválido.' using errcode = 'P0001';
  end if;

  with alvo as (
    select id, preco_centavos as antes,
           (ceil(preco_centavos::numeric * (10000 + v_centesimos) / 1000000) * 100)::integer as depois
    from public.servicos
    where ativo and (p_categoria_id is null or categoria_id = p_categoria_id)
  ),
  mudou as (
    update public.servicos s set preco_centavos = a.depois
    from alvo a
    where s.id = a.id and a.depois <> a.antes
    returning s.id, a.antes, a.depois
  )
  select count(*), jsonb_agg(jsonb_build_object('id', id, 'antes', antes, 'depois', depois))
  into v_qtd, v_antes
  from mudou;

  if v_qtd > 0 then
    insert into public.log_auditoria (usuario_id, tabela, registro_id, acao, antes, depois)
    values (auth.uid(), 'servicos', p_categoria_id::text, 'REAJUSTE',
            jsonb_build_object('percentual', p_percentual, 'categoria_id', p_categoria_id),
            v_antes);
  end if;
  return v_qtd;
end;
$$;

revoke execute on function public.reajustar_precos_servicos(numeric, uuid) from public, anon;
grant execute on function public.reajustar_precos_servicos(numeric, uuid) to authenticated;
