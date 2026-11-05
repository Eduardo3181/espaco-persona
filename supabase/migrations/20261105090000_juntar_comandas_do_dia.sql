-- =====================================================================
-- Cobrança junta: comandas abertas da mesma cliente (mesmo cadastro) no
-- mesmo dia viram uma só, com os serviços de todas as profissionais.
-- Fica a comanda mais antiga; as outras são canceladas com o motivo
-- "Juntada à comanda #N". Comandas de dias diferentes continuam separadas
-- para cada uma entrar no faturamento e nas comissões do seu dia.
-- =====================================================================

-- Dia da comanda: o da agenda, o informado na avulsa ou o da abertura
create function public.comanda_dia(p_comanda_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (a.inicio at time zone 'America/Sao_Paulo')::date from public.agendamentos a where a.id = c.agendamento_id),
    c.data_atendimento,
    (c.aberta_em at time zone 'America/Sao_Paulo')::date)
    from public.comandas c where c.id = p_comanda_id
$$;
revoke execute on function public.comanda_dia(uuid) from public, anon, authenticated;

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
    -- Avulsa: se a cliente já tem comanda aberta hoje, usa a mesma
    if p_cliente_id is not null then
      select c.id into v_id from public.comandas c
       where c.status = 'aberta' and c.cliente_id = p_cliente_id
         and public.comanda_dia(c.id) = public.hoje_sp()
       order by c.aberta_em limit 1;
      if v_id is not null then return v_id; end if;
    end if;
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

    -- Comanda aberta da mesma cliente no mesmo dia (de agenda ou avulsa)
    select c.* into v_cmd from public.comandas c
     where c.status = 'aberta' and c.cliente_id = v_ag.cliente_id
       and public.comanda_dia(c.id) = v_dia
     order by c.aberta_em limit 1;

    if v_cmd.id is null then
      insert into public.comandas (cliente_id, agendamento_id, grupo_atendimento)
      values (v_ag.cliente_id, v_ag.id, v_ag.grupo_atendimento) returning * into v_cmd;
    elsif v_cmd.agendamento_id is null then
      update public.comandas set agendamento_id = v_ag.id where id = v_cmd.id returning * into v_cmd;
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

-- ---------------------------------------------------------------------
-- Junta tudo da cliente naquele dia na comanda mais antiga e traz os
-- horários ainda não atendidos. Roda ao abrir a comanda na tela e ao
-- fechar. Devolve {"comanda_id": "...", "juntou": true/false}.
-- ---------------------------------------------------------------------
create function public.juntar_comandas_do_dia(p_comanda_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.comandas;
  v_principal public.comandas;
  v_o public.comandas;
  v_dia date;
  v_juntou boolean := false;
  v_ids uuid[] := '{}';
  v_grupo uuid;
  v_alvo uuid;
  v_antes integer;
  v_depois integer;
begin
  if not public.eh_dono() then
    raise exception 'Só o dono pode juntar comandas.' using errcode = 'P0001';
  end if;

  select * into v_c from public.comandas where id = p_comanda_id for update;
  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'P0001';
  end if;
  if v_c.status <> 'aberta' or v_c.cliente_id is null then
    return jsonb_build_object('comanda_id', v_c.id, 'juntou', false);
  end if;
  v_dia := public.comanda_dia(v_c.id);

  select * into v_principal from public.comandas c
   where c.status = 'aberta' and c.cliente_id = v_c.cliente_id and public.comanda_dia(c.id) = v_dia
   order by c.aberta_em, c.numero limit 1 for update;

  for v_o in
    select * from public.comandas c
     where c.status = 'aberta' and c.cliente_id = v_c.cliente_id and c.id <> v_principal.id
       and public.comanda_dia(c.id) = v_dia
     order by c.aberta_em, c.numero for update
  loop
    update public.comanda_itens set comanda_id = v_principal.id where comanda_id = v_o.id;
    insert into public.comanda_caixinhas (comanda_id, profissional_id, valor_centavos)
    select v_principal.id, x.profissional_id, x.valor_centavos from public.comanda_caixinhas x where x.comanda_id = v_o.id
    on conflict (comanda_id, profissional_id)
      do update set valor_centavos = public.comanda_caixinhas.valor_centavos + excluded.valor_centavos;
    delete from public.comanda_caixinhas where comanda_id = v_o.id;
    delete from public.comanda_pagamentos where comanda_id = v_o.id;
    update public.anotacoes_clientes set comanda_id = v_principal.id where comanda_id = v_o.id;

    v_ids := v_ids || coalesce(array(
      select a.id from public.agendamentos a
       where a.id = v_o.agendamento_id
          or (v_o.grupo_atendimento is not null and a.grupo_atendimento = v_o.grupo_atendimento)), '{}');

    -- Sem grupo, o cancelamento não mexe no status dos horários, que seguem em atendimento
    update public.comandas
       set status = 'cancelada', cancelada_em = now(), grupo_atendimento = null,
           motivo = format('Juntada à comanda #%s', v_principal.numero)
     where id = v_o.id;

    if v_principal.agendamento_id is null and v_o.agendamento_id is not null then
      update public.comandas set agendamento_id = v_o.agendamento_id where id = v_principal.id returning * into v_principal;
    end if;
    v_juntou := true;
  end loop;

  -- Horários das comandas juntadas ficam ligados à principal
  if v_juntou then
    v_ids := v_ids || coalesce(array(
      select a.id from public.agendamentos a
       where a.id = v_principal.agendamento_id
          or (v_principal.grupo_atendimento is not null and a.grupo_atendimento = v_principal.grupo_atendimento)), '{}');
    if (select count(distinct x) from unnest(v_ids) x) > 1 then
      v_grupo := coalesce(v_principal.grupo_atendimento, gen_random_uuid());
      update public.agendamentos set grupo_atendimento = v_grupo where id = any(v_ids);
      update public.comandas set grupo_atendimento = v_grupo where id = v_principal.id;
    end if;
  end if;

  -- Horários da cliente no dia ainda não atendidos entram também
  select a.id into v_alvo from public.agendamentos a
   where a.tipo = 'atendimento' and a.status in ('aguardando', 'confirmado')
     and a.cliente_id = v_c.cliente_id and (a.inicio at time zone 'America/Sao_Paulo')::date = v_dia
     and not exists (
       select 1 from public.comandas k
        where k.id <> v_principal.id and k.status <> 'cancelada'
          and (k.agendamento_id = a.id or (a.grupo_atendimento is not null and k.grupo_atendimento = a.grupo_atendimento)))
   order by a.inicio limit 1;
  if v_alvo is not null then
    select count(*) into v_antes from public.comanda_itens where comanda_id = v_principal.id;
    perform public.abrir_comanda(null, v_alvo);
    select count(*) into v_depois from public.comanda_itens where comanda_id = v_principal.id;
    v_juntou := v_juntou or v_depois <> v_antes;
  end if;

  return jsonb_build_object('comanda_id', v_principal.id, 'juntou', v_juntou);
end;
$$;
revoke execute on function public.juntar_comandas_do_dia(uuid) from public, anon;
grant execute on function public.juntar_comandas_do_dia(uuid) to authenticated;
