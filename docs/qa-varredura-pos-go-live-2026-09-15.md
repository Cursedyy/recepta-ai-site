# Varredura de qualidade após go-live — 2026-09-15

Auditoria somente leitura de https://www.receptaai.com.br, executada em 15/09/2026. Chromium 151.0.7922.34, Windows, Playwright instalado em src/node_modules. Não houve clique em CTA de compra, checkout válido, pagamento, alteração de código, deploy, push ou acesso de mutação a n8n/Supabase/Stripe/UazAPI. Os únicos POSTs de negócio foram os quatro payloads inválidos expressamente pedidos. Scripts existentes produziram artefatos locais de teste; somente este relatório entra no commit.

## Resultado e classificação

Foram identificados dois achados CRÍTICOS de coerência comercial, um ALTO de contraste, três MÉDIOS e duas notas BAIXAS. Nenhuma oferta de trial gratuito foi confirmada nas superfícies servidas. Não foi detectado overflow horizontal na matriz de 54 combinações. Isso não equivale a certificação visual ou WCAG completa.

| ID | Classe | Achado confirmado |
|---|---|---|
| C1 | CRÍTICO | A landing promete compartilhamento inexistente; a Privacidade declara operadores necessários. |
| C2 | CRÍTICO | A landing promete ausência de retenção; a Privacidade declara 30 dias e retenção fiscal. |
| A1 | ALTO | Contraste insuficiente nos CTAs e badges de Ortopedia e Psicologia. |
| M1 | MÉDIO | Quatro nichos sem landmark main; nichos e blog têm conteúdo fora de landmarks. |
| M2 | MÉDIO | Alvos pequenos medidos apesar do PASS do teste responsivo. |
| M3 | MÉDIO | Script de acessibilidade imprime PASS e retorna zero mesmo com 16 erros. |
| B1 | BAIXO | Busca literal de trial encontra industrial nos Termos: falso positivo. |
| B2 | BAIXO | Ao dispensar aviso de abandono pelo teclado, foco volta ao BODY. |

### C1 — promessas incompatíveis sobre compartilhamento

Passo: GET da home e de /privacidade/, inspeção dos trechos com compartilhamento/terceiros no HTML servido, inclusive FAQ JSON-LD.

Saída real da home: “Sem compartilhar com terceiros”; “não são compartilhados com terceiros”; quadro institucional “Compartilhamento Nenhum, com ninguém”. Privacidade §5: “Não vendemos nem compartilhamos dados pessoais com terceiros para finalidades comerciais próprias. Compartilhamos dados apenas com operadores estritamente necessários para o funcionamento do serviço, sob obrigações contratuais de confidencialidade e segurança”.

A promessa absoluta da superfície de venda contradiz a própria política vinculada. A classificação vem dessa incompatibilidade documental servida, não de suposição sobre fornecedores. O tráfego efetivo de dados em n8n/Supabase não confirmei nesta auditoria.

### C2 — promessas incompatíveis sobre exclusão e retenção

Mesmo GET/inspeção, termos de busca retenção/30 dias/apag.

Saída real da home #planos: “Se não servir, some tudo”; “Desistiu? Você pede e a gente apaga os dados da clínica e as conversas dos pacientes, sem pergunta e sem processo de retenção.” Privacidade §7: dados operacionais “permanecem disponíveis para exportação pela clínica durante 30 dias contados do encerramento e, então, são eliminados”; registros fiscais e contábeis são retidos.

A landing vende ausência de retenção enquanto a política prevê retenção. A execução real de uma exclusão e seu prazo não confirmei; não solicitei nem executei exclusão.

### A1 — contraste de controles de contratação

Passo: axe-core local injetado por page.evaluate, axe.run(document, runOnly tags wcag2a/wcag2aa/wcag21a/wcag21aa/best-practice), em 375 e 1440 px, páginas servidas.

| Página | Seletor | Saída axe | Esperado |
|---|---|---|---|
| /ortopedia/ | .hero-badge | 3.53; #0891b2 sobre #ecfeff; 12 px normal | 4.5:1 |
| /ortopedia/ | .hero-cta e .cta-section > a[href$="/#planos"] | 3.68; branco sobre #0891b2; 16 px normal | 4.5:1 |
| /psicologia/ | .hero-badge | 3.57; #059669 sobre #ecfdf5; 12 px normal | 4.5:1 |
| /psicologia/ | .hero-cta e .cta-section > a[href$="/#planos"] | 3.76; branco sobre #059669; 16 px normal | 4.5:1 |

Mesmos resultados nas duas larguras; regra color-contrast, impacto serious do axe. Reprodução: abrir página, ajustar largura, rodar axe com os tags acima. O teste padrão não visita esses nichos.

### M1 — estrutura de navegação assistiva

Axe complementar em 375 e 1440: /estetica/, /ortopedia/, /psicologia/, /radiologia/ retornam landmark-one-main (“Document does not have a main landmark”) e region, com .hero, .section:nth-child(3), .section:nth-child(4), .cta-section fora de landmarks. /blog/ retorna region em .hero e .cta. Impacto moderate. Não houve teste com leitor de tela real: não confirmei.

### M2 — alvos pequenos

node src/test-responsive-ci.mjs --output-dir screenshots/qa-pos-live/ci retornou 102 ocorrências touch-target-small, zero overflow. O critério do script é dimensão menor que 32 px, não uma auditoria completa de espaçamento WCAG.

| Página | 1920 | 768 | 375 |
|---|---:|---:|---:|
| home | 7 | 7 | 5 |
| briefing | 1 | 1 | 1 |
| login | 1 | 1 | 1 |
| definir-senha | 0 | 0 | 0 |
| esqueci-senha | 1 | 1 | 1 |
| painel público | 0 | 0 | 0 |
| termos | 20 | 20 | 3 |
| privacidade | 15 | 15 | 1 |

Inspeção adicional nos quatro nichos e blog: link de navegação Assinar tem caixa de 50.28 × 17 px em todas as seis larguras; hit-test central true. Os CTAs principais e finais desses sites tiveram hit-test true, sem compra acionada. Os 102 registros contam a mesma interface em várias larguras; não representam 102 bugs distintos.

### M3 — falso PASS da ferramenta de acessibilidade

Comando exigido, da raiz: node src/test-accessibility.mjs.

Saída: ENOENT, arquivo ausente C:\Users\matheus\Desktop\Recepta LP\node_modules\axe-core\axe.min.js; Total tests: 16; Passed: 0; Failed: 0; Errors: 16; OVERALL: PASS; exit_code: 0.

Leitura do repo confirmou que resolve('node_modules/axe-core/axe.min.js') usa cwd e que overallPassed considera apenas totais de violações, sem errors. Isto pode sinalizar sucesso sem auditoria. Nenhum código foi alterado.

Repetição da pasta src: node test-accessibility.mjs --output-dir ../screenshots/qa-pos-live/a11y.

Saída real: Total tests: 16; Passed: 16; Failed: 0; Errors: 0; Critical/Serious/Moderate/Minor issues: 0; OVERALL: PASS; exit_code: 0. Páginas: home, briefing, login, definir-senha, esqueci-senha, painel, termos, privacidade; 1920×1080 e 375×812. Há oito resultados com incomplete=1. Não declarar conformidade completa só por esse PASS.

### B1 — trial dentro de industrial

Busca literal no HTML servido de /termos/ retorna uma ocorrência: “legislação de propriedade industrial aplicável”. Todos os outros termos retornaram zero, inclusive trial nas outras 11 páginas. Não é regressão comercial. Busca por palavra inteira trial elimina esse falso positivo; não oculto a ocorrência da busca solicitada.

### B2 — aviso dispensável

Passo: abrir /?c=abandonado#planos, focar o botão “Dispensar aviso de checkout cancelado”, pressionar Enter.

Antes: div.pricing-err.is-vis role=alert, texto “Checkout cancelado. Sua escolha foi preservada nesta aba.” e button type=button com aria-label. Depois: alerts=0, active='BODY'. A dispensa funciona; nota de continuidade de foco, sem perda de venda comprovada. Não foi criada sessão cancelada para produzir o aviso.

## Responsividade e inspeção visual

Comandos existentes, da raiz:

```powershell
node src/test-responsive-ci.mjs --output-dir screenshots/qa-pos-live/ci
node src/check-hero-breakpoints.mjs
```

Saídas reais: responsivo 24/24 Passed, Failed 0, Errors 0, Total issues 102, Critical issues 0, OVERALL PASS (limiar permissivo para alvos). Hero: “Todos os 8 breakpoints OK”, 320/375/719/720/768/1024/1440/1920. Stack abaixo de 720; duas colunas acima; CTAs do hero 280×77 em 320 e 376×63 em desktop. Sangria do chat +10 px em 1440/1920, contida no hero e intencional segundo contexto; não classificada como bug.

Complemento executado como código Node via stdin, sem criar script novo: Playwright-core; navegação em produção com networkidle; setViewportSize({width,height:900}); scroll pela página em passos de 700 px para despertar reveals; comparação documentElement.scrollWidth/clientWidth; inspeção de scrollWidth/clientWidth e overflowX hidden/clip nos h1/h2/h3/p/a/button/label/summary; screenshots fullPage em 320 e 1440.

| Página | 320 | 375 | 768 | 1024 | 1440 | 1920 |
|---|---|---|---|---|---|---|
| / | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |
| /estetica/ | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |
| /ortopedia/ | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |
| /psicologia/ | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |
| /radiologia/ | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |
| /blog/ | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |
| /termos/ | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |
| /privacidade/ | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |
| /briefing | 320/320 | 375/375 | 768/768 | 1024/1024 | 1440/1440 | 1920/1920 |

Cada célula: largura cliente/scroll; clipped=[] em todas. Inspeção humana das capturas de nichos/blog em 320/1440 e Termos/Privacidade em 320, além da home e gate. Capturas fullPage após scroll podem incluir o header fixo no meio da imagem e reveals em transição: não classificadas como defeito sem reprodução na viewport. Revisão visual de cada pixel em todas as seis larguras, outros navegadores, dispositivos físicos e zoom: não confirmei.

Inspeção dos dois CTAs de compra via #planos a.btn, após scrollIntoViewIfNeeded, elementFromPoint no centro: true em 24 verificações (2 CTAs × mensal/anual × 6 larguras). Em 320: Essencial x=45..275, 230×79.59; Completo x=46..274, 228×79.59; em 375: 285/283×54.80; desktop 348/346×54.80. href='#' com handler JS inspecionado; nenhuma ativação realizada. A passagem de foco inicial usou focus() para isolar controles; percurso completo por Tab desde o topo não confirmei.

## Seletor de planos por teclado

Passo real: foco no primeiro [role=radio]; keyboard.press nas seis teclas; leitura de aria-checked/tabIndex/activeElement/:focus-visible/getComputedStyle.

| Tecla | Selecionado e focado | Tabindex selecionado/outro |
|---|---|---|
| ArrowRight | anual | 0 / -1 |
| ArrowLeft | mensal | 0 / -1 |
| End | anual | 0 / -1 |
| Home | mensal | 0 / -1 |
| ArrowDown | anual | 0 / -1 |
| ArrowUp | mensal | 0 / -1 |

Sempre um aria-checked=true e outro false. :focus-visible=true no selecionado; outline rgb(16,16,16) auto 1px; screenshot confirmou contorno. Mensal mostra R$497/R$997, cobrança hoje e renovação mensal. End troca para R$4.164/R$8.364 por ano, equivalentes R$347/R$697 por mês, texto “Você paga ... hoje” e renovação anual. Não testei contratação; não confirmei checkout válido nesta auditoria, por proibição explícita.

## Gates sem criação de dado

GET com fetch(...,{redirect:'manual'}), sem cookie/sessão. POST com JSON e Content-Type application/json.

| Requisição | Saída real |
|---|---|
| GET /briefing sem pedido | 200; texto “Escolha seu plano antes de configurar”; forms visíveis=0, inputs/selects/textareas visíveis=0 nas seis larguras |
| POST /api/submit {} | 400 {"erro":"pedido_invalido"} |
| POST /api/submit {"pedido":null} | 400 {"erro":"pedido_invalido"} |
| POST /api/submit {"pedido":"lixo"} | 400 {"erro":"pedido_invalido"} |
| POST /api/checkout {} | 400 {"erro":"tier_ou_ciclo_invalido"} |
| GET /clinica/painel | 302; Location: /clinica/login |
| GET /clinic-react/ | 404 |
| GET /t/ | 404 |

Gate #semPedido também contém links /#planos e /; nova captura após 1500 ms confirmou texto explicativo. Abrir briefing com pedido UUID válido ou fluxo pago não confirmei, para não consultar/acionar pedido existente.

## HTML servido: copy e links

GETs por fetch, processamento do corpo HTML integral (não innerText nem fonte local), regex case-insensitive:

```js
/grátis|gratuito|gratuita|sem cartão|sem compromisso|trial|dias de teste|período de teste|experimente/gi
/href\s*=\s*["']([^"']*briefing[^"']*)["']/gi
```

| Página servida (HTTP 200 em todas) | Ocorrências de copy | href contendo briefing |
|---|---:|---:|
| / | 0 | 0 |
| /estetica/ | 0 | 0 |
| /ortopedia/ | 0 | 0 |
| /psicologia/ | 0 | 0 |
| /radiologia/ | 0 | 0 |
| /blog/ | 0 | 0 |
| /blog/erros-clinicas-atendimento/ | 0 | 0 |
| /blog/ia-whatsapp-atendimento/ | 0 | 0 |
| /blog/secretaria-virtual-clinica/ | 0 | 0 |
| /termos/ | 1: industrial (B1) | 0 |
| /privacidade/ | 0 | 0 |
| /briefing | 0 | 0 |

“Quatro páginas de blog” foi interpretado como índice + três artigos, confirmados no sitemap. Nenhum link perigoso para briefing foi encontrado nessas nove superfícies comerciais. Inspeção do repo com rg nos HTML dessas pastas, palavras de copy e href briefing, também não retornou ocorrência com trial delimitado por palavra. Fonte local usada apenas para diagnóstico do script e handlers; produção prevalece, pois há edição concorrente.

## SEO e dados estruturados

Passo: GET /, extração do script type=application/ld+json por regex e JSON.parse; GET /sitemap.xml e /robots.txt, ambos 200.

Saída: um bloco JSON-LD válido, @graph com cinco entidades: Organization, WebSite, WebPage, [SoftwareApplication,Service] e FAQPage. Quatro Offers:

| Offer | price | Moeda | billingDuration / billingIncrement | Equivalente anual na description |
|---|---:|---|---|---|
| Essencial mensal | 497.00 | BRL | 1 / 1 | — |
| Completo mensal | 997.00 | BRL | 1 / 1 | — |
| Essencial anual | 4164.00 | BRL | 12 / 12 | R$347/mês |
| Completo anual | 8364.00 | BRL | 12 / 12 | R$697/mês |

Em todas: hasMerchantReturnPolicy @type MerchantReturnPolicy, applicableCountry BR, returnPolicyCategory MerchantReturnFiniteReturnWindow, merchantReturnDays 7, refundType FullRefund. Os totais coincidem com o DOM mensal/anual observado. Essas propriedades não detalham marco na ativação/fallback 30 dias; a FAQ descreve o marco, mas a aceitação semântica pelo Google não confirmei.

Sitemap contém 11 URLs: home, termos, privacidade, índice do blog, três artigos, quatro nichos; lastmod 2026-09-15 em todas. Nenhuma URL de briefing/painel/clinica/api.

robots.txt servido:

```text
User-agent: *
Allow: /
Allow: /blog/
Disallow: /api/
Disallow: /t/
Disallow: /briefing
Disallow: /painel
Disallow: /clinica/

Sitemap: https://www.receptaai.com.br/sitemap.xml
```

As quatro áreas pedidas continuam fora do sitemap e bloqueadas no robots. Estado efetivo de indexação no Google/Search Console não confirmei: robots não prova desindexação.

Tentativa de abrir https://search.google.com/test/rich-results?url=https%3A%2F%2Fwww.receptaai.com.br%2F pela ferramenta web: “Internal Error”, URL “is not safe to open (non-retryable error)”. Resultado Rich Results Google: **não confirmei**. JSON.parse válido não prova elegibilidade para rich snippets.

## Limites e artefatos

Não confirmei compra/pareamento/claim/reembolso real, health 13/13 nesta run (informado no contexto, não repetido), conformidade jurídica das promessas, envio real de dados, baseline analytics, indexação e Rich Results. Nos complementos Playwright, requisições /api/** foram abortadas para evitar efeitos e contaminação de analytics; os scripts existentes foram executados como estão e podem carregar o analytics da produção. Não enviei evento QA válido manualmente.

Artefatos locais não commitados: screenshots/qa-pos-live/matrix.json (54 resultados), axe-extra.json (10 resultados com seletores e contrastes), ci/report.json, a11y/a11y-report.json, visual/*.png, keyboard.png, brief-fresh.png; screenshots/hero/*.png; screenshots/a11y/a11y-report.json registra a primeira execução com erro. Não remover artefatos preexistentes nem arquivos de outros agentes.

Uma tentativa complementar de inspeção de CTA falhou por strict mode (três anchors /#planos). Foi repetida iterando todos os anchors e concluiu. Tentativas de selecionar CTAs como button/data-tier ou por getByRole(link) retornaram coleção inadequada/vazia; a inspeção final usou #planos a.btn e mediu os anchors reais, sem ativá-los. Nenhuma falha da instrumentação foi contada como bug do produto.
