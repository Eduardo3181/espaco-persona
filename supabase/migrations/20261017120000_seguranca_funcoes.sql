-- =====================================================================
-- Revisão de segurança antes da publicação (avisos do Supabase)
-- =====================================================================

-- 1) Funções de gatilho: nunca devem ser chamadas pela API.
--    (Os gatilhos continuam funcionando; a permissão só é exigida ao criá-los.)
revoke execute on function public.registrar_auditoria()           from public, anon, authenticated;
revoke execute on function public.auditar_item_reaberta()         from public, anon, authenticated;
revoke execute on function public.auditar_configuracoes()         from public, anon, authenticated;
revoke execute on function public.garantir_um_dono()              from public, anon, authenticated;
revoke execute on function public.vincular_login_a_profissional() from public, anon, authenticated;
revoke execute on function public.vincular_profissional_a_login() from public, anon, authenticated;
revoke execute on function public.tocar_atualizado_em()           from public, anon, authenticated;
revoke execute on function public.marcar_autor_ficha()            from public, anon, authenticated;
revoke execute on function public.proteger_anotacao()             from public, anon, authenticated;

-- 2) Funções de permissão: só para quem está logado (usadas pelas regras RLS).
revoke execute on function public.eh_dono()             from public, anon;
revoke execute on function public.eh_equipe()           from public, anon;
revoke execute on function public.meu_profissional_id() from public, anon;
grant  execute on function public.eh_dono()             to authenticated;
grant  execute on function public.eh_equipe()           to authenticated;
grant  execute on function public.meu_profissional_id() to authenticated;

-- 3) Demais funções do sistema: nenhuma para visitantes sem login.
revoke execute on function public.comissao_servico(uuid, uuid) from public, anon;
revoke execute on function public.salvar_agendamento(uuid, uuid, uuid, timestamptz, integer, uuid[], text) from public, anon;
revoke execute on function public.texto_busca(text) from anon;
grant  execute on function public.comissao_servico(uuid, uuid) to authenticated;
grant  execute on function public.salvar_agendamento(uuid, uuid, uuid, timestamptz, integer, uuid[], text) to authenticated;

-- Observação: as funções SECURITY DEFINER chamadas pela equipe
-- (abrir_comanda, lancar_item, remover_item, comanda_equipe, comandas_abertas_equipe,
--  historico_cliente, resumo_cliente, extrato_profissional, extrato_pagamento, config_equipe)
-- são intencionais: cada uma confere a permissão por dentro e não devolve valores à profissional.
-- Cobertas pelos testes em supabase/tests/.
