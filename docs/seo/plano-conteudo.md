# Plano de Conteúdo SEO — Recepta AI

> Criado em 2026-09-18. Revisão trimestral. Pesquisas de base: SERP "secretária
> virtual clínicas preço", "no-show consultas Brasil", "IA no WhatsApp clínicas".
>
> **Princípio central: BOFU primeiro.** Prioridade para conteúdo que captura
> quem já tem a dor e está comparando solução — não quem só pesquisa conceito.

## Funil e objetivo

- **Objetivo de negócio:** assinaturas (Essencial/Completo, mensal/anual).
- **Métrica norte:** cliques no Search Console nas páginas BOFU + eventos
  `checkout_iniciado` vindos delas.
- **Tese:** o comprador de secretária virtual já sabe que tem problema de
  WhatsApp/recepção. Ele pesquisa: preço, comparação, como resolver no-show,
  "vale a pena". É esse volume que converte — não o topo de funil.

## Dados que fundamentam as escolhas (verificados 2026-09-18)

- Taxa de **no-show no Brasil ~20%** (fontes citam 25–30% em clínicas);
  lembrete automático reduz "até 65%" — dor quantificada = keyword forte.
- Concorrentes diretos ranqueando: Cloudia, Clinia, App Health, Agência do
  Médico, Avie, Doutor.dev (guia técnico). Nenhum domina "quanto custa".
- **People Also Ask** reais do Google: "Quanto custa para ter uma assistente
  virtual?", "Qual o valor da hora de uma assistente virtual?" → demanda de
  preço explícita e sem boa resposta atual.

---

## Fila prioritária (seguir nesta ordem)

### P1 — Posts/páginas BOFU de maior conversão

| # | Página/post | Keyword alvo | Por quê | CTA de conversão |
|---|---|---|---|---|
| 1 | `/quanto-custa-secretaria-virtual-clinica/` | "quanto custa secretária virtual", "preço secretária virtual clínica" | PAA real, concorrentes evitam mostrar preço; nós já temos tabela pública (R$497/347/997/697) — vantagem brutal | Comparativo Essencial vs Completo + checkout direto |
| 2 | `/blog/reduzir-no-show-consultas/` | "como reduzir no-show", "paciente falta na consulta" | Dor quantificada (20–30% da agenda), decisão imediata | Lembretes 24h/3h da Recepta + garantia 7 dias |
| 3 | `/blog/recepta-ai-vs-contratar-secretaria/` | "secretária virtual vale a pena", "IA vs secretária humana" | Quem pesquisa isso está no checkout mental; custo da CLT (R$2.5k+) vs R$347 | Calculadora simples ou tabela comparativa + checkout |
| 4 | `/blog/recepta-ai-vs-concorrentes/` (ou atualizar) | "melhor secretária virtual IA clínica", nomes de concorrentes | Tráfego de comparação é o mais próximo da compra | Tabela honesta de recursos + garantia |

### P2 — Dor específica (médio volume, alta afinidade)

| # | Página/post | Keyword alvo | CTA |
|---|---|---|---|
| 5 | `/blog/whatsapp-clinica-fora-do-horario/` | "atendimento fora do horário clínica", "responder whatsapp madrugada" | 24/7 + garantia |
| 6 | `/blog/confirmação-consulta-whatsapp/` | "confirmação de consulta automática" | Fluxo de confirmação da Recepta |
| 7 | `/blog/como-funciona-ia-atendimento/` (atualizar o existente com números) | "IA atendimento clínica como funciona" | Demo + checkout |
| 8 | `/blog/agenda-vazia-clinica/` | "agenda vazia consultório", "atrair pacientes clínica" | Reativação + agendamento automático |

### P3 — Expansão de especialidades (padrão já validado)

Seguir com: **Ginecologia e Obstetrícia**, **Cardiologia**, **Fisioterapia**,
**Nutrição**, **Oftalmologia** — todas já citadas como chips na home.
Padrão: copiar estrutura de `/dermatologia/` (hero com dor, 6 benefícios, FAQ,
JSON-LD FAQPage, bloco related, cor própria). Atualizar chips da home, footer,
cross-links e sitemap a cada lote.

---

## Regras de execução

1. **Cada página = uma keyword primária**, no title nas primeiras palavras,
   H1 e URL slug. Sem canibalizar páginas existentes.
2. **Toda página BOFU linka para** `/#planos` (2+ CTAs) e para 2 especialidades
   relacionadas. Toda página nova recebe link da home (chips/footer) no mesmo
   deploy — nada de página órfã.
3. **Sitemap + lastmod** atualizados no mesmo commit do conteúdo.
4. **Schema:** BlogPosting nos posts (com datePublished + dateModified),
   FAQPage só quando o FAQ existir de fato na página.
5. **Cadência:** 2 peças por semana (1 BOFU + 1 P2/especialidade). Depois de
   publicar: Inspeção de URL → "Solicitar indexação".
6. **Proibido:** keyword stuffing, página fina sem conteúdo real, promessa
   clínica pela IA (a IA não promete resultado — alinhado ao que o site já diz).

## Medição (a cada 2 semanas)

- Search Console: impressões/cliques das URLs novas vs meta de 100 cliques/mês
  por BOFU em 90 dias.
- GA/eventos: `checkout_iniciado` com origem na página.
- Revisar posições das keywords P1; reescrever o que ficar fora do top 20
  após 60 dias (atualizar conteúdo + dateModified).
