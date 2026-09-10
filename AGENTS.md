# Recepta AI — contexto permanente

Carrega em toda sessão. Aqui só entra o que **evita erro caro ou investigação
repetida**. Detalhe e histórico vivem na memória do projeto
(`.agentsroom/memory/` — comece pelo `INDEX.md`).

**REGRA DE VERIFICAÇÃO.** Afirmação sobre o que existe vem do sistema real:
n8n (API), Supabase (query) ou `curl` no site. **Nunca** de PRD ou doc — os
PRDs deste repo já estiveram desatualizados e induziram a erro. Não conseguiu
verificar? Escreva **"não confirmei"**.

## GUARDRAILS

1. **Nunca deletar** workflow, instância UazAPI ou linha de banco sem
   confirmação explícita do usuário.
2. **Backup do JSON antes** de alterar qualquer workflow n8n
   (`GET /api/v1/workflows/:id` → `tmp-backup-workflows-deletados/`).
3. Todo teste que cria instância UazAPI **apaga a instância no fim** (nunca a
   de alertas).
4. **Nunca deployar sem `npm run health` antes.**
5. **Nunca colar credencial em chat.** Env var / secret do agente.

## Stack

Frontend + API: HTML/CSS/JS vanilla **sem build**, servido pela Vercel.
Serverless: Vercel Functions (Node) em `src/api/`.
Banco: Supabase — `vfyubktlmqytkcewicse.supabase.co`.
Automação: n8n self-hosted — `https://n8n.zapscout.com.br`.
WhatsApp: UazAPI — `https://sitemagic1.uazapi.com`. Email: Resend.
Produção: `https://www.receptaai.com.br`.

## Mapa — onde mexer

| Área                | Arquivos                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Landing             | `src/index.html` (164 KB, editar por trecho)                                                |
| Briefing (wizard)   | `src/briefing/index.html`, `src/api/submit.js`                                              |
| Painel da clínica   | `src/clinica/painel.{js,css}`, `src/painel/index.html`                                      |
| API do painel       | `src/api/clinica/painel-view.js`, `painel-acoes.js`, `agenda-listar.js`, `config-salvar.js` |
| Auth da clínica     | `src/api/clinica/{login,definir-senha,esqueci-senha}.js`, `src/api/_lib/auth-clinica.js`    |
| Admin               | `src/api/painel/admin.js`                                                                   |
| Infra compartilhada | `src/api/_lib/` (rate-limit, redis, supabase-server, api-key)                               |
| Código de node n8n  | `src/n8n-patches/` + `deploy-node-code.mjs`                                                 |
| Migrations          | `supabase-migrations/*.sql`                                                                 |
| Health check        | `scripts/health.mjs` (`npm run health` na raiz)                                             |

**Não é fonte:** `archive/` (código descontinuado), `tmp*/`,
`src/screenshots/`, `docs/prd/` (planos antigos, não estado).

## Armadilhas do repo

- **`archive/clinic-react-descontinuado/` é um painel React morto.** 53 arquivos
  com os mesmos nomes de feature do painel real (`Agenda.jsx`, `Conversas.jsx`,
  `Precos.jsx`…). **Nada o importa** e contradiz a stack "sem build". Vivia em
  `src/clinic-react/` e por isso era publicado: `/clinic-react/` respondia 200
  servindo o template de dev do Vite (página em branco). **Arquivado em
  2026-09-09**: movido para fora de `src/` (o Root Directory da Vercel), rota
  agora 404. Sem decisão de retomada — **não edite nada aí achando que corrige
  o painel.** Detalhe: `archive/clinic-react-descontinuado/LEIA-ME.md` e memória
  `repo-artifacts-e-deploy`.
- `docs/prd/*` são planos, vários já superados. Ler runbook/memória, não PRD.

## DEPLOY — ler antes de publicar

- **Rodar da RAIZ do repo:** `npx vercel --prod --yes`.
- O **Root Directory na Vercel já é `src/`**. Rodar de dentro de `src/` duplica
  o caminho e publica **site vazio** — já causou apagão duas vezes.
- **`npx vercel --prod` NÃO move os domínios** (verificado 2026-09-08). O deploy
  vira Production mas os domínios continuam no deployment anterior. Sempre
  rodar depois — **um domínio por vez**, porque `vercel alias set` aceita no
  máximo dois argumentos (verificado 2026-09-09, CLI 59.9.1):
  ```
  for d in www.receptaai.com.br receptaai.com.br briefing-recepta.vercel.app; do
    npx vercel alias set <novo-deployment>-site-magic.vercel.app "$d"
  done
  ```
  Depois **prove com marker**: `curl .../painel.js | grep -c <marker>`.
  "Ready/Production" no CLI **não é evidência** de que o site mudou.
- Deploy quebrou o site? **Rollback primeiro, investigar depois.**
- Push no `master` **não** publica. Deploy é manual via CLI.
- Deployment/alias dando 302 → `vercel.com/sso-api` é Deployment Protection
  mascarando o probe, não site quebrado. Testar pelo domínio custom.
- `/clinica/painel` → 302 `/clinica/login` sem sessão é o gate de auth, não erro.

Detalhe, rollback e o histórico dos apagões: memória `deploy-vercel`.

## n8n — armadilhas

1. **`update_workflow` salva só DRAFT.** Sem `publish_workflow` o teste roda a
   versão antiga **em silêncio**. Sinal: `versionId != activeVersionId`.
2. **Token de API pode responder 200 com `{"data":[]}` mesmo inválido.** Conte
   os workflows retornados, não confie no status.
3. Expressão n8n precisa de `=` na frente (`=eq.{{ $json.x }}`), senão vai
   literal.
4. `status: success` na execução **não** significa fluxo OK — o branch de
   alerta também termina em success. Conferir o caminho dos nodes.
5. **httpRequest node criado via API** precisa das 4 chaves
   (`authentication: "predefinedCredentialType"`, `nodeCredentialType`,
   `sendBody: true`, `credentials`), senão dá "No API key found in request".
   Copiar de um node equivalente que já funciona.
6. `PUT /workflows/:id` rejeita chaves de `settings` fora do schema
   (`binaryMode`, `availableInMCP`). Mandar só `{executionOrder, errorWorkflow}`.
7. **Ler execução exige `?includeData=true`**, senão parece execução vazia.

### Workflows críticos

Os 6 confirmados **ativos** em 2026-09-08 (e2e completo). O health check cobre
5; `Alerta de Falha` foi confirmado via API.

| ID                 | Papel                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| `cxn5FxUNMJmlJ1WJ` | Atendimento (IA no WhatsApp)                                                     |
| `voEwbw5fzNnn6bQq` | Onboarding (cadastro → clínica → instância WhatsApp)                             |
| `DxCGAEmTMS6sU1qK` | Criar Agendamento                                                                |
| `cf1An4BYT9A0LuHi` | Verificação de Trial — **é este que atende o webhook do Stripe**, apesar do nome |
| `sJzrlremPGkjZDxO` | Lembretes                                                                        |
| `2ZvOhRWcQNO3WZ8C` | Alerta de Falha (Error Workflow dos demais)                                      |

**O ciclo de cobrança (trial, status, webhook Stripe) vive no n8n, não em
`src/api/`.** Não crie rota de Stripe/trial no repo. `clinicas.status` usa o
vocabulário do n8n: `ativo`, `expirado`. Detalhe e evidência: memória
`billing` e `stripe-webhook-n8n`.

### Patch de node n8n — JÁ CORROMPEU PRODUÇÃO 2x

Ambos os incidentes em 2026-09-08, no Atendimento: um patch substituiu o parser
inteiro e perdeu campos; outro tinha escapes duplicados (`\\d` em vez de `\d`)
e o script de deploy copia verbatim → SyntaxError.

- **Nunca** aplicar patch colando código no chat ou copiando à mão. Editar o
  arquivo em `src/n8n-patches/` e deployar por script (PUT + publish +
  verificar `activeVersionId == versionId`).
- **Preservar os contratos** ao substituir um node:
  - `Parser da Mensagem` emite `tipo`, `token`, `telefone`, `telefone_alt`,
    `mensagem`, `mensagem_media`.
  - `Processar Resposta IA` emite `partes`, `precisa_escalar`, `agendamento`,
    `is_agendamento`, `supabase_insert`.
- **Fuso:** a IA emite DATA/HORA em BRT. Converter antes de gravar:
  `new Date('DD/MM/AAAATHH:MM:00-03:00').toISOString()`. Gravar local como UTC
  adianta todo agendamento em 3h.
- **Debounce por identidade, não por timestamp:** `Gravar Mensagem Pendente`
  gera o `id` client-side, `É a Mensagem Mais Recente?` compara
  `meu_id === latest_id`. Comparar por janela de tempo triplicava a resposta.

## Banco — colunas reais

Fonte: `supabase-migrations/*.sql` + uso confirmado em produção. **`clinicas`
foi criada fora do repo** (DDL não rastreado): a lista abaixo mistura migration
e leitura de código — para certeza absoluta, confira no Supabase real.

**`clinicas`** — migrations: `id` uuid, `config_editavel` jsonb (default
`{precos:[],horarios:{},convenios:[],mensagem_identidade:""}`), `spreadsheet_id`,
`config_agenda` jsonb, `stripe_customer_id`, `plano` ('mensal'|'anual'),
`categoria` (default 'geral'), `trial_inicio`/`trial_fim` timestamptz
**nullable** desde a 011 (trial começa quando o WhatsApp conecta).
Usadas pelo código/n8n, DDL fora do repo: `clinica` (nome), `status`
('ativo'|'expirado'), `uazapi_token`, `uazapi_server`, `telefone_alerta`,
`telefone_operador`, `mensagem_audio_padrao`, `tempo_pausa_minutos`,
`ia_config` jsonb, `stripe_subscription_id`.

**`conversas`** — `telefone`, `clinica`, `role`, `mensagem`, `criado_em`;

- `escalado` bool (handoff), `nome_cliente`, `mensagem_media` jsonb (a mensagem
  legível fica em `mensagem`).

**`agendamentos`** (DDL na 003) — `id`, `clinica_id` FK, `paciente_telefone`,
`data_hora` timestamptz, `status` (default 'agendado'), `lembrete_24h_em`,
`lembrete_3h_em`, `cancelado_em`, `criado_em`; + `sheet_row` int (004),
`paciente_nome`, `observacao` (008, nullable de propósito).

**`convites_clinica`** (DDL na 001) — `id`, `clinica_id` FK, `token` unique,
`expira_em`, `usado_em`, `criado_em`; + `tipo` default 'convite' com check
`('convite','reset')` (007).

**`mensagens_pendentes`** (DDL na 013, debounce do Atendimento) — `id`,
`chatid`, `telefone`, `texto`, `token`, `clinica`, `created_at`. Índice
`(telefone, created_at DESC)`.

**`pausas_ia`** — `telefone`, `clinica`, `pausado_ate`. **DDL não rastreado no
repo — não confirmei.**

**RLS:** todas as tabelas de produção têm policy "service only" (migration 009).
Acesso server-side usa `SUPABASE_SERVICE_ROLE_KEY`. **Nunca client-side.**

## UazAPI — limite rígido

- A conta permite **2 instâncias**. Uma clínica = uma instância.
- **A instância de alertas é `recepta-alertas` e NUNCA é apagada.** Sem ela
  conectada, nenhum alerta nem link de onboarding sai.
- Instâncias de teste (`zz-teste-*`) **devem ser apagadas ao fim do teste** —
  lixo sobrando faz o onboarding falhar em "UazAPI Criar Instância".
- **Deletar instância:** `DELETE /instance` (**sem path param**), header
  `token` = token da **própria instância** (não o AdminToken). Demora **~25s**;
  timeout curto não é falha. Variantes com path param dão 404/405.
- Token por instância em `clinicas.uazapi_token`; o token ADMIN vive em
  credencial do n8n, nunca no código.

## Health check

`npm run health` (na raiz) roda `scripts/health.mjs`: n8n (auth + workflows
críticos ativos), Supabase, site (`/`, `/briefing`, `/clinica/painel`),
instâncias UazAPI, conexão de `recepta-alertas` e lixo `zz-teste-*`.

Credenciais vêm do ambiente: `N8N_API_KEY`, `N8N_BASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `UAZAPI_ADMIN_TOKEN`, `UAZAPI_BASE_URL` (aceita
`UAZAPI_SERVER`). O script **nunca** lê `.vercel/.env.production.local` como
fonte de segredo — esse arquivo pode conter placeholders `[SENSITIVE]`.
