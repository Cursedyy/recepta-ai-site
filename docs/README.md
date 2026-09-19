# docs/ — o que é vivo e o que é histórico

Regra do projeto (`AGENTS.md`): **doc não é fonte de estado.** Estado vem do
sistema real (n8n API, Supabase, `curl` no site) e do que já foi verificado na
memória do projeto (`.agentsroom/memory/`, comece pelo `INDEX.md`).

| Arquivo                          | Estado                                   | Ler quando                                                                                              |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `runbook-producao.md`            | **vivo** (auditado no n8n em 2026-08-28) | Operar produção: quem é dono de quê, procedimento do webhook Stripe                                     |
| `previews/*.html`                | **vivo**                                 | Revisar CSS do painel sem estar logado. Ficam fora de `src/` de propósito, para não virarem URL pública |
| `prd/agenda-integracao-plano.md` | superado                                 | Só para entender a decisão original da agenda                                                           |
| `prd/planilha-agenda-modelo.md`  | superado                                 | Só para o formato da planilha                                                                           |
| `prd/briefing-fase0-brief.md`    | histórico                                | Só para entender por que o briefing encurtou                                                            |
| `prd/test-plan.md`               | histórico                                | Rodada de QA de 2026-08-15, não é a suíte atual                                                         |

Nada em `prd/` descreve o sistema de hoje. Se precisa saber como algo funciona
agora: memória do projeto primeiro, depois o código, depois o sistema ao vivo.
