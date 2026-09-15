const ESPERA = (ms) => new Promise((r) => setTimeout(r, ms));

// Sincronização é sempre pós-commit: falha aqui nunca desfaz o agendamento.
export async function sincronizarAgendamentoSheets({ admin, agendamento }) {
  const { data: clinica } = await admin.from("clinicas").select("spreadsheet_id").eq("id", agendamento.clinica_id).maybeSingle();
  const token = process.env.GOOGLE_SHEETS_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN;
  if (!clinica?.spreadsheet_id || !token) {
    console.warn("sheets_sync_pendente", JSON.stringify({ agendamento_id: agendamento.id, motivo: !clinica?.spreadsheet_id ? "sem_planilha" : "credencial_indisponivel" }));
    return { ok: false, pendente: true };
  }
  if (agendamento.sheet_row) return { ok: true, sheet_row: agendamento.sheet_row, duplicado: false };
  const dt = new Date(agendamento.data_hora);
  const data = dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = dt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const valores = [[data, hora, agendamento.paciente_telefone, "Agendado", ""]];
  let ultimo;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(clinica.spreadsheet_id)}/values/Agenda!A:E:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ values: valores }) });
      const body = await r.json();
      if (!r.ok) throw new Error(`sheets_${r.status}`);
      const match = String(body?.updates?.updatedRange || "").match(/!A(\d+):/);
      const sheetRow = match ? Number(match[1]) : null;
      if (sheetRow) await admin.from("agendamentos").update({ sheet_row: sheetRow }).eq("id", agendamento.id).is("sheet_row", null);
      return { ok: true, sheet_row: sheetRow };
    } catch (e) { ultimo = e; if (tentativa < 2) await ESPERA(250 * 2 ** tentativa); }
  }
  console.error("sheets_sync_falhou", JSON.stringify({ agendamento_id: agendamento.id, erro: ultimo?.message }));
  return { ok: false, pendente: true };
}
