import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";

// ── Auth helper ──
async function autenticarAdmin(req, res) {
  const supabase = createSupabaseServerClient(req, res);
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { erro: { status: 401, corpo: { erro: "nao_autenticado" } } };

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { erro: { status: 500, corpo: { erro: "supabase_nao_configurado" } } };

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: perfil } = await admin.from("perfis").select("papel,clinica_id").eq("id", user.id).maybeSingle();

  if (!perfil || perfil.papel !== "admin") {
    return { erro: { status: 403, corpo: { erro: "sem_permissao" } } };
  }
  return { admin, perfil, userId: user.id };
}

function escapeCsv(v) {
  const s = String(v || "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function registrarLog(admin, userId, acao, detalhes, ip) {
  await admin.from("logs_auditoria").insert({ usuario_id: userId, acao, detalhes, ip });
}

function getClientIp(req) {
  const f = req.headers["x-forwarded-for"];
  if (typeof f === "string") return f.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// ── Handlers ──

// GET /api/painel/admin?acao=clinicas|usuarios|metricas|convites|logs
async function handleGet(req, res, auth) {
  const { admin } = auth;
  const acao = req.query?.acao;

  // ── Listar clínicas ──
  if (acao === "clinicas") {
    const { data, error } = await admin.from("clinicas").select("id,clinica,status,trial_fim,plano,stripe_customer_id,tempo_pausa_minutos,criado_em").order("criado_em", { ascending: false });
    if (error) return res.status(500).json({ erro: "falha_buscar" });
    return res.status(200).json({ ok: true, clinicas: data || [] });
  }

  // ── Listar usuários ──
  if (acao === "usuarios") {
    const { data: perfis, error } = await admin.from("perfis").select("id,papel,clinica_id,nome,ativo").order("papel");
    if (error) return res.status(500).json({ erro: "falha_buscar" });

    const { data: clinicas } = await admin.from("clinicas").select("id,clinica");
    const mapaClinicas = {};
    (clinicas || []).forEach(c => { mapaClinicas[c.id] = c.clinica; });

    const usuariosComEmail = await Promise.all((perfis || []).map(async (p) => {
      let email = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(p.id);
        email = u?.user?.email || null;
      } catch {}
      return { ...p, email, clinica_nome: mapaClinicas[p.clinica_id] || null };
    }));

    return res.status(200).json({ ok: true, usuarios: usuariosComEmail });
  }

  // ── Métricas agregadas ──
  if (acao === "metricas") {
    const [totalClinicas, clinicasAtivas, totalConversas, totalEscalonamentos] = await Promise.all([
      admin.from("clinicas").select("id", { count: "exact", head: true }),
      admin.from("clinicas").select("id", { count: "exact", head: true }).eq("status", "ativo"),
      admin.from("conversas").select("id", { count: "exact", head: true }),
      admin.from("conversas").select("id", { count: "exact", head: true }).eq("escalado", true),
    ]);

    const { data: ultimasConversas } = await admin.from("conversas").select("criado_em").order("criado_em", { ascending: false }).limit(1);

    return res.status(200).json({
      ok: true,
      total_clinicas: totalClinicas?.count || 0,
      clinicas_ativas: clinicasAtivas?.count || 0,
      total_conversas: totalConversas?.count || 0,
      total_escalonamentos: totalEscalonamentos?.count || 0,
      ultima_conversa: ultimasConversas?.[0]?.criado_em || null,
    });
  }

  // ── Listar convites pendentes ──
  if (acao === "convites") {
    const { data, error } = await admin.from("convites_clinica").select("id,clinica_id,tipo,token,expira_em,usado_em,criado_em").is("usado_em", null).order("criado_em", { ascending: false }).limit(100);
    if (error) return res.status(500).json({ erro: "falha_buscar" });

    const { data: clinicas } = await admin.from("clinicas").select("id,clinica");
    const mapa = {};
    (clinicas || []).forEach(c => { mapa[c.id] = c.clinica; });

    const comNome = (data || []).map(c => ({ ...c, clinica_nome: mapa[c.clinica_id] || "?" }));
    return res.status(200).json({ ok: true, convites: comNome });
  }

  // ── Logs de auditoria ──
  if (acao === "logs") {
    const limit = Math.min(parseInt(req.query?.limit) || 50, 200);
    const { data, error } = await admin.from("logs_auditoria").select("id,usuario_id,acao,detalhes,ip,criado_em").order("criado_em", { ascending: false }).limit(limit);
    if (error) return res.status(500).json({ erro: "falha_buscar" });
    return res.status(200).json({ ok: true, logs: data || [] });
  }

  return res.status(400).json({ erro: "acao_invalida" });
}

// POST /api/painel/admin
async function handlePost(req, res, auth) {
  const { admin, userId } = auth;
  const ip = getClientIp(req);
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ erro: "payload_invalido" }); }

  // ── Criar clínica ──
  if (body?.acao === "criar_clinica") {
    const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
    if (!nome) return res.status(400).json({ erro: "nome_obrigatorio" });
    const { data, error } = await admin.from("clinicas").insert({ clinica: nome, status: "trial", trial_fim: new Date(Date.now() + 14 * 86400000).toISOString() }).select("id,clinica").maybeSingle();
    if (error) return res.status(500).json({ erro: "falha_criar" });
    await registrarLog(admin, userId, "criar_clinica", { clinica_id: data.id, nome }, ip);
    return res.status(200).json({ ok: true, clinica: data });
  }

  // ── Editar clínica ──
  if (body?.acao === "editar_clinica") {
    const id = body?.id;
    if (!id) return res.status(400).json({ erro: "id_obrigatorio" });
    const updates = {};
    if (typeof body?.nome === "string" && body.nome.trim()) updates.clinica = body.nome.trim();
    if (typeof body?.status === "string") updates.status = body.status;
    if (body?.trial_fim !== undefined) updates.trial_fim = body.trial_fim;
    if (typeof body?.plano === "string") updates.plano = body.plano;
    if (typeof body?.tempo_pausa_minutos === "number") updates.tempo_pausa_minutos = body.tempo_pausa_minutos;
    if (!Object.keys(updates).length) return res.status(400).json({ erro: "nada_para_atualizar" });
    const { error } = await admin.from("clinicas").update(updates).eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_atualizar" });
    await registrarLog(admin, userId, "editar_clinica", { clinica_id: id, updates }, ip);
    return res.status(200).json({ ok: true });
  }

  // ── Gerar convite para clínica ──
  if (body?.acao === "gerar_convite") {
    const clinicaId = body?.clinica_id;
    if (!clinicaId) return res.status(400).json({ erro: "clinica_id_obrigatorio" });
    const { nanoid } = await import("nanoid");
    const token = nanoid(24);
    const expiraEm = new Date(Date.now() + 48 * 3600000).toISOString();
    const { error } = await admin.from("convites_clinica").insert({ clinica_id: clinicaId, token, expira_em, tipo: "convite" });
    if (error) return res.status(500).json({ erro: "falha_criar_convite" });
    const base = process.env.SITE_URL || "https://www.receptaai.com.br";
    const url = base + "/clinica/definir-senha/" + token;
    await registrarLog(admin, userId, "gerar_convite", { clinica_id: clinicaId }, ip);
    return res.status(200).json({ ok: true, token, expira_em: expiraEm, url });
  }

  // ── Ativar/desativar usuário ──
  if (body?.acao === "toggle_usuario") {
    const id = body?.id;
    const ativo = body?.ativo;
    if (!id || typeof ativo !== "boolean") return res.status(400).json({ erro: "parametros_invalidos" });
    const { error } = await admin.from("perfis").update({ ativo }).eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_atualizar" });
    await registrarLog(admin, userId, ativo ? "ativar_usuario" : "desativar_usuario", { usuario_id: id }, ip);
    return res.status(200).json({ ok: true });
  }

  // ── Alterar papel do usuário ──
  if (body?.acao === "alterar_papel") {
    const id = body?.id;
    const papel = body?.papel;
    if (!id || !["admin", "clinica"].includes(papel)) return res.status(400).json({ erro: "parametros_invalidos" });
    const { error } = await admin.from("perfis").update({ papel }).eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_atualizar" });
    await registrarLog(admin, userId, "alterar_papel", { usuario_id: id, papel }, ip);
    return res.status(200).json({ ok: true });
  }

  // ── Resetar senha de usuário (gera convite de reset) ──
  if (body?.acao === "resetar_senha") {
    const usuarioId = body?.usuario_id;
    if (!usuarioId) return res.status(400).json({ erro: "usuario_id_obrigatorio" });
    const { data: perfil } = await admin.from("perfis").select("clinica_id").eq("id", usuarioId).maybeSingle();
    if (!perfil) return res.status(404).json({ erro: "usuario_nao_encontrado" });
    const { nanoid } = await import("nanoid");
    const token = nanoid(24);
    const expiraEm = new Date(Date.now() + 2 * 3600000).toISOString();
    const { error } = await admin.from("convites_clinica").insert({ clinica_id: perfil.clinica_id, token, expira_em, tipo: "reset" });
    if (error) return res.status(500).json({ erro: "falha_criar_convite" });
    const base = process.env.SITE_URL || "https://www.receptaai.com.br";
    const url = base + "/clinica/definir-senha/" + token;
    await registrarLog(admin, userId, "resetar_senha", { usuario_id: usuarioId }, ip);
    return res.status(200).json({ ok: true, url });
  }

  // ── Excluir convite ──
  if (body?.acao === "excluir_convite") {
    const id = body?.id;
    if (!id) return res.status(400).json({ erro: "id_obrigatorio" });
    const { error } = await admin.from("convites_clinica").delete().eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_excluir" });
    await registrarLog(admin, userId, "excluir_convite", { convite_id: id }, ip);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ erro: "acao_invalida" });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  let auth;
  try { auth = await autenticarAdmin(req, res); } catch { return res.status(500).json({ erro: "supabase_nao_configurado" }); }
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);

  if (req.method === "GET") return handleGet(req, res, auth);
  if (req.method === "POST") return handlePost(req, res, auth);
  return res.status(405).json({ erro: "metodo" });
}
