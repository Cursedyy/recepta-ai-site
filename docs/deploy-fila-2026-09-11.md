# Deploy do site/API — 11/09/2026

**Gatilho:** após a fila ser integrada ao Atendimento (n8n), restava publicar
as correções da API/painel que estavam "no workspace, sem deploy"
(`docs/fila-correcoes-2026-09-11.md`). Esta é a perna Vercel.

## O que entrou em produção

- `src/api/clinica/fila.js` → fundido em `src/api/clinica/painel-acoes.js`
  (GET `?acao=fila`; POST `cancelar`/`aceitar`/`recusar`). Mesmos guards:
  tier Completo, CSRF, janela válida antes da RPC, clínica só da sessão.
  O arquivo original segue em `archive/api-clinica-fila.js`.
- `src/clinica/painel.js`: 2 fetches atualizados para o endpoint fundido.
- Painel/API das correções 019/020 (service-only, horário ofertado,
  409 de remarcação) — exatamente o que os testes provaram no workspace.

**Motivo da fusão:** deploy falhou com
*"No more than 12 Serverless Functions can be added to a Deployment on the
Hobby plan"* — com `fila.js` eram 13 functions. `reset-trial` não podia sair
(chamado pelo n8n em `/api/submit`), então `fila.js` foi fundida em
`painel-acoes.js` (dispatcher multi-ação já existente). Deployment final:
**12/12 functions**.

## Evidência (lida de produção, não do payload)

- Deployment: `briefing-recepta-r3snyarp3-site-magic.vercel.app` (Production).
- Domínios movidos (um por comando): `www.receptaai.com.br`,
  `receptaai.com.br`, `briefing-recepta.vercel.app` → apontam para o deploy
  novo (o `--prod` não move domínios sozinho).
- Marker: `curl …/clinica/painel.js | grep -c 'painel-acoes?acao=fila'` → **1**.
- `/api/clinica/fila` (endpoint antigo) → **404**; `/api/clinica/painel-acoes?acao=fila` → **401** sem sessão.
- `/` 200, `/briefing` 200, `/clinica/painel` 302 (gate de auth), raiz nua 308 → www.
- `npm run health`: tudo ✓ exceto o UazAPI 4/2 pré-existente (2 instâncias
  desconectadas de outro produto, não tocadas).
- n8n `cxn5FxUNMJmlJ1WJ` intocado: `versionId == activeVersionId ==
  2ebb0065-644c-409e-8e87-a56636daf300`, 95 nodes, ativo — conferido por API
  **depois** do deploy.

## Limitação honesta

`scripts/test-fila-fixes.mjs` não rodou nesta sessão: exige
`SUPABASE_ACCESS_TOKEN` (ausente no ambiente) para obter a anon key. A suíte
foi provada antes (41/41) no workspace de origem; aqui a verificação foi
sintaxe, probe dos endpoints (401/404/403) e marker.

## Rollback

```
npx vercel rollback briefing-recepta-r3snyarp3-site-magic.vercel.app
```

(ou `npx vercel alias set <deployment-anterior> www.receptaai.com.br` — um
domínio por comando.)

## Pendências fora desta rodada

- WhatsApp da fila (`fila_whatsapp_enabled: false`) e cron `Expirar Ofertas
  Fila` seguem desligados — decisão separada.
- Memória `fila-espera` continua desatualizada (tool de memória falhou na
  sessão anterior; este doc é a fonte do estado).
