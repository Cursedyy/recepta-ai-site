const target = $("Preparar Destino Reembolso").first().json;
const rows = $input.all().map(item => item.json).filter(row => row.id);
if (rows.length !== 1 || rows[0].id !== target.clinica_alvo || rows[0].stripe_subscription_id !== target.subscription_id || rows[0].stripe_customer_id !== target.customer_id || rows[0].pedido_id !== target.pedido_id) {
  throw new Error("Reembolso: gravação da clínica não confirmada");
}
if (target.integral && (!rows[0].reembolsado_em || rows[0].status !== "expirado" || Number(rows[0].reembolso_valor) < target.valor)) throw new Error("Reembolso: revogação não confirmada");
if (!target.integral && !rows[0].reembolsado_em && Number(rows[0].reembolso_valor) < target.valor) throw new Error("Reembolso: valor parcial não confirmado");
return [{ json: target }];
