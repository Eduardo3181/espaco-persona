-- =====================================================================
-- Espaço Persona — Fase 4: funções das comandas
-- * Equipe (dono e profissionais): abrir comanda, lançar e remover itens,
--   consultar comanda e histórico SEM valores.
-- * Só o dono: salvar caixinhas/pagamentos, fechar, reabrir, cancelar.
-- Funções SECURITY DEFINER conferem a permissão explicitamente.
-- =====================================================================

create function public.hoje_sp()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- ---------------------------------------------------------------------
-- Abrir comanda (a partir do agendamento ou avulsa)
-- ---------------------------------------------------------------------
create function public.abrir_comanda(p_cliente_id uuid, p_agendamento_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos;
  v_id uuid;
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

  select id into v_id from public.comandas where agendamento_id = p_agendamento_id and status <> 'cancelada';
  if found then return v_id; end if;

  if v_ag.status in ('cancelado', 'faltou') then
    raise exception 'Agendamento desmarcado: reative antes de abrir a comanda.' using errcode = 'P0001';
  end if;

  insert into public.comandas (cliente_id, agendamento_id) values (v_ag.cliente_id, v_ag.id) returning id into v_id;

  insert into public.comanda_itens (comanda_id, tipo, servico_id, descricao, profissional_id, quantidade, valor_unitario_centavos)
  select v_id, 'servico', s.id, s.nome, v_ag.profissional_id, 1, s.preco_centavos
    from public.agendamento_servicos x
    join public.servicos s on s.id = x.servico_id
   where x.agendamento_id = v_ag.id
   order by x.ordem;

  update public.agendamentos set status = 'em_atendimento' where id = v_ag.id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Lançar item (valor vem do cadastro; o dono pode ajustar depois)
-- Profissional só lança em nome próprio.
-- ---------------------------------------------------------------------
create function public.lancar_item(
  p_comanda_id uuid, p_tipo text, p_ref_id uuid, p_quantidade integer, p_profissional_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.status_comanda;
  v_prof uuid := p_profissional_id;
  v_nome text;
  v_preco integer;
  v_id uuid;
begin
  if not public.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = 'P0001';
  end if;
  if not public.eh_dono() then
    v_prof := public.meu_profissional_id();
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    raise exception 'Quantidade inválida.' using errcode = 'P0001';
  end if;

  select status into v_status from public.comandas where id = p_comanda_id;
  if v_status is distinct from 'aberta' then
    raise exception 'A comanda não está aberta.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profissionais where id = v_prof and ativo) then
    raise exception 'Escolha a profissional.' using errcode = 'P0001';
  end if;

  if p_tipo = 'servico' then
    select nome, preco_centavos into v_nome, v_preco from public.servicos where id = p_ref_id;
    if not found then raise exception 'Serviço não encontrado.' using errcode = 'P0001'; end if;
    insert into public.comanda_itens (comanda_id, tipo, servico_id, descricao, profissional_id, quantidade, valor_unitario_centavos)
    values (p_comanda_id, 'servico', p_ref_id, v_nome, v_prof, p_quantidade, v_preco) returning id into v_id;
  elsif p_tipo = 'produto' then
    select nome, preco_centavos into v_nome, v_preco from public.produtos where id = p_ref_id;
    if not found then raise exception 'Produto não encontrado.' using errcode = 'P0001'; end if;
    insert into public.comanda_itens (comanda_id, tipo, produto_id, descricao, profissional_id, quantidade, valor_unitario_centavos)
    values (p_comanda_id, 'produto', p_ref_id, v_nome, v_prof, p_quantidade, v_preco) returning id into v_id;
  else
    raise exception 'Tipo de item inválido.' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- Remover item (comanda aberta). Profissional só remove os próprios.
create function public.remover_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.comanda_itens;
  v_status public.status_comanda;
begin
  select * into v_item from public.comanda_itens where id = p_item_id;
  if not found then raise exception 'Item não encontrado.' using errcode = 'P0001'; end if;
  select status into v_status from public.comandas where id = v_item.comanda_id;
  if v_status is distinct from 'aberta' then
    raise exception 'A comanda não está aberta.' using errcode = 'P0001';
  end if;
  if not public.eh_dono() and v_item.profissional_id is distinct from public.meu_profissional_id() then
    raise exception 'Você só pode remover itens lançados em seu nome.' using errcode = 'P0001';
  end if;
  delete from public.comanda_itens where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Consultas da equipe SEM valores
-- ---------------------------------------------------------------------
create function public.comandas_abertas_equipe()
returns table (id uuid, numero integer, cliente_id uuid, cliente_nome text, aberta_em timestamptz, profissionais text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.numero, c.cliente_id, cl.nome, c.aberta_em,
         (select string_agg(distinct p.nome, ', ') from public.comanda_itens i
            join public.profissionais p on p.id = i.profissional_id where i.comanda_id = c.id)
    from public.comandas c
    left join public.clientes cl on cl.id = c.cliente_id
   where c.status = 'aberta' and public.eh_equipe()
   order by c.aberta_em
$$;

create function public.comanda_equipe(p_comanda_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'numero', c.numero, 'status', c.status, 'aberta_em', c.aberta_em,
    'cliente_id', c.cliente_id, 'cliente_nome', cl.nome, 'agendamento_id', c.agendamento_id,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'tipo', i.tipo, 'descricao', i.descricao, 'quantidade', i.quantidade,
               'profissional_id', i.profissional_id, 'profissional_nome', p.nome) order by i.criado_em)
        from public.comanda_itens i join public.profissionais p on p.id = i.profissional_id
       where i.comanda_id = c.id), '[]'::jsonb)
  )
  from public.comandas c
  left join public.clientes cl on cl.id = c.cliente_id
  where c.id = p_comanda_id and c.status = 'aberta' and public.eh_equipe()
$$;

-- Histórico da cliente: valores e formas de pagamento só para o dono.
create function public.historico_cliente(p_cliente_id uuid)
returns table (
  comanda_id uuid, numero integer, data timestamptz, status public.status_comanda,
  itens jsonb, total_centavos integer, pagamentos jsonb, anotacoes jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.numero, coalesce(c.fechada_em, c.aberta_em), c.status,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'descricao', i.descricao, 'quantidade', i.quantidade, 'tipo', i.tipo,
                     'profissional_id', i.profissional_id, 'profissional_nome', p.nome,
                     'valor_centavos', case when public.eh_dono() then i.valor_total_centavos end) order by i.criado_em)
                     from public.comanda_itens i join public.profissionais p on p.id = i.profissional_id
                    where i.comanda_id = c.id), '[]'::jsonb),
         case when public.eh_dono() then c.total_itens_centavos end,
         case when public.eh_dono() then (
           select jsonb_agg(jsonb_build_object('forma', g.forma, 'valor_centavos', g.valor_centavos) order by g.ordem)
             from public.comanda_pagamentos g where g.comanda_id = c.id) end,
         coalesce((select jsonb_agg(jsonb_build_object('texto', a.texto, 'autor', pa.nome, 'criado_em', a.criado_em) order by a.criado_em)
                     from public.anotacoes_clientes a left join public.profissionais pa on pa.id = a.autor_id
                    where a.comanda_id = c.id), '[]'::jsonb)
    from public.comandas c
   where c.cliente_id = p_cliente_id and c.status <> 'cancelada' and public.eh_equipe()
   order by coalesce(c.fechada_em, c.aberta_em) desc
$$;

-- Resumo da cliente (total gasto só para o dono)
create function public.resumo_cliente(p_cliente_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visitas as (
    select (c.fechada_em at time zone 'America/Sao_Paulo')::date as dia, c.total_itens_centavos
      from public.comandas c
     where c.cliente_id = p_cliente_id and c.status = 'fechada'
  ), dias as (
    select distinct dia from visitas
  )
  select case when not public.eh_equipe() then null else jsonb_build_object(
    'ultima_visita', (select max(dia) from dias),
    'visitas', (select count(*) from dias),
    'frequencia_dias', (select case when count(*) >= 2 then round((max(dia) - min(dia))::numeric / (count(*) - 1)) end from dias),
    'servico_mais_feito', (
      select i.descricao from public.comanda_itens i join public.comandas c on c.id = i.comanda_id
       where c.cliente_id = p_cliente_id and c.status = 'fechada' and i.tipo = 'servico'
       group by i.descricao order by sum(i.quantidade) desc, max(c.fechada_em) desc limit 1),
    'total_gasto_centavos', case when public.eh_dono() then (select coalesce(sum(total_itens_centavos), 0) from visitas) end
  ) end
$$;

-- ---------------------------------------------------------------------
-- Só o dono: caixinhas e pagamentos (rascunho), fechar, reabrir, cancelar
-- p_caixinhas:  [{"profissional_id": "...", "valor_centavos": 1000}, …]
-- p_pagamentos: [{"forma": "pix", "valor_centavos": 5000}, …]
-- ---------------------------------------------------------------------
create function public.salvar_caixinhas_pagamentos(p_comanda_id uuid, p_caixinhas jsonb, p_pagamentos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.eh_dono() then raise exception 'Só o dono.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.comandas where id = p_comanda_id and status = 'aberta') then
    raise exception 'A comanda não está aberta.' using errcode = 'P0001';
  end if;

  delete from public.comanda_caixinhas where comanda_id = p_comanda_id;
  insert into public.comanda_caixinhas (comanda_id, profissional_id, valor_centavos)
  select p_comanda_id, (x->>'profissional_id')::uuid, sum((x->>'valor_centavos')::integer)
    from jsonb_array_elements(coalesce(p_caixinhas, '[]')) x
   where (x->>'valor_centavos')::integer > 0
   group by (x->>'profissional_id')::uuid;

  delete from public.comanda_pagamentos where comanda_id = p_comanda_id;
  insert into public.comanda_pagamentos (comanda_id, ordem, forma, valor_centavos)
  select p_comanda_id, row_number() over (), (x->>'forma')::public.forma_pagamento, (x->>'valor_centavos')::integer
    from jsonb_array_elements(coalesce(p_pagamentos, '[]')) x
   where (x->>'valor_centavos')::integer > 0;
end;
$$;

create function public.fechar_comanda(p_comanda_id uuid, p_caixinhas jsonb, p_pagamentos jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_c public.comandas;
  v_cfg public.configuracoes;
  v_hoje date := public.hoje_sp();
  v_itens integer;
  v_caixinhas integer;
  v_pago integer;
  v_taxas integer;
  v_taxa_cartao numeric;
  v_item record;
  v_pct numeric;
  v_com integer;
begin
  if not public.eh_dono() then raise exception 'Só o dono pode fechar a comanda.' using errcode = 'P0001'; end if;
  perform public.salvar_caixinhas_pagamentos(p_comanda_id, p_caixinhas, p_pagamentos);

  select * into v_c from public.comandas where id = p_comanda_id for update;
  select * into v_cfg from public.configuracoes limit 1;

  select coalesce(sum(valor_total_centavos), 0), count(*) into v_itens, v_com from public.comanda_itens where comanda_id = p_comanda_id;
  if v_com = 0 then raise exception 'A comanda não tem itens.' using errcode = 'P0001'; end if;
  select coalesce(sum(valor_centavos), 0) into v_caixinhas from public.comanda_caixinhas where comanda_id = p_comanda_id;
  select coalesce(sum(valor_centavos), 0) into v_pago from public.comanda_pagamentos where comanda_id = p_comanda_id;

  if v_pago <> v_itens + v_caixinhas then
    raise exception 'Os pagamentos (R$ %) não fecham com o total (R$ %).',
      replace(to_char(v_pago / 100.0, 'FM9999990.00'), '.', ','), replace(to_char((v_itens + v_caixinhas) / 100.0, 'FM9999990.00'), '.', ',')
      using errcode = 'P0001';
  end if;
  if v_c.cliente_id is null and exists (select 1 from public.comanda_pagamentos where comanda_id = p_comanda_id and forma = 'saldo') then
    raise exception 'Para usar o saldo na casa, a comanda precisa ter cliente.' using errcode = 'P0001';
  end if;

  -- Taxas da maquininha
  update public.comanda_pagamentos g
     set taxa_percentual = case g.forma when 'credito' then v_cfg.taxa_credito when 'debito' then v_cfg.taxa_debito
                                        when 'pix' then v_cfg.taxa_pix else 0 end
   where g.comanda_id = p_comanda_id;
  update public.comanda_pagamentos set taxa_centavos = round(valor_centavos * taxa_percentual / 100)
   where comanda_id = p_comanda_id;
  select coalesce(sum(taxa_centavos), 0) into v_taxas from public.comanda_pagamentos where comanda_id = p_comanda_id;

  -- Comissões: sobre o valor cheio do item; percentual gravado no item
  for v_item in
    select i.*, p.recebe_comissao from public.comanda_itens i
      join public.profissionais p on p.id = i.profissional_id
     where i.comanda_id = p_comanda_id
  loop
    v_pct := case
      when not v_item.recebe_comissao then 0
      when v_item.tipo = 'servico' then coalesce(public.comissao_servico(v_item.profissional_id, v_item.servico_id), 0)
      when v_item.tipo = 'produto' then coalesce((select comissao_percentual from public.produtos where id = v_item.produto_id), 0)
      else 0 end;
    v_com := round(v_item.valor_total_centavos * v_pct / 100);
    update public.comanda_itens set comissao_percentual = v_pct, comissao_centavos = v_com where id = v_item.id;
    if v_com > 0 then
      insert into public.lancamentos_profissional (profissional_id, tipo, valor_centavos, descricao, data, comanda_id, comanda_item_id)
      values (v_item.profissional_id, 'comissao', v_com,
              format('%s (%s%%) — comanda #%s', v_item.descricao, replace(rtrim(rtrim(v_pct::text, '0'), '.'), '.', ','), v_c.numero),
              v_hoje, p_comanda_id, v_item.id);
    end if;
    -- Estoque
    if v_item.tipo = 'produto' then
      update public.produtos set estoque = estoque - v_item.quantidade where id = v_item.produto_id;
      insert into public.movimentos_estoque (produto_id, quantidade, motivo, comanda_id)
      values (v_item.produto_id, -v_item.quantidade, format('Venda — comanda #%s', v_c.numero), p_comanda_id);
    end if;
  end loop;

  -- Caixinhas: 100% da profissional (opcionalmente menos a taxa do cartão)
  v_taxa_cartao := case when v_cfg.caixinha_desconta_taxa and v_pago > 0 then v_taxas::numeric / v_pago else 0 end;
  insert into public.lancamentos_profissional (profissional_id, tipo, valor_centavos, descricao, data, comanda_id)
  select x.profissional_id, 'caixinha', round(x.valor_centavos * (1 - v_taxa_cartao)),
         format('Caixinha — comanda #%s', v_c.numero), v_hoje, p_comanda_id
    from public.comanda_caixinhas x where x.comanda_id = p_comanda_id;

  -- Saldo na casa usado (ou pendurado)
  insert into public.movimentos_saldo (cliente_id, valor_centavos, descricao, comanda_id)
  select v_c.cliente_id, -g.valor_centavos, format('Usado na comanda #%s', v_c.numero), p_comanda_id
    from public.comanda_pagamentos g where g.comanda_id = p_comanda_id and g.forma = 'saldo';

  update public.comandas set
    status = 'fechada', fechada_em = now(), fechada_por = public.meu_profissional_id(),
    total_itens_centavos = v_itens, total_caixinhas_centavos = v_caixinhas, total_taxas_centavos = v_taxas,
    total_comissoes_centavos = (select coalesce(sum(comissao_centavos), 0) from public.comanda_itens where comanda_id = p_comanda_id)
  where id = p_comanda_id;

  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'concluido' where id = v_c.agendamento_id;
  end if;
end;
$$;

create function public.reabrir_comanda(p_comanda_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_c public.comandas;
begin
  if not public.eh_dono() then raise exception 'Só o dono pode reabrir comandas.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001'; end if;
  select * into v_c from public.comandas where id = p_comanda_id for update;
  if v_c.status is distinct from 'fechada' then raise exception 'Só comandas fechadas podem ser reabertas.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.lancamentos_profissional where comanda_id = p_comanda_id and pagamento_id is not null) then
    raise exception 'As comissões desta comanda já foram pagas; não é possível reabrir.' using errcode = 'P0001';
  end if;

  delete from public.lancamentos_profissional where comanda_id = p_comanda_id;
  delete from public.movimentos_saldo where comanda_id = p_comanda_id;

  -- Devolve o estoque
  update public.produtos p set estoque = p.estoque - m.qtd
    from (select produto_id, sum(quantidade) as qtd from public.movimentos_estoque where comanda_id = p_comanda_id group by produto_id) m
   where p.id = m.produto_id;
  insert into public.movimentos_estoque (produto_id, quantidade, motivo, comanda_id)
  select produto_id, -sum(quantidade), format('Estorno — reabertura da comanda #%s', v_c.numero), p_comanda_id
    from public.movimentos_estoque where comanda_id = p_comanda_id group by produto_id having sum(quantidade) <> 0;

  update public.comanda_itens set comissao_percentual = null, comissao_centavos = null where comanda_id = p_comanda_id;
  update public.comanda_pagamentos set taxa_percentual = null, taxa_centavos = null where comanda_id = p_comanda_id;
  update public.comandas set
    status = 'aberta', reaberta_em = now(), motivo = trim(p_motivo), fechada_em = null, fechada_por = null,
    total_itens_centavos = null, total_caixinhas_centavos = null, total_taxas_centavos = null, total_comissoes_centavos = null
  where id = p_comanda_id;

  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'em_atendimento' where id = v_c.agendamento_id;
  end if;
end;
$$;

create function public.cancelar_comanda(p_comanda_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_c public.comandas;
begin
  if not public.eh_dono() then raise exception 'Só o dono pode cancelar comandas.' using errcode = 'P0001'; end if;
  select * into v_c from public.comandas where id = p_comanda_id for update;
  if v_c.status is distinct from 'aberta' then raise exception 'Só comandas abertas podem ser canceladas.' using errcode = 'P0001'; end if;
  update public.comandas set status = 'cancelada', cancelada_em = now(), motivo = nullif(trim(p_motivo), '') where id = p_comanda_id;
  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'confirmado' where id = v_c.agendamento_id;
  end if;
end;
$$;

-- Ninguém sem login executa estas funções
revoke execute on function public.hoje_sp() from public, anon;
grant execute on function public.hoje_sp() to authenticated;
revoke execute on function public.abrir_comanda(uuid, uuid) from public, anon;
grant execute on function public.abrir_comanda(uuid, uuid) to authenticated;
revoke execute on function public.lancar_item(uuid, text, uuid, integer, uuid) from public, anon;
grant execute on function public.lancar_item(uuid, text, uuid, integer, uuid) to authenticated;
revoke execute on function public.remover_item(uuid) from public, anon;
grant execute on function public.remover_item(uuid) to authenticated;
revoke execute on function public.comandas_abertas_equipe() from public, anon;
grant execute on function public.comandas_abertas_equipe() to authenticated;
revoke execute on function public.comanda_equipe(uuid) from public, anon;
grant execute on function public.comanda_equipe(uuid) to authenticated;
revoke execute on function public.historico_cliente(uuid) from public, anon;
grant execute on function public.historico_cliente(uuid) to authenticated;
revoke execute on function public.resumo_cliente(uuid) from public, anon;
grant execute on function public.resumo_cliente(uuid) to authenticated;
revoke execute on function public.salvar_caixinhas_pagamentos(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_caixinhas_pagamentos(uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.fechar_comanda(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.fechar_comanda(uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.reabrir_comanda(uuid, text) from public, anon;
grant execute on function public.reabrir_comanda(uuid, text) to authenticated;
revoke execute on function public.cancelar_comanda(uuid, text) from public, anon;
grant execute on function public.cancelar_comanda(uuid, text) to authenticated;
