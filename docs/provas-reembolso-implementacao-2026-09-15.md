# Reembolso: implementação e provas antes da publicação

## Estado

Implementação em `scripts/billing-refund-workflow.mjs` e nos arquivos
`src/n8n-patches/billing-refund-*.js`. Após apresentação das provas e autorização
do usuário, publicada no workflow de produção `cf1An4BYT9A0LuHi` às
2026-09-15T17:05:01Z. GET da API confirmou ativo, nodes e conexões iguais ao
candidato testado e `versionId == activeVersionId ==
0a106cf3-bd67-427f-8061-1eb1f5c253c3`.
Versão anterior: `d0f4b0b8-99f4-42de-a1df-ca0ad5512e6a`.
Script: `scripts/publish-billing-refund.mjs`, com rejeição de fonte alterada
desde o QA e rollback se a publicação ou a conferência falharem.
Backup imediatamente anterior ao PUT:
`tmp-backup-workflows-deletados/cf1An4BYT9A0LuHi-antes-publicacao-reembolso-2026-09-15T17-04-58-930Z.json`.
Prova: `tmp-qa-reembolso/publicacao.json`. Health antes e depois: **13/13**.

Backup anterior à preparação:
`tmp-backup-workflows-deletados/cf1An4BYT9A0LuHi-antes-reembolso-2026-09-15T16-59-15-805Z.json`.
O candidato local está em `tmp-qa-reembolso/candidate.json`.

## Comportamento preparado

`charge.refunded` consulta a cobrança canônica e vincula fatura, assinatura,
cliente e pedido. Suporta fatura direta legada e resolução por Invoice Payments
para Payment Intent. Recusa vínculo ambíguo, cliente divergente, moeda diferente
de BRL ou modo diferente de live antes dos efeitos.

Parcial registra o valor acumulado em reais e preserva acesso e assinatura.
Integral cancela a assinatura identificada com
`DELETE /v1/subscriptions/{id}?invoice_now=false&prorate=false`, confirma
`status=canceled` por GET e só então registra clínica `expirado`,
`reembolsado_em`, valor, motivo e pedido `reembolsado`. Não cria estorno,
fatura final ou crédito de prorrata. O motivo já informado no painel é preservado.

Mantém a auditoria por event ID. Duplicatas encerradas não repetem efeitos;
eventos abertos retomam após falha. Gravações usam filtros condicionais e
releitura para comprovar o estado. Assinatura já cancelada dispensa novo DELETE.
Outro pedido do mesmo customer não é alvo. Clínica ausente ou vinculada a uma
compra posterior não é expirada pelo reembolso da assinatura antiga.

## Ensaio real no n8n, com Stripe simulado

Cópia QA com webhook próprio: `tLVaSaoSGktC7SGA`.
O código de negócio do candidato rodou no n8n real com fixtures Supabase.
Somente assinatura do webhook e I/O Stripe foram substituídos no ensaio.
Nenhuma chamada financeira Stripe real foi feita. Cancelamento real na Stripe
e recebimento de webhook com assinatura real **não confirmei** neste ensaio.

| Cenário | Execução | HTTP | Prova |
|---|---|---|---|
| Parcial | 103851 | 200 | Clínica ativo, valor 100, sem data de integral; pedido provisionado; sem cancelamento |
| Integral | 103852 | 200 | Cancelamento simulado confirmado; clínica expirado, valor 497 e data; pedido reembolsado |
| Mesmo event ID | 103853 | 200 | Branch duplicado, sem cancelamento ou alteração de datas |
| Novo event ID, mesma cobrança | 103854 | 200 | Assinatura já cancelada, sem novo DELETE; datas preservadas |
| Falha de cancelamento | 103855 | 500 | Evento aberto; clínica e pedido preservados |
| Retomada do mesmo evento | 103856 | 200 | Branch de recomposição, cancelamento e fechamento concluídos |
| DELETE incerto, GET confirma cancelada | 103857 | 200 | Estado canônico autoriza concluir |
| Cliente da fatura divergente | 103858 | 500 | Bloqueio antes de cancelamento e gravação de reembolso |
| Evento active posterior ao integral | 103860 | 500 | Guard existente impediu reativação; clínica permaneceu expirado |

O HTTP 500 do último cenário é o comportamento existente do assert de reativação
quando a atualização condicional não encontra clínica elegível; não foi
convertido em sucesso. O evento fixture pendente foi encerrado no teardown.

Execuções foram lidas com `includeData=true`, conferindo nodes e estado real
do banco, além do HTTP. Evidências completas:
`tmp-qa-reembolso/implementacao-mu2x4pkr/result.json`, arquivos individuais das
execuções e `teardown.json`. Script reproduzível: `scripts/qa-billing-refund.mjs`.
O ensaio anterior do botão real do painel e de `reembolso_pedido_em` está em
`docs/ensaio-reembolso-sem-dinheiro-2026-09-15.md` (execução 103839 expôs a ausência
do ramo e motivou esta implementação).

## Encerramento e limites

Cópia QA confirmada inativa. Quatro pedidos fixture confirmados cancelados com
`motivo_encerramento=qa_refund_impl`; clínicas fixture expiradas. Nenhuma linha,
workflow ou instância foi deletada. Health final: **13/13**.

Não foi executada compra real, estorno real, cancelamento real de assinatura,
exclusão de `zapscout_59a506f0` ou push. A conta UazAPI segue 2/2 e
`recepta-alertas` conectada. A compra real ponta a ponta continua pendente.

Os 32 commits anteriores estão listados individualmente em
`docs/proveniencia-32-commits-2026-09-15.md`, distinguindo próprios, mistos,
outras frentes e autoria anterior não confirmada. Nenhum foi reescrito.
