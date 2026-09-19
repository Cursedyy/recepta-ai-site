# Runbook — a primeira compra real (2026-09-15)

Tudo do funil foi provado **em elos isolados**. A cadeia inteira — cartão real →
webhook → claim → Onboarding → instância UazAPI → WhatsApp pareado → garantia no
painel — **nunca rodou**. Este runbook existe para que a primeira execução seja
nossa, e não de um cliente.

Comprador sugerido: **Essencial mensal, R$ 497**, cartão do dono. O valor volta
pela própria Garantia Recepta se o reembolso for pedido dentro da janela — e o
pedido de reembolso é o passo 8 daqui, de propósito.

## Pré-requisito que bloqueia tudo: o slot da UazAPI

A conta permite **2 instâncias** e está **2/2**:

| Instância           | Estado       | Número                                                                       |
| ------------------- | ------------ | ---------------------------------------------------------------------------- |
| `recepta-alertas`   | connected    | 555391635302 — **nunca tocar**, é o canal de alertas e do link de onboarding |
| `zapscout_59a506f0` | disconnected | 5511981008159                                                                |

Verificado em 2026-09-15: as 6 clínicas do banco são todas de teste
(`teste`, `asadasda`, `Teste QA`, três `ZZ QA …`), nenhuma com `pedido_id`,
nenhuma com garantia, e o `uazapi_token` das **seis** devolve **401** na UazAPI —
ou seja, nenhuma clínica do banco é dona da `zapscout_59a506f0`. Ela é órfã de
um teste antigo.

**Decisão do dono, não do agente:** apagar `zapscout_59a506f0` para liberar o
slot. Comando (AGENTS.md): `DELETE /instance` **sem path param**, header `token`
= token da própria instância, demora ~25s — timeout curto não é falha. Sem slot
livre, o Onboarding falha em "UazAPI Criar Instância" e o teste morre no meio,
com dinheiro já cobrado.

## Antes de começar

```
npm run health          # precisa dar 13/13
```

Ter aberto: painel do Stripe (modo live), Supabase SQL/REST, n8n (execuções do
`voEwbw5fzNnn6bQq` e do `cf1An4BYT9A0LuHi`), e um celular com o WhatsApp que vai
ser pareado (**não** pode ser o número de `recepta-alertas`).

## Os 8 passos, com a prova de cada um

### 1. Checkout na landing

Abrir `https://www.receptaai.com.br/#planos`, escolher **mensal**, clicar
"Começar com o Essencial".

**Prova:** navegador em `checkout.stripe.com`; no Supabase,
`pedidos` ganha linha `status='aberto'`, `tier='essencial'`, `ciclo='mensal'`,
`origem='landing'`, `stripe_session_id` começando em `cs_live_`.

**Se falhar:** 500 `configuracao_preco_invalida` = chave Stripe rejeitada de
novo (ver `docs/verificacao-chave-stripe-2026-09-15.md`). Nada foi cobrado.

### 2. Pagamento

Pagar com cartão real.

**Prova:** cobrança aparece no Stripe; o navegador volta para
`/briefing?pedido=<uuid>` — o mesmo uuid da linha de `pedidos`.

### 3. Webhook e claim do pedido

**Prova:** em `stripe_eventos`, o `event_id` do `checkout.session.completed`
com `processado_em` preenchido; em `pedidos`, a linha vira `status='pago'` com
`pago_em`, `garantia_teto_em = pago_em + 30 dias`, `stripe_customer_id` e
`stripe_subscription_id`; a execução do `cf1An4BYT9A0LuHi` no n8n termina no
ramo de confirmação (ler com `?includeData=true`).

**Se travar aqui:** o cliente pagou e não entrou. `pedidos.status='pago'` parado
é exatamente o que o check `fila: pedidos travados` acusa. Retomada manual:
reenviar o evento pelo painel do Stripe (Webhooks → Send test/resend).

### 4. Briefing

Preencher o formulário na aba que o Stripe abriu (a URL **precisa** ter
`?pedido=`; sem ele o gate publicado hoje bloqueia e `/api/submit` devolve 400
`pedido_invalido`).

**Prova:** `/api/submit` responde 200 e a execução do Briefing aparece no n8n.

### 5. Claim no Onboarding (modo HARD)

**Prova:** `pedidos` passa a `provisionando` com `provisionando_em`; a execução
do `voEwbw5fzNnn6bQq` mostra `Preparar Claim` → `É Pedido Pago?` pelo ramo true.

**Se falhar:** o claim compensa devolvendo o pedido para `pago` — dá para tentar
de novo sem cobrar duas vezes. Confirmar que não sobrou instância órfã antes de
repetir.

### 6. Instância UazAPI e pareamento

**Prova:** instância nova na UazAPI (a conta volta a 2/2), link/QR chega pelo
`recepta-alertas`, e o WhatsApp de teste pareia. Ao conectar,
`clinicas.garantia_inicio` e `garantia_fim` são materializados por
`src/api/clinica/conectar.js` — **em BRT, uma única vez**. Conferir que
`garantia_fim = garantia_inicio + 7 dias` e que `trial_inicio`/`trial_fim`
continuam nulos.

### 7. Painel e atendimento

Entrar em `/clinica/login` com a clínica criada.

**Prova:** painel mostra assinatura ativa e a janela da garantia com as datas
reais; `pedidos` está em `provisionado` com `clinica_id`; mandar uma mensagem
para o número pareado e ver a IA responder (tabela `conversas` recebendo linhas).

### 8. Exercitar o reembolso (o ponto do teste)

Pedir reembolso pelo botão do painel.

**Prova:** `clinicas.reembolso_pedido_em` preenchido; o operador cancela a
assinatura e lança o estorno integral no Stripe; o webhook grava
`reembolsado_em`, valor e motivo, põe `status='expirado'` e o pedido vira
`reembolsado`. Conferir que **não** foi criado status `reembolsado` em
`clinicas` (vocabulário é só `ativo`/`expirado`) e que a assinatura ficou
cancelada no Stripe — estorno não cancela sozinho.

## Teardown depois do teste

1. Apagar a instância criada (`DELETE /instance` com o token dela). **Nunca**
   `recepta-alertas`.
2. Deixar as linhas de `clinicas`, `pedidos` e `stripe_eventos` como ficaram:
   são o registro da primeira transação real. Marcar a clínica no nome, não
   apagar.
3. `npm run health` — 13/13, filas limpas.

## Riscos aceitos nesta execução

- Dinheiro real sai e volta pelo estorno; a tarifa do Stripe sobre a transação
  não volta.
- O passo 6 consome o único slot livre da UazAPI: durante o teste, nenhuma outra
  clínica pode ser provisionada.
- O que o teste **não** cobre: renovação mensal, `past_due` e cancelamento sem
  reembolso. Esses só aparecem no segundo ciclo.

Ver também [[pagamento-antecipado-garantia]], [[garantia-politica-operacional]],
`docs/go-live-pagamento-garantia-2026-09-14.md` e
`docs/fechamento-go-live-2026-09-15.md`.
