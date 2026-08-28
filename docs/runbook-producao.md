# Runbook: Recepta em produção

Auditado ao vivo no n8n em 2026-08-28. Substitui a versão anterior deste
arquivo, que foi escrita **sem** olhar o n8n e por isso listava como faltando
coisas que já existiam.

## Onde cada peça vive

| Assunto                                 | Dono   | Onde                     |
| --------------------------------------- | ------ | ------------------------ |
| Site, painel da clínica, /api           | código | este repositório, Vercel |
| Cadastro → clínica → instância WhatsApp | n8n    | `voEwbw5fzNnn6bQq`       |
| Atendimento da IA no WhatsApp           | n8n    | `cxn5FxUNMJmlJ1WJ`       |
| Trial, cobrança, expiração              | n8n    | `cf1An4BYT9A0LuHi`       |
| Lembretes de consulta                   | n8n    | `sJzrlremPGkjZDxO`       |
| Alerta de falha                         | n8n    | `2ZvOhRWcQNO3WZ8C`       |

**O ciclo de cobrança não vive no código.** Não crie rota em `src/api/` para
trial, status ou webhook do Stripe: já existe no n8n, com verificação HMAC, e
dois donos do mesmo campo é pior que nenhum. O vocabulário de
`clinicas.status` é do n8n: `ativo` e `expirado`.

## Corrigido em 2026-08-28

- **Dedupe do onboarding, que nunca funcionou.** `Supabase Buscar Clínica
Existente` e `Supabase Buscar CNPJ Existente` tinham expressão sem o prefixo
  `=`, então iam para o Supabase como a string literal `eq.{{ $json.clinica }}`
  e nunca achavam nada. Cada reenvio de briefing criava clínica e instância
  UazAPI duplicadas.
- **Alerta de briefing incompleto quebrado.** `Alerta: Campos Faltando` morria
  com `invalid syntax`: quebras de linha literais dentro de string de aspas
  simples. Lead incompleto chegava e ninguém era avisado.
- **Fim de pagamento não cortava ninguém.** O webhook só tratava
  `checkout.session.completed`. Agora `Extrair Fim de Pagamento` +
  `Supabase Expirar Por Pagamento` tratam `unpaid`, `canceled` e
  `subscription.deleted`. `invoice.payment_failed` **não** corta de propósito:
  o Stripe ainda está tentando, e cortar no primeiro boleto falho derruba
  clínica que só trocou de cartão.
- **Atendimento estava desligado.** `active: false` desde 26/08, enquanto o
  Onboarding continuava apontando as instâncias novas para o webhook dele.
  Cadastro novo teria as mensagens caindo no vazio. Reativado e publicado.
- **Alerta de falha não existia.** Criado `Recepta AI - Alerta de Falha` e
  ligado como Error Workflow dos cinco workflows de produção.

## Pendências suas

### 1. Token do alerta — 2 minutos, senão o alerta é mudo

Abrir `Recepta AI - Alerta de Falha` → node `Config Alerta` → preencher
`admin_connected_token` com o token do UazAPI (o mesmo do `Config Fixa` do
Onboarding). Deixei vazio de propósito: segredo não entra por ferramenta.

Testar depois: rodar qualquer workflow com payload inválido e conferir se o
WhatsApp chega.

### 2. Eventos do Stripe

Conferir em Stripe → Developers → Webhooks que o endpoint do n8n assina
`customer.subscription.updated` e `customer.subscription.deleted`, além de
`checkout.session.completed`. Sem esses dois, o corte por falta de pagamento
que acabou de ser implementado nunca é acionado.

### 3. Cadastro real ponta a ponta

Nenhum cliente real jamais passou pelo funil — as execuções completas do
Onboarding foram payload montado à mão. Agora que dedupe, alerta e atendimento
estão de pé, fazer um cadastro de verdade com o seu WhatsApp: clínica criada,
instância criada, pareamento recebido, convite do painel chegando, login
funcionando, mensagem respondida. Depois marcar essa clínica como `expirado` e
confirmar que o bot para.

### 4. Deploy automático

Push no master não publica; alguém roda `npx vercel --prod`. A conta Vercel
que meu acesso enxerga não lista este projeto, então isto fica no painel:
projeto `briefing-recepta` → Settings → Git → conectar
`Cursedyy/recepta-ai-site`, branch `master`, root `src`.

### 5. Decisão de produto: CNPJ obrigatório

O node `Campos Obrigatórios OK?` exige CNPJ com 14 dígitos. É atrito no
cadastro. Agora que o dedupe funciona de verdade, dá para trocar a chave
anti-duplicata para o WhatsApp e deixar o CNPJ só na hora do pagamento — mas
isso muda regra de negócio, então não mexi.

## Armadilhas do n8n (custaram bugs reais)

- **Expressão precisa do `=` na frente.** `eq.{{ $json.x }}` vai literal;
  `=eq.{{ $json.x }}` é que resolve. Este é o bug do dedupe.
- **Nunca quebra de linha real dentro de string de aspas simples numa
  expressão.** Use a sequência barra-n. Este é o bug do alerta.
- **Publicar não é salvar.** Se `versionId != activeVersionId`, a mudança está
  no rascunho e não está no ar.
- **`status: success` não significa fluxo bem-sucedido**: o branch de alerta
  também termina em success. Conferir o caminho dos nodes.
