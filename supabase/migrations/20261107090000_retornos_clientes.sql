-- =====================================================================
-- Retorno da cliente: na ficha, o dono escolhe o serviço e daqui a quanto
-- tempo ela deve voltar. No dia, aparece um alerta no Início, até ser
-- marcado como avisado. Só o dono cria e vê.
-- =====================================================================
create table public.retornos_clientes (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references public.clientes (id) on delete cascade,
  servico_id   uuid not null references public.servicos (id) on delete restrict,
  data_retorno date not null,
  avisado_em   timestamptz,
  criado_por   uuid default public.meu_profissional_id() references public.profissionais (id) on delete set null,
  criado_em    timestamptz not null default now()
);
create index retornos_clientes_cliente_idx on public.retornos_clientes (cliente_id, data_retorno desc);
create index retornos_clientes_pendentes_idx on public.retornos_clientes (data_retorno) where avisado_em is null;

alter table public.retornos_clientes enable row level security;
revoke all on public.retornos_clientes from anon;
create policy "dono gerencia retornos" on public.retornos_clientes
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

alter table public.configuracoes
  add column msg_retorno text not null default 'Olá, {cliente}! Aqui é do Espaço Persona. Chegou o tempo de voltar ao salão para {servico}. Vamos agendar seu horário?';
