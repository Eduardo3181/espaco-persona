-- =====================================================================
-- Dados de exemplo — Fase 1
-- Equipe real do salão + catálogo fictício para testes.
-- Regras de comissão ficam em branco: o dono preenche pelo sistema.
-- =====================================================================

-- Equipe. O login é ligado automaticamente pelo e-mail.
insert into public.profissionais (nome, email, funcao, papel, recebe_comissao, cor) values
  ('Eduardo Persan', 'espacopersona.beauty@gmail.com', 'Cabeleireiro', 'dono',         false, '#96604A'),
  ('Valdete Costa',  null,                             'Cabeleireira', 'profissional', true,  '#6F4F8C'),
  ('Di',             null,                             'Manicure',     'profissional', true,  '#2F6B3A')
on conflict do nothing;

-- Categorias
insert into public.categorias (nome, tipo) values
  ('Cortes',      'servico'),
  ('Coloração',   'servico'),
  ('Tratamentos', 'servico'),
  ('Escovas',     'servico'),
  ('Unhas',       'servico'),
  ('Cabelo',      'produto'),
  ('Unhas',       'produto')
on conflict do nothing;

-- Serviços (valores "a partir de", em centavos)
insert into public.servicos (nome, categoria_id, duracao_min, preco_centavos)
select v.nome, c.id, v.duracao, v.preco
from (values
  ('Corte feminino',      'Cortes',      60,  12000),
  ('Corte masculino',     'Cortes',      30,   6000),
  ('Escova',              'Escovas',     45,   7000),
  ('Coloração raiz',      'Coloração',   90,  18000),
  ('Mechas',              'Coloração',  180,  45000),
  ('Hidratação',          'Tratamentos', 45,   9000),
  ('Manicure',            'Unhas',       45,   4000),
  ('Pedicure',            'Unhas',       60,   5000),
  ('Esmaltação em gel',   'Unhas',       60,   8000)
) as v(nome, categoria, duracao, preco)
join public.categorias c on c.nome = v.categoria and c.tipo = 'servico'
where not exists (select 1 from public.servicos s where s.nome = v.nome);

-- Produtos
insert into public.produtos (nome, categoria_id, preco_centavos, estoque, estoque_minimo, comissao_percentual)
select v.nome, c.id, v.preco, v.estoque, v.minimo, 10
from (values
  ('Shampoo reconstrutor 300 ml', 'Cabelo', 8900, 12, 3),
  ('Máscara hidratante 250 g',    'Cabelo', 11900, 2, 3),
  ('Óleo finalizador 60 ml',      'Cabelo', 6900,  8, 2),
  ('Base fortalecedora',          'Unhas',  2900,  5, 2)
) as v(nome, categoria, preco, estoque, minimo)
join public.categorias c on c.nome = v.categoria and c.tipo = 'produto'
where not exists (select 1 from public.produtos p where p.nome = v.nome);

-- Pacotes
insert into public.pacotes (nome, validade_dias, preco_centavos)
select v.nome, v.validade, v.preco
from (values
  ('Pacote 4 escovas',       60, 24000),
  ('Mãos e pés — 4 sessões', 60, 30000)
) as v(nome, validade, preco)
where not exists (select 1 from public.pacotes p where p.nome = v.nome);

insert into public.pacote_servicos (pacote_id, servico_id, quantidade)
select p.id, s.id, v.qtd
from (values
  ('Pacote 4 escovas',       'Escova',   4),
  ('Mãos e pés — 4 sessões', 'Manicure', 4),
  ('Mãos e pés — 4 sessões', 'Pedicure', 4)
) as v(pacote, servico, qtd)
join public.pacotes p on p.nome = v.pacote
join public.servicos s on s.nome = v.servico
on conflict do nothing;
