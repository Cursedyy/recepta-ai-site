# Checklist — Solicitar indexação no Search Console

> Lote publicado em 2026-09-19 (commit `7beb5cc`, deploy prod + aliases ok).
> Caminho no GSC: **Inspeção de URL** → colar a URL → **Solicitar indexação**.
>
> Quota do GSC é limitada (~12 validações/dia). Bater as URLs em **3 dias** na
> ordem abaixo. Marcar ☐ ao concluir — não repetir no mesmo dia.

## Dia 1 — BOFU (conversão)

- [ ] `https://www.receptaai.com.br/quanto-custa-secretaria-virtual-clinica/`
- [ ] `https://www.receptaai.com.br/recepta-vs-concorrentes/`
- [ ] `https://www.receptaai.com.br/blog/reduzir-no-show-consultas/`
- [ ] `https://www.receptaai.com.br/blog/ia-vs-secretaria-clt/`
- [ ] `https://www.receptaai.com.br/blog/whatsapp-clinica-fora-do-horario/`
- [ ] `https://www.receptaai.com.br/blog/confirmacao-consulta-whatsapp/`
- [ ] `https://www.receptaai.com.br/blog/agenda-vazia-clinica/`
- [ ] `https://www.receptaai.com.br/blog/` (hub atualizado)

## Dia 2 — Especialidades novas + home

- [ ] `https://www.receptaai.com.br/cardiologia/`
- [ ] `https://www.receptaai.com.br/dermatologia/`
- [ ] `https://www.receptaai.com.br/fisioterapia/`
- [ ] `https://www.receptaai.com.br/ginecologia/`
- [ ] `https://www.receptaai.com.br/nutricao/`
- [ ] `https://www.receptaai.com.br/odontologia/`
- [ ] `https://www.receptaai.com.br/oftalmologia/`
- [ ] `https://www.receptaai.com.br/pediatria/`
- [ ] `https://www.receptaai.com.br/` (home — novos links no footer)

## Dia 3 — Páginas atualizadas

- [ ] `https://www.receptaai.com.br/estetica/`
- [ ] `https://www.receptaai.com.br/ortopedia/`
- [ ] `https://www.receptaai.com.br/psicologia/`
- [ ] `https://www.receptaai.com.br/radiologia/`
- [ ] `https://www.receptaai.com.br/blog/erros-clinicas-atendimento/`
- [ ] `https://www.receptaai.com.br/blog/ia-whatsapp-atendimento/`
- [ ] `https://www.receptaai.com.br/blog/secretaria-virtual-clinica/`
- [ ] *(opcional)* `https://www.receptaai.com.br/privacidade`
- [ ] *(opcional)* `https://www.receptaai.com.br/termos`

## Depois de todas

1. Verificar em 2–3 dias o relatório **Páginas** do GSC: as 15 novas devem
   aparecer como "Encontrada — indexada" ou em processamento.
2. Se alguma ficar presa em "Descoberta — sem indexação" após 2 semanas,
   avaliar: link interno adicional de página já indexada + atualizar `lastmod`.
3. Meta do plano: 100 cliques/mês por URL BOFU em 90 dias — revisar na
   medição quinzenal de `docs/seo/plano-conteudo.md`.
