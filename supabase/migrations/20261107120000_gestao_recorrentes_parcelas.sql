-- =====================================================================
-- Gestão: contas recorrentes (todo mês, sem data para acabar) e parceladas.
-- Cada mês ou parcela é um lançamento próprio, ligado por repeticao_id.
-- Recorrentes ficam sempre lançadas 12 meses à frente: a função abaixo roda
-- ao abrir a Gestão e cria os meses que faltam, até a recorrência ser encerrada.
-- =====================================================================
alter table public.fin_lancamentos
  add column repeticao_tipo text check (repeticao_tipo in ('recorrente', 'parcelada')),
  add column parcela_numero integer check (parcela_numero > 0),
  add column parcelas_total integer check (parcelas_total > 0),
  add column repeticao_encerrada boolean not null default false;
create index fin_lancamentos_repeticao_idx on public.fin_lancamentos (repeticao_id) where repeticao_id is not null;

create function public.gestao_estender_recorrentes()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limite date := (public.hoje_sp() + interval '12 months')::date;
  v_serie record;
  v_ultima public.fin_lancamentos;
  v_data date;
  v_k integer;
  v_criados integer := 0;
begin
  if not public.eh_dono() then
    raise exception 'A gestão financeira é só para o dono.' using errcode = 'P0001';
  end if;

  for v_serie in
    select repeticao_id, min(vencimento) as base, max(vencimento) as ultimo
      from public.fin_lancamentos
     where repeticao_tipo = 'recorrente'
     group by repeticao_id
    having not bool_or(repeticao_encerrada) and max(vencimento) < v_limite
  loop
    select * into v_ultima from public.fin_lancamentos
     where repeticao_id = v_serie.repeticao_id order by vencimento desc limit 1;
    v_k := 1;
    loop
      -- Sempre a partir do primeiro mês: dia 31 volta a ser 31 depois de fevereiro
      v_data := (v_serie.base + make_interval(months => v_k))::date;
      exit when v_data > v_limite;
      if v_data > v_serie.ultimo then
        insert into public.fin_lancamentos (categoria_id, conta_id, descricao, valor_centavos, vencimento, repeticao_id, repeticao_tipo)
        values (v_ultima.categoria_id, v_ultima.conta_id, v_ultima.descricao, v_ultima.valor_centavos, v_data, v_ultima.repeticao_id, 'recorrente');
        v_criados := v_criados + 1;
      end if;
      v_k := v_k + 1;
    end loop;
  end loop;
  return v_criados;
end;
$$;

revoke execute on function public.gestao_estender_recorrentes() from public, anon;
grant execute on function public.gestao_estender_recorrentes() to authenticated;
