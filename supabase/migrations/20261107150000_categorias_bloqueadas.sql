-- =====================================================================
-- Categorias que uma profissional não pode lançar, para evitar lançamento
-- errado (ex.: a manicure não lança serviços nem produtos de cabelo).
-- Vale no agendamento e na comanda, inclusive quando o dono lança em nome
-- dela. O que já estava lançado continua como está.
-- =====================================================================
create table public.profissional_categorias_bloqueadas (
  profissional_id uuid not null references public.profissionais (id) on delete cascade,
  categoria_id    uuid not null references public.categorias (id) on delete cascade,
  primary key (profissional_id, categoria_id)
);

alter table public.profissional_categorias_bloqueadas enable row level security;
revoke all on public.profissional_categorias_bloqueadas from anon;
create policy "equipe vê categorias bloqueadas" on public.profissional_categorias_bloqueadas
  for select to authenticated using (public.eh_equipe());
create policy "dono define categorias bloqueadas" on public.profissional_categorias_bloqueadas
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

create function public.exigir_categoria_permitida(p_profissional_id uuid, p_categoria_id uuid, p_item text)
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
    raise exception '% não pode lançar "%": a categoria % é bloqueada para ela.', split_part(v_nome, ' ', 1), p_item, v_categoria
      using errcode = 'P0001';
  end if;
end;
$$;

create function public.conferir_categoria_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_categoria_permitida(
    new.profissional_id,
    case when new.tipo = 'servico' then (select categoria_id from public.servicos where id = new.servico_id)
         when new.tipo = 'produto' then (select categoria_id from public.produtos where id = new.produto_id) end,
    new.descricao);
  return new;
end;
$$;

create trigger comanda_itens_categoria_permitida
  before insert or update of profissional_id, servico_id, produto_id on public.comanda_itens
  for each row execute function public.conferir_categoria_item();

create function public.conferir_categoria_agendamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prof uuid;
  v_categoria uuid;
  v_nome text;
begin
  select profissional_id into v_prof from public.agendamentos where id = new.agendamento_id;
  select categoria_id, nome into v_categoria, v_nome from public.servicos where id = new.servico_id;
  perform public.exigir_categoria_permitida(v_prof, v_categoria, v_nome);
  return new;
end;
$$;

create trigger agendamento_servicos_categoria_permitida
  before insert or update of servico_id on public.agendamento_servicos
  for each row execute function public.conferir_categoria_agendamento();

revoke execute on function public.exigir_categoria_permitida(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.conferir_categoria_item() from public, anon, authenticated;
revoke execute on function public.conferir_categoria_agendamento() from public, anon, authenticated;

-- Di (manicure): nada de cabelo
insert into public.profissional_categorias_bloqueadas (profissional_id, categoria_id)
select p.id, k.id
  from public.profissionais p, public.categorias k
 where p.nome = 'Di'
   and ((k.tipo = 'servico' and k.nome in ('Coloração e reflexo', 'Cortes', 'Escova e finalização', 'Mega hair', 'Penteados', 'Tratamentos'))
     or (k.tipo = 'produto' and k.nome = 'Produtos para cabelo'));
