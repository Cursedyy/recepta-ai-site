#!/usr/bin/env node
/**
 * scripts/health.mjs — health check de infraestrutura do Recepta AI.
 *
 * Uso: npm run health   (na raiz do repo)
 *
 * Credenciais vêm do AMBIENTE (nunca de .vercel/.env.production.local, que o
 * CLI pode puxar com placeholders [SENSITIVE]):
 *   N8N_API_KEY                  (obrigatório p/ checagem n8n)
 *   N8N_BASE_URL                 (default https://n8n.zapscout.com.br)
 *   SUPABASE_URL                 (obrigatório)
 *   SUPABASE_SERVICE_ROLE_KEY    (obrigatório)
 *   UAZAPI_ADMIN_TOKEN           (obrigatório p/ checagem UazAPI)
 *   UAZAPI_BASE_URL              (default https://sitemagic1.uazapi.com)
 *
 * Verifica:
 *   1. n8n responde e os 5 workflows críticos estão ativos
 *   2. Supabase responde (query na tabela clinicas)
 *   3. Site responde 200 em /, /briefing, /clinica/painel (302 = gate de auth, ok)
 *   4. UazAPI: quantas instâncias existem, quantas vagas restam (limite = 2)
 *   5. UazAPI: instância recepta-alertas (alertas admin) conectada — sem ela
 *      nenhum alerta nem link de onboarding é enviado
 *   6. Lixo de QA: instâncias zz-teste-* sobrando
 *   7. Price pin: os 4 price IDs do node "Config Stripe Webhook" batem com a
 *      auditoria da API do Stripe de 2026-09-13 (fase F1)
 *   8. Cron de cobrança: alguma execução com sucesso nas últimas 25h
 *
 * Não faz nenhuma operação de escrita/deleção. Só lê.
 */

const N8N_BASE_URL = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const UAZAPI_BASE_URL = (process.env.UAZAPI_BASE_URL || "https://sitemagic1.uazapi.com").replace(/\/$/, "");

const SITE_BASE = process.env.HEALTH_SITE_URL || "https://www.receptaai.com.br";

const CRITICAL_WORKFLOWS = [
  { id: "cxn5FxUNMJmlJ1WJ", name: "Atendimento" },
  { id: "voEwbw5fzNnn6bQq", name: "Onboarding" },
  { id: "DxCGAEmTMS6sU1qK", name: "Criar Agendamento" },
  { id: "cf1An4BYT9A0LuHi", name: "Verificação de Trial (webhook Stripe)" },
  { id: "sJzrlremPGkjZDxO", name: "Lembretes" },
];

const UAZAPI_LIMIT = 2; // limite da conta: 1 instância por clínica + 1 de alertas admin

const results = [];

function row(check, status, detail) {
  results.push({ check, status, detail });
}

async function fetchSafe(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 1. n8n
// ---------------------------------------------------------------------------
async function checkN8n() {
  const key = process.env.N8N_API_KEY;
  if (!key) {
    row("n8n: workflows ativos", "ERRO", "N8N_API_KEY ausente no ambiente");
    return;
  }
  try {
    // IMPORTANTE: não confiar no status code. n8n pode responder 200 com
    // {"data":[]} para token inválido — conta-se o que voltou.
    const res = await fetchSafe(`${N8N_BASE_URL}/api/v1/workflows?limit=250`, {
      headers: { "X-N8N-API-KEY": key },
    });
    if (res.status === 401 || res.status === 403) {
      row("n8n: workflows ativos", "ERRO", `HTTP ${res.status} — token rejeitado pelo n8n`);
      return;
    }
    const body = await res.json().catch(() => null);
    const list = Array.isArray(body?.data) ? body.data : null;
    if (!list) {
      row("n8n: workflows ativos", "ERRO", `resposta inesperada (HTTP ${res.status})`);
      return;
    }
    // Token inválido silencioso: 200 com lista vazia num servidor que tem workflows.
    if (list.length === 0) {
      row("n8n: workflows ativos", "ERRO", "200 com 0 workflows — provável token inválido (armadilha conhecida)");
      return;
    }
    const byId = new Map(list.map((w) => [String(w.id), w]));
    const lines = [];
    let missing = 0;
    let inactive = 0;
    for (const wf of CRITICAL_WORKFLOWS) {
      const found = byId.get(wf.id);
      if (!found) {
        lines.push(`${wf.name}: NÃO ENCONTRADO`);
        missing++;
      } else if (!found.active) {
        lines.push(`${wf.name}: INATIVO`);
        inactive++;
      } else {
        lines.push(`${wf.name}: ativo`);
      }
    }
    if (missing > 0) {
      row("n8n: workflows ativos", "ERRO", lines.join(" | "));
    } else if (inactive > 0) {
      row("n8n: workflows ativos", "ERRO", `${inactive} workflow(s) inativo(s): ${lines.join(" | ")}`);
    } else {
      row("n8n: workflows ativos", "OK", `5/5 críticos ativos (${list.length} workflows no total)`);
    }
  } catch (err) {
    row("n8n: workflows ativos", "ERRO", `falha de rede: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Supabase
// ---------------------------------------------------------------------------
async function checkSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    row("Supabase: clinicas", "ERRO", "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no ambiente");
    return;
  }
  try {
    const res = await fetchSafe(
      `${SUPABASE_URL}/rest/v1/clinicas?select=id&limit=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      },
    );
    const body = await res.json().catch(() => null);
    if (res.status === 401) {
      row("Supabase: clinicas", "ERRO", "401 Invalid API key — service_role key rejeitada");
      return;
    }
    if (!res.ok) {
      row("Supabase: clinicas", "ERRO", `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 120)}`);
      return;
    }
    row("Supabase: clinicas", "OK", "query REST respondeu (service_role válido)");
  } catch (err) {
    row("Supabase: clinicas", "ERRO", `falha de rede: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Site
// ---------------------------------------------------------------------------
async function checkSite() {
  // /clinica/painel redireciona para /clinica/login quando não há sessão —
  // isso é o gate de auth funcionando, não uma queda. Aceitamos 200 ou 302.
  const routes = [
    { path: "/", expect: [200] },
    { path: "/briefing", expect: [200] },
    { path: "/clinica/painel", expect: [200, 302] },
  ];
  for (const r of routes) {
    try {
      const res = await fetchSafe(`${SITE_BASE}${r.path}`, { redirect: "manual" });
      if (r.expect.includes(res.status)) {
        row(`site: ${r.path}`, "OK", `HTTP ${res.status}`);
      } else {
        row(`site: ${r.path}`, "ERRO", `HTTP ${res.status} (esperado ${r.expect.join(" ou ")})`);
      }
    } catch (err) {
      row(`site: ${r.path}`, "ERRO", `falha de rede: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4 + 5. UazAPI
// ---------------------------------------------------------------------------
async function checkUazapi() {
  const token = process.env.UAZAPI_ADMIN_TOKEN;
  if (!token) {
    row("UazAPI: instâncias", "ERRO", "UAZAPI_ADMIN_TOKEN ausente no ambiente");
    row("UazAPI: recepta-alertas", "ERRO", "UAZAPI_ADMIN_TOKEN ausente no ambiente");
    row("UazAPI: lixo zz-teste-*", "ERRO", "UAZAPI_ADMIN_TOKEN ausente no ambiente");
    return;
  }
  try {
    const res = await fetchSafe(`${UAZAPI_BASE_URL}/instance/all`, {
      headers: { AdminToken: token },
    });
    const body = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) {
      row("UazAPI: instâncias", "ERRO", `HTTP ${res.status} — admin token rejeitado`);
      row("UazAPI: recepta-alertas", "ERRO", "admin token rejeitado");
      row("UazAPI: lixo zz-teste-*", "ERRO", "admin token rejeitado");
      return;
    }
    if (!res.ok || !Array.isArray(body)) {
      row("UazAPI: instâncias", "ERRO", `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 120)}`);
      row("UazAPI: recepta-alertas", "ERRO", "não foi possível listar instâncias");
      row("UazAPI: lixo zz-teste-*", "ERRO", "não foi possível listar instâncias");
      return;
    }
    const total = body.length;
    const vagas = UAZAPI_LIMIT - total;
    const nomes = body.map((i) => i.name || i.instanceName || i.instance_name || "?");
    const teste = body.filter((i) => {
      const name = i.name || i.instanceName || i.instance_name || "";
      return String(name).toLowerCase().startsWith("zz-teste-");
    });
    row(
      "UazAPI: instâncias",
      total > UAZAPI_LIMIT ? "ERRO" : "OK",
      `${total}/${UAZAPI_LIMIT} em uso [${nomes.join(", ")}]`,
    );

    // Instância de alertas admin: o n8n envia por ela TODOS os avisos e o
    // link de onboarding. Desconectada = operação sem comunicação.
    const alertas = body.find((i) => (i.name || i.instanceName || i.instance_name || "") === "recepta-alertas");
    if (!alertas) {
      row("UazAPI: recepta-alertas", "ERRO", "instância de alertas NÃO EXISTE — alertas e onboarding parados");
    } else if (alertas.status === "connected") {
      row("UazAPI: recepta-alertas", "OK", "conectada");
    } else {
      const motivo = alertas.lastDisconnectReason || "motivo não informado";
      const quando = String(alertas.lastDisconnect || "").slice(0, 16);
      row(
        "UazAPI: recepta-alertas",
        "AVISO",
        `SEM alertas/onboarding — ${alertas.status} desde ${quando} (${motivo})`,
      );
    }
    if (teste.length > 0) {
      row("UazAPI: lixo zz-teste-*", "ERRO", `${teste.length} instância(s) de teste sobrando — apagar (nunca a de alertas)`);
    } else {
      row("UazAPI: lixo zz-teste-*", "OK", "nenhuma instância de teste sobrando");
    }
  } catch (err) {
    row("UazAPI: instâncias", "ERRO", `falha de rede: ${err.message}`);
    row("UazAPI: recepta-alertas", "ERRO", `falha de rede: ${err.message}`);
    row("UazAPI: lixo zz-teste-*", "ERRO", `falha de rede: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Stripe price pin + cron de cobrança
// ---------------------------------------------------------------------------
// Preços auditados na API do Stripe em 2026-09-14 (valor unit_amount, livemode
// true): essencial mensal R$497, essencial anual R$4.164, completo mensal
// R$997, completo anual R$8.364. Se o node "Config Stripe Webhook" divergir
// daqui, "Determinar Plano" (fail-closed) pode nunca ativar um pagante.
const PRICE_PIN = {
  STRIPE_PRICE_ESSENCIAL_MENSAL: "price_1U35F9HkvKNdqMufd58XEIq2",
  STRIPE_PRICE_ESSENCIAL_ANUAL: "price_1U35FAHkvKNdqMuf7dtT8vrs",
  STRIPE_PRICE_COMPLETO_MENSAL: "price_1UEIx6HkvKNdqMufqV6xA1s7",
  STRIPE_PRICE_COMPLETO_ANUAL: "price_1UEIx8HkvKNdqMufg0iqXerD",
};
// Gancho exclusivamente local para a prova negativa do F1. Ele altera a fonte
// esperada somente neste processo e nunca escreve no n8n, Stripe ou Vercel.
const PRICE_PIN_CHECK = process.env.HEALTH_PRICE_PIN_OVERRIDE_ESSENCIAL_MENSAL
  ? {
      ...PRICE_PIN,
      STRIPE_PRICE_ESSENCIAL_MENSAL:
        process.env.HEALTH_PRICE_PIN_OVERRIDE_ESSENCIAL_MENSAL,
    }
  : PRICE_PIN;
const WF_BILLING = "cf1An4BYT9A0LuHi";

async function checkStripePin() {
  const key = process.env.N8N_API_KEY;
  if (!key) {
    row("n8n: price pin", "ERRO", "N8N_API_KEY ausente no ambiente");
    return;
  }
  try {
    const res = await fetchSafe(`${N8N_BASE_URL}/api/v1/workflows/${WF_BILLING}`, {
      headers: { "X-N8N-API-KEY": key },
    });
    if (!res.ok) {
      row("n8n: price pin", "ERRO", `GET workflow falhou (HTTP ${res.status})`);
      return;
    }
    const wf = await res.json().catch(() => null);
    const cfg = wf?.nodes?.find((n) => n.name === "Config Stripe Webhook");
    const assignments = cfg?.parameters?.assignments?.assignments || [];
    if (!assignments.length) {
      row("n8n: price pin", "ERRO", "node Config Stripe Webhook não encontrado ou vazio");
      return;
    }
    const divergentes = [];
    for (const [nome, esperado] of Object.entries(PRICE_PIN_CHECK)) {
      const a = assignments.find((x) => x.name === nome);
      if (!a) divergentes.push(`${nome}: AUSENTE`);
      else if (a.value !== esperado) divergentes.push(`${nome}: ${a.value}`);
    }
    if (divergentes.length) {
      row("n8n: price pin", "ERRO", `DRIFT: ${divergentes.join(" | ")} — conferir com a API do Stripe antes de ativar checkout`);
    } else {
      row("n8n: price pin", "OK", "4/4 price IDs batem com auditoria Stripe de 2026-09-14");
    }
  } catch (err) {
    row("n8n: price pin", "ERRO", `falha de rede: ${err.message}`);
  }
}

async function checkCronBilling() {
  const key = process.env.N8N_API_KEY;
  if (!key) {
    row("n8n: cron billing", "ERRO", "N8N_API_KEY ausente no ambiente");
    return;
  }
  try {
    const res = await fetchSafe(
      `${N8N_BASE_URL}/api/v1/executions?workflowId=${WF_BILLING}&status=success&limit=5`,
      { headers: { "X-N8N-API-KEY": key } },
    );
    if (!res.ok) {
      row("n8n: cron billing", "ERRO", `GET executions falhou (HTTP ${res.status})`);
      return;
    }
    const body = await res.json().catch(() => null);
    const list = Array.isArray(body?.data) ? body.data : [];
    if (!list.length) {
      row("n8n: cron billing", "ERRO", "nenhuma execução com sucesso no histórico recente — cron quebrado");
      return;
    }
    const ultima = list
      .map((e) => new Date(e.startedAt || e.stoppedAt).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => b - a)[0];
    const horas = ultima ? (Date.now() - ultima) / 3600000 : Infinity;
    if (horas > 25) {
      row("n8n: cron billing", "ERRO", `última execução com sucesso há ${horas.toFixed(0)}h — rodar npm run health amanhã 9h+ ou investigar`);
    } else {
      row("n8n: cron billing", "OK", `última execução com sucesso há ${horas.toFixed(1)}h`);
    }
  } catch (err) {
    row("n8n: cron billing", "ERRO", `falha de rede: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------
function printTable() {
  const widthCheck = Math.max(...results.map((r) => r.check.length), 24);
  const widthStatus = 7;
  // Detalhe dinâmico (até 90) para não truncar motivos importantes,
  // ex.: por que a instância de alertas está desconectada.
  const widthDetail = Math.min(Math.max(...results.map((r) => r.detail.length), 30), 90);
  const sep = (l, m, rt) =>
    `${l}${"─".repeat(widthCheck + 2)}${m}${"─".repeat(widthStatus + 2)}${m}${"─".repeat(widthDetail + 2)}${rt}`;
  console.log(sep("┌", "┬", "┐"));
  console.log(`│ ${"CHECK".padEnd(widthCheck)} │ ${"STATUS".padEnd(widthStatus)} │ ${"DETALHE".padEnd(widthDetail)} │`);
  console.log(sep("├", "┼", "┤"));
  for (const r of results) {
    const icon = r.status === "OK" ? "✓" : r.status === "AVISO" ? "!" : "✗";
    const detail = r.detail.length > widthDetail ? r.detail.slice(0, widthDetail - 3) + "..." : r.detail;
    console.log(`│ ${r.check.padEnd(widthCheck)} │ ${(icon + " " + r.status).padEnd(widthStatus)} │ ${detail.padEnd(widthDetail)} │`);
  }
  console.log(sep("└", "┴", "┘"));
}

const t0 = Date.now();
await Promise.all([
  checkN8n(),
  checkSupabase(),
  checkSite(),
  checkUazapi(),
  checkStripePin(),
  checkCronBilling(),
]);
printTable();

const erros = results.filter((r) => r.status === "ERRO").length;
const avisos = results.filter((r) => r.status === "AVISO").length;
const secs = ((Date.now() - t0) / 1000).toFixed(1);
let linha;
if (erros === 0 && avisos === 0) linha = "✓ TUDO OK";
else if (erros === 0) linha = `⚠ ${avisos} aviso(s), nenhum erro`;
else linha = `✗ ${erros} erro(s)` + (avisos > 0 ? `, ${avisos} aviso(s)` : "");
console.log(`\n${linha} — ${secs}s`);
process.exit(erros === 0 ? 0 : 1);
