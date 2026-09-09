# ARQUIVADO — painel React descontinuado

**Não é código ativo. Não edite nada aqui esperando mudar o produto.**

Movido de `src/clinic-react/` para cá em 2026-09-09.

## O que é

Segunda implementação do painel da clínica, em React + Vite + SCSS modules.
Tem os mesmos nomes de feature do painel real (`Agenda.jsx`, `Conversas.jsx`,
`Precos.jsx`, `Horarios.jsx`, `Convenios.jsx`, …) e um `pages/admin/` inteiro.

## Por que foi arquivado

- **Nada o importa.** Zero referências fora da própria pasta.
- **Contradiz a stack do projeto**, que é HTML/CSS/JS vanilla sem build.
- **Estava publicado e quebrado.** Em `src/`, a Vercel servia
  `https://www.receptaai.com.br/clinic-react/` com HTTP 200 — mas o HTML era o
  template de dev do Vite, apontando para `/src/main.jsx`, que não existe em
  produção. Resultado: página em branco no ar. O `dist/` buildado nunca subiu
  (é gitignored).
- Continuava recebendo commits, o que fazia parecer vivo e enganava agentes de
  IA e humanos.

Fora de `src/` ele não pode mais ser publicado: `src/` é o Root Directory do
projeto na Vercel.

## O painel de verdade

`src/clinica/painel.js`, `src/clinica/painel.css`, `src/painel/index.html` e
`src/api/clinica/*`.

## Retomar isso algum dia?

Não há decisão de retomada. Se um dia houver, ela exige: build no pipeline da
Vercel, rota definida, e reverter a regra "sem build" declarada no `AGENTS.md`.
Enquanto isso não acontecer, este diretório é histórico.
