-- =====================================================================
-- Espaço Persona — Fase 3 (Agenda)
-- Agendamentos (com vários serviços) e bloqueios de horário.
-- O banco impede horários sobrepostos da mesma profissional.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

create type public.tipo_agendamento as enum ('atendimento', 'bloqueio');
create type public.status_agendamento as enum (
  'aguardando',      -- aguardando confirmação
  'confirmado',
  'em_atendimento',  -- comanda aberta (fase 4)
  'concluido',       -- comanda fechada (fase 4)
  'cancelado',
  'faltou'
);

create table public.agendamentos (
  id               uuid primary key default gen_random_uuid(),
  tipo             public.tipo_agendamento not null default 'atendimento',
  profissional_id  uuid not null references public.profissionais (id) on delete restrict,
  cliente_id       uuid references public.clientes (id) on delete cascade,
  inicio           timestamptz not null,
  fim              timestamptz not null,
  status           public.status_agendamento not null default 'aguardando',
  motivo           text,          -- bloqueios: almoço, ausência, folga…
  observacao       text,
  grupo_repeticao  uuid,          -- bloqueios criados juntos (repetição)
  criado_por       uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint agendamentos_periodo check (fim > inicio and fim - inicio <= interval '16 hours'),
  constraint agendamentos_tipo check (
       (tipo = 'atendimento' and cliente_id is not null)
    or (tipo = 'bloqueio' and cliente_id is null)
  ),
  -- Trava: a mesma profissional não pode ter dois horários sobrepostos
  -- (cancelados e faltas liberam o horário).
  constraint agendamentos_sem_sobreposicao exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim, '[)') with &&
  ) where (status not in ('cancelado', 'faltou'))
);
create index agendamentos_inicio_idx on public.agendamentos (inicio);
create index agendamentos_cliente_idx on public.agendamentos (cliente_id, inicio desc);
create index agendamentos_grupo_idx on public.agendamentos (grupo_repeticao) where grupo_repeticao is not null;

create trigger agendamentos_atualizado_em
  before update on public.agendamentos
  for each row execute function public.tocar_atualizado_em();

create table public.agendamento_servicos (
  agendamento_id uuid not null references public.agendamentos (id) on delete cascade,
  ordem          smallint not null,
  servico_id     uuid not null references public.servicos (id) on delete restrict,
  duracao_min    integer not null check (duracao_min > 0),
  primary key (agendamento_id, ordem)
);
create index agendamento_servicos_servico_idx on public.agendamento_servicos (servico_id);

-- ---------------------------------------------------------------------
-- Cria ou altera um atendimento com seus serviços, numa só operação.
-- Roda com as permissões de quem chama (RLS vale normalmente).
-- ---------------------------------------------------------------------
create function public.salvar_agendamento(
  p_id              uuid,
  p_profissional_id uuid,
  p_cliente_id      uuid,
  p_inicio          timestamptz,
  p_duracao_min     integer,
  p_servicos        uuid[],
  p_observacao      text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_ordem int := 0;
  v_servico uuid;
begin
  if coalesce(array_length(p_servicos, 1), 0) = 0 then
    raise exception 'Escolha pelo menos um serviço.' using errcode = 'P0001';
  end if;
  if p_duracao_min is null or p_duracao_min <= 0 then
    raise exception 'Duração inválida.' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.agendamentos (tipo, profissional_id, cliente_id, inicio, fim, observacao)
    values ('atendimento', p_profissional_id, p_cliente_id, p_inicio,
            p_inicio + make_interval(mins => p_duracao_min), nullif(trim(p_observacao), ''))
    returning id into v_id;
  else
    update public.agendamentos
       set profissional_id = p_profissional_id,
           cliente_id      = p_cliente_id,
           inicio          = p_inicio,
           fim             = p_inicio + make_interval(mins => p_duracao_min),
           observacao      = nullif(trim(p_observacao), '')
     where id = v_id and tipo = 'atendimento';
    if not found then
      raise exception 'Agendamento não encontrado ou sem permissão.' using errcode = 'P0001';
    end if;
    delete from public.agendamento_servicos where agendamento_id = v_id;
  end if;

  foreach v_servico in array p_servicos loop
    v_ordem := v_ordem + 1;
    insert into public.agendamento_servicos (agendamento_id, ordem, servico_id, duracao_min)
    select v_id, v_ordem, s.id, s.duracao_min from public.servicos s where s.id = v_servico;
  end loop;

  return v_id;
end;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- Dono: toda a agenda. Profissional: só a própria coluna.
-- =====================================================================
alter table public.agendamentos         enable row level security;
alter table public.agendamento_servicos enable row level security;
revoke all on public.agendamentos, public.agendamento_servicos from anon;
revoke execute on function public.salvar_agendamento(uuid, uuid, uuid, timestamptz, integer, uuid[], text) from anon;

create policy "dono vê toda a agenda; profissional a própria" on public.agendamentos
  for select to authenticated
  using (public.eh_dono() or profissional_id = public.meu_profissional_id());
create policy "agenda: criar" on public.agendamentos
  for insert to authenticated
  with check (public.eh_dono() or profissional_id = public.meu_profissional_id());
create policy "agenda: alterar" on public.agendamentos
  for update to authenticated
  using (public.eh_dono() or profissional_id = public.meu_profissional_id())
  with check (public.eh_dono() or profissional_id = public.meu_profissional_id());
create policy "agenda: excluir" on public.agendamentos
  for delete to authenticated
  using (public.eh_dono() or profissional_id = public.meu_profissional_id());

-- Serviços do agendamento seguem a permissão do agendamento.
create policy "serviços do agendamento: ver" on public.agendamento_servicos
  for select to authenticated
  using (exists (select 1 from public.agendamentos a where a.id = agendamento_id));
create policy "serviços do agendamento: alterar" on public.agendamento_servicos
  for all to authenticated
  using (exists (select 1 from public.agendamentos a where a.id = agendamento_id))
  with check (exists (select 1 from public.agendamentos a where a.id = agendamento_id));
