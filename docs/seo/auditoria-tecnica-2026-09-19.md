# Auditoria técnica SEO — páginas publicadas

> **Data:** 2026-09-19 · **Fonte:** páginas servidas em `https://www.receptaai.com.br` (produção, não arquivos locais) · Lote do commit `7beb5cc` + páginas atualizadas.
> Método: fetch HTTP das 24 URLs + análise estática do HTML + PageSpeed Insights (lab, mobile). CrUX field data ainda não existe para páginas novas.

## Resumo

| Métrica | Valor |
| --- | --- |
| Páginas auditadas | 24/24 |
| Erros de fetch | nenhum |
| Issues P0 (crítico) | 0 |
| Issues P1 (alto) | 8 |
| Issues P2 (médio/baixo) | 113 |
| Titles duplicados | nenhum |
| Descriptions duplicadas | nenhuma |

## Correções aplicadas (mesmo dia)

> Commit `1474086`, deploy prod + aliases verificados via curl (og:image=1 nas
> amostras; `"image"` presente no BlogPosting live).

- **Resolvido (P1):** `BlogPosting.image` adicionado nos 8 posts.
- **Resolvido (P2 sistêmico):** `og:type/title/description/url/locale/site_name/image(+dim/alt)` e `twitter:card/title/description/image` inseridos nas 23 páginas que não tinham — elimina ~69 achados P2 desta lista (as seções abaixo registram o estado **anterior** à correção).
- **Pendentes (P2):** 8 titles >65 car., 14 descriptions >170 car., conteúdo de especialidades ~305–400 palavras, `defer` no `/analytics.js` da home.

## robots.txt e sitemap

- robots.txt: presente, com diretiva `Sitemap:`
  - `User-agent: *`
  - `Disallow: /api/`
  - `Disallow: /t/`
  - `Disallow: /briefing`
  - `Disallow: /painel`
  - `Disallow: /clinica/`
  - `Sitemap: https://www.receptaai.com.br/sitemap.xml`
- sitemap.xml: 26 URLs · lastmod de 2026-09-15 a 2026-09-18

## Paridade live × local (amostra md5)

- `/` → **IDÊNTICOS**
- `/cardiologia/` → **IDÊNTICOS**
- `/blog/reduzir-no-show-consultas/` → **IDÊNTICOS**

## Detalhe por página

| Página | Tipo | Title | Desc | Canonical | H1 | H2/H3 | Palavras | Imgs (s/alt · s/dim) | Schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | home | 59 car. | 213 car. | ✓ | 1 | 10/23 | 2185 | 0 (0 · 0) | Organization, WebSite, WebPage, SoftwareApplication+Service, FAQPage |
| /quanto-custa-secretaria-virtual-clinica/ | BOFU | 66 car. | 171 car. | ✓ | 1 | 4/6 | 515 | 0 (0 · 0) | FAQPage |
| /recepta-vs-concorrentes/ | BOFU | 69 car. | 153 car. | ✓ | 1 | 6/11 | 756 | 0 (0 · 0) | FAQPage |
| /cardiologia/ | especialidade | 48 car. | 179 car. | ✓ | 1 | 4/9 | 333 | 0 (0 · 0) | FAQPage |
| /dermatologia/ | especialidade | 61 car. | 174 car. | ✓ | 1 | 4/9 | 346 | 0 (0 · 0) | FAQPage |
| /fisioterapia/ | especialidade | 49 car. | 179 car. | ✓ | 1 | 4/9 | 350 | 0 (0 · 0) | FAQPage |
| /ginecologia/ | especialidade | 62 car. | 184 car. | ✓ | 1 | 4/9 | 347 | 0 (0 · 0) | FAQPage |
| /nutricao/ | especialidade | 50 car. | 186 car. | ✓ | 1 | 4/9 | 365 | 0 (0 · 0) | FAQPage |
| /odontologia/ | especialidade | 59 car. | 180 car. | ✓ | 1 | 4/9 | 362 | 0 (0 · 0) | FAQPage |
| /oftalmologia/ | especialidade | 49 car. | 184 car. | ✓ | 1 | 4/9 | 394 | 0 (0 · 0) | FAQPage |
| /pediatria/ | especialidade | 46 car. | 177 car. | ✓ | 1 | 4/9 | 346 | 0 (0 · 0) | FAQPage |
| /estetica/ | especialidade | 57 car. | 177 car. | ✓ | 1 | 4/9 | 305 | 0 (0 · 0) | FAQPage |
| /ortopedia/ | especialidade | 62 car. | 197 car. | ✓ | 1 | 4/9 | 311 | 0 (0 · 0) | FAQPage |
| /psicologia/ | especialidade | 47 car. | 186 car. | ✓ | 1 | 4/9 | 331 | 0 (0 · 0) | FAQPage |
| /radiologia/ | especialidade | 59 car. | 176 car. | ✓ | 1 | 4/10 | 335 | 0 (0 · 0) | WebPage, FAQPage |
| /blog/ | hub | 63 car. | 120 car. | ✓ | 1 | 10/0 | 336 | 0 (0 · 0) | — |
| /blog/agenda-vazia-clinica/ | post | 85 car. | 195 car. | ✓ | 1 | 6/1 | 538 | 0 (0 · 0) | BlogPosting |
| /blog/confirmacao-consulta-whatsapp/ | post | 76 car. | 190 car. | ✓ | 1 | 7/1 | 502 | 0 (0 · 0) | BlogPosting |
| /blog/ia-vs-secretaria-clt/ | post | 70 car. | 201 car. | ✓ | 1 | 5/1 | 575 | 0 (0 · 0) | BlogPosting |
| /blog/reduzir-no-show-consultas/ | post | 76 car. | 203 car. | ✓ | 1 | 8/1 | 565 | 0 (0 · 0) | BlogPosting |
| /blog/whatsapp-clinica-fora-do-horario/ | post | 82 car. | 188 car. | ✓ | 1 | 7/1 | 551 | 0 (0 · 0) | BlogPosting |
| /blog/erros-clinicas-atendimento/ | post | 68 car. | 114 car. | ✓ | 1 | 7/1 | 306 | 0 (0 · 0) | BlogPosting |
| /blog/ia-whatsapp-atendimento/ | post | 60 car. | 134 car. | ✓ | 1 | 5/4 | 416 | 0 (0 · 0) | BlogPosting |
| /blog/secretaria-virtual-clinica/ | post | 68 car. | 127 car. | ✓ | 1 | 7/5 | 404 | 0 (0 · 0) | BlogPosting |

## Issues por página

### `/`
- P2 description longa (213)

### `/quanto-custa-secretaria-virtual-clinica/`
- P2 title longo (66)
- P2 description longa (171)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente

### `/recepta-vs-concorrentes/`
- P2 title longo (69)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente

### `/cardiologia/`
- P2 description longa (179)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (333 palavras, mín 350 p/ especialidade)

### `/dermatologia/`
- P2 description longa (174)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (346 palavras, mín 350 p/ especialidade)

### `/fisioterapia/`
- P2 description longa (179)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente

### `/ginecologia/`
- P2 description longa (184)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (347 palavras, mín 350 p/ especialidade)

### `/nutricao/`
- P2 description longa (186)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente

### `/odontologia/`
- P2 description longa (180)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente

### `/oftalmologia/`
- P2 description longa (184)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente

### `/pediatria/`
- P2 description longa (177)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (346 palavras, mín 350 p/ especialidade)

### `/estetica/`
- P2 description longa (177)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (305 palavras, mín 350 p/ especialidade)

### `/ortopedia/`
- P2 description longa (197)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (311 palavras, mín 350 p/ especialidade)

### `/psicologia/`
- P2 description longa (186)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (331 palavras, mín 350 p/ especialidade)

### `/radiologia/`
- P2 description longa (176)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (335 palavras, mín 350 p/ especialidade)

### `/blog/`
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente

### `/blog/agenda-vazia-clinica/`
- P2 title longo (85)
- P2 description longa (195)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (538 palavras, mín 700 p/ post)
- P1 schema: BlogPosting: sem image

### `/blog/confirmacao-consulta-whatsapp/`
- P2 title longo (76)
- P2 description longa (190)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (502 palavras, mín 700 p/ post)
- P1 schema: BlogPosting: sem image

### `/blog/ia-vs-secretaria-clt/`
- P2 title longo (70)
- P2 description longa (201)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (575 palavras, mín 700 p/ post)
- P1 schema: BlogPosting: sem image

### `/blog/reduzir-no-show-consultas/`
- P2 title longo (76)
- P2 description longa (203)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (565 palavras, mín 700 p/ post)
- P1 schema: BlogPosting: sem image

### `/blog/whatsapp-clinica-fora-do-horario/`
- P2 title longo (82)
- P2 description longa (188)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (551 palavras, mín 700 p/ post)
- P1 schema: BlogPosting: sem image

### `/blog/erros-clinicas-atendimento/`
- P2 title longo (68)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (306 palavras, mín 700 p/ post)
- P1 schema: BlogPosting: sem image

### `/blog/ia-whatsapp-atendimento/`
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (416 palavras, mín 700 p/ post)
- P1 schema: BlogPosting: sem image

### `/blog/secretaria-virtual-clinica/`
- P2 title longo (68)
- P2 og:image ausente
- P2 og:url ausente
- P2 twitter:card ausente
- P2 conteúdo fino (404 palavras, mín 700 p/ post)
- P1 schema: BlogPosting: sem image


## Core Web Vitals

> PageSpeed Insights API retornou HTTP 429 — quota diária esgotada sem API key
> ("Queries per day", reinicia à meia-noite PT). Rodar amanhã ou manualmente em
> https://pagespeed.web.dev/. Em substituição, análise estática de render:

| Página | CSS externo | JS externo | Risco CWV |
| --- | --- | --- | --- |
| Especialidades (12) e posts (8) | 1 | **0** | Mínimo — CSS inline, sem JS de terceiros, zero `<img>` (SVG inline = CLS ~0) |
| `/blog/` (hub) | 1 | 0 | Mínimo |
| Home | 2 | 4 (`page-transition` e `smooth-scroll`/`lenis` com `defer`; **`/analytics.js` sem defer — bloqueante**) | Baixo — único ponto de bloqueio do site |

- Nenhuma página usa `<img>` raster → sem riscos de dimensões ausentes, lazy loading ou formatos modernos no lote novo.
- LCP nas páginas novas tende a ser texto/CSS puro (hero) → sem dependência de imagem hero.
- Único ajuste CWV sugerido: adicionar `defer` a `/analytics.js` na home (pré-existente, não é do lote SEO).
