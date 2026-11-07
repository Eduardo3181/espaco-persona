-- =====================================================================
-- Relatórios: quanto ainda deve entrar dos horários agendados.
-- Soma o preço atual da tabela dos serviços de cada horário que ainda não
-- virou comanda (aguardando ou confirmado), de hoje em diante.
-- =====================================================================
create function public.previsto_agendamentos(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.eh_dono() then
    raise exception 'Relatórios são só para o dono.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
           'valor', coalesce(sum(s.preco_centavos), 0),
           'atendimentos', count(distinct a.id))
    into v
    from public.agendamentos a
    join public.agendamento_servicos x on x.agendamento_id = a.id
    join public.servicos s on s.id = x.servico_id
   where a.tipo = 'atendimento'
     and a.status in ('aguardando', 'confirmado')
     and (a.inicio at time zone 'America/Sao_Paulo')::date between greatest(p_inicio, public.hoje_sp()) and p_fim;
  return v;
end;
$$;

revoke execute on function public.previsto_agendamentos(date, date) from public, anon;
grant execute on function public.previsto_agendamentos(date, date) to authenticated;
