# Trial gratuito de 7 dias — arquivo de restauracao

Arquivado em **2026-09-12**, ao trocar o trial gratuito sem cartao por
**pagamento antecipado com garantia de reembolso de 7 dias**.

Isto aqui **nao e fonte**. Nada importa nada desta pasta. Ela existe por um
motivo so: se a decisao comercial for revertida, a volta e mecanica em vez de
arqueologia.

> **Nao e o estado atual do sistema.** E uma fotografia do commit `4001ac4`.
> Antes de restaurar qualquer coisa, confira contra o sistema real (n8n API,
> Supabase, `curl` no site). A regra de verificacao do `AGENTS.md` continua
> valendo aqui — talvez mais do que em qualquer outro lugar do repo.

## Por que o trial saiu

Nao saiu por falha tecnica: o fluxo funcionava. Saiu por decisao comercial.
O diagnostico completo que embasou a troca esta nas notas da run de time
"Pagamento com garantia de 7 dias" (Partes 1 a 3b).

O resumo em uma linha: o funil nao tinha checkout nenhum na landing — o unico
link de pagamento saia por WhatsApp no ultimo dia do trial, e so existiam dois
payment links, ambos com os precos do Essencial. Quem escolhia Completo nao
tinha como pagar.

## O que tem aqui

### `codigo/`
| Arquivo | Origem | O que era |
|---|---|---|
| `reset-trial.js` | `src/api/clinica/reset-trial.js` | Endpoint que reabria o trial. Guards de cadastro, de instancia e de API key, mais rate limit por clinica e global. |
| `api-trial-[token].js` | `src/api/trial/[token].js` | Consulta publica de status de trial por token. Le a tabela `trials`, nao `clinicas`. |
| `pagina-t-index.html` | `src/t/index.html` | A pagina `/t/:token` que consumia o endpoint acima. |
| `conectar-trial-trecho.js` | `src/api/clinica/conectar.js` | **O coracao do trial.** `TRIAL_DIAS`, `deveIniciarTrial`, `iniciarTrial` e a chamada no handler. |
| `painel-trial-ui.js` | `src/clinica/painel.js` | Badge "Periodo de teste" e a linha "Teste ate <data> (N dias restantes)". |
| `admin-trial-trecho.js` | `src/api/painel/admin.js` | Criacao manual de clinica abrindo trial de 7 dias. |
| `test-trial-inicio.mjs` | `src/test-trial-inicio.mjs` | Teste das regras de `deveIniciarTrial`. Restaure junto: e a rede de seguranca das duas condicoes. |

### `n8n/`
| Arquivo | O que e |
|---|---|
| `verificacao-de-trial-COMPLETO.json` | Workflow `cf1An4BYT9A0LuHi` inteiro, como estava ao vivo. |
| `onboarding-automatico-COMPLETO.json` | Workflow `voEwbw5fzNnn6bQq` inteiro. |
| `ramo-cron-trial.json` | So os **7 nodes desconectados**: o cron das 9h, o aviso de ultimo dia e o `Expirar Clinicas`. E este o recorte que interessa na volta. |
| `node-reset-trial.js` | O node `Reset Trial` do Onboarding. |

### `sql/`
`011_trial_nullable.sql` (a migration original) e `restaurar-trial.sql`, que
explica por que provavelmente **nao ha DDL a rodar** na volta.

### `copy/`
`landing-copy-trial.md`: os 29 trechos da landing que afirmavam o trial, com o
numero da linha original. Inclui os blocos de JSON-LD.

## Segredos: leia antes de restaurar

O JSON original do workflow de Onboarding trazia a **`RESET_TRIAL_KEY` em texto
claro** dentro do node `Reset Trial`, legivel por qualquer um com acesso a API
do n8n. Como `archive/` vai para o git, **os valores nesta pasta foram
substituidos por `<REDACTED>`**.

Ao restaurar: a chave vai para credencial ou env do n8n, **nunca inline** — e
**rotacione antes**, porque o valor antigo ja esteve exposto. O mesmo vale para
qualquer `whsec_`, `sk_live` ou hash longo que voce encontre marcado aqui.

## Como voltar, se for o caso

Na ordem. A sequencia importa tanto quanto o conteudo.

1. **Banco.** Rode `sql/restaurar-trial.sql` — na pratica, so confirme que as
   tres colunas ainda existem. Elas nao foram dropadas de proposito.
2. **n8n.** Reconecte `Config Fixa -> [Buscar Avisos Pendentes, Expirar
   Clinicas]` no `cf1An4BYT9A0LuHi`, usando `ramo-cron-trial.json` como
   referencia. **Backup do JSON antes do PUT**, `publish` depois, e confira
   `activeVersionId == versionId`: `update_workflow` salva so DRAFT e o teste
   roda a versao antiga em silencio.
   Confira tambem se os payment links do `Config Fixa` ainda existem no Stripe.
3. **Codigo.** Devolva os trechos de `conectar.js`, `painel.js` e `admin.js`,
   e o teste `test-trial-inicio.mjs`.
4. **Landing por ultimo.** Como na ida: prometer trial antes de o trial existir
   e o unico erro desta lista que vira discussao com cliente.
5. `npm run health` antes de publicar. Deploy da raiz do repo, dominios movidos
   um a um depois.

## As tres armadilhas que custaram caro

1. **`clinicas.status` nunca teve o valor `trial`.** O vocabulario e `ativo` e
   `expirado`. Clinica em teste = `ativo` + `trial_fim` no futuro. Ja houve
   producao inserindo `trial`, e o cron — que so expira `ativo` — criava
   clinica imortal (corrigido em `04f6de4`).
2. **Nao unifique `trial_fim` com `garantia_fim`.** O `Expirar Clinicas` faz
   PATCH cego em `status=eq.ativo&trial_fim=lt.<agora>`. Um campo servindo aos
   dois modelos expira todo cliente pagante as 9h da manha, sem erro nenhum no
   log.
3. **O relogio do trial nascia no codigo, nao no n8n.** A memoria `billing`
   afirmava que ninguem escrevia esses campos; quem escrevia era
   `conectar.js`, no primeiro polling que via o WhatsApp conectado. Se for
   voltar, comece por ali.

## O que deliberadamente NAO esta aqui

- O **ramo do webhook do Stripe** de `cf1An4BYT9A0LuHi`. Ele continua vivo e em
  producao: e o que processa pagamento, cancelamento e reativacao. Nao faz
  parte do trial.
- A migration `005_stripe_billing.sql`, pelo mesmo motivo.
- A tabela `trials` e suas linhas. Ela existe no banco e nao participa do ciclo
  de cobranca; nao foi mexida.
