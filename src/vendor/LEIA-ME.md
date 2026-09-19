# vendor/

Dependências de terceiros servidas pelo nosso próprio domínio.

## Por que não CDN

O `script-src` do `vercel.json` já não inclui `unpkg.com`. Antes disso, 8 páginas
carregavam o Lenis de `https://unpkg.com` e **7 delas usavam `lenis@latest`** —
versão não fixada, baixada de um terceiro, executando em `/clinica/login` e
`/clinica/definir-senha`, que são exatamente as telas onde o usuário digita a
senha. Quem publica o pacote podia trocar o conteúdo sem nenhuma revisão nossa.

Servindo do nosso domínio: versão fixa, auditável, sem request a terceiro e sem
uma origem a mais no CSP.

## Arquivos

| Arquivo | Versão | Origem | SHA-256 |
|---|---|---|---|
| `lenis-1.3.26.min.js` | 1.3.26 | `https://unpkg.com/lenis@1.3.26/dist/lenis.min.js` | `53195c9797e7ce7bf9d7fa9242b08209e57f46de4c9dac126a6494fa780e3346` |

Byte a byte o que o upstream serve — nada foi editado, dá pra reconferir o hash.

## Como atualizar

```sh
curl -sL -o src/vendor/lenis-<nova>.min.js https://unpkg.com/lenis@<nova>/dist/lenis.min.js
sha256sum src/vendor/lenis-<nova>.min.js     # anotar na tabela acima
grep -rln 'lenis-1.3.26.min.js' src/          # trocar a referência em todas
```

O arquivo precisa continuar definindo o global `Lenis` (build IIFE/UMD, não
`.mjs`): `src/smooth-scroll.js` testa `typeof Lenis === "undefined"`. O `dist/`
do pacote tem os dois — pegar `lenis.min.js`, não `lenis.mjs`.

O nome carrega a versão de propósito: troca de versão = URL nova = cache velho
não pega.
