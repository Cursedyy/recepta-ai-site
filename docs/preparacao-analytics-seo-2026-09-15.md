# Preparação do F2 e F8

## Analytics

A API aceita os sete eventos previstos no F2, além dos três nomes anteriores.
Somente `evento`, `tier` e `ciclo` são aceitos; tier/ciclo são enums fixos.
Campos adicionais, inclusive identificadores de pedido ou paciente, recebem
400 antes de acessar Redis. Os contadores usam data UTC e TTL de 180 dias.

`node scripts/test-analytics-privacy.mjs` passou com o handler real e Redis
simulado: rejeição sem escrita, sete eventos, dimensões e compatibilidade.
Isso não comprova escrita no Redis de produção nem envio dos sete eventos
pelo frontend. A landing ainda envia os três eventos anteriores.

`node scripts/read-analytics-baseline.mjs` é somente leitura e usa as env
`UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. Ambas estão ausentes
no agente e seus nomes não constam no cadastro de secrets do AgentsRoom.
Baseline real: **não confirmei**. HTTP 204 da API não comprova contador.
Disponibilizar pelo ambiente do agente, nunca colar valores no chat.

Publicado da raiz no deployment `dpl_CbET2vkJr5BdtGyBzj8cJKfLnyW3`, URL
`briefing-recepta-4ls6n4nos-site-magic.vercel.app`, com os três aliases movidos.
Health antes e depois: 13/13. Nos três domínios, POST com campo extra recebeu
400 `evento_invalido`; briefing recebeu 200 e seu HTML é idêntico à origem.
A landing publicada também é idêntica à origem protegida. Nenhum evento válido
de QA foi enviado para não contaminar o contador.
Prova local: `tmp-preparacao-f8/deploy-analytics-proof.json`.

## SEO preparado, sem aplicar

`node scripts/prepare-f8-seo.mjs` gera candidatos em `tmp-preparacao-f8/`.
Não altera `src/index.html` nem `src/sitemap.xml`.
O manifesto registra hashes da origem para revisão antes de qualquer aplicação.

- Preços anuais dos Offers: 347 → 4164 e 697 → 8364 BRL.
- Equivalentes mensais permanecem nas descrições existentes.
- Quatro Offers recebem política de retorno de sete dias, BR e reembolso integral.
- Candidato do sitemap atualiza suas 11 datas para 2026-09-15.

O gerador confirma que o HTML fora do JSON-LD permanece idêntico.
Validar a semântica final do UnitPriceSpecification e Rich Results antes
de aplicar: **não confirmei** o teste do Google.
A landing foi expressamente reservada pelo usuário; candidato não é publicação.
O F8 também permanece dependente do aceite do Customer Portal.

## Pendências que preparação não encerra

F2: contador real e emissores dos sete eventos.
Customer Portal: cancelamento real e webhook Stripe correspondente.
Compra real ponta a ponta: depende do cartão do dono e slot UazAPI disponível.
Nenhuma compra, exclusão de instância ou push foi executado nesta preparação.

## Aplicação autorizada do SEO

O usuário autorizou aplicar somente o JSON-LD e as datas do sitemap.
Commit `692ff1c`: totais anuais 4164/8364, política de reembolso nos quatro
Offers, 11 datas atualizadas. O incremento de cobrança anual passou a 12
meses para acompanhar o total anual; duração permanece em 12 meses.
Referência: https://schema.org/UnitPriceSpecification e
https://schema.org/billingDuration.

Backups da origem em `tmp-preparacao-f8/before-index.html` e
`tmp-preparacao-f8/before-sitemap.xml`. Verificação local confirmou igualdade
do HTML fora do JSON-LD e do XML fora das datas. O diff não inclui alterações
na copy, CTAs, blog, termos, scroll nem gate do briefing.
Teste Rich Results do Google continua **não confirmei**.

Deploy da raiz concluído: `dpl_BHm4cEr76ZjtifQJXNQxDMXbB2Am`, URL
`briefing-recepta-r65wecvnt-site-magic.vercel.app`. Aliases www, domínio raiz
e briefing-recepta.vercel.app movidos individualmente. Probes nos três domínios
confirmaram HTTP 200, HTML igual à origem, anuais 4164/8364, quatro políticas,
sitemap idêntico à origem com 11 datas novas e briefing inalterado.
Health pré/pós-deploy: 13/13. Prova em
`tmp-preparacao-f8/publicacao-seo-proof.json`.
F8 não foi marcado concluído: aceite do Portal e Rich Results seguem pendentes.
