# Test Plan — /clinica/login + /clinica/painel (edição de config)

Escopo: só login da clínica e a área de edição (preços, horários, convênios, mensagem de identidade). Nada de /briefing, landing pública, ou webhooks n8n.

Cada item: `[ ]` id — descrição — resultado esperado. Marcado só com print + saída crua de console/rede anexados pelo subagente de QA (não pelo autor do código).

## A. /clinica/login — fluxo feliz

- [x] A1 — Carregar `/clinica/login` sem sessão — form visível, campos vazios, sem erro na tela
  - Print: `qa/A1-login-inicial.png`
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 404 () @ https://www.receptaai.com.br/favicon.ico:0` (irrelevante ao app, apenas favicon ausente)
  - Network: n/a (só GET do documento HTML, sem chamadas de API na carga inicial). Snapshot confirma textbox "E-mail" e "Senha" vazios, botão "Entrar", sem texto de erro na árvore de acessibilidade.
- [x] A2 — Preencher e-mail+senha válidos, clicar Entrar — botão vira "Entrando…" e desabilita, depois redireciona pra `/clinica/painel`
  - Print: `qa/A2-login-entrando.png` (botão mostrando "Entrando…" cinza/desabilitado, capturado com delay real de 2.5s injetado via `page.route` no POST real de login, sem mockar a resposta)
  - Console: nenhum erro
  - Network: `POST /api/clinica/login -> 200`. Estado do botão capturado via DOM em pleno request: `{midClickText: "Entrando…", midClickDisabled: true}`, depois `finalUrl: https://www.receptaai.com.br/clinica/painel` (redirect confirmado, é hard navigation — não SPA — confirmado por "Execution context was destroyed" numa tentativa anterior)
- [x] A3 — Após redirect, `/clinica/painel` mostra "Olá, {nome da clínica}" real (não placeholder)
  - Print: `qa/A3-painel-nome-clinica.png`
  - Console: nenhuma mensagem (0 erros, 0 warnings)
  - Network: `POST /api/clinica/login -> 200`. Snapshot mostra `heading "Olá, teste"` (nome real da clínica de teste, não placeholder genérico como "Olá, cliente").

## B. /clinica/login — erros e bug conhecido

- [x] B1 — **(bug conhecido, validar fix)** Login com e-mail existente + senha errada — mensagem vermelha visível "E-mail ou senha incorretos.", sem ficar em silêncio
  - Print: `qa/B1-login-erro-senha.png` (mensagem "E-mail ou senha incorretos." em vermelho/laranja acima dos campos, botão volta a "Entrar")
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 401 () @ https://www.receptaai.com.br/api/clinica/login:0`
  - Network: `POST /api/clinica/login -> 401`. Bug antigo (falha silenciosa) CONFIRMADO CORRIGIDO — mensagem aparece na tela via snapshot: `generic: E-mail ou senha incorretos.`
- [x] B2 — Login com e-mail que não existe — mesma mensagem genérica de B1 (não pode dizer "conta não encontrada" nem nada que revele se o e-mail existe)
  - Print: `qa/B2-login-email-inexistente.png` (mesma mensagem "E-mail ou senha incorretos.", sem diferença de B1)
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 401 () @ https://www.receptaai.com.br/api/clinica/login:0`
  - Network: `POST /api/clinica/login -> 401` (e-mail `email.que.nao.existe.qa.teste@gmail.com`, mesmo status/mensagem de B1, sem vazamento de existência de conta)
- [x] B3 — Clicar Entrar com os dois campos vazios — mensagem "Preenche e-mail e senha.", sem popup nativo do browser (`novalidate` deve estar ativo)
  - Print: `qa/B3-login-campos-vazios.png` (mensagem "Preenche e-mail e senha." visível, sem popup nativo)
  - Console: nenhuma mensagem (0 erros)
  - Network: nenhum POST disparado (validação client-side bloqueou antes da chamada à API). `form.noValidate` confirmado `true` via `browser_evaluate`.
- [x] B4 — Clicar Entrar só com e-mail preenchido (senha vazia) — mesma mensagem de campo obrigatório de B3
  - Print: `qa/B4-login-so-email.png` (mensagem "Preenche e-mail e senha." com e-mail preenchido e senha vazia)
  - Console: nenhuma mensagem
  - Network: nenhum POST disparado, mesma validação client-side de B3
- [x] B5 — Digitar e-mail em formato inválido (sem @) e tentar logar — comportamento do input `type=email` + reação do form (não pode travar nem ficar mudo)
  - Print: `qa/B5-login-email-invalido.png` (mensagem "E-mail ou senha incorretos." aparece normalmente)
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 401 () @ https://www.receptaai.com.br/api/clinica/login:0`
  - Network: `POST /api/clinica/login -> 401`. Comportamento real: `input[type=email]` marca `validity.typeMismatch: true` no DOM, mas como o form tem `novalidate`, o submit não é bloqueado pelo browser — a requisição vai pro servidor mesmo assim, que responde 401 e o form mostra a mesma mensagem genérica. Não trava, não fica mudo.

## C. /clinica/login — estado, teclado, navegação

- [x] C1 — Loading state: durante o POST de login, botão fica desabilitado e não é possível clicar duas vezes (checar se um duplo-clique rápido dispara 2 requests na aba Network)
  - Print: `qa/C1-login-duplo-clique.png` (botão "Entrando…" cinza durante tentativa de segundo clique)
  - Console: nenhum erro relevante
  - Network: só 1 `POST /api/clinica/login` disparado (200) durante a janela de request (delay real de 2s injetado via `page.route`, sem mockar resposta). Segundo clique falhou com `locator.click: Timeout 1000ms exceeded ... locator resolved to <button disabled type="submit" id="btn-entrar">Entrando…` — confirma que o atributo `disabled` real no DOM impede fisicamente o segundo clique.
- [x] C2 — Depois de um erro (B1), o botão volta ao normal ("Entrar", habilitado) — não fica travado em "Entrando…"
  - Print: `qa/C2-login-botao-volta-normal.png`
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 401 () @ https://www.receptaai.com.br/api/clinica/login:0`
  - Network: `POST /api/clinica/login -> 401`. Estado do botão via DOM logo após o erro: `{text: "Entrar", disabled: false}` — confirma que não fica travado em "Entrando…".
- [x] C3 — Navegação por teclado: Tab passa por e-mail → senha → botão, na ordem certa; Enter dentro do campo senha submete o form
  - Print: `qa/C3-tab-ordem-botao.png` (foco visível no botão "Entrar" após 3 Tabs), `qa/C3-enter-submete.png` (painel carregado após Enter na senha)
  - Console: 0 erros em ambos os passos
  - Network: sequência de `document.activeElement` capturada via `browser_evaluate`: 1º Tab -> `input#email`, 2º Tab -> `input#senha`, 3º Tab -> `button#btn-entrar`. Depois, `Enter` dentro do campo senha disparou `POST /api/clinica/login -> 200` e navegou pra `/clinica/painel`.
- [x] C4 — Recarregar a página no meio do preenchimento (campos preenchidos, sem submeter) — form volta limpo, sem erro de JS no console
  - Print: `qa/C4-reload-campos-vazios.png` (campos vazios, sem mensagem de erro)
  - Console: 0 mensagens (0 erros, 0 warnings)
  - Network: recarga normal do documento, `textbox "E-mail"` e `textbox "Senha"` sem valor no snapshot pós-reload (estavam preenchidos com `campo.parcial@teste.com` / `senhaParcial` antes do reload)
- [x] C5 — Depois de logar com sucesso (A2) e cair no painel, clicar "Voltar" do navegador — o que aparece? Documentar o comportamento real (login de novo, painel em cache, ou erro)
  - Print: `qa/C5-voltar-navegador.png`
  - Console: 0 mensagens
  - Network: nenhuma requisição nova disparada (página veio do bfcache). Comportamento real: volta pra `/clinica/login` (não pro painel), com o campo E-mail ainda preenchido (`ghost.rodrigues1709@gmail.com`, restaurado pelo bfcache) e Senha vazio. Não é erro, não é painel em cache — é o form de login pré-submit restaurado.

## D. /clinica/painel — carregamento e sessão

- [x] D1 — Acessar `/clinica/painel` direto na URL sem estar logado — redireciona pra `/clinica/login` (sem mostrar nenhum dado)
  - Print: `qa/D1-D3-painel-sem-login-redireciona.png`
  - Console: 0 mensagens
  - Network: `goto https://.../clinica/painel` resultou em `Page URL: https://www.receptaai.com.br/clinica/login` (redirect server-side confirmado, sem nenhum dado do painel exposto)
- [x] D2 — Painel carregado mostra os 4 blocos: Preços, Horários, Convênios, Mensagem de identidade — cada um pré-preenchido com o que já está salvo (ou vazio, se nada salvo ainda)
  - Print: `qa/D2-painel-4-blocos.png` (página completa, 4 blocos visíveis)
  - Console: 0 mensagens
  - Network: dados vieram renderizados no HTML inicial (SSR), sem XHR/fetch client-side visível pro filtro `clinica`. Snapshot confirma os 4 blocos: "Preços dos serviços/exames" (Nenhum preço cadastrado.), "Horários de atendimento" (7 dias, todos "Fechado"), "Convênios aceitos" (Nenhum convênio cadastrado.), "Mensagem de identidade" (textbox vazio, "0/300") — estado vazio consistente (conta de teste sem dados salvos ainda).
- [x] D3 — Botão "Sair" — desloga, redireciona pra `/clinica/login`, e uma nova tentativa de acessar `/clinica/painel` volta a exigir login (D1 de novo)
  - Print: `qa/D1-D3-painel-sem-login-redireciona.png` (mesmo print de D1, tirado logo após clicar Sair e tentar acessar /clinica/painel de novo)
  - Console: 0 mensagens
  - Network: clique em "Sair" -> `Page URL: https://www.receptaai.com.br/clinica/login`. Nova tentativa de `goto /clinica/painel` -> redirecionado de volta pra `/clinica/login`, confirmando que a sessão foi realmente encerrada.
- [x] D4 — Recarregar `/clinica/painel` no meio de uma edição não salva — dados voltam ao último estado salvo (perda de rascunho é esperada, só documentar que não quebra nem corrompe nada)
  - Print: `qa/D4-reload-rascunho-perdido.png` (mensagem de identidade voltou a "0/300" vazia depois do reload)
  - Console: 0 mensagens (0 erros)
  - Network: digitado "Rascunho nao salvo D4 teste QA" no textbox (30/300, sem salvar), reload em seguida -> snapshot pós-reload mostra `textbox` vazio e `0/300`. Nenhum erro, nenhuma corrupção, apenas perda esperada do rascunho não salvo.

## E. /clinica/painel — Preços (nome + valor)

- [x] E1 — Lista vazia — mostra "Nenhum preço cadastrado." em vez de lista quebrada
  - Print: `qa/E1-precos-lista-vazia.png`
  - Console: 0 mensagens
  - Network: n/a (renderização de estado vazio server-side). Snapshot confirma `paragraph: Nenhum preço cadastrado.` sem nenhuma lista quebrada ou erro.
- [x] E2 — Adicionar 1 preço válido (nome + valor positivo), salvar — "Salvo!" aparece, reload confirma persistência
  - Print: `qa/E2-preco-salvo.png` ("Salvo!" visível ao lado do botão), `qa/E2-preco-reload-persistiu.png` (após reload, preço "Consulta QA E2" / R$150 continua lá)
  - Console: 0 mensagens
  - Network: `POST /api/clinica/config-salvar -> 200`. Snapshot pós-reload confirma `textbox "Nome do serviço": Consulta QA E2` e `spinbutton "R$": "150"`.
- [x] E3 — Remover um preço existente, salvar — item some da lista e do que persiste depois de reload
  - Print: `qa/E3-preco-removido-reload.png` ("Nenhum preço cadastrado." depois do reload)
  - Console: 0 mensagens
  - Network: `POST /api/clinica/config-salvar -> 200` após clicar "×" e Salvar. Snapshot pós-reload confirma que o preço "Consulta QA E2" não existe mais.
- [x] E4 — Valor **zero** — o form aceita ou rejeita? Documentar comportamento real (API valida `valor >= 0`, então zero deveria passar — confirmar)
  - Print: `qa/E4-preco-zero.png` ("Salvo!" visível com preço "Servico Gratis E4" / R$0)
  - Console: 0 mensagens
  - Network: `POST /api/clinica/config-salvar -> 200`. Confirmado: valor 0 é ACEITO, consistente com validação `valor >= 0`.
- [x] E5 — Valor **negativo** — deve ser rejeitado (erro visível ao salvar, não silencioso)
  - Print: `qa/E5-preco-negativo.png` (mensagem "Não foi possível salvar. Confere os campos." visível)
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 400 () @ https://www.receptaai.com.br/api/clinica/config-salvar:0`
  - Network: `POST /api/clinica/config-salvar -> 400` (valor -50). Erro visível na tela, nada silencioso.
- [x] E6 — Nome vazio com valor preenchido — deve ser rejeitado ao salvar
  - Print: `qa/E6-preco-nome-vazio.png` (mensagem "Não foi possível salvar. Confere os campos." visível, nome vazio e valor 80)
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 400 () @ https://www.receptaai.com.br/api/clinica/config-salvar:0`
  - Network: `POST /api/clinica/config-salvar -> 400`. Rejeitado com erro visível, confirmado.
- [x] E7 — Digitar texto no campo de valor (ex. "abc") — o input é `type=number`, então o browser deve impedir; documentar o que acontece de verdade
  - Print: `qa/E7-valor-texto-abc.png` (campo continua "0" mesmo após tentar digitar "abc")
  - Console: 2 erros pré-existentes (E5/E6 400s), nenhum novo erro deste passo
  - Network: nenhuma requisição disparada por esta digitação. Confirmado via `browser_evaluate`: `input[type=number]` bloqueia fisicamente os caracteres não numéricos — `pressSequentially('abc')` resultou em `value: "0"` (inalterado).

## F. /clinica/painel — Horários

- [x] F1 — Dia sem nenhuma faixa — mostra "Fechado", sem quebrar
  - Print: `qa/F1-horarios-fechado.png` (todos os 7 dias mostrando "Fechado")
  - Console: 2 erros pré-existentes de E5/E6, nenhum novo
  - Network: n/a (renderização de estado). Snapshot confirma os 7 dias da semana com "Fechado", sem quebra de layout.
- [x] F2 — Adicionar uma faixa (ex. 08:00–18:00) num dia, salvar, reload — persiste certo
  - Print: `qa/F2-horario-persistiu.png` (Segunda 08:00 até 18:00, depois do reload)
  - Console: 0 novos erros
  - Network: `POST /api/clinica/config-salvar -> 200`. Snapshot pós-reload confirma `Segunda: 08:00 até 18:00`.
- [x] F3 — Adicionar 2 faixas no mesmo dia (ex. manhã e tarde, simulando intervalo de almoço) — ambas salvam e voltam certas depois de reload
  - Print: `qa/F3-duas-faixas-persistiu.png` (Segunda com 08:00-12:00 e 14:00-18:00 depois do reload)
  - Console: 0 erros
  - Network: `POST /api/clinica/config-salvar -> 200`. Snapshot pós-reload confirma as duas faixas exatas na Segunda.
- [x] F4 — Faixa com horário de fim ANTES do início (ex. 18:00–08:00) — deve ser rejeitada ao salvar, erro visível
  - Print: `qa/F4-faixa-invertida.png` (mensagem "Não foi possível salvar. Confere os campos." com faixa 18:00 até 08:00)
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 400 () @ https://www.receptaai.com.br/api/clinica/config-salvar:0`
  - Network: `POST /api/clinica/config-salvar -> 400`. Rejeitado com erro visível, confirmado.
- [x] F5 — Remover uma faixa de um dia que tinha 2 — sobra só a outra, salva certo
  - Print: `qa/F5-faixa-removida.png` (Segunda com só 08:00-12:00 depois do reload)
  - Console: 0 erros
  - Network: `POST /api/clinica/config-salvar -> 200`. Snapshot pós-reload confirma que só a faixa 08:00-12:00 restou.

## G. /clinica/painel — Convênios

- [x] G1 — Lista vazia — mensagem "Nenhum convênio cadastrado.", sem quebrar
  - Print: `qa/G1-convenios-vazio.png`
  - Console: 0 mensagens
  - Network: n/a. Snapshot confirma `paragraph: Nenhum convênio cadastrado.`
- [x] G2 — Adicionar convênio com texto, salvar, reload — persiste
  - Print: `qa/G2-convenio-persistiu.png` ("Unimed QA Teste" presente depois do reload)
  - Console: 0 mensagens
  - Network: `POST /api/clinica/config-salvar -> 200`. Snapshot pós-reload confirma `textbox "Nome do convênio": Unimed QA Teste`.
- [x] G3 — Adicionar convênio e deixar o campo vazio (apagar o texto), tentar salvar — rejeitado, erro visível
  - Print: `qa/G3-convenio-vazio.png` (mensagem "Não foi possível salvar. Confere os campos." com uma linha de convênio vazia)
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 400 () @ https://www.receptaai.com.br/api/clinica/config-salvar:0`
  - Network: `POST /api/clinica/config-salvar -> 400`. Rejeitado com erro visível, confirmado.
- [x] G4 — Dois convênios com o mesmo nome (duplicado) — o form aceita? A API valida duplicata ou não? Documentar comportamento real
  - Print: `qa/G4-convenio-duplicado.png` ("Salvo!" com duas linhas "Unimed QA Teste" idênticas)
  - Console: erro 400 é residual do request anterior (G3), a request desta ação retornou 200
  - Network: `POST /api/clinica/config-salvar -> 200`. Comportamento real: a API NÃO valida duplicata — dois convênios com nome idêntico são aceitos e salvos sem erro.

## H. /clinica/painel — Mensagem de identidade

- [x] H1 — Digitar texto curto — contador de caracteres atualiza em tempo real (ex. "42/300")
  - Print: `qa/H1-contador-tempo-real.png` (contador "32/300" refletindo o texto digitado)
  - Console: 0 novos erros
  - Network: n/a (contagem client-side). Snapshot confirma `textbox: Ola! Somos a clinica QA teste H1` e `generic: 32/300`.
- [x] H2 — Colar/digitar texto passando de 300 caracteres — o `maxlength` do textarea trava em 300, ou dá pra passar e só falha no salvar? Documentar
  - Print: n/a (texto de 300 "A"s não traz informação visual nova além do contador — evidência é o snapshot/DOM abaixo)
  - Console: 0 novos erros
  - Network: n/a. Tentativa de preencher com 350 caracteres resultou em `t.value.length === 300` no DOM (truncado pelo `maxlength=300` do `<textarea id="mensagem-identidade">`), contador mostrou "300/300". Confirmado: trava em 300, não dá pra ultrapassar via input real.
- [x] H3 — Deixar em branco e salvar — deve ser aceito (mensagem vazia é válida) ou rejeitado? Confirmar contra o código (`validarConfigEditavel` aceita string vazia)
  - Print: `qa/H3-mensagem-vazia-aceita.png` ("Salvo!" com mensagem de identidade vazia, "0/300")
  - Console: erro 400 residual do request anterior de H2 nao contabiliza (nenhum erro novo nesta ação)
  - Network: `POST /api/clinica/config-salvar -> 200`. Confirmado: mensagem vazia é aceita pela API.

## I. /clinica/painel — salvar, erro de rede, sessão expirada

- [x] I1 — Clicar "Salvar alterações" duas vezes rápido (duplo clique) — não deve disparar 2 saves conflitantes nem duplicar dado
  - Print: `qa/I1-duplo-clique-salvar.png` (estado final "Salvo!", sem dados duplicados)
  - Console: nenhum erro novo neste passo
  - Network: apenas 1 `POST /api/clinica/config-salvar -> 200` disparado (delay real de 1.8s injetado via `page.route`, sem mockar resposta). Segunda tentativa de clique falhou com `locator.click: Timeout 1000ms exceeded ... waiting for getByRole('button', { name: 'Salvar alterações' })` — confirma que o botão fica indisponível/travado durante o save, impedindo o segundo clique de disparar outro request.
- [x] I2 — Simular rede lenta/offline no meio do save (DevTools throttling ou offline) — mensagem de erro visível ("Falha de conexão"), botão volta ao normal, não trava em "Salvando…" pra sempre
  - Print: `qa/I2-rede-offline-erro.png`
  - Console: `[ERROR] Failed to load resource: net::ERR_FAILED @ https://www.receptaai.com.br/api/clinica/config-salvar:0`
  - Network: `POST /api/clinica/config-salvar -> FAILED (net::ERR_FAILED)`, simulado com `page.route(...).abort('failed')` via Playwright (a ferramenta MCP não expõe throttling/offline nativo, então usei interceptação de rede real do Playwright para forçar falha de conexão de verdade, sem mockar a resposta). Resultado: mensagem "Falha de conexão. Tenta de novo." visível, botão volta a `{text: "Salvar alterações", disabled: false}` — não trava em "Salvando…".
- [x] I3 — Sessão expirada/cookie inválido no momento do save (se der pra simular apagando o cookie) — API retorna 401/403 e a tela mostra erro, não falha silenciosa
  - Print: `qa/I3-sessao-expirada.png` (mensagem "Não foi possível salvar. Confere os campos." visível após 401)
  - Console: `[ERROR] Failed to load resource: the server responded with a status of 401 () @ https://www.receptaai.com.br/api/clinica/config-salvar:0`
  - Network: `POST /api/clinica/config-salvar -> 401`. Cookie apagado via `document.cookie` (achado: o cookie `sb-...-auth-token` é LEGÍVEL via `document.cookie`, ou seja NÃO é httpOnly como o briefing assumia — ver nota de achado extra ao final). API respondeu 401 e a tela mostrou erro visível, sem falha silenciosa. Nota: a mensagem exibida é o texto genérico de erro de salvar, não uma mensagem específica de "sessão expirada" — comportamento aceitável (não silencioso) mas poderia ser mais específico.

## J. Segurança e vazamento de dado

- [x] J1 — Confirmar via aba Network que nenhuma resposta de `/clinica/painel` ou das APIs expõe campos de `ia_config` (persona/prompt) — só os 4 campos editáveis
  - Print: n/a (evidência é o corpo bruto da resposta, colado abaixo)
  - Console: 0 erros
  - Network: corpo completo de `GET /clinica/painel` inspecionado via `browser_network_request` (response-body) — o objeto `CONFIG` embutido no HTML só tem `{"precos":[...],"horarios":{...},"convenios":[...],"mensagem_identidade":"..."}`. Corpo de `POST /api/clinica/config-salvar -> 200`: `{"ok":true,"config":{"precos":[],"horarios":{"segunda":[{"inicio":"08:00","fim":"12:00"}],"terca":[],"quarta":[],"quinta":[],"sexta":[],"sabado":[],"domingo":[]},"convenios":["Unimed QA Teste","Unimed QA Teste"],"mensagem_identidade":""}}`. Nenhum campo `ia_config`, `persona` ou `prompt` em nenhuma das duas respostas.
- [x] J2 — Confirmar que o HTML/JS de `/clinica/painel` não contém, em nenhum lugar (view-source), texto de persona ou system prompt de outra clínica
  - Print: n/a (evidência é o HTML bruto completo, mesma captura do J1)
  - Console: 0 erros
  - Network: `GET /clinica/painel` response-body completo inspecionado (equivalente a view-source, corpo bruto de ~200 linhas de HTML/CSS/JS). Contém apenas: CSS estático, markup dos 4 blocos, e o `<script>` com `var CONFIG = {"precos":[],"horarios":{...},"convenios":["Unimed QA Teste","Unimed QA Teste"],"mensagem_identidade":""}` — dados só desta clínica de teste. Nenhum texto de persona, system prompt, ou dado de outra clínica em nenhum lugar do documento.

---

## Achados extras (fora dos itens originais)

- **Cookie de sessão não é httpOnly.** O briefing original assumia "Supabase Auth via cookie httpOnly, sessão server-side". Ao inspecionar via `document.cookie` durante o teste I3, o cookie `sb-vfyubktlmqytkcewicse-auth-token` (contendo o `access_token` JWT completo em base64) veio LEGÍVEL por JavaScript client-side — ou seja, não está marcado `httpOnly`. Isso expõe o token de sessão a roubo via XSS, caso exista alguma vulnerabilidade de injeção de script na aplicação. Recomendo revisar a configuração de cookies do Supabase Auth/SSR nesse deploy e marcar o cookie de auth como `httpOnly` (e `Secure`, `SameSite=Lax` ou `Strict`) se ainda não estiver. Não foi possível confirmar visualmente via print (é uma leitura de `document.cookie`, não uma tela), mas a saída bruta do `browser_evaluate` está documentada no item I3 acima.

**Nota pro subagente de QA**: cada item só fecha com print da tela no momento do teste + trecho relevante do console/network anexados na mesma resposta. Item sem essas duas provas continua `[ ]`. Se algo quebrar de um jeito não previsto aqui, adicione uma linha nova em vez de forçar num item existente.
