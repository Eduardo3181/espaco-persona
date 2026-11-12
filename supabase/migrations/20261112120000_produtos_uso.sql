-- =====================================================================
-- Produtos de uso (custo de insumos) — só dono.
-- Coloração, oxidante, descolorante, matizador e tratamentos usados nos
-- atendimentos (não vendidos à cliente). Na comanda, cada serviço tem a
-- fórmula (produtos e gramas); ao fechar, grava o custo por grama do dia e
-- baixa do estoque. Estoque e embalagem em g (ou ml, com 1 ml ≈ 1 g).
-- =====================================================================
create table public.produtos_uso (
  id                        uuid primary key default gen_random_uuid(),
  tipo                      text not null check (tipo in ('coloracao', 'oxidante', 'descolorante', 'matizador', 'tratamento', 'outro')),
  familia                   text,
  numero                    text,              -- número/tom é texto: "10.0", "M89"
  nome                      text not null check (length(trim(nome)) > 0),
  embalagem_qtd             numeric(10,2) check (embalagem_qtd > 0),   -- g ou ml por embalagem
  unidade                   text not null default 'g' check (unidade in ('g', 'ml')),
  valor_compra_centavos     integer not null default 0 check (valor_compra_centavos >= 0),
  estoque_qtd               numeric(12,2) not null default 0,          -- em g/ml
  estoque_minimo_embalagens numeric(8,2) not null default 0 check (estoque_minimo_embalagens >= 0),
  observacao                text,
  ativo                     boolean not null default true,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now(),
  constraint produtos_uso_coloracao_com_numero check (tipo <> 'coloracao' or numero is not null)
);
create unique index produtos_uso_coloracao_numero_unico on public.produtos_uso (numero) where tipo = 'coloracao';
create trigger produtos_uso_atualizado_em
  before update on public.produtos_uso
  for each row execute function public.tocar_atualizado_em();

-- Fórmula de cada serviço da comanda
create table public.comanda_produtos_uso (
  id                      uuid primary key default gen_random_uuid(),
  comanda_item_id         uuid not null references public.comanda_itens (id) on delete cascade,
  produto_uso_id          uuid not null references public.produtos_uso (id) on delete restrict,
  quantidade              numeric(10,2) not null check (quantidade > 0),   -- g ou ml
  custo_unitario_centavos numeric(14,6),   -- custo por g/ml, gravado ao fechar
  custo_centavos          integer,         -- gravado ao fechar
  criado_em               timestamptz not null default now()
);
create index comanda_produtos_uso_item_idx on public.comanda_produtos_uso (comanda_item_id);
create index comanda_produtos_uso_produto_idx on public.comanda_produtos_uso (produto_uso_id);

alter table public.comandas add column total_custo_produtos_centavos integer not null default 0;

alter table public.produtos_uso enable row level security;
alter table public.comanda_produtos_uso enable row level security;
revoke all on public.produtos_uso, public.comanda_produtos_uso from anon;
create policy "dono gerencia produtos de uso" on public.produtos_uso
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
create policy "dono gerencia fórmulas" on public.comanda_produtos_uso
  for all to authenticated using (public.eh_dono()) with check (public.eh_dono());

-- Fórmula só muda com a comanda aberta
create function public.conferir_formula_comanda_aberta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.comanda_itens i join public.comandas c on c.id = i.comanda_id
                  where i.id = coalesce(new.comanda_item_id, old.comanda_item_id) and c.status = 'aberta') then
    raise exception 'A comanda não está aberta.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger comanda_produtos_uso_so_aberta
  before insert or delete or update of comanda_item_id, produto_uso_id, quantidade on public.comanda_produtos_uso
  for each row execute function public.conferir_formula_comanda_aberta();
revoke execute on function public.conferir_formula_comanda_aberta() from public, anon, authenticated;

-- Coloração aparece só pelo número; os outros, pelo nome
create function public.nome_produto_uso(p_tipo text, p_numero text, p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_tipo = 'coloracao' then 'Coloração ' || p_numero else p_nome end
$$;

-- Última fórmula da cliente (de preferência do mesmo serviço), sem custo: a equipe pode ver
create function public.ultima_formula_cliente(p_cliente_id uuid, p_servico_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with item as (
    select i.id, i.descricao, c.data_atendimento
      from public.comanda_itens i
      join public.comandas c on c.id = i.comanda_id
     where c.cliente_id = p_cliente_id and c.status = 'fechada' and public.eh_equipe()
       and exists (select 1 from public.comanda_produtos_uso u where u.comanda_item_id = i.id)
     order by (p_servico_id is not null and i.servico_id = p_servico_id) desc, c.data_atendimento desc, c.fechada_em desc
     limit 1
  )
  select jsonb_build_object(
           'servico', item.descricao, 'data', item.data_atendimento,
           'produtos', (select jsonb_agg(jsonb_build_object(
                          'produto_uso_id', p.id, 'produto', public.nome_produto_uso(p.tipo, p.numero, p.nome),
                          'quantidade', u.quantidade, 'unidade', p.unidade) order by u.criado_em)
                          from public.comanda_produtos_uso u join public.produtos_uso p on p.id = u.produto_uso_id
                         where u.comanda_item_id = item.id))
    from item
$$;

-- Consumo por produto no período (comandas fechadas, pelo dia do atendimento)
create function public.consumo_produtos_uso(p_inicio date, p_fim date)
returns table (produto_uso_id uuid, quantidade numeric, custo_centavos bigint, atendimentos bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.eh_dono() then
    raise exception 'Só o dono vê o consumo de produtos.' using errcode = 'P0001';
  end if;
  return query
    select u.produto_uso_id, sum(u.quantidade), coalesce(sum(u.custo_centavos), 0)::bigint, count(distinct i.comanda_id)
      from public.comanda_produtos_uso u
      join public.comanda_itens i on i.id = u.comanda_item_id
      join public.comandas c on c.id = i.comanda_id
     where c.status = 'fechada' and c.data_atendimento between p_inicio and p_fim
     group by u.produto_uso_id;
end;
$$;

revoke execute on function public.ultima_formula_cliente(uuid, uuid) from public, anon;
revoke execute on function public.consumo_produtos_uso(date, date) from public, anon;
grant execute on function public.ultima_formula_cliente(uuid, uuid) to authenticated;
grant execute on function public.consumo_produtos_uso(date, date) to authenticated;

create or replace function public.fechar_comanda(p_comanda_id uuid, p_caixinhas jsonb, p_pagamentos jsonb, p_data_atendimento date default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_c public.comandas;
  v_cfg public.configuracoes;
  v_hoje date := public.hoje_sp();
  v_dia date;
  v_itens integer;
  v_caixinhas integer;
  v_pago integer;
  v_taxas integer;
  v_taxa_cartao numeric;
  v_item record;
  v_pct numeric;
  v_com integer;
  v_pix integer;
  v_desconto integer := 0;
  v_resto integer;
  v_parte integer;
  v_linha record;
  v_custo_produtos integer;
begin
  if not public.eh_dono() then raise exception 'Só o dono pode fechar a comanda.' using errcode = 'P0001'; end if;
  perform public.salvar_caixinhas_pagamentos(p_comanda_id, p_caixinhas, p_pagamentos);

  select * into v_c from public.comandas where id = p_comanda_id for update;
  select * into v_cfg from public.configuracoes limit 1;

  -- Dia do atendimento: o da agenda (nunca no futuro) ou o informado na comanda avulsa
  select least((a.inicio at time zone 'America/Sao_Paulo')::date, v_hoje) into v_dia
    from public.agendamentos a where a.id = v_c.agendamento_id;
  if v_dia is null then
    v_dia := coalesce(p_data_atendimento, v_c.data_atendimento, v_hoje);
    if v_dia > v_hoje then
      raise exception 'A data do atendimento não pode ser no futuro.' using errcode = 'P0001';
    end if;
  end if;

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

  -- Desconto do Pix: só sobre a parte em Pix e sem a caixinha (fatia proporcional dos itens).
  -- O valor da linha passa a ser o que a cliente pagou; reabrir a comanda devolve o valor cheio.
  select coalesce(sum(valor_centavos), 0) into v_pix from public.comanda_pagamentos where comanda_id = p_comanda_id and forma = 'pix';
  if v_pix > 0 and v_cfg.desconto_pix > 0 then
    v_desconto := round(v_pix::numeric * v_itens * v_cfg.desconto_pix / (v_pago * 100.0));
    v_resto := v_desconto;
    for v_linha in
      select id, valor_centavos, row_number() over (order by ordem desc) as de_tras
        from public.comanda_pagamentos where comanda_id = p_comanda_id and forma = 'pix' order by ordem
    loop
      v_parte := case when v_linha.de_tras = 1 then v_resto else round(v_desconto::numeric * v_linha.valor_centavos / v_pix) end;
      update public.comanda_pagamentos set valor_centavos = valor_centavos - v_parte, desconto_centavos = v_parte where id = v_linha.id;
      v_resto := v_resto - v_parte;
    end loop;
    v_pago := v_pago - v_desconto;
  end if;

  -- Taxas da maquininha
  update public.comanda_pagamentos g
     set taxa_percentual = case g.forma
           when 'credito' then case g.parcelas
             when 1 then v_cfg.taxa_credito when 2 then v_cfg.taxa_credito_2x
             when 3 then v_cfg.taxa_credito_3x when 4 then v_cfg.taxa_credito_4x end
           when 'debito' then v_cfg.taxa_debito
           when 'pix' then v_cfg.taxa_pix else 0 end
   where g.comanda_id = p_comanda_id;
  if exists (select 1 from public.comanda_pagamentos where comanda_id = p_comanda_id and taxa_percentual is null) then
    raise exception 'Sem taxa cadastrada para esse parcelamento. Cadastre em Configurações ou escolha outra opção.' using errcode = 'P0001';
  end if;
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
              v_dia, p_comanda_id, v_item.id);
    end if;
    -- Estoque
    if v_item.tipo = 'produto' then
      update public.produtos set estoque = estoque - v_item.quantidade where id = v_item.produto_id;
      insert into public.movimentos_estoque (produto_id, quantidade, motivo, comanda_id)
      values (v_item.produto_id, -v_item.quantidade, format('Venda — comanda #%s', v_c.numero), p_comanda_id);
    end if;
  end loop;

  -- Produtos de uso: grava o custo por grama de hoje (reajustes futuros não mudam o histórico) e baixa do estoque
  update public.comanda_produtos_uso u
     set custo_unitario_centavos = case when p.embalagem_qtd > 0 then p.valor_compra_centavos::numeric / p.embalagem_qtd else 0 end,
         custo_centavos = round(u.quantidade * case when p.embalagem_qtd > 0 then p.valor_compra_centavos::numeric / p.embalagem_qtd else 0 end)
    from public.produtos_uso p, public.comanda_itens i
   where p.id = u.produto_uso_id and i.id = u.comanda_item_id and i.comanda_id = p_comanda_id;
  update public.produtos_uso p set estoque_qtd = p.estoque_qtd - x.qtd
    from (select u.produto_uso_id, sum(u.quantidade) as qtd
            from public.comanda_produtos_uso u join public.comanda_itens i on i.id = u.comanda_item_id
           where i.comanda_id = p_comanda_id group by u.produto_uso_id) x
   where p.id = x.produto_uso_id;
  select coalesce(sum(u.custo_centavos), 0) into v_custo_produtos
    from public.comanda_produtos_uso u join public.comanda_itens i on i.id = u.comanda_item_id
   where i.comanda_id = p_comanda_id;

  -- Caixinhas: 100% da profissional (opcionalmente menos a taxa do cartão)
  v_taxa_cartao := case when v_cfg.caixinha_desconta_taxa and v_pago > 0 then v_taxas::numeric / v_pago else 0 end;
  insert into public.lancamentos_profissional (profissional_id, tipo, valor_centavos, descricao, data, comanda_id)
  select x.profissional_id, 'caixinha', round(x.valor_centavos * (1 - v_taxa_cartao)),
         format('Caixinha — comanda #%s', v_c.numero), v_dia, p_comanda_id
    from public.comanda_caixinhas x where x.comanda_id = p_comanda_id;

  -- Saldo na casa usado (ou pendurado)
  insert into public.movimentos_saldo (cliente_id, valor_centavos, descricao, comanda_id)
  select v_c.cliente_id, -g.valor_centavos, format('Usado na comanda #%s', v_c.numero), p_comanda_id
    from public.comanda_pagamentos g where g.comanda_id = p_comanda_id and g.forma = 'saldo';

  update public.comandas set
    status = 'fechada', fechada_em = now(), data_atendimento = v_dia, fechada_por = public.meu_profissional_id(),
    total_itens_centavos = v_itens - v_desconto, total_desconto_centavos = v_desconto, total_custo_produtos_centavos = v_custo_produtos, total_caixinhas_centavos = v_caixinhas, total_taxas_centavos = v_taxas,
    total_comissoes_centavos = (select coalesce(sum(comissao_centavos), 0) from public.comanda_itens where comanda_id = p_comanda_id)
  where id = p_comanda_id;

  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'concluido' where id = v_c.agendamento_id;
  end if;
end;
$$;

create or replace function public.reabrir_comanda(p_comanda_id uuid, p_motivo text)
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

  -- Produtos de uso voltam para o estoque
  update public.produtos_uso p set estoque_qtd = p.estoque_qtd + x.qtd
    from (select u.produto_uso_id, sum(u.quantidade) as qtd
            from public.comanda_produtos_uso u join public.comanda_itens i on i.id = u.comanda_item_id
           where i.comanda_id = p_comanda_id group by u.produto_uso_id) x
   where p.id = x.produto_uso_id;
  update public.comanda_produtos_uso u set custo_unitario_centavos = null, custo_centavos = null
    from public.comanda_itens i where i.id = u.comanda_item_id and i.comanda_id = p_comanda_id;
  delete from public.movimentos_saldo where comanda_id = p_comanda_id;

  -- Devolve o estoque
  update public.produtos p set estoque = p.estoque - m.qtd
    from (select produto_id, sum(quantidade) as qtd from public.movimentos_estoque where comanda_id = p_comanda_id group by produto_id) m
   where p.id = m.produto_id;
  insert into public.movimentos_estoque (produto_id, quantidade, motivo, comanda_id)
  select produto_id, -sum(quantidade), format('Estorno — reabertura da comanda #%s', v_c.numero), p_comanda_id
    from public.movimentos_estoque where comanda_id = p_comanda_id group by produto_id having sum(quantidade) <> 0;

  update public.comanda_itens set comissao_percentual = null, comissao_centavos = null where comanda_id = p_comanda_id;
  update public.comanda_pagamentos set taxa_percentual = null, taxa_centavos = null,
         valor_centavos = valor_centavos + desconto_centavos, desconto_centavos = 0 where comanda_id = p_comanda_id;
  update public.comandas set
    status = 'aberta', reaberta_em = now(), motivo = trim(p_motivo), fechada_em = null, fechada_por = null,
    total_itens_centavos = null, total_desconto_centavos = 0, total_custo_produtos_centavos = 0, total_caixinhas_centavos = null, total_taxas_centavos = null, total_comissoes_centavos = null
  where id = p_comanda_id;

  if v_c.agendamento_id is not null then
    update public.agendamentos set status = 'em_atendimento' where id = v_c.agendamento_id;
  end if;
end;
$$;

create or replace function public.relatorio_vendas(p_inicio date, p_fim date)
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

  with cmd as (
    select c.*, c.data_atendimento as dia
      from public.comandas c
     where c.status = 'fechada'
       and c.data_atendimento between p_inicio and p_fim
  ),
  itens as (
    select i.*, c.dia from public.comanda_itens i join cmd c on c.id = i.comanda_id
  )
  select jsonb_build_object(
    'totais', (select jsonb_build_object(
        'faturamento', coalesce(sum(total_itens_centavos), 0),
        'descontos',   coalesce(sum(total_desconto_centavos), 0),
        'custo_produtos', coalesce(sum(total_custo_produtos_centavos), 0),
        'caixinhas',   coalesce(sum(total_caixinhas_centavos), 0),
        'taxas',       coalesce(sum(total_taxas_centavos), 0),
        'comissoes',   coalesce(sum(total_comissoes_centavos), 0),
        'comandas',    count(*),
        'clientes',    count(distinct cliente_id)
      ) from cmd),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'valor', valor) order by dia)
        from (select dia, sum(total_itens_centavos) as valor from cmd group by dia) d), '[]'),
    'por_item', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'descricao', descricao, 'quantidade', qtd, 'valor', valor) order by valor desc)
        from (select tipo, descricao, sum(quantidade) as qtd, sum(valor_total_centavos) as valor
                from itens group by tipo, descricao) x), '[]'),
    'por_forma', coalesce((select jsonb_agg(jsonb_build_object('forma', forma, 'valor', valor, 'taxa', taxa) order by valor desc)
        from (select g.forma, sum(g.valor_centavos) as valor, sum(coalesce(g.taxa_centavos, 0)) as taxa
                from public.comanda_pagamentos g join cmd c on c.id = g.comanda_id group by g.forma) f), '[]'),
    'por_profissional', coalesce((select jsonb_agg(jsonb_build_object(
          'profissional_id', p.id, 'nome', p.nome, 'cor', p.cor,
          'faturamento', x.valor, 'comissao', x.comissao, 'atendimentos', x.atendimentos,
          'caixinhas', coalesce((select sum(cx.valor_centavos) from public.comanda_caixinhas cx join cmd c on c.id = cx.comanda_id
                                  where cx.profissional_id = p.id), 0)) order by x.valor desc)
        from (select profissional_id, sum(valor_total_centavos) as valor, sum(coalesce(comissao_centavos, 0)) as comissao,
                     count(distinct comanda_id) as atendimentos
                from itens group by profissional_id) x
        join public.profissionais p on p.id = x.profissional_id), '[]')
  ) into v;

  return v;
end;
$$;

drop function public.historico_cliente(uuid);
create function public.historico_cliente(p_cliente_id uuid)
returns table (
  comanda_id uuid, numero integer, data timestamptz, status public.status_comanda,
  itens jsonb, total_centavos integer, pagamentos jsonb, anotacoes jsonb, produtos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.numero, case when c.status = 'fechada'
           then (c.data_atendimento + (c.fechada_em at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo'
           else c.aberta_em end, c.status,
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
                    where a.comanda_id = c.id), '[]'::jsonb),
         -- Produtos de uso (fórmula), um por linha; o custo só para o dono
         coalesce((select jsonb_agg(jsonb_build_object(
                     'servico', i.descricao, 'produto', public.nome_produto_uso(p.tipo, p.numero, p.nome),
                     'quantidade', u.quantidade, 'unidade', p.unidade,
                     'custo_centavos', case when public.eh_dono() then u.custo_centavos end) order by i.criado_em, u.criado_em)
                     from public.comanda_produtos_uso u
                     join public.comanda_itens i on i.id = u.comanda_item_id
                     join public.produtos_uso p on p.id = u.produto_uso_id
                    where i.comanda_id = c.id), '[]'::jsonb)
    from public.comandas c
   where c.cliente_id = p_cliente_id and c.status <> 'cancelada' and public.eh_equipe()
   order by case when c.status = 'fechada'
           then (c.data_atendimento + (c.fechada_em at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo'
           else c.aberta_em end desc
$$;
revoke execute on function public.historico_cliente(uuid) from public, anon;
grant execute on function public.historico_cliente(uuid) to authenticated;

-- Produtos da planilha produtos_uso_2.xlsx (catálogo fotografado pelo dono em 12/11/2026).
-- Valores de compra e estoques chegam em branco: o dono preenche no sistema.
insert into public.produtos_uso
  (tipo, familia, numero, nome, embalagem_qtd, unidade, valor_compra_centavos, estoque_qtd, estoque_minimo_embalagens, observacao)
values
  ('coloracao', 'Naturais', '1.0', 'Coloração 1.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Naturais', '3.0', 'Coloração 3.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Naturais', '4.0', 'Coloração 4.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Naturais', '5.0', 'Coloração 5.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Naturais', '6.0', 'Coloração 6.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Naturais', '7.0', 'Coloração 7.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Naturais', '8.0', 'Coloração 8.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Naturais', '9.0', 'Coloração 9.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Naturais', '10.0', 'Coloração 10.0', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Cinzas', '5.1', 'Coloração 5.1', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Cinzas', '6.1', 'Coloração 6.1', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Cinzas', '7.1', 'Coloração 7.1', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Cinzas', '8.1', 'Coloração 8.1', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Cinzas', '9.1', 'Coloração 9.1', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Cinzas', '10.1', 'Coloração 10.1', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Pérola Acinzentados', '7.21', 'Coloração 7.21', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Pérola Acinzentados', '8.21', 'Coloração 8.21', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Pérola Acinzentados', '9.21', 'Coloração 9.21', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Pérola Acinzentados', '10.21', 'Coloração 10.21', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Pérola Acinzentados', 'M89', 'Coloração M89', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Pérola', '8.2', 'Coloração 8.2', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Pérola', '9.2', 'Coloração 9.2', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Mate', '7.13', 'Coloração 7.13', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Mate', '8.13', 'Coloração 8.13', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Mate', '10.13', 'Coloração 10.13', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Dourados', '6.3', 'Coloração 6.3', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Dourados', '7.3', 'Coloração 7.3', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Dourados', '8.3', 'Coloração 8.3', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Dourados', '9.3', 'Coloração 9.3', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Beges', '8.31', 'Coloração 8.31', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Beges', '9.31', 'Coloração 9.31', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Beges', '10.31', 'Coloração 10.31', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons', '4.7', 'Coloração 4.7', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons', '5.7', 'Coloração 5.7', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons', '6.7', 'Coloração 6.7', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons', '7.7', 'Coloração 7.7', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons Pérola', '7.72', 'Coloração 7.72', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons Pérola', '8.72', 'Coloração 8.72', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons Pérola', '9.72', 'Coloração 9.72', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons Tropicais', '6.35', 'Coloração 6.35', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons Tropicais', '7.35', 'Coloração 7.35', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons Tropicais', '6.37', 'Coloração 6.37', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons Tropicais', '7.37', 'Coloração 7.37', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Marrons Tropicais', '8.37', 'Coloração 8.37', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '6.4', 'Coloração 6.4', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '7.4', 'Coloração 7.4', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '8.4', 'Coloração 8.4', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '6.41', 'Coloração 6.41', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '5.34', 'Coloração 5.34', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '6.34', 'Coloração 6.34', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '8.34', 'Coloração 8.34', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '6.43', 'Coloração 6.43', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Acobreados', '9.43', 'Coloração 9.43', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Vermelhos', '4.66', 'Coloração 4.66', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Vermelhos', '6.66', 'Coloração 6.66', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Vermelhos', '7.66', 'Coloração 7.66', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Vermelhos', '5.64', 'Coloração 5.64', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Vermelhos', '7.64', 'Coloração 7.64', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Vermelhos Especiais', '66.46', 'Coloração 66.46', 60, 'g', 0, 0, 0, 'Confirmar o número na caixa (cortado na foto)'),
  ('coloracao', 'Vermelhos Especiais', '5.20', 'Coloração 5.20', 60, 'g', 0, 0, 0, 'Confirmar o número na caixa (cortado na foto)'),
  ('coloracao', 'Vermelhos Especiais', '55.62', 'Coloração 55.62', 60, 'g', 0, 0, 0, 'Confirmar o número na caixa (cortado na foto)'),
  ('coloracao', 'Vermelhos Especiais', '77.62', 'Coloração 77.62', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Intensificadores / Corretores', '0.6', 'Coloração 0.6', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Intensificadores / Corretores', '0.43', 'Coloração 0.43', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Intensificadores / Corretores', '0.3', 'Coloração 0.3', 60, 'g', 0, 0, 0, null),
  ('coloracao', 'Intensificadores / Corretores', '0.1', 'Coloração 0.1', 60, 'g', 0, 0, 0, null),
  ('oxidante', null, '5 vol', 'Oxidante 5 volumes', 1000, 'g', 0, 0, 0, 'Frasco de 1 litro, pesado em gramas (1 ml ≈ 1 g)'),
  ('oxidante', null, '20 vol', 'Oxidante 20 volumes', 1000, 'g', 0, 0, 0, 'Frasco de 1 litro, pesado em gramas (1 ml ≈ 1 g)'),
  ('oxidante', null, '30 vol', 'Oxidante 30 volumes', 1000, 'g', 0, 0, 0, 'Frasco de 1 litro, pesado em gramas (1 ml ≈ 1 g)'),
  ('oxidante', null, '40 vol', 'Oxidante 40 volumes', 1000, 'g', 0, 0, 0, 'Frasco de 1 litro, pesado em gramas (1 ml ≈ 1 g)'),
  ('descolorante', null, null, 'Pó descolorante', null, 'g', 0, 0, 0, 'Informar o tamanho da embalagem'),
  ('matizador', null, null, 'Matizador', null, 'g', 0, 0, 0, 'Informar o tom e o tamanho da embalagem');
