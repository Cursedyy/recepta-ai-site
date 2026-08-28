# Gate de assinatura no Atendimento (n8n)

Workflow **Atendimento WhatsApp (Template Genérico) (1)** — `cxn5FxUNMJmlJ1WJ`.

Sem este IF, `/api/stripe/webhook` e `/api/cron/expirar-trials` gravam
`suspensa` no banco e o bot continua atendendo de graça. Ver a nota de
memória `billing`.

## Onde entra

Depois de `Buscar Clinica` (que já faz `select=*`, então `status` já chega) e
**antes** de `Montar Prompt` / `Chamar Claude`:

```
Buscar Clinica → [Assinatura Ativa?] → true  → Montar Prompt → ... (fluxo atual)
                                     → false → NoOp "Assinatura inativa"
```

O ramo `false` não deve responder nada ao paciente: a clínica está fora, quem
fala com ela é o comercial, não o bot. Se preferir uma resposta fixa, ligue o
`false` no node de envio com um texto curto — nunca no Claude, que custa
dinheiro por clínica que não paga.

## Node para colar no canvas

Copiar o JSON abaixo e colar direto no editor do n8n (Ctrl+V no canvas cria o
node). Depois ligar as três pontas e **publicar** — mudança não publicada fica
no rascunho (`versionId != activeVersionId`) e não está no ar.

```json
{
  "nodes": [
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "loose",
            "version": 2
          },
          "conditions": [
            {
              "id": "assinatura-ativa",
              "leftValue": "={{ $json.status }}",
              "rightValue": "trial,ativo",
              "operator": {
                "type": "string",
                "operation": "regex"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [0, 0],
      "name": "Assinatura Ativa?"
    }
  ],
  "connections": {}
}
```

O operador acima é `regex` porque a lista é pequena e assim cabe num node só.
Se preferir explícito, troque a condição por duas em `combinator: "or"`, cada
uma `equals` (`trial` e `ativo`).

## Cuidado que importa

A condição é uma **lista de permissão**, não de bloqueio: só `trial` e `ativo`
passam. Escrever ao contrário (`status != 'suspensa'`) faz clínica com status
nulo, vazio ou escrito errado atravessar o gate — que é exatamente o caso que
se quer barrar. A migration 009 já preenche `status` de quem estava sem, mas a
lista de permissão é o que garante isso pra frente.

## Conferir depois de publicar

1. Uma clínica com `status = 'ativo'` continua recebendo resposta.
2. `update clinicas set status = 'suspensa' where id = '<clínica de teste>'` e
   mandar mensagem: o bot fica mudo, e a execução mostra o caminho pelo ramo
   `false`.
3. Voltar para `'ativo'`.

Lembrete: `status: success` numa execução não significa sucesso do fluxo —
conferir o CAMINHO dos nodes, não o badge.
