-- =====================================================================
-- Espaço Persona — Fase 7 (Configurações)
-- Modelos de mensagem de WhatsApp, dias de pagamento configuráveis
-- e auditoria das alterações de configuração.
-- =====================================================================

alter table public.configuracoes
  add column msg_confirmacao text not null default
    'Olá, {cliente}! Aqui é do Espaço Persona. Confirmando seu horário {data} às {hora} com {profissional}. Podemos confirmar?',
  add column msg_aniversario text not null default
    'Feliz aniversário, {cliente}! 🎉 Toda a equipe do Espaço Persona deseja um dia lindo para você. Esperamos você para comemorar!';

-- Dois dias de pagamento no mês, em ordem (1 a 28)
alter table public.configuracoes add constraint configuracoes_dias_pagamento check (
  array_length(dias_pagamento, 1) = 2
  and dias_pagamento[1] between 1 and 28
  and dias_pagamento[2] between 1 and 28
  and dias_pagamento[1] < dias_pagamento[2]
);

-- Auditoria (taxas, caixinha, dias e mensagens)
alter table public.configuracoes add column id_texto text generated always as ('configuracoes') stored;
create function public.auditar_configuracoes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.log_auditoria (usuario_id, tabela, registro_id, acao, antes, depois)
  values (auth.uid(), 'configuracoes', 'configuracoes', tg_op, to_jsonb(old), to_jsonb(new));
  return null;
end;
$$;
create trigger configuracoes_auditoria
  after update on public.configuracoes
  for each row execute function public.auditar_configuracoes();

-- O que a equipe precisa ler (sem expor taxas): dias de pagamento e mensagens
create function public.config_equipe()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.eh_equipe() then jsonb_build_object(
    'dias_pagamento', c.dias_pagamento,
    'msg_confirmacao', c.msg_confirmacao,
    'msg_aniversario', c.msg_aniversario
  ) end
  from public.configuracoes c limit 1
$$;
revoke execute on function public.config_equipe() from public, anon;
grant execute on function public.config_equipe() to authenticated;
