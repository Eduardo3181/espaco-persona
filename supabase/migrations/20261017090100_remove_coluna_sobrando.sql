-- Coluna criada sem uso na migração anterior
alter table public.configuracoes drop column if exists id_texto;
