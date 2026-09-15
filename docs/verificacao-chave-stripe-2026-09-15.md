# Verificação da credencial Stripe — 2026-09-15

Registro da correção de configuração, sem credenciais. Não descreve pagamento
concluído ou provisionamento de uma clínica pagante.

## Evidências concluídas

- Credencial local: GET `/v1/balance` e GET
  `/v1/prices/price_1U35F9HkvKNdqMufd58XEIq2` retornaram HTTP 200.
- A variável sensível `STRIPE_SECRET_KEY` de Production não pôde ser lida
  pela API Vercel. Não confirmei o conteúdo anterior ou a causa exata do 401.
- Com autorização, somente essa variável foi substituída pela credencial
  local validada, com `.trim()`, via PATCH em memória, sem arquivo de segredo.
  Metadados confirmaram a atualização e nenhuma mudança nas demais variáveis.
- `npm run health` antes do deploy: 13/13 OK.
- Deploy pela raiz: `dpl_9DxXuq21mJpyGb7WPXsjKNCjS2Qd`, URL
  `briefing-recepta-fg9evzwxb-site-magic.vercel.app`.
- Aliases movidos individualmente: `www.receptaai.com.br`,
  `receptaai.com.br`, `briefing-recepta.vercel.app`.
  GET `/smooth-scroll.js` retornou 200 e hash igual ao arquivo local nos três.
- Teste no domínio: essencial/mensal, essencial/anual, completo/mensal e
  completo/anual retornaram HTTP 200 e URL `checkout.stripe.com`.
  Queries reais confirmaram pedido aberto e sessão persistida; GETs Stripe
  confirmaram modo live, valores BRL 49700/416400/99700/836400 centavos,
  intervalos month/year e `client_reference_id` correspondente ao pedido.
- As quatro sessões de teste foram expiradas e seus pedidos cancelados com
  `motivo_encerramento=qa_go_live`; ambos confirmados por releitura.
  Nenhuma cobrança ou exclusão foi realizada.

## HARD — não executado

Consulta read-only ao n8n confirmou Onboarding `voEwbw5fzNnn6bQq` ativo,
`versionId == activeVersionId == 9e864629-230b-4937-a5f8-b85264d2dcbd`,
`Preparar Claim` byte a byte igual ao arquivo SOFT, e o ramo false de
`É Pedido Pago?` apontando para `Gerar ia_config`.

`node scripts/f6-claim-modo.mjs --hard` usaria esse workflow por padrão
(a variável `F6_WORKFLOW_ID` pode sobrescrever o alvo). Faz backup JSON em
`tmp-backup-workflows-deletados/`, substitui o jsCode de `Preparar Claim`
(`prep-claim-mu1q7kc7`) pelo arquivo `onboarding-claim-pedido-hard.js`, muda o
ramo false de `É Pedido Pago?` para `Falha Claim Pedido`, aplica fallback de UUID
nulo às URLs de `Finalizar Pedido Provisionado` e `Liberar Pedido para Retry`,
salva via PUT e publica se o workflow estiver ativo.

Briefing sem UUID de pedido passa a falhar antes do provisionamento, acionando
o Error Workflow `2ZvOhRWcQNO3WZ8C`. O caminho pago mantém claim condicional
`status=pago` para `status=provisionando`; UUID válido sozinho não autoriza
provisionamento. A alternância não deleta workflows, recursos ou linhas.

## Pedidos órfãos — não alterados

Query Supabase confirmou duas linhas abertas, completo/mensal, sem sessão:

| ID | criado_em (UTC) |
|---|---|
| fd640b6e-d0db-4b91-a397-e216cd496d75 | 2026-09-14T20:57:46.607194+00:00 |
| b869f97d-ab4a-4cea-8901-f6bb70651c89 | 2026-09-14T21:02:15.606032+00:00 |

Proposta sujeita a autorização: PATCH somente esses IDs, condicionado a
`status=aberto`, `stripe_session_id IS NULL`, `tier=completo`, `ciclo=mensal`,
para `status=cancelado`, `motivo_encerramento=qa_orfao_2026-09-14` e
`encerrado_em` no instante da execução. Sem DELETE e sem ação no Stripe.

## Escopo de versionamento

Esta sessão não mudou código do produto. Os arquivos de implementação e QA
já estavam presentes e alterados antes da correção; não foram incluídos neste
commit para preservar trabalho de outras frentes. Este registro é o único
arquivo de fonte criado nesta revisão. Não foram repetidos testes live.
