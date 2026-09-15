# Fechamento das pendências — 15/09/2026

## Bloqueadores descobertos e corrigidos

GET real de `/briefing` confirmou que o formulário publicado enviava o UUID
somente em `bruto.pedido`, enquanto `/api/submit` exige `body.pedido`. O
formulário agora usa uma função única para validar o UUID e envia o mesmo
valor no topo e no bruto. A API continua autorizando pelo claim n8n; UUID
válido não substitui pagamento.

Teste com o payload extraído do HTML real e handler real comprovou passagem
pela API sem rede externa. Teste em Chromium preencheu todos os campos,
aceites e enviou pelo callback real, com submit mockado; comprovou UUID no
topo, tela de conclusão e evento após sucesso. Não é pagamento real E2E.

O gate sem pedido removia `hidden`, mas `.intro { display: none }` ainda
escondia a mensagem. Corrigido com `#semPedido:not([hidden])`. Chromium
consultando produção confirmou gate visível, formulário oculto e nenhum
overflow/erro de JS em 320, 390 e 1440 px. Analytics foi interceptado nos
testes para não contaminar os contadores reais.

Texto dinâmico do formulário ainda dizia “liberar seu teste” e orientava
desativar respostas “durante o teste”. Atualizado para identificação da
clínica e período em que Recepta atende. Não foi acrescentada promessa de
emissão de nota fiscal não verificada.

## Sete eventos de analytics

`src/analytics.js` centraliza payloads, filtra eventos/tier/ciclo por enums,
omite cookies no fetch e usa keepalive. Nunca envia identificadores ou
valores livres do formulário. Falha de rede não bloqueia o atendimento.

- `ciclo_alterado`: somente alteração real, não inicialização/clique repetido.
- `checkout_iniciado`: sessão obtida com sucesso, tier/ciclo da requisição.
- `checkout_abandonado`: retorno cancelado do Stripe.
- `briefing_iniciado`: primeira edição do formulário com UUID válido.
- `briefing_enviado`: resposta de envio bem-sucedida.
- `whatsapp_conectado`: conexão observada no polling da conexão/painel.
- `reembolso_solicitado`: resposta bem-sucedida com registro novo.

Preservados os três contadores legados. Snapshot do ciclo impede que mudança
do seletor durante a requisição altere dimensão ou escolha salva da sessão.
Política de Privacidade já descreve contagens anônimas e sem cookies.

Testes passaram: `test-submit-pedido.mjs`, `test-funnel-frontend.mjs`,
`test-analytics-privacy.mjs`, `test-stripe-portal.mjs` e `npm test`. Integrações
financeiras foram simuladas nos testes. Emissores publicados não provam os
contadores: Upstash continua sem env no agente, e baseline real **não confirmei**.
Dias de baseline anteriores à mudança comercial não podem ser recriados.

## Publicação e prova real

Health antes/depois da primeira publicação: 13/13. Deploy da raiz
`dpl_3pdkKB77dz75kLqcdeEW2gGxDrHb`,
`briefing-recepta-8mmfanyb2-site-magic.vercel.app`, três aliases movidos
individualmente. `scripts/verify-pending-production.mjs` conferiu os três
domínios: home, briefing, analytics, painel JS e sitemap HTTP 200 e iguais
à origem; submit inválido 400. Prova em `tmp-pendencias/production-proof.json`.

Doze superfícies comerciais consultadas por GET real: sem promessa antiga
pesquisada e sem CTA direto ao briefing sem pedido. JSON-LD: quatro Offers,
anuais 4164/8364 e quatro políticas de sete dias. Verificação considera HTML
e schema; o bug dos textos dinâmicos foi corrigido separadamente.

Publicação final dos textos dinâmicos:
`dpl_DH88ombADoLFsze6eSSDrWd5keSk`,
`briefing-recepta-eywlx0avm-site-magic.vercel.app`. Provas finais e aliases são
registrados após finalizar o deploy, sem inferir atualização por “Ready”.

## Pendências revalidadas

API Stripe: uma configuração Portal ativa/live, cancelamento habilitado
`at_period_end`, faturas habilitadas. Cancelamento real e webhook **não confirmei**.
Consulta de 14 sessões dos pedidos `qa_go_live`: todas encerradas; nenhuma
exigiu expire, nenhum pagamento ou DELETE foi feito.

MCP AgentsRoom confirma trigger habilitado às 09:15/18:00, catchUp,
runCount zero. Está configurado; primeira execução autônoma ainda não confirmada.

API UazAPI e query Supabase confirmam duas instâncias, alertas conectada e
`zapscout_59a506f0` desconectada sem clínica com seu token. Exclusão aguarda
confirmação explícita exigida pelo AGENTS.md. Compra real, pareamento,
cancelamento e estorno reais dependem do dono/cartão e vaga; não executados.

Rich Results Google foi tentado em Chromium no serviço oficial; retornou
“Something went wrong / Log in and try again”. Resultado dos Offers no
validador Google **não confirmei**. Não substituir esse aceite por parse JSON.

Revisão jurídica, reintegração da fila no Atendimento e remoção de legados
continuam exigindo escopo/aceite próprio; não foram declaradas concluídas.

## Fechamento final confirmado

Deployment final pronto e três aliases movidos individualmente para
`briefing-recepta-eywlx0avm-site-magic.vercel.app`. Probes de 22:09:35 UTC
confirmaram cinco arquivos iguais à origem nos três domínios, gate visível
em três larguras, doze superfícies sem promessa antiga pesquisada e Portal
ativo. Health pós-deploy: 13/13 OK.

Repetição inicial do probe POST atingiu o rate limit legítimo do submit
(429); não foi contornado. Nova rodada usou `--skip-submit` para conferir
arquivos/navegador sem consumir a quota pública. O handler da API não mudou
entre os dois deploys; prova 400 está na primeira rodada e no teste local.

Commit de implementação `8967571`, push em `codex/pos-e2e-corrections`
confirmado por `git ls-remote`. Incluiu também os commits locais anteriores
da branch. Não houve merge no master ou alteração das configs locais dos
agentes. Cérebro do Obsidian recebe este fechamento e link da semana.
