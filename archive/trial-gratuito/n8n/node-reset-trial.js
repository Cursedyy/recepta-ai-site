// Node 'Reset Trial' do workflow voEwbw5fzNnn6bQq (Onboarding Automatico).
// Rodava quando o briefing chegava para uma clinica que JA EXISTIA: reabria o
// trial chamando /api/clinica/reset-trial. Morre junto com o trial.
//
// ATENCAO AO RESTAURAR: o original trazia a RESET_TRIAL_KEY em TEXTO CLARO
// aqui dentro, legivel por qualquer um com acesso a API do n8n. Esta cópia
// esta redigida. Se religar, a chave vai para credencial/env do n8n, nunca
// inline — e rotacione antes, porque o valor antigo ja esteve exposto.

const clinicaId = .clinica_existente?.id;
if (!clinicaId) return .all();
try {
  const r = await fetch('https://www.receptaai.com.br/api/clinica/reset-trial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': '<REDACTED>' },
    body: JSON.stringify({ clinica_id: clinicaId })
  });
  if (r.status === 409) {
    throw new Error('Instancia ja conectada. Trial ja foi usado.');
  }
} catch (e) {
  if (e.message.includes('Instancia ja conectada')) throw e;
}
return .all();