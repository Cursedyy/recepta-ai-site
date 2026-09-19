# Fila integrada ao Atendimento de produção — 11/09/2026

**O que aconteceu:** com autorização explícita, `src/n8n-patches/aplicar-fila-producao.mjs --aplicar` integrou a fila ao Atendimento (`cxn5FxUNMJmlJ1WJ`) usando o **mesmo** `fila-integracao.mjs` provado pela bateria QA (65/65, evidência `tmp-qa-fila-e2e/resultado-2026-09-11T19-34-57-686Z.json`).

## Evidência da aplicação (lida do servidor, não do payload enviado)

- `versionId == activeVersionId == 2ebb0065-644c-409e-8e87-a56636daf300` (publicado, não draft), `active: true`, **95 nodes** (73 → 95).
- 22/22 nodes da fila presentes; entrada `Consolidar Histórico → Gate Fila Tier Completo`; saída false do gate → `IF - É Áudio?` (atendimento de sempre intacto).
- Webhooks de produção preservados: `recepta/in/188316d5…` e `recepta/out`.
- `Chamar Claude` / `Enviar Parte` / `Enviar Alerta` seguem `httpRequest` (nenhum mock vazou); `Configuração da Clínica` agora injeta `clinica_id`, `tier`, `supabase_url`.
- Invariantes do aplicador passaram: 0 nodes removidos, nenhum node trocou de tipo.

## O que continua DESLIGADO (por decisão, não por acidente)

- **WhatsApp da fila:** `fila_whatsapp_enabled: false` no "Config Fixa" de Cancelar Agendamento (`elFchoRzp2dzbweH`, `versionId 8c078107…`, intacto). A cópia QA também forçava `false`; nada na fila envia oferta por WhatsApp até a flag virar `true`.
- **Cron de expiração:** `Expirar Ofertas Fila` (`o17p1vkWI7oPCPoU`) **inativo**, `versionId fe1ea558…`. Sem ele, ofertas não expiram sozinhas nem reofertam — oferecer slot hoje é só via chamada manual da RPC `fila_ofertar_proximo`.

## Bateria QA que provou este código

65 asserções / 16 cenários, zero falhas (retry só para infra: timeout/ECONNRESET/502/503/504; erros de lógica falharam alto na rodada de descoberta — "Workflow does not exist", 504). Essencial não executou nenhum node de fila (gate na entrada). Nenhum request saiu para UazAPI/Anthropic/OpenAI/Sheets (mocks + guarda de isolamento no construtor). Infra QA (cópias + clínica sintética) removida no fim — teardown 22/22.

## Health check

Antes e depois da aplicação: site `/`, `/briefing`, `/clinica/painel` OK; Supabase OK; **5/5 workflows críticos ativos**; `recepta-alertas` conectada. Único erro, pré-existente e alheio a esta mudança: UazAPI 4/2 instâncias (2 desconectadas de outro produto, não tocadas).

## Rollback

```
node src/n8n-patches/aplicar-fila-producao.mjs --rollback "tmp-backup-workflows-deletados/cxn5FxUNMJmlJ1WJ-pre-fila-2026-09-11T20-06-53-737Z.json"
```

O backup contém o estado pré-fila (`versionId e628e2c4-9c77-4ee4-9206-fa55b65d4d74`, 73 nodes).

## Pendências abertas (não desta rodada)

- Memória do projeto `fila-espera` ficou **desatualizada** (registra bateria 61/61 e "fila não integrada"): a ferramenta de memória falhou nesta sessão (`name_required` em toda tentativa). Atualizá-la quando voltar a funcionar — o estado correto é este documento.
- Ativação do WhatsApp da fila (`fila_whatsapp_enabled: true`) e do cron de expiração é decisão separada, com teste próprio.
