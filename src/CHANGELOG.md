# Changelog — Recepta AI

Registro de mudanças significativas do projeto.

---

## 2026-08-25 — Redesign visual do briefing

**Commit:** `6416e63`
**Arquivo:** `src/briefing/index.html`

### O que mudou

Redesign visual completo da página de briefing inspirado no Multi-step Wizard do 21st.dev.

#### Stepper conectado
- Steps com linhas conectoras (`.step-connector`) que preenchem ao avançar
- Checkmark SVG nos steps concluídos (em vez de números)
- Glow animado no step ativo (ring roxo + scale 1.08)

#### Cards de seção
- Border-radius 16px
- Sombras sutis com elevação ao hover (`shadow-sm` → `shadow-lg`)

#### Completion screen (novo)
- Tela de sucesso com ícone check verde animado (`popIn`)
- Card de resumo com todos os dados preenchidos
- Esconde footer, stepper e nota ao enviar

#### Campos de formulário
- Bordas 1.5px com hover states
- Focus ring roxo com glow (`accent-glow`)
- Checkboxes customizadas com circles animados
- Select com ícone SVG limpo

#### Micro-interações
- Badge "Teste grátis" com dot pulsante
- Título com gradiente no "secretária virtual"
- Botão principal com gradiente e shimmer no hover
- Save flag com animação de slide-up

#### Fonte e paleta
- Fonte: Inter substituindo Manrope
- Paleta indigo-based: `--accent: #4f46e5`, `--accent-2: #818cf8`
- Success green: `--success: #10b981`

### Memória do projeto atualizada
- Nota `briefing` na pasta `features` atualizada com seção "Visual Redesign"

---

## 2026-08-25 — Fase 0: briefing encurtado

**Commit:** `f3da2e0`

### O que mudou
- Briefing encurtado de 8 passos/43 campos para **2 passos/9 campos**
- Campo `cnpj` mantido obrigatório (backend n8n exige 14 dígitos)
- Validação do aceite corrigida: exige TODOS os checkboxes marcados
- 34 campos removidos saíram do DOM (não escondidos com CSS)
