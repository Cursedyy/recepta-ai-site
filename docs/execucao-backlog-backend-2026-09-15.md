# Execução do backlog de backend — 2026-09-15

## Customer Portal

GET live `billing_portal/configurations?active=true` confirmou lista vazia antes
da correção. Configuração criada: `bpc_1UG1B1HkvKNdqMufLwPjfy46`, ativa/live,
histórico de faturas e atualização de cartão habilitados, cancelamento no fim
do período pago, sem prorrata; troca de plano desabilitada. Cancela renovação,
preservando acesso até o fim do período; reembolso integral continua separado.
Referência: https://docs.stripe.com/api/customer_portal/configurations/create.

API publicada no deployment `dpl_9nxoC5qYJRJ1PrhzHd1693aHhdXj`, URL
`briefing-recepta-bi3qpz7a5-site-magic.vercel.app`, pela raiz após health 13/13.
Três aliases movidos individualmente. Nos três domínios: briefing HTTP 200,
marker exatamente 1, HTML igual ao arquivo local; submit sem pedido HTTP 400
pedido_invalido; API painel-acoes sem sessão HTTP 401, sem erro de import/runtime.
Health depois 13/13. Prova tmp-qa-f7/deploy-proof.json.
Commits: Portal `29237f1`, F7 `7ef85b6`. Sem push.

`src/api/_lib/stripe-portal.js` seleciona explicitamente a configuração Recepta
ou uma default ativa/live antes de criar a sessão. Configuração ausente ou
erro permanente gera `503 portal_nao_configurado`, sem mensagem de tentar de
novo. Falha transitória permanece `502 falha_stripe`. Timeouts limitados e
logs sem corpo sensível. Rota do painel reutiliza o helper.

Testes: `scripts/test-stripe-portal.mjs` passou os três cenários de ausência,
seleção explícita e erro permanente. Helper com Stripe live criou sessão real
HTTP 200 em billing.stripe.com e return_url do painel, sem cobrança. Customer
existente usado apenas para criar sessão; nenhuma assinatura cancelada.
Provas locais: `tmp-qa-portal/configurations-before.json`,
`configurations-after.json` e `session-proof.json`.

## F7 completo: disputa, observador e reconciliação

Candidato em `scripts/billing-f7-workflow.mjs` usa a fonte ativa real,
preserva reembolso já publicado e todos os contratos existentes. Código de
nodes vem dos arquivos em `src/n8n-patches/`, sem colagem manual na produção.

Publicado às 2026-09-15T18:44:13Z no workflow `cf1An4BYT9A0LuHi`.
GET confirmou ativo, nodes/conexões iguais ao candidato QA e
`versionId == activeVersionId == b832d415-b957-49c2-ae5c-5cfb679e0280`.
Backup anterior ao PUT:
`tmp-backup-workflows-deletados/cf1An4BYT9A0LuHi-antes-publicar-f7-2026-09-15T18-44-11-550Z.json`.
Script `scripts/publish-billing-f7.mjs` recusa fonte modificada desde o QA e
possui rollback da publicação em caso de falha. Prova tmp-qa-f7/publicacao.json.

Primeira execução real do cron após publicar: **104036**, iniciada
2026-09-15T18:45:19Z, success sem erro. includeData confirmou as quatro novas
consultas, consolidação, busca e preparação das clínicas sem garantia.
Reconciliação real encontrou zero pendências; não houve instância elegível para
iniciar garantia nessa execução. Prova tmp-qa-f7/cron-producao.json. A execução
não confirma pareamento real nem substitui o ensaio de fixtures.

Disputa resolve cobrança/fatura/assinatura/customer/pedido e só congela a
clínica confirmada. Grava `status=expirado` e `disputa_em` condicional, relê,
emite alerta alto ao destino operacional já configurado e fecha auditoria.
Duplicata por event ID não repete efeitos; active posterior não reativa.
Cliente compartilhado não é motivo para expirar outra compra.

Observador independente roda no schedule de 15 minutos existente, consulta
somente instâncias já existentes, não cria ou apaga instâncias. Servidor é
validado por allowlist antes de usar o token da clínica. Instância conectada
materializa garantia com condição `garantia_inicio is null`, sem tocar em
trial. Prazo é calculado em UTC, 23:59:59 BRT do sétimo dia. Outra observação
não reabre a janela. Tokens inválidos/status desconectado não iniciam garantia.

Reconciliação acrescenta leituras: pedido pago há >2h, provisionando há >30min
e garantia vencendo em 48h (ativada usa fim; não ativada usa teto), além dos
eventos Stripe abertos há >15min existentes. Usa o destino operacional e as
credenciais gerenciadas já existentes. Nunca reconcilia movimentando dinheiro.

## Provas QA antes da publicação

Script `scripts/qa-backlog-f7.mjs`, rodada final `tmp-qa-f7/mu30puya/`.
As duas cópias QA têm webhook próprio; assinatura e I/O Stripe/UazAPI/alertas
foram simulados. Supabase, n8n e execução dos nodes de negócio foram reais.
Execuções lidas com `includeData=true`; não se usou somente status success.

| Prova | Execução | Resultado |
|---|---|---|
| Disputa integral | 104014 | 200, clínica expirada, data gravada, alerta capturado sem envio |
| Duplicata | 104016 | 200, sem novo alerta/data |
| Active após disputa | 104017 | 500 pelo guard existente; clínica permaneceu expirada |
| subscription.deleted | 104018 | 200, clínica alvo expirada |
| Observação conectada | 104019 | 200, início/fim gravados, trial nulo; desconectada sem início |
| Dez novas observações | 104020–104029 | 200 e datas byte a byte preservadas |
| Reconciliação | 104030 | 200, encontrou 1 evento, 1 pago, 1 provisionando e 2 garantias |

IDs exatos devem ser conferidos no result.json da rodada; os nomes de execução
são a ligação primária. Cópias `h7XXAJY0cAz6B9MC` e `IFLbzv79K3dXeTjw`
confirmadas inativas; quatro pedidos QA cancelados com qa_backlog_f7 e clínicas
expiradas. Nenhum DELETE. Rodadas anteriores detectaram URL ausente no sandbox,
default de trial herdado pela fixture e resposta vazia do webhook lastNode
quando não havia ação. Código/fixtures corrigidos e harness do cron usa
onReceived: HTTP não serve de prova; execução e banco continuam obrigatórios.

`scripts/qa-refund-corte.mjs`: cópia `VQwxg5nhpkHXCu7P`, execução **104033**,
HTTP 200, ramo real do gate retornou bloqueado e não alcançou ramo de IA.
Queries reais dos lembretes 24h e 3h: com `clinicas.status=ativo`, zero; sem o
guard, um agendamento QA no intervalo. Provas em tmp-qa-f7/corte-proof.json e
corte-execution.json. Cópia inativa; agendamento
`06306d10-9aab-4334-be63-0298ccc5ffb8` cancelado, sem envio externo.

## Reset Trial e pendências preservadas

F0a: API real confirma Onboarding ativo/publicado, sem Reset Trial, sem matches
de secret Stripe/JWT inline no scanner dos parâmetros. POST real da rota
reset-trial respondeu 404. Repo só contém referências históricas em comentários.
Não repeti rotação; revogação histórica da antiga chave não confirmei de forma
independente, mas sua superfície e seus consumidores foram removidos. Env
opcional sem uso não foi removida.

F2: três eventos publicados, não sete. Sem env Upstash no agente não foi
possível ler o contador real. Baseline pré-troca não confirmei e não pode ser
recriado retroativamente. Copy/landing/blog/termos/gate preservados.

F8, verificação read-only: home, termos, privacidade, quatro nichos, blog/três
artigos e briefing responderam 200, sem promessa antiga visível ou links
diretos /briefing sem pedido. Hash home igual ao arquivo local. /t/ sem token
respondeu 404; com token não confirmei. Sitemap servido mantém as 11 lastmod
de 2026-08-25/29. Os Offers anuais no JSON-LD servido ainda declaram 347.00 e
697.00 com billingDuration 12 (o ticket pede totais 4164.00/8364.00), sem
hasMerchantReturnPolicy nos Offers. Google Rich Results Test não confirmei.
Prova tmp-qa-f7/f8-commercial-proof.json. Ticket continua bloqueado pelo Portal
em revisão; nenhuma alteração feita na frente de conteúdo do usuário.

Estados do backlog ao encerrar: F0a concluído; F7 concluído; Customer Portal em
revisão, com implementação publicada e sessão real comprovada, aguardando
cancelamento real assinado; F2 pendente; F8 pendente por dependência e seus
aceites restantes. Não marquei esses aceites não verificados como concluídos.

Cancelamento real pelo Portal e compra/estorno real ponta a ponta não confirmei;
permanecem do dono, com cartão e slot UazAPI. Não foi apagada zapscout_59a506f0,
nem workflow, clínica ou pedido. Push não executado.
