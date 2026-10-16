-- =====================================================================
-- Dados de exemplo — Fase 2: clientes FICTÍCIAS para testes.
-- Pode rodar de novo sem duplicar.
-- =====================================================================

insert into public.clientes (nome, telefone, aniversario_dia, aniversario_mes, aniversario_ano, cliente_desde)
select v.nome, v.telefone, v.dia, v.mes, v.ano, v.desde::date
from (values
  ('Ana Teste Ribeiro',     '11990000001', 12::smallint, 3::smallint,  1988::smallint, '2023-02-10'),
  ('Beatriz Exemplo Souza', '11990000002', 25::smallint, 10::smallint, null::smallint, '2024-06-03'),
  ('Carla Fictícia Lima',   '11990000003', null,         null,         null,           '2025-01-20'),
  ('Débora Modelo Alves',   '11990000004', 2::smallint,  7::smallint,  1975::smallint, '2022-11-05')
) as v(nome, telefone, dia, mes, ano, desde)
where not exists (select 1 from public.clientes c where c.nome = v.nome);

insert into public.fichas_tecnicas (cliente_id, cor_formula, tipo_cabelo, alergias_cuidados, preferencias)
select c.id, v.cor, v.tipo, v.alergias, v.pref
from (values
  ('Ana Teste Ribeiro',     '7.1 + 8.1 (1:1), OX 20 vol, 35 min', 'Liso, fino', 'Couro cabeludo sensível', 'Gosta de café sem açúcar'),
  ('Beatriz Exemplo Souza', 'Mechas com pó descolorante + OX 30 vol', 'Ondulado 2B', null, 'Prefere horários de manhã'),
  ('Débora Modelo Alves',   '5.0 cobertura de brancos, OX 20 vol', 'Cacheado 3A', 'Alergia a amônia — usar linha sem amônia', null)
) as v(nome, cor, tipo, alergias, pref)
join public.clientes c on c.nome = v.nome
on conflict (cliente_id) do nothing;

insert into public.anotacoes_clientes (cliente_id, autor_id, texto, criado_em)
select c.id, p.id, v.texto, v.quando::timestamptz
from (values
  ('Ana Teste Ribeiro',   'Valdete Costa',  'Quer deixar o cabelo crescer, só aparar as pontas.',          '2026-09-02 10:30-03'),
  ('Ana Teste Ribeiro',   'Eduardo Persan', 'Comentou que vai casar em dezembro — oferecer pacote noiva.', '2026-09-20 15:10-03'),
  ('Débora Modelo Alves', 'Di',             'Unhas fracas, recomendei base fortalecedora.',                '2026-08-14 11:00-03')
) as v(nome, autor, texto, quando)
join public.clientes c on c.nome = v.nome
join public.profissionais p on p.nome = v.autor
where not exists (select 1 from public.anotacoes_clientes a where a.cliente_id = c.id and a.texto = v.texto);

insert into public.movimentos_saldo (cliente_id, valor_centavos, descricao, criado_em)
select c.id, v.valor, v.descr, v.quando::timestamptz
from (values
  ('Beatriz Exemplo Souza', 10000, 'Pagou adiantado (Pix)', '2026-09-15 09:00-03'),
  ('Carla Fictícia Lima',   -3000, 'Ficou devendo parte da escova', '2026-10-01 18:20-03')
) as v(nome, valor, descr, quando)
join public.clientes c on c.nome = v.nome
where not exists (select 1 from public.movimentos_saldo m where m.cliente_id = c.id and m.descricao = v.descr);
