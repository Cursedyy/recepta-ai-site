# Auditoria após rollback — 11/09/2026

**Conclusão:** preservar o Atendimento atual; a fila ainda não está pronta para republicação. Nenhum workflow foi alterado ou publicado. Nenhum cron foi ativado, mensagem enviada, pagamento criado ou instância alterada. Os registros, usuários e clínicas sintéticos foram removidos. Google Sheets não foi usado como critério de conclusão.

## 1. Funcionando, com evidências

- **Autenticação e isolamento nas APIs do painel:** dois usuários sintéticos autenticaram com cookies `HttpOnly`/`Secure`; conversas e agenda sem sessão retornaram 401. A clínica B não leu as conversas da A e recebeu 403 ao tentar cancelar/remarcar seu agendamento. Isso não cobre a vulnerabilidade nas RPCs da fila descrita abaixo.
- **Agenda pelo painel/API:** criação, remarcação e cancelamento persistiram no Supabase. Duas criações concorrentes no mesmo horário produziram um 200 e um 409. A data de 15h BRT foi persistida como 18h UTC.
- **Conversas:** insert real de dois turnos, leitura pela API autenticada e exibição no navegador passaram. Teste com conteúdo sintético; não representa uma nova conversa WhatsApp ponta a ponta.
- **Painel autenticado:** abriu sem erro JavaScript; sem overflow horizontal em 320, 390, 768 e 1440 px. Axe sem violações na tela inicial a 1440 px; problemas nos tamanhos menores estão abaixo.
- **Conteúdo no prompt:** código obtido da API do Atendimento publicado passou nos três contratos locais: texto, transcrição e resultado de visão chegam ao último turno do prompt e ao lote de persistência. STT, visão e LLM foram substituídos por resultados sintéticos nesse teste; não é E2E com os provedores.
- **Planos:** site mostra Essencial R$ 497/mês ou R$ 347/mês no anual; Completo R$ 997/mês ou R$ 697/mês no anual. O código publicado mapeia quatro IDs distintos para tier/período e rejeita ID desconhecido. Valores dos objetos de preço no Stripe: **não confirmei**.
- **Fila, componentes:** entrada, recusa, rejeição de duplicidade, bloqueio de entrada no Essencial e rejeição de aceite sem oferta/expirado passaram nas RPCs reais, usando clínica sintética. Expiração passou em tabelas/funções temporárias clonadas do catálogo real, com rollback da transação; não foi disparada sobre produção.

## 2. Quebrado

1. **Crítico — isolamento das RPCs da fila:** usuário autenticado da clínica B criou entrada na A por `fila_entrar` (HTTP 200). As seis funções `fila_*` são executáveis por `anon` e `authenticated`; as funções consultadas usam `SECURITY DEFINER` sem validar a clínica do usuário. A exploração foi limitada aos dados sintéticos. O acesso anônimo foi confirmado no catálogo de permissões, não explorado contra clientes.
2. **Fila confirma horário errado:** oferecer 15h para preferência 12h–18h e aceitar gravou 12h. Com janela aberta, o aceite falha com `23502`, pois tenta inserir `data_hora = null`. A função de oferta não preserva o horário ofertado separadamente da preferência.
3. **Integração revertida encerra atendimento sem oferta:** execução real anterior `95629`, versão `93af11b1-d4ac-4751-a614-ab27744359b1`, terminou `success` com saída `[[]]` em `Buscar Oferta Ativa do Paciente`, sem chegar ao prompt. `alwaysOutputData` não estava habilitado. Execução `95613` também registra URL `undefined/rest/v1/...`. Replay isolado confirmou que o combinador aceita ausência de oferta se chegar a executar; o ramo anterior não o chama com zero itens.
4. **Conflito ao remarcar retorna 500**, embora a restrição do banco preserve o horário. Deve retornar conflito tratável, sem sugerir falha interna genérica.
5. **Acessibilidade móvel:** botões da navegação perdem nome acessível nos tamanhos menores. Axe detectou `button-name` crítico e `link-name` sério; capturas e seletores estão nos resultados.
6. **Gate de áudio inconsistente:** o ramo publicado que inicia STT testa apenas `midia_tipo=audio`, sem tier. Imagem e resposta TTS têm condição de Completo. A confirmação foi estrutural no workflow publicado, sem consumir áudio de cliente.

## 3. Ainda não implementado/integrado no produto publicado

- **Fila completa após o rollback:** `/api/clinica/fila` retorna 404, o JavaScript servido não chama essa API e o Atendimento atual não contém os nodes de entrada/aceite/recusa da fila. O workflow de expiração existe, mas está inativo. Isso é recurso não disponibilizado, não teste bloqueado por login.
- **Cancelar/remarcar pelo WhatsApp:** o Atendimento publicado só chama `Criar Agendamento`; seu parser não produz comandos de cancelamento/remarcação. Há workflow de cancelamento separado, mas não está ligado a esse caminho. As ações manuais do painel funcionam.
- **Promessas ainda sem implementação identificada nas superfícies reais examinadas:** retorno a faltosos/abandono, relatório semanal, aviso agregado de informação faltante, assistente operacional “Recepta Voz” e cinco agendas por profissional. O catálogo real de workflows não apresenta esses fluxos; `agendamentos` não tem dimensão de profissional e seu índice exclusivo é por clínica/horário. Não confundir resposta TTS existente com “Recepta Voz”.

## 4. Limites e itens não testados

- **Nova entrega WhatsApp/email:** excluída por instrução. Os registros anteriores `95633`, `95634`, `95636` e `95395` trazem `Pending`; entrega **não confirmada**. `95395` contém STT e TTS anteriores ao rollback, não constitui novo teste da versão atual.
- **Nova execução completa de STT/visão/LLM e fila no motor n8n isolado:** não executada. Foram testados contratos de nodes em VM, RPCs reais sintéticas e cópias SQL temporárias. O webhook de produção pode enviar mensagens e não foi acionado; não foi publicado um workflow de teste para contornar isso.
- **Cobrança, assinatura e cron reais:** não executados. Não havia chave Stripe no ambiente consultado; verificados apenas site e mapeamento de IDs no n8n. Nenhuma assinatura foi alterada.
- **UazAPI:** API retornou quatro instâncias: `recepta-alertas` e `asadasda` conectadas; `zapscout_e0f41762` e `zapscout_prospeccao_e0f41762` desconectadas, sem vínculo por token com clínicas Recepta. O health usa limite fixo de duas e falha por 4/2. O limite contratado atual pela API da conta **não confirmei**; não houve tentativa de criar ou apagar instâncias.
- A acessibilidade automatizada cobre a tela inicial autenticada nos quatro tamanhos e a leitura da aba Conversas; não equivale à certificação WCAG nem à cobertura de todos os modais.

## 5. Menor sequência de correções

1. Restringir execução das RPCs da fila e validar isolamento; retestar com usuários de clínicas distintas. É o risco imediato, mesmo sem fila publicada no painel.
2. Corrigir armazenamento do horário ofertado, aceite com janela aberta e continuação quando a busca retorna zero itens. Corrigir a URL/contexto de Supabase. Repetir a integração da fila em ambiente isolado, incluindo expiração e corridas, antes de qualquer republicação.
3. Tratar conflito de remarcação como 409; corrigir nomes acessíveis e alinhar os gates de áudio aos planos.
4. Concluir os caminhos de cancelamento/remarcação e fila já iniciados, com um único responsável por workflow, backup prévio e testes isolados. Só então considerar publicação; preservar o Atendimento funcional até lá.
5. Alinhar as promessas restantes do site ao que pode ser entregue. Cumpri-las integralmente exige trabalho posterior nos recursos ausentes; não foram criadas funcionalidades nesta auditoria. Resolver separadamente a capacidade UazAPI, sem remover instâncias de outro produto.

**Único teste proposto para entrega real, não executado:** uma resposta curta com marcador único para o número QA já identificado, `+55 19 98220-6746`, sem mídia, agendamento, alerta ou cobrança. Sem repetição automática. Correlacionar ID da execução, ID da mensagem e confirmação de entrega do provedor; `Pending` não aprova. Executar somente numa rodada autorizada para envio real.

## Evidências reproduzíveis

- `scripts/audit-rollback.mjs`: APIs reais, fixtures identificadas, navegador e limpeza em `finally`; `--browser-only` limita a rodada às verificações visuais/conversas.
- `scripts/audit-live-workflows.mjs`: consulta da versão publicada, contratos em VM, preços e execuções históricas QA.
- `scripts/audit-fila-isolated.mjs`: clones SQL temporários com rollback e replay do ramo sem oferta; não modifica funções públicas.
- `tmp-auditoria/qa-audit-2026-09-11T04-54-06-043Z/resultados.json`: testes de API/banco. A asserção inicial de criação marcou falso por esperar `clinica_id` na resposta, campo omitido pela versão publicada; não é evidência de vazamento. O 404 da rota de fila também não comprova isolamento; essa classificação foi corrigida no script.
- `tmp-auditoria/qa-audit-2026-09-11T04-55-42-627Z/`: resultados e capturas autenticadas. A rodada anterior atingiu timeout em `networkidle`; a rodada visual usou `domcontentloaded` e concluiu.
- `tmp-auditoria/workflows-evidence.json`, `fila-isolada.json`, `suplemento.json`: versões, caminhos, consultas e resultados adicionais.

Atendimento preservado: `e628e2c4-9c77-4ee4-9206-fa55b65d4d74`, 73 nodes, `versionId == activeVersionId` na consulta desta auditoria.
