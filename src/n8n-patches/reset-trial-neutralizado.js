// F0a — node neutralizado (2026-09-13, deploy auditável via deploy-node-code).
//
// Este node estava com JS inválido (`.clinica_existente` sem prefixo $json —
// o terceiro caso do padrão "patch de node corrompeu produção") e carregava a
// RESET_TRIAL_KEY inline em texto claro, visível para quem lê a API do n8n.
//
// A rota destrutiva /api/clinica/reset-trial fica FORA do fluxo até o claim
// atômico do pedido pago (F6) substituir este ramo inteiro. Enquanto isso,
// reenvio de briefing de clínica já cadastrada FALHA COM MENSAGEM CLARA
// (erro deliberado → Error Workflow alerta o operador). Nada é apagado e a
// chave existente é invalidada pela rotação no Vercel (env RESET_TRIAL_KEY).
//
// Contrato preservado: este node apenas passa itens adiante quando não há
// nada a fazer; quem o sucede (Gerar ia_config) não lê campos dele.

const clinicaExistente = $json?.clinica_existente || $('Normalizar Busca Supabase')?.first()?.json?.clinica_existente || null;

if (clinicaExistente) {
  throw new Error(
    'F0A_NEUTRALIZADO: briefing reenviado de clínica já cadastrada. ' +
      'O reset automático de trial foi desligado (F0a) e será substituído ' +
      'pelo claim atômico do pedido (F6). Tratar manualmente: clínica "' +
      (clinicaExistente.clinica || clinicaExistente.id || 'desconhecida') +
      '".',
  );
}

return $input.all();
