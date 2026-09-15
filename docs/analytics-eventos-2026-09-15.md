# Analytics do funil — os 10 eventos de `/api/an` (2026-09-15)

Objetivo desta frente (F2): tirar do zero os 7 contadores que a rota
`src/api/an.js` já aceitava e que ninguém emitia. Este documento é a prova de
que cada um sai do ponto certo, com o corpo certo.

**Resultado da auditoria:** os 7 emissores **já estavam no repositório** quando
esta verificação começou — entraram no commit `8967571`
("fix: unblock briefing submission and complete anonymous funnel tracking").
Nenhuma linha de emissão precisou ser escrita aqui. O que faltava era a prova
de navegador dos dois eventos do painel e este documento. Nenhum arquivo de
produto foi alterado nesta passagem.

## Contrato (não mudou)

`src/api/an.js` — `chavesAnalytics()` aceita **apenas** as chaves
`evento`, `tier`, `ciclo`; qualquer campo extra devolve **400 antes de tocar no
Redis**. `tier ∈ {essencial, completo}`, `ciclo ∈ {mensal, anual}`.
Chave `an:<evento>:<YYYY-MM-DD>` (UTC), TTL 180 dias.

O emissor do cliente é `src/analytics.js` (`window.receptaAnalytics`):
allowlist local dos 10 eventos, filtra `tier`/`ciclo` por enum, `fetch` com
`credentials: "omit"`, `keepalive: true`, `.catch()` vazio dentro de
`try/catch`. Sem `await` no caminho do clique, sem cookie, sem identificador.
Casa com a promessa da seção 10 da Política de Privacidade
(`src/privacidade/index.html:445-461`) — **a promessa não precisou mudar**.

## Tabela evento → gatilho → arquivo:linha → prova

| Evento                    | Gatilho real                                                                       | Arquivo:linha                             | Corpo observado                                                     |
| ------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `visit` (legado)          | carregamento da landing                                                            | `src/index.html:5781`                     | `{"evento":"visit"}`                                                |
| `cta_planos` (legado)     | 1º clique em `.pricing-card .btn` (dedup por `dataset.anCta`)                      | `src/index.html:5790`                     | `{"evento":"cta_planos"}`                                           |
| `checkout_start` (legado) | clique no CTA de plano, **antes** do `fetch`                                       | `src/index.html:5797` (chamado em `5916`) | `{"evento":"checkout_start"}`                                       |
| `ciclo_alterado`          | troca mensal↔anual no radiogroup, só quando o estado muda                          | `src/index.html:5858`                     | `{"evento":"ciclo_alterado","ciclo":"anual"}`                       |
| `checkout_iniciado`       | resposta OK de `/api/checkout` com `url` (sessão Stripe criada), antes do redirect | `src/index.html:5931`                     | `{"evento":"checkout_iniciado","tier":"essencial","ciclo":"anual"}` |
| `checkout_abandonado`     | retorno do Stripe em `/?c=abandonado#planos`                                       | `src/index.html:5876`                     | `{"evento":"checkout_abandonado","ciclo":"anual"}`                  |
| `briefing_iniciado`       | 1º `input` no formulário (`{once:true}`), só com `?pedido=<uuid>` válido           | `src/briefing/index.html:1923`            | `{"evento":"briefing_iniciado"}`                                    |
| `briefing_enviado`        | `/api/submit` respondeu OK e o JSON foi lido                                       | `src/briefing/index.html:2520`            | `{"evento":"briefing_enviado"}`                                     |
| `whatsapp_conectado`      | polling autenticado detecta a transição desconectado→conectado                     | `src/clinica/painel.js:2164`              | `{"evento":"whatsapp_conectado"}`                                   |
| `reembolso_solicitado`    | `/api/clinica/painel-acoes` devolveu `ok` **com** `registrado_em`                  | `src/clinica/painel.js:1413`              | `{"evento":"reembolso_solicitado"}`                                 |

### Por que `checkout_iniciado` fica depois do `fetch`

A instrução original pedia "antes do fetch". Antes do `fetch` já existe
`checkout_start` (`5797`), que não pode quebrar. Emitir os dois no mesmo ponto
criaria dois contadores idênticos e jogaria fora um sinal. Do jeito que está:

- `checkout_start` = cliques no CTA (tentativas)
- `checkout_iniciado` = sessões Stripe criadas, **com `tier` e `ciclo`**
- diferença entre os dois = taxa de falha de `/api/checkout`
- `checkout_abandonado` = voltou do Stripe sem pagar

Sem essa separação não dá para distinguir "a API do checkout quebrou" de
"o cliente desistiu". Decisão registrada aqui de propósito, porque diverge da
letra da instrução.

## Provas executadas

Todas locais, com I/O mockada. **Nenhuma requisição foi para produção** — um
beacon real contaminaria o contador do dia.

| Prova                          | Comando                                                                        | Resultado                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Sintaxe                        | `node --check` em `src/analytics.js`, `src/clinica/painel.js`, `src/api/an.js` | OK                                                                                   |
| Suite do repo                  | `npm test` (`scripts/test-checkout-f5.mjs`)                                    | `OK: 4 combinações, contrato, consentimento, reativação e compensações.`             |
| Navegador — landing + briefing | `node scripts/test-funnel-frontend.mjs`                                        | PASS                                                                                 |
| Navegador — painel             | harness no scratchpad (ver abaixo)                                             | PASS                                                                                 |
| Acessibilidade                 | `cd src && node test-accessibility.mjs`                                        | 16/16 PASS, 0 critical/serious/moderate/minor                                        |
| Âncoras                        | `cd src && node check-ancoras.mjs`                                             | PASS nos 3 caminhos (Lenis, reduced-motion, CDN fora), folgas 11–12px, variação ≤1px |

Os dois scripts em `src/` **só funcionam com `cwd = src/`** (`check-ancoras.mjs`
usa `process.cwd()` como raiz do servidor estático e `axe-core` vive em
`src/node_modules`). Rodar da raiz dá erro de ambiente, não regressão.

### Corpos capturados — landing e briefing

`scripts/test-funnel-frontend.mjs` (roteia tudo para fixtures locais; `/api/an`,
`/api/checkout` e `/api/submit` são interceptados):

```
[{"evento":"visit"},
 {"evento":"ciclo_alterado","ciclo":"anual"},
 {"evento":"cta_planos"},
 {"evento":"checkout_start"},
 {"evento":"checkout_iniciado","tier":"essencial","ciclo":"anual"},
 {"evento":"visit"},
 {"evento":"checkout_abandonado","ciclo":"anual"},
 {"evento":"briefing_iniciado"},
 {"evento":"briefing_enviado"}]
```

Além do corpo, esse harness prova: dois cliques em "anual" emitem
`ciclo_alterado` **uma** vez; `/briefing` sem `?pedido` mostra o gate e emite
**zero** `briefing_iniciado`; `fetch` que joga exceção não derruba a página;
campo extra (`pedido`, `telefone`) não sai no corpo; zero erro de JS.

### Corpos capturados — painel

O harness de `scripts/` só cobria os dois eventos do painel por **regex no
código-fonte**, não por execução. Esta passagem fechou essa lacuna com um
harness de navegador que renderiza o HTML **real** do painel (importa
`paginaPainel` de `src/api/clinica/painel-view.js` pelo mesmo truque de
`src/test-painel-script.mjs`) e carrega o `src/clinica/painel.js` **real**:

```
DEBUG acao html: <button …>Gerenciar assinatura</button><button …>Pedir reembolso (garantia de 7 dias)</button>
corpos observados em /api/an: [{"evento":"whatsapp_conectado"},{"evento":"reembolso_solicitado"}]
PASS: whatsapp_conectado (1x, so na transicao, polling parou) e reembolso_solicitado
      (1x, so com registrado_em); zero erro de JS; toda I/O mockada.
```

O que ele prova, além do corpo:

- `whatsapp_conectado` **não** sai no carregamento de um painel já conectado —
  a checagem inicial (`painel.js:2181`) não emite; só o polling
  (`verificarConexao`) emite, e ele só liga quando a instância está
  desconectada. Emitir na checagem inicial transformaria o contador em
  pageview de painel conectado.
- Depois de conectar, o polling é desligado: 20s a mais (>1 intervalo de 15s)
  sem nova chamada e sem segundo evento.
- `reembolso_solicitado` sai uma vez, condicionado a `x.j.registrado_em`:
  um 409 "já reembolsado" não conta.

O harness vive no scratchpad da sessão (`prova-painel-eventos.mjs`), não no
repo: `scripts/` é frente de outro agente nesta rodada.

## Achado que NÃO foi corrigido (fora da lista de arquivos desta frente)

`src/test-painel-script.mjs` **está falhando**:

```
FALHA HTML carrega /clinica/painel.js
1 falha(s). O painel da clinica nao roda no browser.
```

Causa verificada: o teste afirma a tag literal
`<script src="/clinica/painel.js?v=20260910-tabler"></script>`, mas o commit
`8967571` (o da instrumentação) subiu a query para `?v=20260915-f2`
(`src/api/clinica/painel-view.js:654`). É assertion velha, não painel quebrado —
o harness de navegador acima carrega o painel real e renderiza tudo sem um único
erro de JS. Correção de uma linha: afirmar por regex
(`/clinica\/painel\.js\?v=/`) em vez do literal. Não aplicada porque
`src/test-painel-script.mjs` está fora dos arquivos desta frente.

## Não confirmei

- **Contadores reais no Upstash.** As env `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` não estão disponíveis para este agente, então o
  baseline de produção não foi lido. `scripts/read-analytics-baseline.mjs` faz
  a leitura quando as env existirem.
- **Emissão em produção.** Nenhum beacon foi disparado contra
  `www.receptaai.com.br` de propósito. Que o contador do dia sobe em produção
  só se confirma lendo o Redis.
