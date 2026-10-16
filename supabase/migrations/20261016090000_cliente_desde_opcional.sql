-- Clientes importadas do Salão Soft não têm data de cadastro conhecida.
-- "Cliente desde" passa a ser opcional (novas clientes continuam com a data de hoje).
alter table public.clientes alter column cliente_desde drop not null;
