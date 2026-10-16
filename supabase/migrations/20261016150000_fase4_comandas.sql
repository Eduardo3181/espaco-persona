-- =====================================================================
-- Espaço Persona — Fase 4 (Comandas)
-- Comandas, itens, caixinhas, pagamentos, extrato das profissionais,
-- estoque e configurações (taxas da maquininha).
-- Valores só para o dono; profissionais usam funções sem valores.
-- =====================================================================

create type public.status_comanda as enum ('aberta', 'fechada', 'cancelada');
create type public.tipo_item_comanda as enum ('servico', 'produto', 'pacote');
create type public.forma_pagamento as enum ('pix', 'credito', 'debito', 'dinheiro', 'saldo');
create type public.tipo_lancamento as enum ('comissao', 'caixinha', 'vale', 'ajuste');

-- ---------------------------------------------------------------------
-- Configurações (uma única linha)
-- ---------------------------------------------------------------------
create table public.configuracoes (
  id                      boolean primary key default true check (id),
  taxa_debito             numeric(5,2) not null default 1.99 check (taxa_debito between 0 and 100),
  taxa_credito            numeric(5,2) not null default 3.49 check (taxa_credito between 0 and 100),
  taxa_pix                numeric(5,2) not null default 0    check (taxa_pix between 0 and 100),
  caixinha_desconta_taxa  boolean not null default false,
  dias_pagamento          smallint[] not null default '{1,16}',
  atualizado_em           timestamptz not null default now()
);
insert into public.configuracoes default values;

create trigger configuracoes_atualizado_em
  before update on public.configuracoes
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Comandas
-- ---------------------------------------------------------------------
create table public.comandas (
  id                        uuid primary key default gen_random_uuid(),
  numero                    integer generated always as identity unique,
  cliente_id                uuid references public.clientes (id) on delete set null,   -- LGPD: some o nome, fica o financeiro
  agendamento_id            uuid references public.agendamentos (id) on delete set null,
  status                    public.status_comanda not null default 'aberta',
  aberta_por                uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  aberta_em                 timestamptz not null default now(),
  fechada_por               uuid references public.profissionais (id) on delete set null,
  fechada_em                timestamptz,
  reaberta_em               timestamptz,          -- preenchida se já foi reaberta alguma vez
  cancelada_em              timestamptz,
  motivo                    text,                 -- motivo do cancelamento / da reabertura
  -- Totais gravados no fechamento
  total_itens_centavos      integer,
  total_caixinhas_centavos  integer,
  total_taxas_centavos      integer,
  total_comissoes_centavos  integer,
  atualizado_em             timestamptz not null default now()
);
-- Um agendamento tem no máximo uma comanda ativa (cancelada não conta)
create unique index comandas_agendamento_unico on public.comandas (agendamento_id)
  where agendamento_id is not null and status <> 'cancelada';
create index comandas_status_idx on public.comandas (status, aberta_em desc);
create index comandas_cliente_idx on public.comandas (cliente_id, fechada_em desc);
create index comandas_fechada_idx on public.comandas (fechada_em) where status = 'fechada';

create trigger comandas_atualizado_em
  before update on public.comandas
  for each row execute function public.tocar_atualizado_em();

-- Auditoria: toda mudança de status (fechar, reabrir, cancelar)
create trigger comandas_auditoria_status
  after update on public.comandas
  for each row when (old.status is distinct from new.status)
  execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- Itens
-- ---------------------------------------------------------------------
create table public.comanda_itens (
  id                       uuid primary key default gen_random_uuid(),
  comanda_id               uuid not null references public.comandas (id) on delete cascade,
  tipo                     public.tipo_item_comanda not null,
  servico_id               uuid references public.servicos (id) on delete restrict,
  produto_id               uuid references public.produtos (id) on delete restrict,
  descricao                text not null,
  profissional_id          uuid not null references public.profissionais (id) on delete restrict,
  quantidade               integer not null default 1 check (quantidade > 0),
  valor_unitario_centavos  integer not null check (valor_unitario_centavos >= 0),
  valor_total_centavos     integer generated always as (quantidade * valor_unitario_centavos) stored,
  comissao_percentual      numeric(5,2),   -- gravado no fechamento
  comissao_centavos        integer,        -- gravado no fechamento
  lancado_por              uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em                timestamptz not null default now(),
  constraint comanda_itens_alvo check (
       (tipo = 'servico' and servico_id is not null and produto_id is null)
    or (tipo = 'produto' and produto_id is not null and servico_id is null)
    or (tipo = 'pacote')
  )
);
create index comanda_itens_comanda_idx on public.comanda_itens (comanda_id);
create index comanda_itens_profissional_idx on public.comanda_itens (profissional_id);

-- Auditoria de itens de comandas que já foram fechadas e reabertas
create function public.auditar_item_reaberta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_reaberta timestamptz;
begin
  select reaberta_em into v_reaberta from public.comandas
   where id = coalesce(new.comanda_id, old.comanda_id);
  if v_reaberta is not null then
    insert into public.log_auditoria (usuario_id, tabela, registro_id, acao, antes, depois)
    values (auth.uid(), 'comanda_itens', coalesce(new.id, old.id)::text, tg_op,
            case when tg_op <> 'INSERT' then to_jsonb(old) end,
            case when tg_op <> 'DELETE' then to_jsonb(new) end);
  end if;
  return null;
end;
$$;

create trigger comanda_itens_auditoria
  after insert or update or delete on public.comanda_itens
  for each row execute function public.auditar_item_reaberta();

-- ---------------------------------------------------------------------
-- Caixinhas (100% da profissional) e pagamentos
-- ---------------------------------------------------------------------
create table public.comanda_caixinhas (
  comanda_id      uuid not null references public.comandas (id) on delete cascade,
  profissional_id uuid not null references public.profissionais (id) on delete restrict,
  valor_centavos  integer not null check (valor_centavos > 0),
  primary key (comanda_id, profissional_id)
);

create table public.comanda_pagamentos (
  id               uuid primary key default gen_random_uuid(),
  comanda_id       uuid not null references public.comandas (id) on delete cascade,
  ordem            smallint not null default 1,
  forma            public.forma_pagamento not null,
  valor_centavos   integer not null check (valor_centavos > 0),
  taxa_percentual  numeric(5,2),   -- gravado no fechamento
  taxa_centavos    integer         -- gravado no fechamento
);
create index comanda_pagamentos_comanda_idx on public.comanda_pagamentos (comanda_id);

-- ---------------------------------------------------------------------
-- Extrato das profissionais (comissões, caixinhas; vales na fase 5)
-- ---------------------------------------------------------------------
create table public.lancamentos_profissional (
  id               uuid primary key default gen_random_uuid(),
  profissional_id  uuid not null references public.profissionais (id) on delete restrict,
  tipo             public.tipo_lancamento not null,
  valor_centavos   integer not null,          -- + a receber / − desconto (vale)
  descricao        text not null,
  data             date not null,             -- data de competência (dia do fechamento)
  comanda_id       uuid references public.comandas (id) on delete set null,
  comanda_item_id  uuid references public.comanda_itens (id) on delete set null,
  pagamento_id     uuid,                       -- preenchido quando for pago (fase 5)
  criado_por       uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em        timestamptz not null default now()
);
create index lancamentos_profissional_idx on public.lancamentos_profissional (profissional_id, data);
create index lancamentos_comanda_idx on public.lancamentos_profissional (comanda_id);

-- ---------------------------------------------------------------------
-- Estoque e saldo ligados à comanda
-- ---------------------------------------------------------------------
create table public.movimentos_estoque (
  id          uuid primary key default gen_random_uuid(),
  produto_id  uuid not null references public.produtos (id) on delete cascade,
  quantidade  integer not null check (quantidade <> 0),   -- − saída / + entrada
  motivo      text not null,
  comanda_id  uuid references public.comandas (id) on delete set null,
  criado_por  uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index movimentos_estoque_produto_idx on public.movimentos_estoque (produto_id, criado_em desc);

alter table public.movimentos_saldo add column comanda_id uuid references public.comandas (id) on delete set null;
alter table public.anotacoes_clientes add column comanda_id uuid references public.comandas (id) on delete set null;

-- =====================================================================
-- ROW LEVEL SECURITY: tudo de comanda é só do dono.
-- Profissionais acessam por funções (sem valores), definidas a seguir.
-- =====================================================================
alter table public.configuracoes             enable row level security;
alter table public.comandas                  enable row level security;
alter table public.comanda_itens             enable row level security;
alter table public.comanda_caixinhas         enable row level security;
alter table public.comanda_pagamentos        enable row level security;
alter table public.lancamentos_profissional  enable row level security;
alter table public.movimentos_estoque        enable row level security;

revoke all on public.configuracoes, public.comandas, public.comanda_itens, public.comanda_caixinhas,
              public.comanda_pagamentos, public.lancamentos_profissional, public.movimentos_estoque from anon;

create policy "dono: configurações" on public.configuracoes
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono: comandas" on public.comandas
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono: itens" on public.comanda_itens
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono: caixinhas" on public.comanda_caixinhas
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono: pagamentos" on public.comanda_pagamentos
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono: estoque" on public.movimentos_estoque
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

-- Extrato: o dono vê tudo; a profissional vê só o próprio (fase 5 mostra na tela).
create policy "extrato: dono tudo, profissional o próprio" on public.lancamentos_profissional
  for select to authenticated using (public.eh_dono() or profissional_id = public.meu_profissional_id());
create policy "extrato: dono altera" on public.lancamentos_profissional
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
