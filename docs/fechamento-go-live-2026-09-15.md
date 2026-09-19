# Fechamento operacional — 2026-09-15

## Publicação e submit

Health pré-deploy: 13/13 OK. Deploy pela raiz:
`dpl_DKqXiQSwPt6ajWBTxDtDn6hnRLe4`,
`briefing-recepta-7gihcff7n-site-magic.vercel.app`.
Aliases movidos individualmente para www.receptaai.com.br,
receptaai.com.br e briefing-recepta.vercel.app.

GET `/briefing` nos três domínios: HTTP 200, exatamente uma ocorrência de
`Escolha seu plano`, SHA-256 igual ao arquivo local. O conteúdo do gate e a
copy de outra frente foram preservados.

`/api/submit` agora rejeita campo top-level `pedido` ausente, null, de tipo
errado ou sem formato UUID com HTTP 400 `pedido_invalido`, antes do webhook.
JSON inválido retorna 400 `payload_invalido`. Campo validado é explicitamente
repassado ao n8n e prevalece sobre `bruto.pedido`. A autoridade de pagamento
permanece no claim n8n. Teste local cobre rejeição sem webhook e caminho feliz.
Prova no domínio: pedido null e lixo retornaram 400 `pedido_invalido`.

O QA 4/4 do checkout, clique real na landing e HARD íntegro foram informados
pelo usuário antes desta publicação; não foram repetidos nesta rodada.
QA dos quatro checkouts após este alias permanece a cargo do usuário.

## Sessões QA

Query real dos pedidos cancelados de hoje com motivo `qa_go_live` encontrou
10 sessões, incluindo testes anteriores já encerrados. GET Stripe e, quando
aberta, POST `/expire` seguido de GET confirmaram 10/10 `expired`.
Não houve pagamento, alteração de pedidos nesta rodada ou DELETE.

## Cópias n8n preservadas para decisão de exclusão

Backups dos dois workflows ativos foram salvos antes da desativação em
`tmp-backup-workflows-deletados/`. Usado POST `/workflows/:id/deactivate`,
a operação de desativação da API n8n. Releitura confirmou ambos inativos.
Nenhum workflow foi deletado. Lista real de cópias QA e utilitários ZZ:

| ID | Nome | Estado |
|---|---|---|
| 40o1KrDfc1dahbtL | ZZ QA Cleanup - Onboarding Teste (temp) | inativo |
| 93KEAimXJJEQDcUw | zz-f4-qa-2026-09-14-16-06 | inativo |
| ECYWoscmdyB9ntJ1 | zz-f4-qa-p4-mu1fsjyh | inativo |
| c1B7b4q53APJTELB | ZZ Revert QA Reteste Onboarding (temp) | inativo |
| yI91lxhyIyAZXumA | zz-f4-reconciliacao-2026-09-14T16-13-04-994Z | inativo |
| pVHtbBhC7U0Zey12 | ZZ QA F6 claim mu1q3rkw | inativo |
| P8IBqd3eQuUADe7f | ZZ Listar Clínicas (temp) | inativo |
| H4cLFKk2Kt3IrVe5 | zz-f4-qa-2026-09-14-15-10 | inativo |
| NrSUi9cVk6qd3uqC | zz-f0b-qa-2026-09-14T16-26-27-804Z | inativo |
| A7R2TzlB09m6jRtA | QA F1 - Auditoria Stripe mu1gx2ho | inativo |
| Stg6aUfruEtDoOB4 | ZZ QA F6 billing mu1q92vv | inativo |
| wcNVB5GtcXmOz5i8 | ZZ QA - Checar Usuario Teste Clinica | inativo |
| icVNHeZm3LJQiFb8 | ZZ Recriar Instância - Clínica Teste (temp) | inativo |
| 4sJgjjtpXrL4iS59 | ZZ Recovery Check - Instancia Teste (temp) | inativo |

Utilit?rios TEMP adicionais: `2KpybsSx1D2LBHye` ([TEMP] Reset Senha Clinica Teste, inativo); `RVhaw7ydO44sgtYf` ([TEMP] Check Perfil Clinica Teste, inativo).

## Analytics — prova ainda bloqueada

Env local não contém UPSTASH_REDIS_REST_URL/TOKEN. API Vercel confirmou
ambas em Production, mas não disponibilizou valores sensíveis; leitura com
decrypt também foi recusada. Não confirmei o contador `an:visit:2026-09-15`,
se está null ou o baseline histórico. Requer credenciais Upstash no ambiente
do agente, sem compartilhá-las no chat.

Revisão encontrou import incorreto em `src/api/an.js`: `../_lib/redis.js`
apontava para `src/_lib/redis.js`, inexistente. Corrigido para
`./_lib/redis.js` e publicado nesta rodada. Isso explica no-op mesmo com envs
presentes, mas não comprova gravação Redis ou recupera baseline perdido.

## Revisão e risco remanescente

Teste local do checkout e teste de pedido no submit passaram. Verificação
de sintaxe passou em 91 arquivos completos. Três recortes históricos do
archive não são programas completos; não foram alterados para compilarem.
Varredura dos candidatos a commit não encontrou padrões de chaves Stripe,
segredos webhook, JWTs ou literais sensíveis. Configurações locais dos agentes,
`.vercel`, tmp e node_modules ficam fora dos commits.

Último risco do go-live: pagamento real → webhook → claim → provisionamento
→ WhatsApp conectado ainda não foi confirmado ponta a ponta. Depende de
cartão real e slot UazAPI; conta 2/2. Nenhuma autorização para liberar
`zapscout_59a506f0`; não executar pagamento real ou liberar instância.

Health após publicação e encerramento: 13/13 OK.

Commits isolados da leva:

| Frente | Commit |
|---|---|
| Checkout, garantia, painel, migrations e pré-checagem submit | 11ed201 |
| Scripts de patch e QA n8n | a1b800c |
| Health e filas | 2a6648f |
| Copy, CTAs, smooth-scroll e gate do briefing | db2510b |
| Archive do trial gratuito | 6f7e534 |
| Correção do import Redis do analytics | 6a690b8 |
| Docs e provas | commit deste registro |

Índice vazio ao fim. Restaram fora dos commits apenas configurações locais
preexistentes: `.claude/settings.local.json`, `.codex/config.toml` e
`.codex/hooks.json`. Nenhuma publicação Git/push foi realizada.
