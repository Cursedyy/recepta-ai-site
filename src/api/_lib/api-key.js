import { timingSafeEqual } from "node:crypto";

/**
 * Compara a API key recebida no header com a esperada, em tempo constante.
 *
 * Usada pelas rotas chamadas pelo n8n (`X-Api-Key`): o convite externo em
 * `api/painel/admin.js` e o `api/clinica/reset-trial.js`. Um `!==` vaza o
 * numero de bytes corretos pelo tempo de resposta, e a chave do reset-trial
 * protege uma rota que APAGA clinica.
 *
 * `timingSafeEqual` exige buffers do mesmo tamanho, entao o length e
 * comparado antes — isso vaza o tamanho da chave, nao o conteudo.
 */
export function apiKeyValida(recebida, esperada) {
  if (typeof recebida !== "string" || typeof esperada !== "string")
    return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
