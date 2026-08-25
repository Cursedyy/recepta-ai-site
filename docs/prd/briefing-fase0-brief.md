# Brief Fase 0 — encurtar o briefing (prompt para o front-end)

Colar o bloco abaixo inteiro para quem for executar. É autocontido.

---

## Tarefa

Encurtar o formulário de entrada da Recepta AI de **8 passos / 43 campos** para **2 passos / 9 campos**, sem tocar em backend.

## Contexto do projeto

- Repositório: `recepta-ai-site`. Landing em `src/index.html`, formulário em `src/briefing/index.html`.
- Stack: HTML/CSS/JS **vanilla, sem build, sem framework, sem bundler**. Servido estático pela Vercel. Não introduza React, Tailwind, nem dependência nova — já foi avaliado e recusado.
- Deploy **não sai por push no GitHub**. É manual: `cd src && npx vercel --prod --yes`. Você não precisa deployar; só entregue o arquivo.
- Arquivo único a alterar: `src/briefing/index.html`. O script é inline no HTML.

## Como o formulário funciona hoje

Os passos e campos vivem num array `S` no `<script>` inline. O DOM é gerado a partir de `S` num `forEach` — **não existe markup de campo escrito à mão**. Mexer nos passos = mexer no array.

Cada campo é um objeto:

- `i` id (vira o `name`/`id` do input e a chave no payload)
- `l` label
- `r` obrigatório (`1`)
- `p` placeholder
- `h` texto de ajuda
- `ty` tipo: `text` (default), `email`, `tel`, `ta` (textarea), `select`, `radio`, `check`
- `o` opções (radio/select/check)
- `im` inputmode

Funções relevantes: `showStep(i)`, `validateStep(i)`, `stepReq(i)`, `firstIncompleteStep()`, `renderRail()`, `prog()`. Rascunho salvo em `localStorage` sob a chave `briefing_recepta_v1`.

## O que entregar

Substituir o array `S` por **exatamente 2 passos**, com estes 9 campos e nada mais:

### Passo 1 — título "Sua clínica"

Descrição sugerida: "O mínimo pra sua secretária virtual entrar no ar. Leva menos de um minuto."

| `i`            | `l`                                           | `r` | `ty`                   | `p` / `h`                                                                                                                                                                            |
| -------------- | --------------------------------------------- | --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clinica`      | Nome da clínica                               | 1   | text                   | p: `Ex: Clínica Imagem Diagnóstica`                                                                                                                                                  |
| `whats_resp`   | Seu WhatsApp (com DDD)                        | 1   | tel                    | p: `53 99999-9999` · h: `Pra falar com você durante o teste e pra IA te chamar quando precisar de um humano.`                                                                        |
| `numero`       | Número que a Recepta vai atender (com DDD)    | 1   | tel                    | p: `53 3333-3333` · h: `Pode ser o mesmo do campo acima.`                                                                                                                            |
| `cnpj`         | CNPJ da clínica                               | 1   | text + `im: "numeric"` | p: `00.000.000/0000-00` · h: `Usamos só pra travar teste grátis repetido no mesmo CNPJ.`                                                                                             |
| `endereco`     | Endereço completo da clínica                  | 1   | ta                     | h: `A IA vai passar isso pro paciente. Inclua ponto de referência.`                                                                                                                  |
| `servicos`     | Exames / consultas / procedimentos oferecidos | 1   | ta                     | p: `Ultrassonografia abdominal` + quebra + `Raio-X de tórax` + quebra + `Mamografia` · h: `Um por linha, com o nome que o paciente usa. A IA só confirma o que estiver nesta lista.` |
| `convenios`    | Convênios aceitos                             | 1   | ta                     | p: `Unimed` + quebra + `Ipê Saúde` + quebra + `Particular` · h: `Um por linha. Se atende particular, escreva "Particular" na lista.`                                                 |
| `horario_func` | Horário de funcionamento                      | 1   | ta                     | p: `Seg a sex 8h-18h, sáb 8h-12h`                                                                                                                                                    |

### Passo 2 — título "Confirmação"

| `i`      | `l`         | `r` | `ty`  | `o`                                                                                                                                                        |
| -------- | ----------- | --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aceite` | Confirmação | 1   | check | `["Autorizo o uso destas informações para configurar meu atendimento durante o teste", "Vou desligar as respostas automáticas do número durante o teste"]` |

**Os outros 34 campos devem ser DELETADOS do array `S`.** Não esconder com CSS, não deixar `r: 0` renderizando invisível: sair do DOM. Menos campo no payload = prompt da IA mais enxuto, e o pipeline já sabe escalar o que ela não souber.

## Restrições duras

1. **NÃO remova o campo `cnpj`.** Ele parece o campo de maior atrito do funil e a intenção é tirá-lo — mas o backend (n8n) hoje reprova o cadastro sem CNPJ de 14 dígitos. Ele sai numa fase posterior, junto com a mudança no backend. Removê-lo agora quebra 100% dos cadastros.
2. **Não mude a chave do localStorage** (`briefing_recepta_v1`) nem os `i` dos campos que ficam. Isso preserva rascunhos de quem já começou a preencher: campo removido simplesmente deixa de ser lido, sem erro.
3. **Não mexa no payload enviado** (`fetch("/api/submit")`, objeto com `campos` + `bruto`). O backend depende do formato atual.
4. **Fonte de input não pode ficar abaixo de 16px no mobile.** Existe media query em `max-width: 640px` forçando `font-size: 16px` — abaixo disso o Safari iOS dá zoom automático ao focar o campo. Não baixar.
5. **Valide a sintaxe do JS depois de editar.** O script é inline; extraia o bloco `<script>` e rode `node --check`. Prettier formata mas não acusa erro de JS.

## Bug para corrigir na mesma passada

O campo `aceite` é `ty: "check"` com `r: 1`, e a função `filled()` faz `Array.isArray(v) ? v.length > 0`. Ou seja: **marcar apenas um dos dois checkboxes já passa na validação** — dá pra pular o "vou desligar as respostas automáticas". Os dois são obrigatórios. Implemente validação específica para esse campo exigindo todas as opções marcadas, com mensagem de erro clara.

## Melhoria opcional (se sobrar tempo)

Hoje um erro de validação só pinta a borda do campo (classe `.inv`), sem dizer o que falta naquele campo específico. Adicionar mensagem por campo abaixo do input.

## Critérios de aceite

- [ ] `/briefing` mostra 2 passos. A trilha (`renderRail`) reflete 2, e o label diz "Passo 1 de 2".
- [ ] A barra de progresso conta 9 obrigatórios, não 25.
- [ ] Enviar o formulário completo continua redirecionando para `/t/<token>` como hoje.
- [ ] Um rascunho salvo pelo formulário antigo (localStorage já populado) abre sem erro de console e reidrata os campos que sobreviveram.
- [ ] `node --check` no script inline passa limpo.
- [ ] Nenhuma dependência nova no projeto.

## O que NÃO fazer

- Não redesenhe visualmente o formulário nesta tarefa. O redesign está previsto para depois do corte — polir agora é retrabalho.
- Não migre para framework nenhum.
- Não altere `src/api/submit.js` nem nada em `src/api/`.
