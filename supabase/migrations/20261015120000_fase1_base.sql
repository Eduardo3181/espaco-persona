-- =====================================================================
-- Espaço Persona — Fase 1 (Base)
-- Equipe, categorias, serviços, produtos, pacotes, regras de comissão
-- e log de auditoria. Todas as tabelas com Row Level Security (RLS).
-- Valores em centavos (integer); percentuais em numeric(5,2).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.papel_usuario as enum ('dono', 'profissional');
create type public.tipo_categoria as enum ('servico', 'produto');
create type public.tipo_regra_comissao as enum ('padrao', 'categoria', 'servico');

-- ---------------------------------------------------------------------
-- Função genérica: mantém a coluna atualizado_em
-- ---------------------------------------------------------------------
create function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Equipe (profissionais). Cada pessoa pode ter um login (usuario_id).
-- O dono também é profissional (atende), mas não recebe comissão.
-- ---------------------------------------------------------------------
create table public.profissionais (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid unique references auth.users (id) on delete set null,
  nome            text not null check (length(trim(nome)) > 0),
  email           text,
  funcao          text,                       -- ex.: cabeleireira, manicure
  papel           public.papel_usuario not null default 'profissional',
  recebe_comissao boolean not null default true,
  cor             text not null default '#96604A' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create unique index profissionais_email_unico on public.profissionais (lower(email)) where email is not null;

create trigger profissionais_atualizado_em
  before update on public.profissionais
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Funções de permissão (usadas nas políticas RLS).
-- SECURITY DEFINER para poderem ler "profissionais" sem cair em recursão.
-- ---------------------------------------------------------------------
create function public.meu_profissional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profissionais p
  where p.usuario_id = auth.uid() and p.ativo
$$;

create function public.eh_dono()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profissionais p
    where p.usuario_id = auth.uid() and p.ativo and p.papel = 'dono'
  )
$$;

create function public.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profissionais p
    where p.usuario_id = auth.uid() and p.ativo
  )
$$;

revoke execute on function public.meu_profissional_id() from anon;
revoke execute on function public.eh_dono() from anon;
revoke execute on function public.eh_equipe() from anon;

-- Ao criar um login no Supabase, liga automaticamente à profissional
-- cadastrada com o mesmo e-mail.
create function public.vincular_login_a_profissional()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profissionais
     set usuario_id = new.id
   where usuario_id is null
     and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger ao_criar_login_vincular_profissional
  after insert on auth.users
  for each row execute function public.vincular_login_a_profissional();

-- Ao cadastrar/alterar o e-mail de uma profissional, liga ao login existente.
create function public.vincular_profissional_a_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.usuario_id is null and new.email is not null then
    select u.id into new.usuario_id
      from auth.users u
     where lower(u.email) = lower(new.email)
       and not exists (select 1 from public.profissionais p where p.usuario_id = u.id and p.id <> new.id);
  end if;
  return new;
end;
$$;

create trigger profissionais_vincular_login
  before insert or update of email on public.profissionais
  for each row execute function public.vincular_profissional_a_login();

-- Impede que o sistema fique sem nenhum dono ativo.
create function public.garantir_um_dono()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profissionais
    where papel = 'dono' and ativo and usuario_id is not null
  ) and exists (select 1 from public.profissionais where usuario_id is not null) then
    raise exception 'O sistema precisa ter pelo menos um dono ativo com login.';
  end if;
  return null;
end;
$$;

create constraint trigger profissionais_garantir_dono
  after update or delete on public.profissionais
  deferrable initially deferred
  for each row execute function public.garantir_um_dono();

-- ---------------------------------------------------------------------
-- Categorias (de serviços ou de produtos)
-- ---------------------------------------------------------------------
create table public.categorias (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) > 0),
  tipo          public.tipo_categoria not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index categorias_nome_unico on public.categorias (tipo, lower(nome));

create trigger categorias_atualizado_em
  before update on public.categorias
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Serviços
-- ---------------------------------------------------------------------
create table public.servicos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) > 0),
  categoria_id   uuid not null references public.categorias (id) on delete restrict,
  duracao_min    integer not null check (duracao_min > 0 and duracao_min <= 720),
  preco_centavos integer not null default 0 check (preco_centavos >= 0), -- valor "a partir de"
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index servicos_categoria_idx on public.servicos (categoria_id);

create trigger servicos_atualizado_em
  before update on public.servicos
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------
create table public.produtos (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null check (length(trim(nome)) > 0),
  categoria_id        uuid not null references public.categorias (id) on delete restrict,
  preco_centavos      integer not null default 0 check (preco_centavos >= 0),
  estoque             integer not null default 0,
  estoque_minimo      integer not null default 0 check (estoque_minimo >= 0),
  comissao_percentual numeric(5,2) not null default 10.00 check (comissao_percentual between 0 and 100),
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index produtos_categoria_idx on public.produtos (categoria_id);

create trigger produtos_atualizado_em
  before update on public.produtos
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Pacotes e serviços incluídos
-- ---------------------------------------------------------------------
create table public.pacotes (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) > 0),
  validade_dias  integer not null check (validade_dias > 0),
  preco_centavos integer not null default 0 check (preco_centavos >= 0),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create trigger pacotes_atualizado_em
  before update on public.pacotes
  for each row execute function public.tocar_atualizado_em();

create table public.pacote_servicos (
  pacote_id  uuid not null references public.pacotes (id) on delete cascade,
  servico_id uuid not null references public.servicos (id) on delete restrict,
  quantidade integer not null check (quantidade > 0),
  primary key (pacote_id, servico_id)
);
create index pacote_servicos_servico_idx on public.pacote_servicos (servico_id);

-- ---------------------------------------------------------------------
-- Regras de comissão (três níveis; vale a mais específica):
--   serviço  →  categoria  →  padrão da profissional
-- ---------------------------------------------------------------------
create table public.regras_comissao (
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissionais (id) on delete cascade,
  tipo            public.tipo_regra_comissao not null,
  categoria_id    uuid references public.categorias (id) on delete cascade,
  servico_id      uuid references public.servicos (id) on delete cascade,
  percentual      numeric(5,2) not null check (percentual between 0 and 100),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint regras_comissao_alvo check (
       (tipo = 'padrao'    and categoria_id is null     and servico_id is null)
    or (tipo = 'categoria' and categoria_id is not null and servico_id is null)
    or (tipo = 'servico'   and categoria_id is null     and servico_id is not null)
  )
);
create unique index regras_comissao_padrao_unica    on public.regras_comissao (profissional_id) where tipo = 'padrao';
create unique index regras_comissao_categoria_unica on public.regras_comissao (profissional_id, categoria_id) where tipo = 'categoria';
create unique index regras_comissao_servico_unica   on public.regras_comissao (profissional_id, servico_id) where tipo = 'servico';

create trigger regras_comissao_atualizado_em
  before update on public.regras_comissao
  for each row execute function public.tocar_atualizado_em();

-- Percentual que vale para uma profissional num serviço.
-- Retorna null quando não há regra cadastrada (o sistema avisa na comanda).
create function public.comissao_servico(p_profissional_id uuid, p_servico_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when not p.recebe_comissao then 0
    else coalesce(
      (select r.percentual from public.regras_comissao r
        where r.profissional_id = p.id and r.tipo = 'servico' and r.servico_id = s.id),
      (select r.percentual from public.regras_comissao r
        where r.profissional_id = p.id and r.tipo = 'categoria' and r.categoria_id = s.categoria_id),
      (select r.percentual from public.regras_comissao r
        where r.profissional_id = p.id and r.tipo = 'padrao')
    )
  end
  from public.profissionais p, public.servicos s
  where p.id = p_profissional_id and s.id = p_servico_id
$$;

-- ---------------------------------------------------------------------
-- Log de auditoria (quem, quando, o quê)
-- ---------------------------------------------------------------------
create table public.log_auditoria (
  id          bigint generated always as identity primary key,
  usuario_id  uuid default auth.uid(),
  tabela      text not null,
  registro_id text,
  acao        text not null,          -- INSERT, UPDATE, DELETE
  antes       jsonb,
  depois      jsonb,
  criado_em   timestamptz not null default now()
);
create index log_auditoria_tabela_idx on public.log_auditoria (tabela, criado_em desc);

create function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.log_auditoria (usuario_id, tabela, registro_id, acao, antes, depois)
  values (
    auth.uid(),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, null),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger regras_comissao_auditoria
  after insert or update or delete on public.regras_comissao
  for each row execute function public.registrar_auditoria();

create trigger profissionais_auditoria
  after insert or update or delete on public.profissionais
  for each row execute function public.registrar_auditoria();

-- Comissão de venda de produtos também é regra de comissão: auditar só quando muda.
create trigger produtos_comissao_auditoria
  after update of comissao_percentual on public.produtos
  for each row
  when (old.comissao_percentual is distinct from new.comissao_percentual)
  execute function public.registrar_auditoria();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profissionais   enable row level security;
alter table public.categorias      enable row level security;
alter table public.servicos        enable row level security;
alter table public.produtos        enable row level security;
alter table public.pacotes         enable row level security;
alter table public.pacote_servicos enable row level security;
alter table public.regras_comissao enable row level security;
alter table public.log_auditoria   enable row level security;

-- Visitantes sem login não acessam nada.
revoke all on all tables in schema public from anon;

-- Profissionais: a equipe vê a equipe (nomes e cores para agenda/comanda);
-- só o dono cadastra, altera ou exclui.
create policy "equipe vê profissionais" on public.profissionais
  for select to authenticated using (public.eh_equipe());
create policy "dono insere profissionais" on public.profissionais
  for insert to authenticated with check (public.eh_dono());
create policy "dono altera profissionais" on public.profissionais
  for update to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono exclui profissionais" on public.profissionais
  for delete to authenticated using (public.eh_dono());

-- Catálogo (categorias, serviços, produtos, pacotes): equipe vê (com preços);
-- só o dono altera.
create policy "equipe vê categorias" on public.categorias
  for select to authenticated using (public.eh_equipe());
create policy "dono gerencia categorias" on public.categorias
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

create policy "equipe vê serviços" on public.servicos
  for select to authenticated using (public.eh_equipe());
create policy "dono gerencia serviços" on public.servicos
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

create policy "equipe vê produtos" on public.produtos
  for select to authenticated using (public.eh_equipe());
create policy "dono gerencia produtos" on public.produtos
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

create policy "equipe vê pacotes" on public.pacotes
  for select to authenticated using (public.eh_equipe());
create policy "dono gerencia pacotes" on public.pacotes
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

create policy "equipe vê serviços dos pacotes" on public.pacote_servicos
  for select to authenticated using (public.eh_equipe());
create policy "dono gerencia serviços dos pacotes" on public.pacote_servicos
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

-- Regras de comissão: dono vê todas; profissional vê só as próprias.
create policy "dono vê todas as regras, profissional as próprias" on public.regras_comissao
  for select to authenticated
  using (public.eh_dono() or profissional_id = public.meu_profissional_id());
create policy "dono gerencia regras de comissão" on public.regras_comissao
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

-- Log de auditoria: só o dono lê; ninguém grava diretamente (só os gatilhos).
create policy "dono lê auditoria" on public.log_auditoria
  for select to authenticated using (public.eh_dono());
revoke insert, update, delete on public.log_auditoria from authenticated;
