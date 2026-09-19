# Planilha modelo — Agenda por clínica

> **HISTÓRICO — spec de 2026-08-27, escrita antes de a agenda ir para produção.**
> A integração de agenda ESTÁ no ar (ver banner de `agenda-integracao-plano.md`).
> Use este arquivo só como referência do formato da planilha, nunca como estado.

Complementa `agenda-integracao-plano.md`. Este documento descreve a estrutura da
planilha Google Sheets modelo e o contrato de sincronização com `agendamentos` no
Supabase. **Não cria a planilha real** — isso é passo manual do Matheus (seção 3).
Não mexe em n8n nem em deploy.

Decisões já travadas que este doc assume (do PRD): Supabase é fonte da verdade, a
planilha é espelho visual nunca lido pelo bot; 1 planilha por clínica; provisionamento
manual (sem Drive API por ora); coluna `sheet_row` decidida (proposta nesta seção 1).

## 1. Estrutura da aba "Agenda" (aba única, template)

| Coluna       | Formato                     | Vem de (`agendamentos`)                                                                                                                                        |
| ------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data         | `DD/MM/AAAA`                | `data_hora` (convertido pra `America/Sao_Paulo` antes de escrever)                                                                                             |
| Hora         | `HH:mm`                     | `data_hora` (mesma conversão)                                                                                                                                  |
| Telefone     | `(DD) 9XXXX-XXXX`           | `paciente_telefone` (formatado — mesma função `formatarTelefone` já usada em `src/painel/index.html`, pra manter o padrão de exibição igual em todo o produto) |
| Status       | `Agendado` / `Cancelado`    | `status` (capitalizado — minúsculo no banco, capitalizado na planilha porque é a única coluna que fica visível pro humano da clínica)                          |
| Cancelado em | `DD/MM/AAAA HH:mm` ou vazio | `cancelado_em` (vazio enquanto `status='agendado'`)                                                                                                            |

Linha 1 = cabeçalho fixo (os 5 nomes acima). Nenhuma outra aba no arquivo.

`data_hora` no Supabase é `timestamptz` (armazenado em UTC) — a conversão pra
`America/Sao_Paulo` acontece no workflow n8n que escreve na planilha (mesmo padrão já
usado no Code node `Montar Mensagem` do workflow de lembretes, que já faz essa
conversão com `toLocaleTimeString('pt-BR', {timeZone: 'America/Sao_Paulo', ...})`).

### Coluna nova: `agendamentos.sheet_row`

Não é uma coluna da planilha — é uma coluna nova em `agendamentos` (Supabase) que
guarda o **número da linha física** que aquele agendamento ocupa na planilha da
clínica. Existe pra permitir update/cancelamento por posição direta (`values.update`
numa linha exata), em vez de buscar por telefone+data/hora — que tem risco real de
ambiguidade (2 agendamentos do mesmo paciente em horários próximos, erro de fuso,
etc — ponto já levantado no PRD).

**Tipo proposto**: `integer`, nullable. Nullable porque continua null até a integração
de planilha existir de verdade (workflows Criar/Cancelar Agendamento, ainda não
construídos) — não quebra nada do que já roda hoje (lembretes não usam essa coluna).

**Migration nova** (arquivo já criado em
`supabase-migrations/004_sheet_row.sql`, **não rodei** — confira e rode você mesmo no
SQL editor do Supabase quando aprovar):

```sql
-- sheet_row: numero da linha fisica que o agendamento ocupa na planilha Google Sheets
-- da clinica (retornado pelo values.append quando o workflow Criar Agendamento
-- escrever la, futuro). Permite update/cancelamento por posicao direta, sem buscar
-- por telefone+data/hora (risco de ambiguidade ja levantado no PRD). Nullable ate
-- a integracao de planilha existir de verdade - nao afeta nada que ja roda hoje
-- (lembretes nao usam essa coluna).
alter table public.agendamentos
  add column sheet_row integer;
```

## 2. Como cada linha se relaciona com `agendamentos`

**Hoje (estado atual): nenhuma automação escreve em nenhum dos dois lados ainda.** O
workflow de atendimento não grava em `agendamentos` (não existe fluxo de agendar de
verdade), e a planilha nem foi criada pra nenhuma clínica. Este documento descreve o
contrato de como vai funcionar **quando** os workflows Criar/Cancelar Agendamento (item
4b/4c do PRD) forem construídos — é especificação pra revisão, não implementação.

**Quando existir**: escrita dupla, sempre nesta ordem — Supabase primeiro, planilha
depois (nunca o contrário, porque sem linha no Supabase o lembrete nunca dispara):

1. Recepta decide agendar → **insert** em `agendamentos` (`status='agendado'`) → captura o
   `id` gerado.
2. **`values.append`** na planilha da clínica (usa `clinicas.spreadsheet_id`) — a API
   do Sheets devolve a posição da linha escrita.
3. **update** em `agendamentos` só pra gravar `sheet_row` = essa posição.
4. Se o passo 2 ou 3 falhar: alerta pro WhatsApp do Matheus (mesmo padrão dos alertas
   de onboarding/trial) — "agendamento X salvo no Supabase mas não sincronizou na
   planilha, confere manual". O agendamento no Supabase **continua válido** (lembrete
   dispara normalmente mesmo sem `sheet_row` — essa coluna só importa pro fluxo de
   cancelamento).

Cancelamento (quando existir): **update** em `agendamentos` (`status='cancelado'`,
`cancelado_em=now()`) primeiro, depois **`values.update`** na linha `sheet_row` da
planilha (Status → "Cancelado", Cancelado em → timestamp formatado).

**Regra permanente, mesmo depois da automação existir: humano nunca edita a planilha
diretamente.** O bot nunca lê a planilha de volta pra decidir nada (confirmado no PRD,
seção 1) — se alguém da clínica editar uma célula à mão (mudar Status, apagar linha),
isso não tem efeito nenhum no sistema real e **diverge silenciosamente**: a planilha
passa a mostrar algo que não é verdade, sem erro nem aviso. A planilha é só um espelho
de leitura pra clínica olhar — todo lugar onde isso for comunicado pra clínica precisa
deixar isso claro.

## 3. Passo a passo manual — clínica nova (Matheus)

Roda toda vez que uma clínica nova fecha, depois que `config_agenda` já estiver
preenchido (`dias_atendimento`, `duracao_consulta_min`, `intervalo_min`,
`email_compartilhamento` — esse último é o e-mail que recebe o compartilhamento no
passo 3 abaixo):

1. Abrir o Google Drive, localizar a planilha modelo ("Recepta AI - Agenda (Modelo)").
2. Botão direito → **Fazer uma cópia**.
3. Renomear a cópia: `Recepta AI - Agenda - {Nome da Clínica}`.
4. Compartilhar a cópia com dois e-mails:
   - `config_agenda.email_compartilhamento` da clínica (coluna `clinicas.config_agenda`,
     já preenchida no onboarding) — permissão **Leitor** (a clínica só acompanha, nunca
     edita — ver regra da seção 2).
   - E-mail da service account do Google (permissão **Editor** — é quem escreve de
     verdade via API). _A service account ainda não existe (PRD seção 3, não
     implementado) — este passo fica pendente até ela ser criada._
5. Abrir a cópia, copiar o `spreadsheet_id` da URL (o trecho entre `/d/` e
   `/edit` em `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`).
6. Gravar no Supabase: `UPDATE clinicas SET spreadsheet_id = 'SPREADSHEET_ID' WHERE id = '<id da clínica>';` (SQL editor, ou update manual na tabela).

Depois disso a clínica está pronta pra usar a planilha assim que os workflows
Criar/Cancelar Agendamento existirem — nenhuma ação extra necessária nesta clínica
quando esses workflows forem ativados globalmente.

## O que este documento não decide

- Quando os workflows Criar/Cancelar Agendamento serão construídos (fora de escopo
  aqui, PRD já registra a ordem: lembretes primeiro, depois o resto).
- Automação do provisionamento via Drive API (`files.copy`) — decidido no PRD que fica
  pra quando o volume justificar.
- Criação da service account do Google — pré-requisito do passo 4 acima, ainda não
  feito.
