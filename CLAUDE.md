# Espaço Persona — Sistema de gestão do salão

Este arquivo é o guia do projeto. Leia-o inteiro no início de cada sessão e siga as decisões abaixo. Em caso de dúvida sobre uma regra de negócio, **pergunte antes de inventar**.

## 1. Visão geral

Sistema web de gestão para o salão **Espaço Persona – Hair and Beauty** (São Paulo, Brasil), usado no computador da recepção e no celular das profissionais (PWA instalável). Uso interno: **não há agendamento pelas clientes**.

Equipe atual:
- **Eduardo Persan**: dono, cabeleireiro, acesso total, não recebe comissão
- **Valdete Costa**: cabeleireira, acesso de profissional
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
- Não permitir sobreposição de horários da mesma profissional
- **Bloquear horário** e **novo agendamento** (cliente, profissional, serviços, data, hora; duração somada dos serviços)
- Clicar num atendimento abre ou cria a comanda

### 4.2 Comandas
- Abertas a partir de um agendamento ou avulsas; lista de comandas abertas ao lado
- Itens dos tipos **Serviço, Produto e Pacote**, cada um com profissional, quantidade e valor. É possível remover itens enquanto a comanda está aberta
- Quadro **"Ficha da cliente"** no topo: cor/fórmula, cuidados/alergias, última anotação e última visita
- **Caixinha** (ver regra 5.3): um campo por profissional presente na comanda, com botões rápidos +R$ 10 e +R$ 20
- **Pagamento dividido**: várias formas (Pix, crédito, débito, dinheiro); a última linha recebe automaticamente o valor restante
- Resumo: itens, caixinhas, taxa da maquininha, comissões geradas e **total a receber**
- Botões: **Cancelar comanda**, **Manter aberta**, **Fechar comanda**
- Ao fechar, mostrar para cada profissional: comissão + caixinha = valor a receber no próximo pagamento
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
- Abas: **A pagar**, **Pagas** e **Vales**
- A pagar, por profissional e período: comissões + caixinhas − vales = total a receber. Botão "Registrar pagamento"
- Pagas: histórico de pagamentos realizados
- Vales: adiantamentos (data, profissional, motivo, valor), descontados no próximo pagamento
- Visão da profissional: cartões com comissões, caixinhas, vales e "você recebe em dd/mm", mais um extrato do período

### 4.6 Despesas
- Lançamentos com descrição, categoria, vencimento, valor e situação (paga/em aberto); totais do mês

### 4.7 Relatórios (só dono)
- Período: dia, semana, mês ou personalizado
- **Visão geral**: vendas, despesas, comissões + taxas e resultado do mês; "para onde vai o dinheiro"
- **Vendas**: faturamento por dia (gráfico de barras), por item (serviços/produtos/pacotes), por forma de pagamento e por profissional
- **Despesas**: por categoria
- Caixinhas **não** entram no faturamento

### 4.8 Configurações (só dono)
- Usuários e acessos (convidar, definir perfil, desativar)
- Regras de comissão (ver 5.1)
- Caixinha: opção "descontar a taxa da maquininha da caixinha paga no cartão" (padrão: desligado)
- Dias de pagamento de comissões (padrão: dias 1 e 16)
- Taxas da maquininha por forma de pagamento (padrão: débito 1,99%, crédito 3,49%, Pix 0%)
- Modelos de mensagem de WhatsApp: confirmação de agendamento e aniversário, com variáveis {cliente}, {data}, {hora}, {profissional}. Na fase 1, gerar link `wa.me` com o texto pronto; envio automático fica para depois

## 5. Regras de negócio

### 5.1 Comissão
- Regra em três níveis; vale sempre a **mais específica**: exceção por serviço → por categoria → padrão da profissional
- Produtos: comissão de venda própria (padrão 10%)
- Comissão calculada sobre o **valor cheio do item** (sem descontar desconto nem taxa da maquininha). ⚠️ Confirmar com o dono antes de implementar
- Ao fechar a comanda, **gravar o percentual usado em cada item**, para que mudanças futuras de regra não alterem o histórico
- Valores iniciais (exemplo, confirmar): Valdete 40% padrão e 35% em coloração; Di 50% padrão; Eduardo sem comissão

### 5.2 Pagamento de comissões
- Períodos: dia 1 a 15 (pago no dia 16) e dia 16 ao fim do mês (pago no dia 1)
- Total = comissões + caixinhas − vales do período

### 5.3 Caixinha
- Informada no fechamento da comanda, **por profissional**
- Vai **100% para a profissional**: não gera comissão e não entra no faturamento do salão
- Entra no total pago pela cliente e é registrada como **repasse** para a profissional
- É somada ao próximo pagamento de comissões

### 5.4 Financeiro
- Faturamento = itens das comandas fechadas (sem caixinhas)
- Taxa da maquininha calculada por forma de pagamento e registrada na comanda
- Resultado = faturamento − despesas − comissões − taxas

## 6. Identidade visual

- Logo: arquivo `public/logo-persona.png` (rosé sobre fundo transparente; usar sobre fundo escuro)
- Cores:
  - Fundo `#F7F4F2`, cartões `#FFFFFF`, bordas `#E6DFDA`
  - Escuro/menu `#1C1B1F`, rosé (destaque) `#96604A`, rosé claro `#C8957B`, texto sobre escuro `#F0D3C2`
  - Status agendado `#F3E3DA`/`#96604A`; aguardando `#FFF1D2`/`#A87A1F`; em atendimento `#E7E0EE`/`#6F4F8C`; concluído `#EEEBE8`/`#A39A95`
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
6. **Despesas e relatórios**
7. **Configurações e PWA**: taxas, mensagens de WhatsApp, instalação no celular
8. **Publicação**: Vercel + Supabase de produção, com um roteiro de testes

## 9. Como trabalhar

- Antes de cada fase, mostre o plano e as tabelas envolvidas; só depois escreva código
- Escreva migrações SQL versionadas para o Supabase (tabelas, RLS, views, funções)
- Crie dados de exemplo (seed) com nomes fictícios para testar
- Use Git e faça um commit ao final de cada etapa
- Explique em linguagem simples o que foi feito e como testar: o dono não é programador
- Ao encontrar uma regra não definida neste arquivo, pergunte
