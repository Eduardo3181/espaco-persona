-- =====================================================================
-- Agenda: a mesma profissional pode atender mais de uma cliente no mesmo
-- horário. Continua proibido agendar em cima de um horário bloqueado
-- (almoço, ausência) e bloquear em cima de um agendamento.
-- Cancelados e faltas continuam liberando o horário.
-- =====================================================================
alter table public.agendamentos drop constraint agendamentos_sem_sobreposicao;

create function public.conferir_horario_bloqueado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelado', 'faltou') then return new; end if;
  -- Um de cada vez por profissional, para dois pedidos simultâneos não passarem juntos
  perform pg_advisory_xact_lock(hashtextextended(new.profissional_id::text, 0));
  if exists (
    select 1 from public.agendamentos a
     where a.profissional_id = new.profissional_id
       and a.id <> new.id
       and a.status not in ('cancelado', 'faltou')
       and (a.tipo = 'bloqueio' or new.tipo = 'bloqueio')
       and tstzrange(a.inicio, a.fim, '[)') && tstzrange(new.inicio, new.fim, '[)')
  ) then
    raise exception 'Horário bloqueado para esta profissional.' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create trigger agendamentos_horario_bloqueado
  before insert or update of profissional_id, inicio, fim, status, tipo on public.agendamentos
  for each row execute function public.conferir_horario_bloqueado();

revoke execute on function public.conferir_horario_bloqueado() from public, anon, authenticated;
