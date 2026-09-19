# Correções da fila — evidências antes de reintegrar

**Estado:** migrations 019/020 aplicadas ao Supabase após teste transacional; API e painel corrigidos no workspace, sem deploy. Atendimento preservado, fila não reintegrada, cron de expiração inativo. Nenhum WhatsApp/email foi enviado e nenhuma instância ou assinatura foi alterada.

## Diff desta rodada

`tmp-fila-fix-2026-09-11/correcoes.patch` contém somente as alterações desta rodada, comparadas ao workspace recebido (que já tinha mudanças não commitadas).

| Prioridade | Alteração |
|---|---|
| P0 | `019_fila_service_only.sql`: revoga acesso à tabela e EXECUTE de PUBLIC/anon/authenticated. Só service_role executa os caminhos suportados. Helper e assinaturas legadas de aceite/recusa ficam sem concessão externa. |
| P0 | `fila.js`: clínica vem exclusivamente de `perfil.clinica_id`; GET, lookup, cancelamento e leitura do agendamento são filtrados. Aceite/recusa passam a clínica da sessão à RPC, que repete o filtro. Campo `clinica_id` forjado é ignorado. |
| P1 horário | `020_fila_horario_ofertado.sql`: separa `oferta_inicio/oferta_fim` de `janela_inicio/janela_fim`. Aceite grava o instante ofertado, sem somar/subtrair horas. Painel exibe o horário da oferta em São Paulo. |
| P1 janela | API valida preferência e oferta antes do aceite; janela aberta/incompleta/invertida retorna 400 com mensagem. Banco também valida entrada/oferta/aceite e usa SQLSTATE 22023. Ofertas antigas sem horário explícito não são preenchidas por inferência. |
| P1 remarcação | Pré-checagem e unique violation retornam 409 `horario_ocupado`. Restrição do banco continua protegendo corridas; update filtra clínica da sessão. |
| P2 | Nomes acessíveis em botões/links móveis; nome da aba dinâmica usa `aria-labelledby`. |

## Callers rastreados

Inventário pela API n8n cobriu os 28 workflows, ativos e inativos, além da busca no código e definições SQL.

| Caller | RPC / origem da identidade | Estado |
|---|---|---|
| `src/api/clinica/fila.js` | `fila_aceitar_oferta`, `fila_recusar_oferta`: UUID da sessão e ID previamente filtrado | Corrigido e testado localmente com Auth/banco reais. Ainda sem deploy. |
| Cancelar Agendamento `elFchoRzp2dzbweH`, node `Ofertar Próximo na Fila` | `fila_ofertar_proximo`: clínica e horário do agendamento encontrado no backend; credencial Supabase server-side | Único caller n8n ativo. Assinatura preservada; aceita intervalo pontual (`início == fim`) usado por esse caller. Nenhuma alteração no workflow. |
| Expirar Ofertas Fila `o17p1vkWI7oPCPoU` | `fila_expirar_ofertas`, `fila_ofertar_proximo`: dados lidos do Supabase, credencial server-side | Inativo e preservado. A futura oferta seguinte deve usar `oferta_inicio/oferta_fim`, não preferência. Não ativar o script antigo. |
| Atendimento `cxn5FxUNMJmlJ1WJ` | Nenhuma RPC da fila | Ativo e preservado. |
| `integrar-fila-atendimento.mjs` | `fila_entrar`; atualmente prepara janela nula e contém referência antiga à identidade | Script de integração anterior, fora do caminho publicado. Agora falha fechado no banco; exige adaptação e teste antes de qualquer reintegração. Não executado. |
| `integrar-oferta-resposta-atendimento.mjs` | Aceite/recusa antigos com apenas `p_id`, mais oferta após recusa | Script de integração anterior. Assinaturas de um argumento não têm mais EXECUTE para service_role. Futura integração deve passar `p_clinica` obtido no backend e usar o slot ofertado. Não executado. |
| `integrar-oferta-fila-cancelamento.mjs` | `fila_ofertar_proximo` com dados do agendamento | Gerador do caller separado acima; não executado. |
| `criar-workflow-expirar-fila.mjs` e `-v2.mjs` | Expiração e próxima oferta | Geradores antigos; não executados nem ativados. |
| Migrations 017/018 e funções SQL | Helper `fila_assert_tier_completo`, chamado internamente por funções SECURITY DEFINER | Owner mantém acesso interno; helper sem concessão externa. Migrations antigas são histórico, não correção a reaplicar isoladamente. |
| `audit-rollback.mjs`, `audit-fila-isolated.mjs` | Casos de auditoria do contrato anterior | Evidência histórica, não smoke atual. Usar `test-fila-fixes.mjs` para o novo contrato. |

O browser chama apenas a API; nenhum acesso à service key foi adicionado. Não houve modificação no n8n, portanto não houve operação que exigisse backup prévio de workflow. O inventário preserva hash, versão e lista de callers, sem credenciais.

## Testes e evidências

- `node scripts/test-fila-migrations.mjs`: **passou**. Aplica 019/020 duas vezes numa transação, testa isolamento, BRT/UTC, janelas inválidas e conflito de aceite; termina com **ROLLBACK**, incluindo fixtures e DDL.
- `node scripts/test-fila-fixes.mjs`: **41/41 registros aprovados**, sendo 31 verificações funcionais e 10 de limpeza. Usa duas clínicas sintéticas com Supabase Auth real e os handlers locais.
- B não lista entradas de A (200 com lista vazia); aceite/recusa/cancelamento forjados retornam 404. Acesso REST/RPC direto retorna 403 para B e 401 para anon; entrada de A permanece intacta.
- Entrada 12h–18h BRT, oferta **15h BRT**, aceite **18h UTC**. Cenário UTC também passa sem reconversão. Preferência original preservada.
- Janela aberta, incompleta ou sem oferta retorna **400**, com **zero chamadas RPC** do handler nesses casos. Mensagem também verificada pelo botão real no navegador.
- Duas remarcações foram sincronizadas para passar pela pré-checagem e disputar o mesmo slot no banco: **200/409**, duas tentativas de PATCH, data original do perdedor preservada. Isso exercita a unique violation real, não apenas um mock.
- Axe WCAG A/AA no painel local autenticado: **zero violações em 320 e 390 px**, sem erros JavaScript. Capturas `painel-320.png`, `painel-390.png`, `janela-400.png`.
- `cd src; node test-painel-script.mjs` e `node test-agendamento.mjs`: passaram. O primeiro exige cwd `src`; uma chamada inicial na raiz falhou por caminho e foi repetida no diretório correto.

**Limite do teste:** Playwright intercepta as rotas e executa os handlers/arquivos locais contra banco e autenticação reais. Não é deploy de preview nem execução ponta a ponta no motor n8n. A reintegração da fila permanece pendente por instrução.

## Estado final

- Atendimento: `e628e2c4-9c77-4ee4-9206-fa55b65d4d74`, ativo, versão publicada igual ao draft e hash intacto.
- Cancelamento separado e expiração também mantêm versão, hash e ativação anteriores.
- `final-state.json` confirma grants: anon/authenticated sem EXECUTE em todas as assinaturas; service_role apenas nos caminhos suportados.
- `regression-results.json` confirma remoção dos quatro registros de fila, três agendamentos, dois perfis, dois usuários e duas clínicas criados nesta rodada. Não houve limpeza de dados anteriores.
- `npm run health`: site e workflows críticos passaram; permanece erro **UazAPI 4/2** segundo o limite fixo do health. Nenhuma instância foi tocada. **Nenhum deploy realizado.**

Artefatos em `tmp-fila-fix-2026-09-11/`: inventário, definições/ACL anteriores, resultado das migrations, regressão, capturas, estado final e diff.
