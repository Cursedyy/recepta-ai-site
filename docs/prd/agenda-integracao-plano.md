# Plano — Agenda via Google Sheets + n8n

> **⚠️ SUPERSEDED — a integração de agenda está EM PRODUÇÃO desde esta semana (início de setembro/2026).**
> Não usar este documento como referência de estado. Estado atual, implantado e testado:
> - O workflow **Atendimento** (`cxn5FxUNMJmlJ1WJ`) chama **Criar Agendamento** (`DxCGAEmTMS6sU1qK`),
>   que checa conflito, valida data no passado, grava em `agendamentos`
>   (com `paciente_nome` e `observacao`) e escreve na planilha.
> - Lembretes de 24h e 3h funcionam com timezone correto.
> - O banner anterior deste arquivo ("corrigido em 2026-08-25", que dizia que os workflows
>   "não são invocados por nada" e que o modo "Recepta confirma sozinha" não era executável)
>   ficou desatualizado: esse modo está no ar.
>
> Ler o restante como histórico de planejamento, nunca como estado atual.
> Estado real do sistema: verificar no n8n e no Supabase, não em PRD.

Schema Supabase já existe (`003_agenda.sql`): `clinicas.spreadsheet_id`, `clinicas.config_agenda`, tabela `agendamentos`. Este plano cobre o resto: planilha, service account, workflows n8n. Nada disso foi implementado ainda — é plano, pra revisão antes de construir.

## Decisões já travadas (do briefing)

- 1 planilha Google Sheets por clínica
- Service account do Google (Matheus cria e compartilha) — sem OAuth do cliente
- Recepta lê disponibilidade e agenda sozinha, sem confirmação humana
- Lembrete automático 24h antes + algumas horas antes (schema usa 3h)
- Paciente cancela → Recepta cancela na planilha sozinha e avisa a clínica

## 1. Fonte da verdade — confirmado

Duas tabelas guardam dado de agendamento agora: a planilha (visual, pro humano da clínica olhar) e `agendamentos` no Supabase (estruturado, pro bot consultar rápido e pros lembretes funcionarem via cron).

Proposta: **Supabase é a fonte de verdade que o bot consulta e decide em cima**. Toda escrita (agendar/cancelar) grava primeiro no Supabase, depois espelha na planilha. Se a escrita na planilha falhar depois do Supabase já ter salvo, isso NÃO desfaz o agendamento — só dispara um alerta pro seu WhatsApp (mesmo padrão dos alertas do onboarding) avisando "agendamento X salvo mas não sincronizou na planilha, confere manual". Caminho contrário (planilha ok, Supabase falhou) trava o agendamento inteiro e avisa erro pro paciente, porque sem linha no Supabase o lembrete nunca dispara.

Isso evita as duas fontes brigarem — a planilha é sempre um espelho, nunca é lida pelo bot pra decidir nada.

## 2. Estrutura da planilha (1 aba, template único)

Aba "Agenda", colunas:

| Data | Hora | Telefone | Status | Cancelado em |
| ---- | ---- | -------- | ------ | ------------ |

- 1 linha por agendamento, escrita via Sheets API `values.append`
- Cancelamento: `values.update` na linha certa (não apaga, só muda Status pra "Cancelado" + preenche "Cancelado em") — localizar a linha pelo Telefone+Data+Hora combinados (não tem id de linha exposto fácil sem mais lógica; alternativa é guardar o número da linha do Sheets numa coluna nova em `agendamentos` tipo `sheet_row` pra edição direta em vez de buscar por valor — mais confiável, sugiro adicionar essa coluna quando formos implementar)
- Template criado uma vez no Google Drive do Matheus, duplicado manual (ou via Drive API `files.copy`) por clínica nova

## 3. Service account

- 1 Google Cloud project, 1 service account, API do Google Sheets + Drive habilitadas
- Credencial da service account vira credencial nativa do n8n (tipo Google Sheets/Drive OAuth2 ou Service Account, já suportado nativamente)
- Provisionamento por clínica (**manual, como decidido**): Matheus duplica o template, compartilha com o e-mail da clínica (`config_agenda.email_compartilhamento`) e com o e-mail da service account, copia o `spreadsheet_id` da URL, grava em `clinicas.spreadsheet_id` — não automatizo isso nesta fase

## 4. Workflows n8n necessários (nenhum existe ainda)

**a) Verificar Disponibilidade** (chamado como tool pela Recepta durante a conversa)

- Lê `config_agenda` (dias_atendimento, duracao_consulta_min, intervalo_min) da clínica
- Consulta `agendamentos` no Supabase (não a planilha) pra saber horários já ocupados no período pedido
- Calcula e devolve slots livres pra Recepta oferecer ao paciente

**b) Criar Agendamento** (tool)

1. Insert em `agendamentos` (status='agendado')
2. Append na planilha (linha nova)
3. Se o append falhar: alerta pro WhatsApp do Matheus, agendamento no Supabase permanece válido
4. Confirma pro paciente

**c) Cancelar Agendamento** (tool, disparado quando Recepta interpreta "não posso ir"/similar)

1. Localiza o agendamento certo (por telefone + proximidade da data/hora da conversa)
2. Update no Supabase (`status='cancelado'`, `cancelado_em=now()`)
3. Update da linha na planilha
4. Alerta pra clínica (`telefone_alerta`, mesmo padrão dos alertas de onboarding)

**d) Lembretes** (2 cron separados, ou 1 com branch)

- Schedule Trigger a cada N minutos → query Supabase: `agendamentos where status='agendado' and lembrete_24h_em is null and data_hora between now()+23h and now()+25h`
- Envia WhatsApp de lembrete pro `paciente_telefone` via UazAPI da clínica (precisa do `uazapi_token`/`uazapi_server` daquela clínica, join com `clinicas`)
- Marca `lembrete_24h_em = now()`
- Mesma lógica pro lembrete de poucas horas antes (janela `lembrete_3h_em`)

## 5. Onde entra na conversa (fora de escopo detalhar agora)

O workflow **"Recepta AI - Atendimento WhatsApp"** (hoje inativo, ainda em desenvolvimento) é onde os 3 tools (a/b/c) precisam ser conectados como LangChain Tool nodes que a Recepta chama durante a conversa — igual ao padrão de `chainLlm` já usado no onboarding pra gerar `ia_config`. Não abri esse workflow nesta passada porque isso já é implementação, não planejamento — mas é o ponto de entrada real quando formos construir.

## Perguntas em aberto — respostas propostas

Todas marcadas **PROPOSTA — aguardando validação de Matheus**. Não é decisão final, é sugestão pra você revisar.

1. ~~Confirma a fonte da verdade~~ — **CONFIRMADO** por Matheus: Supabase decide, planilha é espelho (seção 1).

2. **Provisionamento da planilha: manual, não automatizar ainda.**
   PROPOSTA — aguardando validação de Matheus.
   Justificativa: volume baixo agora (poucas clínicas), automatizar via Drive API `files.copy` adiciona complexidade (tratar erro de permissão, limite de quota da API, gerenciar em qual pasta cai a cópia) sem ganho real ainda. Automatiza quando o número de onboardings por semana justificar.

3. **Sim, adiciona `sheet_row` (int, nullable) em `agendamentos`.**
   PROPOSTA — aguardando validação de Matheus.
   Justificativa: buscar por telefone+data/hora pra editar/cancelar tem risco de ambiguidade (2 agendamentos do mesmo paciente em horários próximos, erro de digitação na hora, fuso) e cada cancelamento viraria uma query de busca a mais. Guardar o número da linha direto no insert (`values.append` do Sheets retorna a posição escrita) resolve update/cancelamento com uma operação direta, sem busca.

4. **Sim, começa pelos workflows de lembrete (d) primeiro.**
   PROPOSTA — aguardando validação de Matheus.
   Justificativa: lembrete (cron + query Supabase + envio WhatsApp) não depende do workflow de atendimento existir nem da Recepta decidir nada — é testável isolado, entrega valor sozinho (lembrete automático já funcionando reduz falta), e valida o padrão de acesso a `agendamentos`/`clinicas` que os outros 3 workflows (a/b/c) vão reusar. Verificar Disponibilidade/Criar/Cancelar (a/b/c) ficam pra depois que o workflow de atendimento em si existir de verdade — não faz sentido construir tools pra um workflow que ainda não roda.
