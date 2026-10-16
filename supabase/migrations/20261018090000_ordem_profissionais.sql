-- Posição de cada profissional na agenda e nas listas (pedido do dono).
alter table public.profissionais add column ordem smallint not null default 99 check (ordem between 1 and 99);

update public.profissionais set ordem = 1 where nome = 'Eduardo Persan';
update public.profissionais set ordem = 2 where nome = 'Valdete Costa';
update public.profissionais set ordem = 3 where nome = 'Di';
