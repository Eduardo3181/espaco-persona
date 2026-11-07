# Espaço Persona — Sistema de gestão do salão

Este arquivo é o guia do projeto. Leia-o inteiro no início de cada sessão e siga as decisões abaixo. Em caso de dúvida sobre uma regra de negócio, **pergunte antes de inventar**.

## 1. Visão geral

Sistema web de gestão para o salão **Espaço Persona – Hair and Beauty** (São Paulo, Brasil), usado no computador da recepção e no celular das profissionais (PWA instalável). Uso interno: **não há agendamento pelas clientes**.

Equipe atual:
- **Eduardo Persan**: dono, cabeleireiro, acesso total, não recebe comissão
- **Valdete Costa**: cabeleireira e **sócia/dona** — acesso total (perfil dono), **não recebe comissão** (desde 06/11/2026; faz a retirada como pró-labore)
- **Di**: manicure, acesso de profissional

Toda a interface é em **português do Brasil**. Valores em reais (R$ 1.234,56), datas em dd/mm/aaaa, fuso America/Sao_Paulo.

## 2. Tecnologia

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Supabase**: Postgres, Auth (login por e-mail e senha) e Storage (logo)
- **PWA**: manifest + service worker; instalável no celular, com o logo como ícone
- Hospedagem: **Vercel**
- Valores monetários guardados em **centavos (integer)**, nunca em float
- Percentuais guardados como numeric (ex.: 40.00)

## 3. Perfis e permissões (OBRIGATÓRIO no banco, com RLS)

As permissões devem ser garantidas por **Row Level Security no Supabase**, não apenas escondendo menus.

| Perfil | Pode |
|---|---|
| **dono** | Tudo: agenda de todos, comandas, clientes (com valores), serviços/produtos/pacotes, comissões, vales, despesas, relatórios, configurações e usuários |
| **profissional** | Ver a **própria** agenda; ver clientes (ficha técnica, anotações e histórico de serviços **sem valores, sem total gasto e sem saldo**); escrever anotações; ver **as próprias** comissões, caixinhas e vales. Não vê financeiro, despesas, relatórios, comissões de outras pessoas nem configurações |

Os valores do histórico de clientes devem vir de uma *view* ou função que não exponha preços ao perfil profissional. Não basta esconder no front-end.

## 4. Módulos e telas

Layout: **menu lateral escuro** com o logo no topo. No celular, o menu vira barra empilhada. Topo com título da página e usuário logado.

### 4.1 Agenda
- Uma coluna por profissional, horários de 30 em 30 min (08:00 às 20:00), mini calendário para trocar o dia
- Um agendamento pode ter **vários serviços** (ex.: "Corte feminino, Escova")
- Status com cores: agendado/confirmado, aguardando confirmação, em atendimento (comanda aberta), concluído, horário bloqueado (almoço, ausência)
- A mesma profissional pode ter **mais de uma cliente no mesmo horário** (07/11/2026): os cartões ficam lado a lado. Não pode agendar em cima de horário bloqueado nem bloquear em cima de agendamento
- **Bloquear horário** e **novo agendamento** (cliente, profissional, serviços, data, hora; duração somada dos serviços)
- Clicar num atendimento abre ou cria a comanda

### 4.2 Comandas
- Abertas a partir de um agendamento ou avulsas; lista de comandas abertas ao lado
- Itens dos tipos **Serviço, Produto e Pacote**, cada um com profissional, quantidade e valor. É possível remover itens enquanto a comanda está aberta
- ~~Quadro "Ficha da cliente" no topo~~ — retirado a pedido do dono (19/10/2026): a comanda foca em serviços e valores; ficha e anotações ficam no cadastro da cliente
- **Caixinha** (ver regra 5.3): um campo por profissional presente na comanda, com botões rápidos +R$ 10 e +R$ 20
- **Pagamento dividido**: várias formas (Pix, crédito, débito, dinheiro); a última linha recebe automaticamente o valor restante
- Resumo: itens, caixinhas, taxa da maquininha e **total a receber** (comissões não aparecem na comanda; ficam na tela de Comissões)
- Botões: **Cancelar comanda**, **Manter aberta**, **Fechar comanda**
- Comanda fechada **só pode ser reaberta ou editada pelo dono**, com registro em log (quem, quando, o quê)

### 4.3 Clientes (muito importante)
- Lista com busca por nome ou telefone
- **Ficha da cliente** com:
  - Cabeçalho: nome, telefone, aniversário, cliente desde
  - Resumo: última visita, nº de visitas, frequência média ("a cada N semanas") e serviço mais feito. Para o dono, também total gasto e saldo na casa
  - **Ficha técnica** (campos editáveis): cor/fórmula da coloração, tipo de cabelo, alergias e cuidados, preferências
  - **Anotações**: campo livre; cada anotação salva com data, hora e autor; lista da mais recente para a mais antiga
  - **Histórico de atendimentos**: agrupado por mês, com data, dia da semana, serviços e quem fez cada um, e anotação daquela visita. Para o dono, também valor e forma de pagamento. Filtro por profissional. Comanda aberta aparece marcada
- **Saldo na casa**: crédito ou débito da cliente

### 4.4 Serviços e produtos
- Abas: **Serviços** (nome, categoria, duração, valor a partir de), **Produtos** (nome, categoria, preço, estoque com alerta de estoque baixo, comissão de venda) e **Pacotes** (nome, serviços incluídos e quantidade, validade, preço)
- Categorias cadastráveis
- Venda de produto na comanda baixa o estoque

### 4.5 Comissões
- Abas: **A pagar** e **Pagas** (o salão **não usa vales** — decisão do dono em 16/10/2026)
- A pagar, por profissional e período: comissões + caixinhas − vales = total a receber. Botão "Registrar pagamento"
- Pagas: histórico de pagamentos realizados
- Visão da profissional: cartões com comissões, caixinhas, vales e "você recebe em dd/mm", mais um extrato do período

### 4.6 Despesas
- Despesas e contas a pagar ficam na aba **Gestão** (seção 4.9), desde 06/11/2026; a decisão anterior de não controlar despesas foi revista pelo dono

### 4.7 Relatórios (só dono)
- Período: dia, semana, mês ou personalizado
- **Visão geral**: vendas, comissões, taxas e resultado (vendas − comissões − taxas, antes das despesas, que ficam na aba Gestão); "para onde vai o dinheiro"
- **Vendas**: faturamento por dia (gráfico de barras), por item (serviços/produtos/pacotes), por forma de pagamento e por profissional
- Caixinhas **não** entram no faturamento
- **Agendado a entrar** (06/11/2026), ao lado de Vendas: soma o preço atual dos serviços dos horários que ainda não viraram comanda (aguardando ou confirmado), de hoje em diante, no período escolhido e em hoje, esta semana e este mês. Não entra em Vendas nem no resultado e não prevê o desconto do Pix

### 4.8 Configurações (só dono)
- Usuários e acessos (convidar, definir perfil, desativar)
- Regras de comissão (ver 5.1)
- Caixinha: opção "descontar a taxa da maquininha da caixinha paga no cartão" (padrão: desligado)
- Dias de pagamento de comissões (padrão: dias 1 e 16)
- Taxas da maquininha por forma de pagamento (padrão: débito 1,99%, crédito 3,49%, Pix 0%)
- Modelos de mensagem de WhatsApp: confirmação de agendamento e aniversário, com variáveis {cliente}, {data}, {hora}, {profissional}. Na fase 1, gerar link `wa.me` com o texto pronto; envio automático fica para depois

### 4.9 Gestão (só dono)
- Abas: **Painel**, **Lançamentos**, **Fluxo de caixa** (visão geral e por categoria), **Análise** (dois períodos), **Metas** e **Plano de contas** (contas, data de início e categorias)
- Vendas, taxas e comissões vêm sozinhas das comandas e dos pagamentos; o resto é lançado à mão, com opção de repetir todo mês

## 5. Regras de negócio

### 5.1 Comissão
- Regra em três níveis; vale sempre a **mais específica**: exceção por serviço → por categoria → padrão da profissional
- Produtos: comissão de venda própria (padrão 10%)
- Comissão calculada sobre o **valor cheio do item** (sem descontar taxa da maquininha). Confirmado pelo dono; o único desconto é o automático do Pix (seção 5.4), que não reduz a comissão (o valor do item também pode ser ajustado à mão)
- Ao fechar a comanda, **gravar o percentual usado em cada item**, para que mudanças futuras de regra não alterem o histórico
- Valores iniciais: em branco — o dono preenche pelo sistema. Eduardo não recebe comissão

### 5.2 Pagamento de comissões
- Períodos fixos (07/11/2026): dia 1 a 15 e dia 16 ao fim do mês, ou **Personalizar** com datas escolhidas à mão. O pagamento é sugerido no próximo dia de pagamento depois do fim do período (dias em Configurações) e pode ser mudado ao registrar
- Total = comissões + caixinhas do período. O pagamento dá baixa em tudo do período escolhido

### 5.3 Caixinha
- Informada no fechamento da comanda, **por profissional**
- Vai **100% para a profissional**: não gera comissão e não entra no faturamento do salão
- Entra no total pago pela cliente e é registrada como **repasse** para a profissional
- É somada ao próximo pagamento de comissões

### 5.4 Financeiro
- Faturamento = itens das comandas fechadas (sem caixinhas)
- Taxa da maquininha calculada por forma de pagamento e registrada na comanda
- **Desconto do Pix (06/11/2026)**: automático ao fechar a comanda, padrão 3% (Configurações). Vale só sobre a parte paga em Pix, sem a caixinha; pagamento dividido usa a fatia proporcional dos itens. O salão assume o desconto: comissão sobre o valor cheio; faturamento e total recebido já sem o desconto. Reabrir devolve o valor cheio, e a comanda recalcula ao fechar de novo
- Em Relatórios: resultado = faturamento − comissões − taxas. Em Gestão: desconta também as despesas lançadas

## 6. Identidade visual

- Logo: arquivo `public/logo-persona.png` (rosé sobre fundo transparente; usar sobre fundo escuro)
- Cores:
  - Fundo `#F7F4F2`, cartões `#FFFFFF`, bordas `#E6DFDA`
  - Escuro/menu `#1C1B1F`, rosé (destaque) `#96604A`, rosé claro `#C8957B`, texto sobre escuro `#F0D3C2`
  - Status na agenda (cores suaves e bem diferentes, pedido do dono em 06/11/2026; fundo / faixa lateral, texto escuro): aguardando confirmação amarelo `#FFF0A8`/`#D4B100`, confirmado roxo `#E8D6F5`/`#A020A8`, em atendimento azul `#CFE3FA`/`#0B72D9`, concluído verde `#D3EFD9`/`#1E8038`, horário bloqueado marrom `#E3D2C3`/`#6B4226`
  - Sucesso `#2F6B3A`, erro `#9B2C2C`
- Fontes (Google Fonts): títulos **Cormorant Garamond** 700; texto **Plus Jakarta Sans**
- Botões e áreas de toque com no mínimo 44px; contraste acessível; tudo funcionando bem no celular

## 7. Segurança e LGPD

- RLS em **todas** as tabelas; testar que a profissional não acessa dados proibidos
- Nunca expor a chave `service_role` no front-end; segredos apenas em variáveis de ambiente
- Dados de clientes são pessoais: coletar só o necessário e permitir excluir a cliente a pedido dela
- Log de auditoria para edição ou reabertura de comandas e alteração de regras de comissão
- Não guardar dados de cartão

## 8. Ordem de construção (uma fase por vez; mostrar o resultado e esperar aprovação)

1. **Base**: projeto Next.js + Supabase, login, perfis, layout com menu lateral e identidade visual, cadastro de profissionais, categorias, serviços, produtos, pacotes e regras de comissão
2. **Clientes**: cadastro, ficha técnica, anotações e saldo
3. **Agenda**: colunas por profissional, agendamentos com vários serviços, bloqueios e status
4. **Comandas**: itens, ficha da cliente, caixinha, pagamento dividido, fechamento com comissões e repasses, estoque e histórico da cliente
5. **Comissões e vales**: a pagar, pagas e vales; visão da profissional
6. **Relatórios** (sem despesas)
7. **Configurações e PWA**: taxas, mensagens de WhatsApp, instalação no celular
8. **Publicação**: Vercel + Supabase de produção, com um roteiro de testes

## 9. Como trabalhar

- Antes de cada fase, mostre o plano e as tabelas envolvidas; só depois escreva código
- Escreva migrações SQL versionadas para o Supabase (tabelas, RLS, views, funções)
- Crie dados de exemplo (seed) com nomes fictícios para testar
- Use Git e faça um commit ao final de cada etapa
- Explique em linguagem simples o que foi feito e como testar: o dono não é programador
- Ao encontrar uma regra não definida neste arquivo, pergunte

## 10. Decisões já tomadas com o dono

- **Projeto**: fica em `C:Projetosespaco-persona` (fora do OneDrive). Supabase do projeto `hxhobtnstgtvvlszujab` (região São Paulo); migrações aplicadas com `npx supabase db push` (sem `--include-seed` desde a importação de dados reais)
- **Next.js 16** sem Cache Components; "middleware" agora se chama `proxy.ts`
- **Catálogo**: profissionais **veem os preços** dos serviços e produtos. Pacotes ficam cadastrados, mas **não são usados nas comandas**
- **Clientes**: dono e profissionais cadastram e editam ficha técnica; anotação: a autora corrige a sua, autora ou dono apagam; aniversário com dia/mês e ano opcional; "cliente desde" opcional
- **Importação**: 159 serviços e 524 clientes vieram do **Salão Soft** (sem telefones). Planilhas ficam em `/importacao` (fora do Git, LGPD)
- **Agenda**: salão abre **todos os dias, 08:00–20:00**; profissionais criam/alteram só a própria agenda; status "Cancelou" e "Faltou" ficam no histórico; bloqueios podem repetir (diário/semanal)
- **Comandas**: profissionais abrem a comanda e lançam itens **em nome próprio, sem ver valores**; só o dono altera valores, recebe, fecha, reabre e cancela. Formas: Pix, crédito, débito, dinheiro e "saldo na casa" (usa crédito ou deixa a cliente devendo). Taxa de crédito única
- **Despesas (revisto em 06/11/2026)**: ficam na aba Gestão; Relatórios continua mostrando vendas, comissões, taxas e o que sobra para o salão
- **LGPD**: excluir cliente apaga cadastro, ficha, anotações, saldo e agendamentos; comandas fechadas ficam no financeiro sem o nome
- **Testes de segurança** em `supabase/tests/*.sql` (rodam e desfazem tudo): `npx supabase db query --linked -f supabase/tests/<arquivo>.sql`
- **Configurações**: acesso de profissionais continua pelo e-mail em Equipe + criar o login no painel do Supabase (sem chave secreta no sistema). Dias de pagamento são **dois dias do mês configuráveis** (padrão 1 e 16) e definem só a data sugerida; os períodos são fixos, ver 5.2
- **PWA**: ícone do app usa só o **símbolo** do logo sobre fundo escuro; o service worker não guarda dados (só a página offline). Instalação no celular só funciona depois de publicado (https)
- **Equipe (18/10/2026)**: Valdete passou a ter perfil **dono** (comissão zerada em 06/11/2026: retira como pró-labore; os R$ 530,50 pendentes também foram zerados, com registro no log de auditoria); Di é profissional. Ordem na agenda: Eduardo, Valdete, Di (campo "Posição na agenda" em Equipe). Os testes de segurança usam a **Di** como profissional (login real, só em simulação)
- **Atendimento com várias profissionais (19/10/2026)**: no novo agendamento o dono pode adicionar outras profissionais, cada uma com hora e serviços próprios; os horários ficam ligados (grupo_atendimento) e geram **uma comanda só**; fechar/reabrir/cancelar atualiza todos os horários ligados
- **Comanda enxuta (19/10/2026)**: sem quadro de ficha da cliente, sem "anotação desta visita" e sem comissões (nem no fechamento nem na comanda fechada). Mantido só o aviso de serviço sem regra de comissão
- **Agendamento recorrente (03/11/2026)**: no novo agendamento, recorrência toda semana, a cada 15 dias ou todo mês (mesmo dia do mês; sem o dia, usa o último), com "Repetir até" (padrão 3 meses, máximo 1 ano). Cada data é um agendamento normal, ligado por `grupo_repeticao`; datas com horário bloqueado ficam de fora e são avisadas. Ao alterar, cancelar ou excluir, pergunta "só este" ou "todos"; "todos" só atinge horários não atendidos e ainda por vir (cliente faltou vale só para o dia)
- **Reajuste, busca e janela da comanda (04/11/2026)**: reajuste em massa dos serviços ativos com prévia (todos ou uma categoria, arredondando para cima até o real); lista de serviços com busca e filtro por categoria; na comanda, "+ Serviço" e "+ Produto" abrem a janela de seleção com busca, profissional, quantidade e preço atual
- **Crédito parcelado (04/11/2026)**: ao escolher crédito na comanda, escolhe-se de 1x a 4x; cada opção tem taxa própria em Configurações (em branco = não aparece). A taxa fica por conta do salão (cliente paga o mesmo total), comissão não muda, e parcelas e taxa usada ficam gravadas no pagamento
- **Dia do atendimento (04/11/2026)**: faturamento, comissões, caixinhas e histórico da cliente usam `comandas.data_atendimento`, não o dia do fechamento. Com agendamento: o dia da agenda (nunca no futuro). Avulsa: campo "Data do atendimento" ao fechar (padrão hoje, sem data futura). Comissão de período já pago fica pendente naquele período e aparece no aviso de "A pagar"
- **Comanda única por cliente no dia (04/11/2026)**: ao abrir a comanda de um horário, entram nela os outros horários da mesma cliente no mesmo dia ainda não atendidos, mesmo agendados separadamente; com comanda aberta da cliente no dia, o horário entra nela. Serviço igual já lançado à mão não duplica. Depois de fechada, um novo horário abre outra comanda
- **Cobrança junta (05/11/2026)**: comandas abertas do mesmo cadastro de cliente no mesmo dia viram uma só (fica a mais antiga; as outras ficam canceladas com motivo "Juntada à comanda #N"). A junção roda ao abrir a comanda e ao fechar, e traz também os horários do dia ainda não atendidos. Comandas de dias diferentes continuam separadas, com aviso. Clientes com o mesmo nome em cadastros diferentes não se misturam
- **Foto da equipe (05/11/2026)**: foto opcional em Equipe, recortada no navegador em quadrado (320 px) e mostrada em círculo na agenda, com a borda na cor da profissional. Fica em espaço privado do Storage (`fotos-profissionais`), com links temporários; só o dono envia ou remove
- **Gestão financeira (06/11/2026)**: inspirada numa planilha mostrada em vídeo pelo dono, feita do zero com a identidade do salão. Tabelas `fin_*`, só dono; funções `gestao_automaticos` e `gestao_posicao`. **Lucro**: vendas, taxas e comissões pelo dia do atendimento; lançamentos pelo vencimento (contas futuras só entram no Painel quando vencem). **Dinheiro disponível**: total de todas as contas, a partir de `configuracoes.fin_data_inicio`; cartão conta como recebido no dia do atendimento; saldo na casa usado não é dinheiro novo, crédito manual positivo no saldo da cliente conta como dinheiro que entrou; caixinha entra no caixa e sai ao registrar o pagamento da profissional. Orçamento = meta de vendas − lucro esperado. **Visão e Realidade**: cada lançamento tem o valor previsto (Visão) e o real (Realidade); preenchida, a Realidade é a que vale nas contas. Início do controle: 01/11/2026; despesas de novembro e dezembro de 2026 vieram da planilha Despesas_Empresa do dono (script em `/importacao`, fora do Git). A Comissão Di da planilha foi apagada a pedido do dono: comissões vêm só do cálculo automático das comandas, sem lançamento à mão. Teste: `supabase/tests/gestao.sql`
- **Horário concluído (06/11/2026)**: na tela do horário, o dono vê os itens da comanda com o valor de cada um e o total da comanda (itens − desconto do Pix + caixinha). Profissional continua vendo só os serviços, sem valores
- **Retorno da cliente (07/11/2026)**: na ficha, o dono escolhe o serviço e o retorno em semanas, meses ou data personalizada, contando de hoje. No dia, o Início mostra o alerta com o nome e o serviço, botão de WhatsApp (mensagem em Configurações, com {cliente} e {servico}) e "Avisei"; o alerta fica até ser marcado. Tabela `retornos_clientes`, só dono; excluir a cliente apaga os retornos. Teste: `supabase/tests/retornos.sql`
- **Contas recorrentes e parceladas (07/11/2026)**: no lançamento, botões Conta única, Recorrente e Parcelada. Recorrente repete todo mês sem fim e fica sempre lançada 12 meses à frente (`gestao_estender_recorrentes`, roda ao abrir a Gestão); a mesma conta (categoria e descrição) já lançada num mês é ligada à recorrência em vez de duplicar. Parcelada: a Visão é o valor de cada parcela, e dá para começar de uma parcela já em andamento. Excluir: só este mês ou este e os próximos em aberto (encerra a recorrência). Editar pode aplicar aos próximos em aberto. Teste: `supabase/tests/gestao_recorrentes.sql`
- **Categorias bloqueadas (07/11/2026)**: em Equipe, cada profissional tem "Não pode lançar" por categoria de serviço e produto. As categorias somem da agenda e da comanda dela, e o banco recusa o lançamento, inclusive quando o dono lança em nome dela; o que já estava lançado não muda. Di: bloqueadas Coloração e reflexo, Cortes, Escova e finalização, Mega hair, Penteados, Tratamentos e Produtos para cabelo. Teste: `supabase/tests/categorias_bloqueadas.sql`
