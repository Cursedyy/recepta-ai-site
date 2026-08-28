import { nanoid } from "nanoid";
import { rateLimit, getClientIp } from "./_lib/rate-limit.js";

const LIMITE = 3200;

// Endpoint publico e sem autenticacao que dispara um workflow n8n (e mensagens
// de WhatsApp) a cada chamada. Sem teto, um script enche a planilha de
// onboarding e queima o numero. 5 briefings por IP a cada 10 minutos.
const MAX_ENVIOS = 5;
const JANELA_MS = 10 * 60 * 1000;
// Teto de payload: `bruto` e' repassado inteiro ao n8n, entao o corpo tem que
// ter tamanho conhecido antes de virar trafego de saida.
const MAX_BYTES = 64 * 1024;

function montarTexto(body, token) {
  const nome = (body?.bruto?.clinica || "Clínica sem nome").trim();
  const resp = (body?.bruto?.responsavel || "-").trim();
  const zap = (body?.bruto?.whats_resp || "-").trim();
  const linhas = [];
  linhas.push("*NOVO BRIEFING — RECEPTA AI*");
  linhas.push("*" + nome + "*");
  linhas.push("Token: " + token);
  linhas.push("Responsável: " + resp + " | " + zap);
  linhas.push(
    "Recebido: " +
      new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  );
  linhas.push("");

  (body?.campos || []).forEach((sec) => {
    linhas.push("━━━ *" + sec.secao.toUpperCase() + "* ━━━");
    (sec.itens || []).forEach((it) => {
      const v = Array.isArray(it.valor) ? it.valor.join(", ") : it.valor || "";
      if (!String(v).trim()) return;
      linhas.push("*" + it.label + "*");
      linhas.push(String(v).trim());
      linhas.push("");
    });
  });
  return linhas.join("\n");
}

function fatiar(texto) {
  const partes = [];
  let atual = "";
  texto.split("\n").forEach((linha) => {
    if ((atual + linha).length > LIMITE) {
      if (atual) partes.push(atual.trimEnd());
      atual = "";
    }
    atual += linha + "\n";
  });
  if (atual.trim()) partes.push(atual.trimEnd());
  return partes.map((p, i) =>
    partes.length > 1 ? "(" + (i + 1) + "/" + partes.length + ")\n" + p : p,
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  if (req.method !== "POST") return res.status(405).json({ erro: "metodo" });

  const ip = getClientIp(req);
  const rl = await rateLimit("submit:" + ip, MAX_ENVIOS, JANELA_MS);
  if (rl.blocked) {
    const minutos = Math.ceil(rl.resetMs / 60000);
    return res.status(429).json({
      erro: "muitas_tentativas",
      mensagem:
        "Muitos envios. Tente novamente em " +
        minutos +
        " minuto" +
        (minutos > 1 ? "s" : "") +
        ".",
    });
  }

  const tamanho = Number(req.headers["content-length"] || 0);
  if (tamanho > MAX_BYTES) {
    return res.status(413).json({ erro: "payload_muito_grande" });
  }

  const webhook = process.env.N8N_BRIEFING_WEBHOOK;
  if (!webhook)
    return res
      .status(500)
      .json({ erro: "N8N_BRIEFING_WEBHOOK nao configurada" });

  const webhookSecret = process.env.N8N_ONBOARDING_WEBHOOK_SECRET;
  if (!webhookSecret)
    return res
      .status(500)
      .json({ erro: "N8N_ONBOARDING_WEBHOOK_SECRET nao configurada" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const token = nanoid(16);
    const texto = montarTexto(body, token);
    const partes = fatiar(texto);

    const r = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Recepta-Webhook-Secret": webhookSecret,
      },
      body: JSON.stringify({
        // O n8n le varios campos do briefing no TOPO do payload, nao dentro de
        // `briefing`: o Onboarding exige `cnpj` (14 digitos) no node "Campos
        // Obrigatorios OK?" e o node "Preparar linha" do workflow Briefing le
        // whats_resp/email/cidade/numero/tipo_conta/automaticas/volume.
        // Sem este spread o onboarding para em "Alerta: Campos Faltando" e a
        // planilha grava colunas vazias. As chaves explicitas abaixo vencem.
        ...(body?.bruto || {}),
        // Normalizado pra digitos: o campo do briefing nao tem mascara e o
        // placeholder sugere "00.000.000/0000-00", entao o valor cru chega com
        // 18 caracteres e reprova no teste de 14 digitos do n8n.
        cnpj: String(body?.bruto?.cnpj || "").replace(/\D/g, ""),
        token,
        clinica: body?.bruto?.clinica || "",
        responsavel: body?.bruto?.responsavel || "",
        whatsapp_responsavel: body?.bruto?.whats_resp || "",
        partes,
        texto,
        briefing: body?.bruto || {},
        recebido_em: new Date().toISOString(),
      }),
    });

    if (!r.ok) {
      // O corpo da resposta do n8n pode conter URLs internas, nomes de nodes e
      // trechos de configuracao. Fica no log do servidor, nunca na resposta.
      const t = await r.text();
      console.error("submit_webhook_erro", r.status, t.slice(0, 500));
      return res.status(502).json({ erro: "webhook" });
    }
    return res.status(200).json({ ok: true, token, partes: partes.length });
  } catch (e) {
    console.error("submit_falha", e);
    return res.status(500).json({ erro: "falha" });
  }
}
