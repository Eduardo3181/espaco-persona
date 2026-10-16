-- =====================================================================
-- Espaço Persona — Fase 2 (Clientes)
-- Cadastro, ficha técnica, anotações e saldo na casa.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- Texto para busca: minúsculo e sem acento ("Patrícia" → "patricia")
create function public.texto_busca(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')))
$$;

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table public.clientes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (length(trim(nome)) > 0),
  telefone        text check (telefone ~ '^[0-9]{10,13}$'),   -- só números, com DDD
  aniversario_dia smallint check (aniversario_dia between 1 and 31),
  aniversario_mes smallint check (aniversario_mes between 1 and 12),
  aniversario_ano smallint check (aniversario_ano between 1900 and 2100),
  cliente_desde   date not null default (now() at time zone 'America/Sao_Paulo')::date,
  ativo           boolean not null default true,
  nome_busca      text generated always as (public.texto_busca(nome)) stored,
  criado_por      uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint clientes_aniversario check (
    (aniversario_dia is null) = (aniversario_mes is null)
    and (aniversario_ano is null or aniversario_dia is not null)
  )
);
create index clientes_nome_busca_idx on public.clientes (nome_busca);
create index clientes_telefone_idx on public.clientes (telefone);

create trigger clientes_atualizado_em
  before update on public.clientes
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Ficha técnica (uma por cliente)
-- ---------------------------------------------------------------------
create table public.fichas_tecnicas (
  cliente_id        uuid primary key references public.clientes (id) on delete cascade,
  cor_formula       text,
  tipo_cabelo       text,
  alergias_cuidados text,
  preferencias      text,
  atualizado_por    uuid references public.profissionais (id) on delete set null,
  atualizado_em     timestamptz not null default now()
);

create function public.marcar_autor_ficha()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := public.meu_profissional_id();
  return new;
end;
$$;

create trigger fichas_tecnicas_autor
  before insert or update on public.fichas_tecnicas
  for each row execute function public.marcar_autor_ficha();

-- ---------------------------------------------------------------------
-- Anotações
-- ---------------------------------------------------------------------
create table public.anotacoes_clientes (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  autor_id   uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  texto      text not null check (length(trim(texto)) > 0),
  criado_em  timestamptz not null default now(),
  editado_em timestamptz
);
create index anotacoes_clientes_cliente_idx on public.anotacoes_clientes (cliente_id, criado_em desc);

-- Autor e data de criação não podem ser trocados; marca a edição.
create function public.proteger_anotacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.autor_id := old.autor_id;
  new.cliente_id := old.cliente_id;
  new.criado_em := old.criado_em;
  new.editado_em := now();
  return new;
end;
$$;

create trigger anotacoes_clientes_proteger
  before update on public.anotacoes_clientes
  for each row execute function public.proteger_anotacao();

-- ---------------------------------------------------------------------
-- Saldo na casa: lançamentos de crédito (+) e débito (−). Só o dono.
-- ---------------------------------------------------------------------
create table public.movimentos_saldo (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes (id) on delete cascade,
  valor_centavos integer not null check (valor_centavos <> 0),  -- + crédito da cliente / − débito
  descricao      text not null check (length(trim(descricao)) > 0),
  criado_por     uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em      timestamptz not null default now()
);
create index movimentos_saldo_cliente_idx on public.movimentos_saldo (cliente_id, criado_em desc);

-- Saldo por cliente (respeita o RLS de quem consulta: só o dono vê linhas)
create view public.saldos_clientes
with (security_invoker = true) as
  select cliente_id, sum(valor_centavos)::integer as saldo_centavos
  from public.movimentos_saldo
  group by cliente_id;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.clientes           enable row level security;
alter table public.fichas_tecnicas    enable row level security;
alter table public.anotacoes_clientes enable row level security;
alter table public.movimentos_saldo   enable row level security;

revoke all on public.clientes, public.fichas_tecnicas, public.anotacoes_clientes,
              public.movimentos_saldo, public.saldos_clientes from anon;

-- Clientes: a equipe vê, cadastra e altera; só o dono exclui.
create policy "equipe vê clientes" on public.clientes
  for select to authenticated using (public.eh_equipe());
create policy "equipe cadastra clientes" on public.clientes
  for insert to authenticated with check (public.eh_equipe());
create policy "equipe altera clientes" on public.clientes
  for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy "dono exclui clientes" on public.clientes
  for delete to authenticated using (public.eh_dono());

-- Ficha técnica: a equipe vê e edita.
create policy "equipe vê fichas" on public.fichas_tecnicas
  for select to authenticated using (public.eh_equipe());
create policy "equipe cria fichas" on public.fichas_tecnicas
  for insert to authenticated with check (public.eh_equipe());
create policy "equipe altera fichas" on public.fichas_tecnicas
  for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- Anotações: a equipe vê e escreve (em nome próprio);
-- a autora corrige a sua; autora ou dono apagam.
create policy "equipe vê anotações" on public.anotacoes_clientes
  for select to authenticated using (public.eh_equipe());
create policy "equipe escreve anotações" on public.anotacoes_clientes
  for insert to authenticated
  with check (public.eh_equipe() and autor_id = public.meu_profissional_id());
create policy "autora corrige anotação" on public.anotacoes_clientes
  for update to authenticated
  using (autor_id = public.meu_profissional_id())
  with check (autor_id = public.meu_profissional_id());
create policy "autora ou dono apagam anotação" on public.anotacoes_clientes
  for delete to authenticated
  using (autor_id = public.meu_profissional_id() or public.eh_dono());

-- Saldo: somente o dono.
create policy "dono vê saldo" on public.movimentos_saldo
  for select to authenticated using (public.eh_dono());
create policy "dono lança saldo" on public.movimentos_saldo
  for insert to authenticated with check (public.eh_dono());
create policy "dono altera saldo" on public.movimentos_saldo
  for update to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono apaga saldo" on public.movimentos_saldo
  for delete to authenticated using (public.eh_dono());
