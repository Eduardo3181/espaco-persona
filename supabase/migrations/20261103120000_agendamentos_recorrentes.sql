-- =====================================================================
-- Agendamentos recorrentes (toda semana, a cada 15 dias, todo mês).
-- Cada data é um agendamento normal; "grupo_repeticao" liga as datas da
-- mesma recorrência (a coluna já existia para os bloqueios repetidos).
-- As duas funções rodam tudo numa operação só: se uma data falhar, nada
-- é gravado. Rodam com as permissões de quem chama (RLS vale normalmente).
-- =====================================================================

comment on column public.agendamentos.grupo_repeticao is
  'Liga os horários criados juntos: bloqueios repetidos e atendimentos recorrentes.';

-- ---------------------------------------------------------------------
-- Criar a recorrência. p_datas tem um item por data, no formato de
-- p_blocos de criar_atendimento: [[{bloco}, {bloco}], [{bloco}], ...]
-- ---------------------------------------------------------------------
create function public.criar_atendimentos_recorrentes(p_cliente_id uuid, p_observacao text, p_datas jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_blocos jsonb;
  v_ids uuid[];
  v_grupo uuid := gen_random_uuid();
  v_qtd integer := 0;
begin
  if coalesce(jsonb_array_length(p_datas), 0) = 0 then
    raise exception 'Nenhuma data para agendar.' using errcode = 'P0001';
  end if;

  for v_blocos in select * from jsonb_array_elements(p_datas) loop
    v_ids := public.criar_atendimento(p_cliente_id, p_observacao, v_blocos);
    update public.agendamentos set grupo_repeticao = v_grupo where id = any(v_ids);
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;
revoke execute on function public.criar_atendimentos_recorrentes(uuid, text, jsonb) from public, anon;
grant execute on function public.criar_atendimentos_recorrentes(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Alterar vários horários de uma recorrência de uma vez.
-- p_itens: [{"id": "...", "inicio": "2026-11-10T14:00:00-03:00"}, ...],
-- na ordem em que devem ser gravados (quem chama ordena para um horário
-- não esbarrar no outro quando todos andam juntos).
-- Só mexe em horários que ainda não foram atendidos.
-- ---------------------------------------------------------------------
create function public.alterar_agendamentos_serie(
  p_profissional_id uuid,
  p_cliente_id      uuid,
  p_duracao_min     integer,
  p_servicos        uuid[],
  p_observacao      text,
  p_itens           jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_qtd integer := 0;
begin
  for v_item in select * from jsonb_array_elements(p_itens) loop
    if not exists (
      select 1 from public.agendamentos
       where id = (v_item->>'id')::uuid and status in ('aguardando', 'confirmado')
    ) then
      raise exception 'Um dos agendamentos mudou de situação. Confira a agenda e tente de novo.' using errcode = 'P0001';
    end if;
    perform public.salvar_agendamento(
      (v_item->>'id')::uuid, p_profissional_id, p_cliente_id,
      (v_item->>'inicio')::timestamptz, p_duracao_min, p_servicos, p_observacao
    );
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;
revoke execute on function public.alterar_agendamentos_serie(uuid, uuid, integer, uuid[], text, jsonb) from public, anon;
grant execute on function public.alterar_agendamentos_serie(uuid, uuid, integer, uuid[], text, jsonb) to authenticated;
