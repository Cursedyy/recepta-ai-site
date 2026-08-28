# Runbook: colocar a Recepta no ar rodando sozinha

Estado em 2026-08-28. A cadeia técnica existe e foi provada em QA; o que falta
é o que separa "funciona quando alguém empurra" de "funciona sozinho".

Cada item diz quem executa: **[código]** já está no repositório, **[você]** é
clique em painel externo (n8n, Stripe, Vercel, Supabase) que eu não alcanço.

---

## 1. Revogar a chave do n8n — [você] — HOJE

Em 2026-08-25 um token da API do n8n foi colado em texto puro num chat.

A chave que está no ambiente local (`N8N_API_KEY`) **já não autentica**: a API
responde `401 unauthorized` enquanto o `/healthz` responde 200. Ou seja, ou ela
já foi revogada, ou expirou sozinha.

Confirme em `n8n.zapscout.com.br` → Settings → API que nenhuma chave antiga
continua ativa. Se for gerar outra, coloque como secret no AgentsRoom e exponha
na variável de ambiente do agente — nunca no chat.

---

## 2. Número hardcoded no Atendimento — [você] — bloqueia tudo

Workflow **Atendimento WhatsApp (Template Genérico) (1)** — `cxn5FxUNMJmlJ1WJ`.

O node de envio manda a resposta para um número fixo de teste em vez do
paciente. Enquanto isso existir, cliente real fala com o bot e não recebe nada,
e um terceiro recebe conversa de paciente — é incidente de privacidade, não só
bug.

1. Abrir o workflow, achar o node de envio (`Envia em partes` ou equivalente).
2. Trocar o telefone fixo por `{{ $json.paciente_telefone }}` (ou `{{ $json.from }}`,
   conforme o que o parser monta).
3. **Publicar.** Mexer no workflow deixa a mudança no rascunho: se
   `versionId != activeVersionId`, não está no ar.

---

## 3. Gate de assinatura no Atendimento — [você] — o corte de custo

O banco agora sabe quem está suspensa (itens 5 e 6). Falta o Atendimento
respeitar isso — hoje ele atende qualquer clínica, pagando ou não.

No mesmo workflow, o node `Buscar Clinica` já faz `select=*`, então `status` já
chega. Basta um IF depois dele:

- `status` ∈ (`trial`, `ativo`) → segue o fluxo normal.
- caso contrário → não chama o Claude, não responde nada (ou responde uma frase
  fixa de assinatura inativa, se preferir).

Sem este IF, os itens 5 e 6 escrevem no banco e nada acontece na prática.

---

## 4. Onboarding: convite e CNPJ — [você]

Workflow **Onboarding Automático de Clínica** — `voEwbw5fzNnn6bQq`.

- **`Gerar Convite Painel`**: em 22/08 esse node retornava 404. Nunca foi
  reverificado. Se ainda retorna, a clínica é criada e nunca recebe acesso ao
  painel — falha silenciosa no meio do cadastro. Rodar uma execução e conferir.
- **CNPJ obrigatório**: o node `Campos Obrigatórios OK?` exige 14 dígitos. É
  atrito no cadastro e dedupe frágil. Proposta: dedupe pelo WhatsApp, CNPJ só
  na hora do pagamento.

---

## 5. Webhook do Stripe — [código] + [você]

**Já no repositório:** `src/api/stripe/webhook.js`.

Ele não confia no corpo do evento: usa o evento apenas como aviso de "algo
mudou neste customer" e vai ler o estado real na API do Stripe antes de
escrever. Quem descobrir a URL e o token só consegue disparar uma releitura.

**O que você faz:**

1. Variáveis de ambiente na Vercel (Production):
   - `STRIPE_WEBHOOK_TOKEN` — invente uma string longa e aleatória.
   - `STRIPE_SECRET_KEY` — se já não estiver lá.
2. Stripe → Developers → Webhooks → Add endpoint:
   - URL: `https://www.receptaai.com.br/api/stripe/webhook?token=SEU_TOKEN`
   - Eventos: `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.payment_failed`.
3. **No Checkout, mandar quem é a clínica.** É o que amarra pagamento a conta.
   No workflow que cria a sessão de checkout, incluir
   `client_reference_id = <id da clínica>` (ou `metadata[clinica_id]`).
   Sem isso, um cliente novo paga e o webhook não sabe a quem dar acesso —
   ele loga `stripe_webhook_clinica_nao_encontrada` e para.
4. Testar com "Send test webhook" e conferir a linha no log da função.

---

## 6. Expiração de trial — [código] + [você]

**Já no repositório:** `src/api/cron/expirar-trials.js` + `crons` no
`src/vercel.json` (todo dia às 9h UTC).

Existe porque o trial dado pelo Onboarding não passa pelo Stripe: sem este
cron, esse trial nunca termina. Quem já tem subscription não passa por aqui —
para esse, o próprio Stripe avisa o fim do trial via webhook.

**O que você faz:** definir `CRON_SECRET` nas variáveis da Vercel. A Vercel
manda esse valor como `Authorization: Bearer` no cron; sem ele a rota responde
401 para todo mundo, inclusive para o cron.

---

## 7. Migration antes do deploy — [você] — nesta ordem

`supabase-migrations/009_ciclo_assinatura.sql`.

Rodar **antes** de publicar o código dos itens 5 e 6. Rota publicada que
escreve coluna inexistente derruba o fluxo inteiro (foi o que aconteceu com
`008_agendamento_manual`).

A migration é idempotente (`add column if not exists`) e define
`status = 'trial'` para quem estiver sem status — ninguém perde acesso ao
rodar.

---

## 8. Deploy automático — [você] — 1 clique

Hoje push no master **não** publica: alguém roda `npx vercel --prod` na mão, e
produção pode divergir do master sem ninguém notar.

Vercel → projeto `briefing-recepta` → Settings → Git → conectar
`Cursedyy/recepta-ai-site`, branch `master`, root directory `src`.

Relacionado: o workflow de teste de responsividade estava em `src/.github/`,
onde o GitHub **nunca** o executa. Movido para `.github/` na raiz — ele passa a
rodar de verdade nos próximos pushes. Pode ser que acuse coisa que estava
passando batido desde que foi escrito.

---

## 9. Alerta de falha — [você]

Não existe nenhum. Se o Onboarding quebrar às 3h da manhã, você descobre pelo
cliente reclamando. Piora: `status: success` numa execução do n8n não significa
sucesso do fluxo — o branch de alerta também termina em success.

Mínimo viável: criar um workflow "Alerta" (manda WhatsApp ou e-mail para você)
e apontar os três workflows para ele em Settings → Error Workflow.

Segundo alerta que vale: a instância UazAPI cair. Se a sessão do WhatsApp
desconecta, o bot fica mudo e nada avisa.

---

## 10. Cadastro real ponta a ponta — [você] — o teste que importa

Nenhum cliente real jamais passou pelo funil. As únicas execuções completas do
Onboarding foram payload montado à mão.

Depois de 2, 3 e 4, fazer um cadastro de verdade pelo site, com o seu WhatsApp:
clínica criada, instância UazAPI criada, pareamento recebido, convite do painel
chegando, login funcionando, mensagem de paciente respondida pelo número certo.
Depois, suspender essa clínica no banco e confirmar que o bot para de responder.

---

## Ordem sugerida

1 → 2 → 4 → 7 (migration) → deploy → 5 → 6 → 3 → 10 → 8 → 9.

Os itens 1 a 4 são dias, não semanas. O 5 e o 6 são o que transforma isto num
negócio que cobra sozinho.
