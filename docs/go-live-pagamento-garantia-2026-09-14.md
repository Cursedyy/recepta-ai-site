# Go-live — Pagamento antecipado + Garantia Recepta (2026-09-14)

Tudo abaixo já está **escrito e verificado no repo**. O que falta para o ar é
execução na janela — com passos que precisam de humano (DDL do banco, deploy,
commit).

## Já pronto (feito e provado nesta leva)

| Fase | Entrega | Prova |
|---|---|---|
| F0a | `Reset Trial` neutralizado, chave inline removida, `RESET_TRIAL_KEY` rotacionada na Vercel | `activeVersionId == versionId`; rota agora 409 em vez de 404 |
| F0b | Cron de billing: ramos isolados + `retryOnFail` (3 tentativas) nos nós de busca | PATCH + publish provado; freshness check no health |
| F0c | Lembretes filtram `clinicas.status=eq.ativo` (retry nos nós de busca/marca, nunca nos de envio) | PATCH + publish provado |
| F1 | **B3 resolvido**: preços auditaros por valor na API do Stripe (probe QA). Node n8n 100% correto; divergência era do ambiente local. Health check pina os 4 preços | `npm run health` — check de preço implementado |
| F3 | Migration 021 escrita: `pedidos`, `stripe_eventos`, colunas de garantia/reembolso/aceite, índice único de subscription, policies `service only` | `supabase-migrations/021_pagamento_antecipado_garantia.sql` (NÃO aplicada) |
| F4 | Idempotência por `event_id` scriptada (gate `Registrar Evento` com `ignore-duplicates` + auditoria). Response-after-processing **propositalmente postergada** (probe provou que `lastNode` vira 500 em terminal de zero itens) | `scripts/patch-webhook-idempotencia-f4.mjs`, gated em 021 |
| F5 | `/api/checkout` (fail-closed por `unit_amount` + rate limit + `Idempotency-Key`) + seletor mensal/anual na landing com fallback no-op | `src/api/checkout.js`; CTAs wired |
| F6 | Claim atômico scriptado: billing PATCH condicional em `pedidos` + fallback legado; onboarding claim antes de Anthropic/UazAPI com `--hard` (fail-closed) e `--soft` (trial atravessa) | `scripts/patch-billing-checkout-f6.mjs`, `scripts/patch-onboarding-claim-f6.mjs`; ambos gated em 021 |
| F7 | Garantia: `conectar.js` materializa `garantia_inicio/fim` (G2, BRT) uma única vez; `reembolso.js` (G4, timestamp do servidor); painel mostra garantia + botão; C6 e C9 no patch de billing | `src/api/clinica/{conectar,reembolso,painel-view}.js`, `src/clinica/painel.js` |
| F2 | `/api/an` sem cookies (3 eventos, contador Redis diário, no-op sem Upstash) + beacons na landing + Privacidade §10 reescrito | `src/api/an.js` |
| F8 | Copy trocada em 14 superfícies: landing (meta/OG/JSON-LD/FAQ/hero/banda/final), briefing (title/badge/checkbox aceite C11/botão), Termos §4 reescrito + §5 fórmula pro rata, 4 nichos, 4 páginas de blog. **Grep "grátis/gratuito/sem cartão" = 0 em todo HTML servido** | este repo |

## Ordem do dia D (não trocar)

```
1. BANCO (humano)   →  2. VERCEL (humano)  →  3. n8n (gate)  →  4. COPY (humano)
```

### 1. Banco — aplicar migration 021 (⚠️ único passo DDL)

SQL Console do Supabase (project `vfyubktlmqytkcewicse`), colar o conteúdo de
`supabase-migrations/021_pagamento_antecipado_garantia.sql` e rodar. É aditiva
e idempotente (sem drop, sem NOT NULL novo). Provar:

```bash
curl -s "$SUPABASE_URL/rest/v1/pedidos?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# esperado: [] (200), NÃO PGRST205
```

### 2. Vercel — deploy da leva de código (antes do gate!)

```bash
npm run health   # obrigatório; cron freshness ainda vai apontar 25h — é esperado até a 9h seguinte
npx vercel --prod --yes
for d in www.receptaai.com.br receptaai.com.br briefing-recepta.vercel.app; do
  npx vercel alias set <novo-deployment>-site-magic.vercel.app "$d"
done
```

Este deploy inclui: checkout, garantia, reembolso, painel, analytics, aceites
e a copy nova **ainda não visível como promoção de trial** (a landing já
diz "garantia", o que é verdade — a garantia existe para quem paga).

Prova por marker no domínio:

```bash
curl -s https://www.receptaai.com.br/ | grep -c "Garantia Recepta"
curl -s https://www.receptaai.com.br/api/checkout -X POST -H 'Content-Type: application/json' -d '{}'
# esperado: 400 com erro de validação (rota viva), NÃO 404
```

### 3. n8n — ligar o gate (minutos antes da copy)

```bash
node scripts/patch-webhook-idempotencia-f4.mjs      # F4: idempotência por event_id
node scripts/patch-billing-checkout-f6.mjs          # F6: claim do pedido no billing
node scripts/patch-onboarding-claim-f6.mjs --hard   # F6 HARD: briefing sem pedido falha fechado
```

Os três: fazem backup, PUT, publish e provam `activeVersionId == versionId`.
Com `--hard`, briefings sem `?pedido=` falham com mensagem legível → Alerta de
Falha. **Nunca rodar `--hard` antes da copy** (bloquearia o trial que a
landing ainda anuncia).

### 4. COPY — troca de promoção (já está no repo; este deploy foi no passo 2)

A copy nova já vai no deploy do passo 2. O que muda aqui é só **conferência**:
grep de "grátis/gratuito/sem cartão" no HTML servido = **0** em `/`,
`/briefing`, `/termos`, nichos e blog. A landing passa a anunciar pagamento
antecipado com Garantia Recepta de 7 dias.

## Depois da janela

- **Monitorar 2h**: `pedidos` com `status='pago'` há +2h deve ser zero;
  `stripe_eventos` com `processado_em is null` há +15min deve ser zero.
- **Health**: rodar `npm run health` — todos os checks novos (preços, cron
  freshness, tabelas) devem passar.
- **Commit**: tudo desta leva está untracked/modified no worktree. Revisar
  por arquivo e commitar separando outras frentes. `archive/trial-gratuito/`
  segue pendente de revisão/commit (decisão da PM de 12/09).

## Rollback (ordem inversa)

| Camada | Como |
|---|---|
| Copy | a landing anterior ainda está nos deployments da Vercel: `vercel alias set` de volta resolve em minutos |
| n8n | cada patch deixou backup em `tmp-backup-workflows-deletados/`; rollback = PUT do backup + publish + conferir versionId |
| Banco | aditivo: rollback = parar de escrever (`--soft` no claim), sem drop |
| Continuidade | sem Stripe: operador insere `pedidos{status:'pago'}` à mão e o cliente segue no briefing |

---

## Execução — 2026-09-15

Ordem real do dia, com o que foi provado em cada passo.

### Incidente que atrasou a janela

Com a copy do F8 já publicada, todo CTA de plano caía no `catch` da landing:

```
POST /api/checkout {"tier":"essencial","ciclo":"mensal"}
→ 500 {"erro":"configuracao_preco_invalida"}
log runtime: checkout_price_pin_falhou STRIPE_PRICE_ESSENCIAL_MENSAL HTTP 401
```

Os 4 `STRIPE_PRICE_*` estavam corretos (`npm run health` 4/4 nos dois lados). O
401 era da `STRIPE_SECRET_KEY` de Production. Como o pin é fail-closed, o
sintoma aparece como erro de **preço**, não de credencial: ler o log runtime,
nunca só o corpo da resposta. Resolvido trocando a env + redeploy (env nova só
vale em deployment novo) + alias dos 3 domínios.

### CTAs e copy (frente separada, publicada no mesmo deploy)

- Os 9 links para `/briefing` viraram planos: 8 páginas para `/#planos`, home
  para `#planos` com texto "Ver planos e começar". Produção: `href="/briefing"`
  = **0** nas 9 páginas.
- Resíduos de trial que o grep de gratuidade não pegava: FAQ "7 dias de teste"
  em `blog/secretaria-virtual-clinica` e "durante o período de teste" nos Termos
  §15. Ambos reescritos; produção com 0 ocorrências.
- `smooth-scroll.js` ganhou tratamento de chegada com hash (`/#planos` vindo de
  outra página assentava a 3px do header em vez de 12px). Guarda
  `src/check-ancoras.mjs`: 5 seções × 4 viewports × 3 caminhos, exit 0.
- JSON-LD servido: 1 bloco válido, `@graph` com Organization/WebSite/WebPage/
  SoftwareApplication+Service/FAQPage, preços 347/497/697/997 e a pergunta da
  Garantia Recepta presente.

### Monitoramento virou check

`npm run health` = **13/13**, com `fila: pedidos travados` (pago/provisionando
há +2h) e `fila: eventos Stripe` (recebido há +15min sem `processado_em`).
Substitui o "monitorar 2h" manual desta página.

### Pendente ao fechar este registro

1. QA dos 4 checkouts live (`scripts/qa-checkout-go-live.mjs --run`) com
   teardown de Session e pedido.
2. `node scripts/f6-claim-modo.mjs --hard` — só depois do item 1 verde.
3. **Não confirmei** se os contadores de `/api/an` estão de fato incrementando:
   a rota devolve 204 mesmo sem Redis (no-op por design). Ler
   `an:visit:<YYYY-MM-DD>` no Upstash para provar o baseline.
4. Commit da leva (worktree ainda sujo, `archive/trial-gratuito/` untracked
   desde 12/09).
