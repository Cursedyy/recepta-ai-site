// EXTRAIDO DE src/api/painel/admin.js (commit 4001ac4).
// Criacao manual de clinica pelo admin, que abria trial de 7 dias.
// O fix de 2026-09-02 (commit 04f6de4) esta aqui: antes inseria status
// 'trial', valor que o cron nao expira, criando clinica imortal.

// --- linhas 195-210 (insert) ---
    const trialFim = new Date(now.getTime() + 7 * 86400000);
    const { data, error } = await admin
      .from("clinicas")
      .insert({
        clinica: nome,
        status: "ativo",
        trial_inicio: now.toISOString(),
        trial_fim: trialFim.toISOString(),
        tier: "completo",
      })
      .select("id,clinica")
      .maybeSingle();
    if (error) return res.status(500).json({ erro: "falha_criar" });
    await registrarLog(
      admin,
      userId,

// --- linhas 220-230 (update) ---
    const id = body?.id;
    if (!id) return res.status(400).json({ erro: "id_obrigatorio" });
    const updates = {};
    if (typeof body?.nome === "string" && body.nome.trim())
      updates.clinica = body.nome.trim();
    if (typeof body?.status === "string") updates.status = body.status;
    if (body?.trial_fim !== undefined) updates.trial_fim = body.trial_fim;
    if (typeof body?.plano === "string") updates.plano = body.plano;
    if (body?.tier !== undefined) {
      if (typeof body.tier !== "string" || !TIERS_VALIDOS.has(body.tier)) {
        return res.status(400).json({ erro: "tier_invalido" });
