import { autenticarClinica } from "../_lib/auth-clinica.js";
import { sincronizarAgendamentoSheets } from "../_lib/sheets-sync.js";
import { ofertaTemJanelaValida } from "../_lib/fila-janela.js";

const JANELA_INVALIDA = {
  ok: false,
  erro: "janela_invalida",
  mensagem: "Informe início e fim válidos para a preferência e para o horário oferecido.",
};

function csrfOk(req) {
  const origin = req.headers?.origin || req.headers?.referer || "";
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "receptaai.com.br" || host === "www.receptaai.com.br" || host === "localhost";
  } catch { return false; }
}

async function tierCompleto(admin, clinicaId) {
  const { data } = await admin.from("clinicas").select("tier").eq("id", clinicaId).maybeSingle();
  return data?.tier === "completo";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  const auth = await autenticarClinica(req, res);
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);
  const { admin, perfil } = auth;
  if (!(await tierCompleto(admin, perfil.clinica_id))) {
    return res.status(403).json({ ok: false, erro: "fila_disponivel_apenas_no_completo", codigo: "TIER_COMPLETO_OBRIGATORIO" });
  }
  if (req.method === "GET") {
    const { data, error } = await admin.from("fila_espera").select("id,paciente_telefone,paciente_nome,servico,servico_normalizado,janela_inicio,janela_fim,oferta_inicio,oferta_fim,status,entrou_em,ofertado_em,oferta_expira_em,respondido_em,agendamento_id").eq("clinica_id", perfil.clinica_id).order("entrou_em", { ascending: true });
    if (error) return res.status(500).json({ ok: false, erro: "falha_buscar_fila" });
    return res.status(200).json({ ok: true, entradas: data || [] });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, erro: "metodo" });
  if (!csrfOk(req)) return res.status(403).json({ ok: false, erro: "csrf_invalido", codigo: "CSRF_INVALIDO" });
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return res.status(400).json({ ok: false, erro: "payload_invalido" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ ok: false, erro: "payload_invalido" });
  const acao = body.acao;
  const id = String(body.id || "");
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) || !["cancelar", "aceitar", "recusar"].includes(acao)) return res.status(400).json({ ok: false, erro: "acao_invalida" });
  // Body/query não são uma fonte de identidade. Clínica vem apenas da sessão.
  const { data: owned, error: erroBusca } = await admin.from("fila_espera").select("id,janela_inicio,janela_fim,oferta_inicio,oferta_fim").eq("id", id).eq("clinica_id", perfil.clinica_id).maybeSingle();
  if (erroBusca) return res.status(500).json({ ok: false, erro: "falha_buscar_fila" });
  if (!owned) return res.status(404).json({ ok: false, erro: "entrada_nao_encontrada" });
  if (acao === "cancelar") {
    const { data, error } = await admin.from("fila_espera").update({ status: "cancelado", respondido_em: new Date().toISOString() }).eq("id", id).eq("clinica_id", perfil.clinica_id).in("status", ["aguardando", "ofertado"]).select("id,status").maybeSingle();
    if (error) return res.status(409).json({ ok: false, erro: "nao_pode_cancelar" });
    return res.status(200).json({ ok: true, entrada: data });
  }
  // Rejeitar ofertas legadas/incompletas antes de executar a RPC de aceite.
  if (acao === "aceitar" && !ofertaTemJanelaValida(owned)) return res.status(400).json(JANELA_INVALIDA);
  const fn = acao === "aceitar" ? "fila_aceitar_oferta" : "fila_recusar_oferta";
  const { data, error } = await admin.rpc(fn, { p_id: id, p_clinica: perfil.clinica_id });
  if (error) {
    if (error.code === "22023") return res.status(400).json(JANELA_INVALIDA);
    if (error.code === "23505") return res.status(409).json({ ok: false, erro: "horario_ocupado" });
    if (error.code === "P0002") return res.status(404).json({ ok: false, erro: "entrada_nao_encontrada" });
    return res.status(409).json({ ok: false, erro: String(error.message).includes("expirada") ? "oferta_expirada" : "oferta_invalida" });
  }
  if (acao === "aceitar" && data?.id) {
    const { data: agendamento } = await admin.from("agendamentos").select("id,clinica_id,paciente_telefone,data_hora,sheet_row").eq("id", data.id).eq("clinica_id", perfil.clinica_id).maybeSingle();
    if (agendamento) await sincronizarAgendamentoSheets({ admin, agendamento });
  }
  return res.status(200).json({ ok: true, resultado: data });
}
