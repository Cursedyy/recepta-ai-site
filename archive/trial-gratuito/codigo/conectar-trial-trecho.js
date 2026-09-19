// EXTRAIDO DE src/api/clinica/conectar.js (commit 4001ac4).
// ESTE e o coracao do trial: o relogio comecava aqui, no primeiro polling que
// via o WhatsApp conectado — NAO no n8n. A memoria `billing` dizia que ninguem
// escrevia trial_inicio/trial_fim e estava errada; era este arquivo.
//
// No modelo de pagamento antecipado o MESMO gatilho passa a escrever
// `garantia_fim`. Para voltar ao trial: devolver a constante, as duas funcoes
// e a chamada no handler.

// --- linha 45: a constante ---
const TRIAL_DIAS = 7;

// --- linhas 111-161: as duas funcoes ---
/**
 * O relogio do trial comeca quando o WhatsApp conecta, nao quando o briefing e
 * enviado. Motivo: o onboarding pode falhar em provisionar a instancia, e nesse
 * caso o cliente nunca usou nada — cobrar dele os 7 dias seria cobrar por um
 * produto que nao subiu. Por isso o n8n insere trial_inicio/trial_fim nulos e
 * quem os preenche e este endpoint, no primeiro polling que ve a instancia
 * conectada.
 *
 * Duas condicoes, ambas necessarias:
 * - trial_inicio nulo: o trial so comeca UMA vez. Reconectar o WhatsApp no
 *   quinto dia nao pode devolver sete dias novos.
 * - sem stripe_customer_id: quem passou pelo checkout nao esta em trial. O n8n
 *   zera trial_fim ao confirmar pagamento (node "Supabase Confirmar
 *   Pagamento"), entao escrever aqui reabriria um trial para quem ja paga.
 *
 * Nao usamos plano_pago_em como guarda: nenhuma outra rota le essa coluna,
 * entao nao ha prova de que ela existe, e pedir coluna inexistente faz o
 * Supabase falhar a query inteira. stripe_customer_id cobre o caso.
 */
function deveIniciarTrial(clinica) {
  if (clinica.trial_inicio) return false;
  if (clinica.stripe_customer_id) return false;
  return true;
}

/**
 * Escrita condicional: o .is("trial_inicio", null) faz o banco decidir, nao
 * nos. O status e consultado em polling (3s na pagina de conexao, 15s no banner
 * do painel), entao duas chamadas podem ver a instancia conectar ao mesmo
 * tempo; sem a condicao, a segunda sobrescreveria a data da primeira.
 *
 * Falha aqui nao derruba a resposta de status: a pagina precisa saber que
 * conectou. E auto-curavel — trial_inicio continua nulo e o proximo polling
 * tenta de novo.
 */
async function iniciarTrial(admin, clinicaId) {
  const agora = new Date();
  const fim = new Date(agora.getTime() + TRIAL_DIAS * 86400000);
  const { error } = await admin
    .from("clinicas")
    .update({
      trial_inicio: agora.toISOString(),
      trial_fim: fim.toISOString(),
    })
    .eq("id", clinicaId)
    .is("trial_inicio", null);
  if (error) {
    console.error("trial_inicio_falhou", clinicaId, error.message);
  }
}


// --- linha ~254: a chamada dentro do handler de status ---
  // nao manda webhook, e /instance/connect responde antes do pareamento
  // terminar.
  if (instancia.conectado && deveIniciarTrial(clinica)) {
    await iniciarTrial(admin, perfil.clinica_id);
  }
