-- =====================================================================
-- Foto da profissional (opcional), mostrada em círculo na agenda.
-- As fotos ficam em um espaço privado: só a equipe logada consegue ver,
-- por links temporários, e só o dono envia, troca ou remove.
-- =====================================================================

alter table public.profissionais add column foto_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-profissionais', 'fotos-profissionais', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "equipe vê fotos da equipe" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-profissionais' and public.eh_equipe());
create policy "dono envia fotos da equipe" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-profissionais' and public.eh_dono());
create policy "dono troca fotos da equipe" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos-profissionais' and public.eh_dono())
  with check (bucket_id = 'fotos-profissionais' and public.eh_dono());
create policy "dono remove fotos da equipe" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-profissionais' and public.eh_dono());
