-- Produtos de uso: novo tipo "tonalizante" (pedido do dono em 12/11/2026).
alter table public.produtos_uso drop constraint produtos_uso_tipo_check;
alter table public.produtos_uso add constraint produtos_uso_tipo_check
  check (tipo in ('coloracao', 'tonalizante', 'oxidante', 'descolorante', 'matizador', 'tratamento', 'outro'));
