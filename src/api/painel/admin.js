import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../_lib/supabase-server.js";
import { getClientIp } from "../_lib/rate-limit.js";

const TIERS_VALIDOS = new Set(["essencial", "completo"]);

// ── Auth helper ──
async function autenticarAdmin(req, res) {
  const supabase = createSupabaseServerClient(req, res);
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user)
    return { erro: { status: 401, corpo: { erro: "nao_autenticado" } } };

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return {
      erro: { status: 500, corpo: { erro: "supabase_nao_configurado" } },
    };

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: perfil } = await admin
    .from("perfis")
    .select("papel,clinica_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || perfil.papel !== "admin") {
    return { erro: { status: 403, corpo: { erro: "sem_permissao" } } };
  }
  return { admin, perfil, userId: user.id };
}

function escapeCsv(v) {
  const s = String(v || "");
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function registrarLog(admin, userId, acao, detalhes, ip) {
  await admin
    .from("logs_auditoria")
    .insert({ usuario_id: userId, acao, detalhes, ip });
}

// Copia local removida: lia o PRIMEIRO elemento de x-forwarded-for, que o
// cliente controla, e gravava esse IP forjado nos logs de auditoria.

// ── Handlers ──

// GET /api/painel/admin?acao=clinicas|usuarios|metricas|convites|logs
async function handleGet(req, res, auth) {
  const { admin } = auth;
  const acao = req.query?.acao;

  // ── Listar clínicas ──
  if (acao === "clinicas") {
    const { data, error } = await admin
      .from("clinicas")
      .select(
        "id,clinica,status,trial_fim,plano,tier,stripe_customer_id,tempo_pausa_minutos,criado_em",
      )
      .order("criado_em", { ascending: false });
    if (error) return res.status(500).json({ erro: "falha_buscar" });
    return res.status(200).json({ ok: true, clinicas: data || [] });
  }

  // ── Listar usuários ──
  if (acao === "usuarios") {
    const { data: perfis, error } = await admin
      .from("perfis")
      .select("id,papel,clinica_id,nome,ativo")
      .order("papel");
    if (error) return res.status(500).json({ erro: "falha_buscar" });

    const { data: clinicas } = await admin
      .from("clinicas")
      .select("id,clinica");
    const mapaClinicas = {};
    (clinicas || []).forEach((c) => {
      mapaClinicas[c.id] = c.clinica;
    });

    const usuariosComEmail = await Promise.all(
      (perfis || []).map(async (p) => {
        let email = null;
        try {
          const { data: u } = await admin.auth.admin.getUserById(p.id);
          email = u?.user?.email || null;
        } catch {}
        return {
          ...p,
          email,
          clinica_nome: mapaClinicas[p.clinica_id] || null,
        };
      }),
    );

    return res.status(200).json({ ok: true, usuarios: usuariosComEmail });
  }

  // ── Métricas agregadas ──
  if (acao === "metricas") {
    const [totalClinicas, clinicasAtivas, totalConversas, totalEscalonamentos] =
      await Promise.all([
        admin.from("clinicas").select("id", { count: "exact", head: true }),
        admin
          .from("clinicas")
          .select("id", { count: "exact", head: true })
          .eq("status", "ativo"),
        admin.from("conversas").select("id", { count: "exact", head: true }),
        admin
          .from("conversas")
          .select("id", { count: "exact", head: true })
          .eq("escalado", true),
      ]);

    const { data: ultimasConversas } = await admin
      .from("conversas")
      .select("criado_em")
      .order("criado_em", { ascending: false })
      .limit(1);

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
    const { data, error } = await admin
      .from("convites_clinica")
      .select("id,clinica_id,tipo,token,expira_em,usado_em,criado_em")
      .is("usado_em", null)
      .order("criado_em", { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ erro: "falha_buscar" });

    const { data: clinicas } = await admin
      .from("clinicas")
      .select("id,clinica");
    const mapa = {};
    (clinicas || []).forEach((c) => {
      mapa[c.id] = c.clinica;
    });

    const comNome = (data || []).map((c) => ({
      ...c,
      clinica_nome: mapa[c.clinica_id] || "?",
    }));
    return res.status(200).json({ ok: true, convites: comNome });
  }

  // ── Logs de auditoria ──
  if (acao === "logs") {
    const limit = Math.min(parseInt(req.query?.limit) || 50, 200);
    const { data, error } = await admin
      .from("logs_auditoria")
      .select("id,usuario_id,acao,detalhes,ip,criado_em")
      .order("criado_em", { ascending: false })
      .limit(limit);
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
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }

  // ── Criar clínica ──
  if (body?.acao === "criar_clinica") {
    const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
    if (!nome) return res.status(400).json({ erro: "nome_obrigatorio" });
    const now = new Date();
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
      "criar_clinica",
      { clinica_id: data.id, nome },
      ip,
    );
    return res.status(200).json({ ok: true, clinica: data });
  }

  // ── Editar clínica ──
  if (body?.acao === "editar_clinica") {
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
      }
      updates.tier = body.tier;
    }
    if (typeof body?.tempo_pausa_minutos === "number")
      updates.tempo_pausa_minutos = body.tempo_pausa_minutos;
    if (!Object.keys(updates).length)
      return res.status(400).json({ erro: "nada_para_atualizar" });
    const { error } = await admin.from("clinicas").update(updates).eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_atualizar" });
    await registrarLog(
      admin,
      userId,
      "editar_clinica",
      { clinica_id: id, updates },
      ip,
    );
    return res.status(200).json({ ok: true });
  }

  // ── Trocar somente o tier de recursos ──
  if (body?.acao === "alterar_tier") {
    const id = body?.id;
    const tier = body?.tier;
    if (!id) return res.status(400).json({ erro: "id_obrigatorio" });
    if (typeof tier !== "string" || !TIERS_VALIDOS.has(tier))
      return res.status(400).json({ erro: "tier_invalido" });

    const { data: atual, error: erroBusca } = await admin
      .from("clinicas")
      .select("id,tier")
      .eq("id", id)
      .maybeSingle();
    if (erroBusca || !atual)
      return res.status(404).json({ erro: "clinica_nao_encontrada" });
    if (atual.tier === tier)
      return res.status(200).json({ ok: true, tier, alterado: false });

    const { error } = await admin
      .from("clinicas")
      .update({ tier })
      .eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_atualizar_tier" });
    await registrarLog(
      admin,
      userId,
      "alterar_tier",
      { clinica_id: id, de: atual.tier || "essencial", para: tier },
      ip,
    );
    return res.status(200).json({ ok: true, tier, alterado: true });
  }

  // ── Gerar convite para clínica ──
  if (body?.acao === "gerar_convite") {
    const clinicaId = body?.clinica_id;
    if (!clinicaId)
      return res.status(400).json({ erro: "clinica_id_obrigatorio" });
    const { nanoid } = await import("nanoid");
    const token = nanoid(24);
    const expiraEm = new Date(Date.now() + 48 * 3600000).toISOString();
    const { error } = await admin
      .from("convites_clinica")
      .insert({ clinica_id: clinicaId, token, expira_em, tipo: "convite" });
    if (error) return res.status(500).json({ erro: "falha_criar_convite" });
    const base = process.env.SITE_URL || "https://www.receptaai.com.br";
    const url = base + "/clinica/definir-senha/" + token;
    await registrarLog(
      admin,
      userId,
      "gerar_convite",
      { clinica_id: clinicaId },
      ip,
    );
    return res.status(200).json({ ok: true, token, expira_em: expiraEm, url });
  }

  // ── Ativar/desativar usuário ──
  if (body?.acao === "toggle_usuario") {
    const id = body?.id;
    const ativo = body?.ativo;
    if (!id || typeof ativo !== "boolean")
      return res.status(400).json({ erro: "parametros_invalidos" });
    const { error } = await admin.from("perfis").update({ ativo }).eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_atualizar" });
    await registrarLog(
      admin,
      userId,
      ativo ? "ativar_usuario" : "desativar_usuario",
      { usuario_id: id },
      ip,
    );
    return res.status(200).json({ ok: true });
  }

  // ── Alterar papel do usuário ──
  if (body?.acao === "alterar_papel") {
    const id = body?.id;
    const papel = body?.papel;
    if (!id || !["admin", "clinica"].includes(papel))
      return res.status(400).json({ erro: "parametros_invalidos" });
    const { error } = await admin.from("perfis").update({ papel }).eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_atualizar" });
    await registrarLog(
      admin,
      userId,
      "alterar_papel",
      { usuario_id: id, papel },
      ip,
    );
    return res.status(200).json({ ok: true });
  }

  // ── Resetar senha de usuário (gera convite de reset) ──
  if (body?.acao === "resetar_senha") {
    const usuarioId = body?.usuario_id;
    if (!usuarioId)
      return res.status(400).json({ erro: "usuario_id_obrigatorio" });
    const { data: perfil } = await admin
      .from("perfis")
      .select("clinica_id")
      .eq("id", usuarioId)
      .maybeSingle();
    if (!perfil)
      return res.status(404).json({ erro: "usuario_nao_encontrado" });
    const { nanoid } = await import("nanoid");
    const token = nanoid(24);
    const expiraEm = new Date(Date.now() + 2 * 3600000).toISOString();
    const { error } = await admin.from("convites_clinica").insert({
      clinica_id: perfil.clinica_id,
      token,
      expira_em,
      tipo: "reset",
    });
    if (error) return res.status(500).json({ erro: "falha_criar_convite" });
    const base = process.env.SITE_URL || "https://www.receptaai.com.br";
    const url = base + "/clinica/definir-senha/" + token;
    await registrarLog(
      admin,
      userId,
      "resetar_senha",
      { usuario_id: usuarioId },
      ip,
    );
    return res.status(200).json({ ok: true, url });
  }

  // ── Excluir convite ──
  if (body?.acao === "excluir_convite") {
    const id = body?.id;
    if (!id) return res.status(400).json({ erro: "id_obrigatorio" });
    const { error } = await admin
      .from("convites_clinica")
      .delete()
      .eq("id", id);
    if (error) return res.status(500).json({ erro: "falha_excluir" });
    await registrarLog(
      admin,
      userId,
      "excluir_convite",
      { convite_id: id },
      ip,
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ erro: "acao_invalida" });
}

// ── Config (publico, sem auth) ──
async function handleConfig(req, res) {
  if (req.method !== "GET") return res.status(405).json({ erro: "metodo" });
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  return res.status(200).json({ url, anonKey });
}

// ── Convite externo (API key, sem auth de clinica) ──
// Mesclado de api/clinica/convite.js
import { apiKeyValida } from "../_lib/api-key.js";
const VALIDADE_CONVITE_HORAS = 48;
async function handleConviteExterno(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });
  const ip = getClientIp(req);
  const rl = await (
    await import("../_lib/rate-limit.js")
  ).rateLimit("convite:" + ip, 10, 10 * 60 * 1000);
  if (rl.blocked) return res.status(429).json({ erro: "muitas_tentativas" });
  const esperada = process.env.CLINICA_CONVITE_API_KEY;
  if (!esperada) return res.status(500).json({ erro: "nao_configurado" });
  if (!apiKeyValida(req.headers["x-api-key"], esperada))
    return res.status(401).json({ erro: "nao_autorizado" });
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ erro: "payload_invalido" });
  }
  const clinicaId =
    typeof body?.clinica_id === "string" ? body.clinica_id.trim() : "";
  if (!clinicaId)
    return res.status(400).json({ erro: "clinica_id_obrigatorio" });
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: clinicaRow, error: erroClinica } = await admin
    .from("clinicas")
    .select("id")
    .eq("id", clinicaId)
    .maybeSingle();
  if (erroClinica || !clinicaRow)
    return res.status(404).json({ erro: "clinica_nao_encontrada" });
  const { nanoid } = await import("nanoid");
  const token = nanoid(24);
  const expiraEm = new Date(
    Date.now() + VALIDADE_CONVITE_HORAS * 3600000,
  ).toISOString();
  const { error: erroInsert } = await admin
    .from("convites_clinica")
    .insert({ clinica_id: clinicaId, token, expira_em: expiraEm });
  if (erroInsert) return res.status(500).json({ erro: "falha_criar_convite" });
  const base = process.env.SITE_URL || "https://www.receptaai.com.br";
  return res
    .status(200)
    .json({
      ok: true,
      token,
      expira_em: expiraEm,
      url: base + "/clinica/definir-senha/" + token,
    });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  // /api/painel/config — publico
  if (req.url?.startsWith("/api/painel/config")) {
    return handleConfig(req, res);
  }

  // /api/clinica/convite — API key auth
  if (req.url?.startsWith("/api/clinica/convite")) {
    return handleConviteExterno(req, res);
  }

  let auth;
  try {
    auth = await autenticarAdmin(req, res);
  } catch {
    return res.status(500).json({ erro: "supabase_nao_configurado" });
  }
  if (auth.erro) return res.status(auth.erro.status).json(auth.erro.corpo);

  if (req.method === "GET") return handleGet(req, res, auth);
  if (req.method === "POST") return handlePost(req, res, auth);
  return res.status(405).json({ erro: "metodo" });
}
