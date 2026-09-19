const target = $("Validar Pedido Reembolso").first().json;
const rows = $input.all().map(item => item.json).filter(row => row.id);
// No clinic yet, or an old subscription has been replaced: do not revoke a
// different purchase. The identified pedido and old subscription still close.
if (rows.length > 1) throw new Error("Reembolso: clínica ambígua");
const clinic = rows[0];
if (clinic && (clinic.id !== target.clinica_id || clinic.stripe_subscription_id !== target.subscription_id || clinic.stripe_customer_id !== target.customer_id || clinic.pedido_id !== target.pedido_id)) {
  throw new Error("Reembolso: vínculo da clínica diverge do pedido");
}
return [{ json: { ...target, clinica_alvo: clinic?.id || null,
  motivo: clinic?.reembolso_motivo || target.motivo,
  reembolsado_em: clinic?.reembolsado_em || null,
} }];
