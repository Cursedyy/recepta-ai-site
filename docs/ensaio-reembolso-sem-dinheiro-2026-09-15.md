# Preparação da primeira compra — prova do reembolso

## Resultado: compra real ainda não preparada

O botão registra a solicitação, mas o workflow publicado ignora o evento de
reembolso. A compra real não foi executada; o fluxo de encerramento financeiro
não está comprovado e precisa ser implementado antes dela.

## Ensaio executado sem dinheiro

Script: `scripts/qa-reembolso-preparacao.mjs`.

- Fonte real n8n: `cf1An4BYT9A0LuHi`, versão ativa
  `d0f4b0b8-99f4-42de-a1df-ca0ad5512e6a`.
- Clínica fixture: `f7788908-39d1-45f0-a979-9d38f34baec2`, nome
  `ZZ QA Reembolso mu2wtukm`; pedido provisionado fixture:
  `6402d8d4-4f8d-4a68-a2b4-31918b04a2da`.
- Chromium executou o renderer e JavaScript reais do painel em origem local
  interceptada, sem servidor público. Clique no botão real e confirmação
  executaram o handler real de `painel-acoes.js` com identidade da fixture
  injetada. Não foi testada a autenticação pública do painel.
- HTTP 200; query Supabase confirmou
  `reembolso_pedido_em=2026-09-15T16:52:35.444+00:00`, mantendo status `ativo`.
  Nenhum erro de JavaScript.
- Cópia QA: `ukxMalriYpyRehJz`, webhook próprio `qa-reembolso-mu2wtukm`.
  A cópia usa o classificador, roteador e gravações de auditoria do workflow
  publicado. Só a validação da assinatura foi substituída por injeção de
  evento QA; crons e raízes não alcançáveis foram removidos da cópia.
- Evento integral simulado: `evt_qa_refund_mu2wtukm`, `charge.refunded`,
  valor original e estornado 49700 centavos, motivo requested_by_customer.
- Execução real n8n `103839`, lida com `?includeData=true`, terminou em success
  no caminho `Classificar Evento → Rotear Evento → Fechar Evento Ignorado →
  Respond 200 Ignorado`; resposta `{received:true,ignored:true}`.
- Query de auditoria: resultado `ignorado`, processado em
  `2026-09-15T16:52:37.113+00:00`.
- Antes do teardown, clínica permaneceu `ativo`, `reembolsado_em` e
  `reembolso_valor` nulos; pedido permaneceu `provisionado`.
- Não existe ramo de cancelamento de assinatura por reembolso no workflow
  consultado. O cancelamento operacional descrito no runbook é manual.
  Não confirmei cancelamento real no Stripe; nenhuma chamada financeira ou
  de cancelamento Stripe foi realizada neste ensaio.

## Teardown confirmado sem DELETE

- Cópia QA desativada e GET confirmou `active=false`; as 14 cópias anteriores
  foram preservadas. Agora existe uma cópia adicional inativa deste ensaio.
- Pedido fixture cancelado, motivo `qa_reembolso_sem_dinheiro`, por releitura.
- Clínica fixture marcada `expirado`, por releitura. Não se criou status
  `reembolsado` em `clinicas`.
- Tentativa anterior criou clínica `8fb6eac5-8594-478d-907f-c1ab09427d79` e
  pedido `ff04a261-7761-4424-9e2c-8ba9469bca0e`; erro de compilação no harness
  foi corrigido. Ambos tiveram teardown confirmado: clínica `expirado`,
  pedido `cancelado/qa_reembolso_sem_dinheiro`.
- Outra tentativa foi recusada por token sintético duplicado e não criou
  clínica; o script passou a usar token inválido único por fixture.
- Health depois: 13/13 OK. Sem compra, cobrança, estorno, cancelamento de
  assinatura real ou operação UazAPI de escrita.
- Evidências completas locais: `tmp-qa-reembolso/provas.json`,
  `tmp-qa-reembolso/execution.json` e `tmp-qa-reembolso/painel.png`.

## Outras preparações

- Quatro novas Checkout Sessions dos pedidos cancelados `qa_go_live` foram
  expiradas; GET confirmou 14/14 sessões de hoje expiradas, incluindo anteriores.
- UazAPI confirmou 2/2, `zapscout_59a506f0` disconnected e `recepta-alertas`
  connected. Backup read-only do status do alvo, com campos sensíveis redigidos:
  `tmp-backup-workflows-deletados/zapscout_59a506f0-status-antes-exclusao-1789491191933.json`.
  Exclusão aguardando “pode apagar” explícito; nenhum DELETE executado.
- Analytics: solicitado ao usuário expor UPSTASH_REDIS_REST_URL e
  UPSTASH_REDIS_REST_TOKEN no ambiente do agente por referências secretas,
  sem valores em chat. Contador e baseline F2 não confirmei.
- Push aguardando confirmação. Origem:
  `https://github.com/Cursedyy/recepta-ai-site.git`, branch
  `codex/pos-e2e-corrections`. Fetch read-only confirmou HEAD local
  `4b92f61af851d0f0e66b72a5b69ab1171e1c371b` e ponta remota
  `9a75dc188b99e5132ab05ed79ddec8fd69a29874`.
  O local tem 32 commits à frente e zero atrás; um push do branch incluiria
  os sete commits da leva e os anteriores ainda não enviados. Não houve push.

## Pendências concretas

1. Implementar e ensaiar em QA o ramo de reembolso integral: identificação
   confiável da compra, idempotência, data/valor/motivo na clínica, acesso
   expirado e pedido reembolsado. O estado `reembolsado` de pedidos deve ser
   confirmado no banco real antes de implementar a escrita.
2. Comprovar o procedimento de cancelamento da assinatura separadamente do
   estorno, sem movimentar dinheiro ou cancelar assinatura de terceiros.
3. Autorizações de exclusão do alvo UazAPI e push; ambiente Upstash.

O workflow de produção e as páginas do produto não foram alterados nesta rodada.
