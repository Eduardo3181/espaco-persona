-- =====================================================================
-- Comanda única por cliente no dia: ao abrir a comanda de um horário, os
-- outros horários da mesma cliente no mesmo dia que ainda não foram
-- atendidos entram nela (e ficam ligados por "grupo_atendimento"), mesmo
-- que tenham sido agendados separadamente. Se já houver comanda aberta da
-- cliente naquele dia, o horário entra nela. Comanda já fechada não muda:
-- um horário novo depois disso abre outra comanda.
-- =====================================================================

create or replace function public.abrir_comanda(p_cliente_id uuid, p_agendamento_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos;
  v_cmd public.comandas;
  v_id uuid;
  v_dia date;
  v_grupo uuid;
  v_alvos uuid[];
  v_todos uuid[];
begin
  if not public.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = 'P0001';
  end if;

  if p_agendamento_id is null then
    insert into public.comandas (cliente_id) values (p_cliente_id) returning id into v_id;
    return v_id;
  end if;

  select * into v_ag from public.agendamentos where id = p_agendamento_id and tipo = 'atendimento' for update;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0001';
  end if;
  if not public.eh_dono() and v_ag.profissional_id is distinct from public.meu_profissional_id() then
    raise exception 'Este agendamento é de outra profissional.' using errcode = 'P0001';
  end if;
  v_dia := (v_ag.inicio at time zone 'America/Sao_Paulo')::date;

  -- Comanda já existente para este horário ou para o mesmo atendimento
  select * into v_cmd from public.comandas
   where status <> 'cancelada'
     and (agendamento_id = p_agendamento_id
          or (v_ag.grupo_atendimento is not null and grupo_atendimento = v_ag.grupo_atendimento))
   order by aberta_em limit 1;

  if found and v_cmd.status <> 'aberta' then
    update public.agendamentos set status = 'em_atendimento'
     where id = p_agendamento_id and status in ('aguardando', 'confirmado');
    return v_cmd.id;
  end if;

  if v_cmd.id is null then
    if v_ag.status in ('cancelado', 'faltou') then
      raise exception 'Agendamento desmarcado: reative antes de abrir a comanda.' using errcode = 'P0001';
    end if;

    -- Comanda aberta da mesma cliente no mesmo dia
    select c.* into v_cmd from public.comandas c
      join public.agendamentos a on a.id = c.agendamento_id
     where c.status = 'aberta' and a.cliente_id = v_ag.cliente_id
       and (a.inicio at time zone 'America/Sao_Paulo')::date = v_dia
     order by c.aberta_em limit 1;

    if v_cmd.id is null then
      insert into public.comandas (cliente_id, agendamento_id, grupo_atendimento)
      values (v_ag.cliente_id, v_ag.id, v_ag.grupo_atendimento) returning * into v_cmd;
    end if;
  end if;
  v_id := v_cmd.id;

  -- Horários que entram agora: da mesma cliente no dia (ou do mesmo atendimento),
  -- ainda não atendidos e sem outra comanda
  select coalesce(array_agg(a.id), '{}') into v_alvos
    from public.agendamentos a
   where a.tipo = 'atendimento' and a.status in ('aguardando', 'confirmado')
     and ((a.cliente_id = v_ag.cliente_id and (a.inicio at time zone 'America/Sao_Paulo')::date = v_dia)
          or (v_ag.grupo_atendimento is not null and a.grupo_atendimento = v_ag.grupo_atendimento))
     and not exists (
       select 1 from public.comandas k
        where k.id <> v_id and k.status <> 'cancelada'
          and (k.agendamento_id = a.id or (a.grupo_atendimento is not null and k.grupo_atendimento = a.grupo_atendimento)));

  -- Mais de um horário na comanda: ficam ligados e acompanham o status dela
  select array_agg(distinct x) into v_todos
    from unnest(v_alvos || v_cmd.agendamento_id) x where x is not null;
  if coalesce(array_length(v_todos, 1), 0) > 1 then
    select coalesce(v_cmd.grupo_atendimento, v_ag.grupo_atendimento,
                    (select a.grupo_atendimento from public.agendamentos a
                      where a.id = any(v_todos) and a.grupo_atendimento is not null limit 1),
                    gen_random_uuid())
      into v_grupo;
    update public.agendamentos set grupo_atendimento = v_grupo where id = any(v_todos);
    update public.comandas set grupo_atendimento = v_grupo where id = v_id;
  end if;

  -- Serviços dos horários que entraram; o que já foi lançado à mão na comanda não duplica
  insert into public.comanda_itens (comanda_id, tipo, servico_id, descricao, profissional_id, quantidade, valor_unitario_centavos)
  select v_id, 'servico', s.id, s.nome, a.profissional_id, 1, s.preco_centavos
    from public.agendamentos a
    join public.agendamento_servicos x on x.agendamento_id = a.id
    join public.servicos s on s.id = x.servico_id
   where a.id = any(v_alvos)
     and not exists (
       select 1 from public.comanda_itens i
        where i.comanda_id = v_id and i.servico_id = s.id and i.profissional_id = a.profissional_id)
   order by a.inicio, x.ordem;

  update public.agendamentos set status = 'em_atendimento' where id = any(v_alvos);
  return v_id;
end;
$$;
