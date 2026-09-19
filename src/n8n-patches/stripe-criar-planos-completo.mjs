import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const base = (
  process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br"
).replace(/\/$/, "");
const apiKey = process.env.N8N_API_KEY;
const workflowId = "cf1An4BYT9A0LuHi";
const productId = "prod_UvBV2LBUigi7K7";

async function api(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `${method} ${path}: ${response.status} ${text.slice(0, 400)}`,
    );
  return text ? JSON.parse(text) : {};
}

function payload(workflow) {
  const settings = {};
  if (workflow.settings?.executionOrder)
    settings.executionOrder = workflow.settings.executionOrder;
  if (workflow.settings?.errorWorkflow)
    settings.errorWorkflow = workflow.settings.errorWorkflow;
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings,
  };
}

const original = await api("GET", `/api/v1/workflows/${workflowId}`);
const backupDir = join(process.cwd(), "tmp-backup-workflows-deletados");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(
  backupDir,
  `${workflowId}-pre-create-stripe-completo-${stamp}.json`,
);
writeFileSync(backup, JSON.stringify(original, null, 2));
console.log(`backup: ${backup}`);

const work = structuredClone(original);
const suffix = randomUUID().replaceAll("-", "");
const hookPath = `recepta/qa/stripe-admin-${suffix}`;
const triggerName = `QA Stripe Admin Trigger ${suffix}`;
const requestName = `QA Stripe Admin Request ${suffix}`;
const trigger = {
  id: randomUUID(),
  name: triggerName,
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [-900, 1600],
  parameters: { httpMethod: "GET", path: hookPath, options: {} },
};
const request = {
  id: randomUUID(),
  name: requestName,
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-650, 1600],
  parameters: {
    url: "https://api.stripe.com/v1/prices?limit=1",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "stripeApi",
    options: {},
  },
  credentials: {
    stripeApi: { id: "ZYM7MJM0SkrpqFWc", name: "Stripe API - Recepta" },
  },
};
work.nodes.push(trigger, request);
work.connections[triggerName] = {
  main: [[{ node: requestName, type: "main", index: 0 }]],
};

async function stripe(method, path, body = "") {
  request.parameters = {
    method,
    url: `https://api.stripe.com${path}`,
    authentication: "predefinedCredentialType",
    nodeCredentialType: "stripeApi",
    options: {},
  };
  if (method !== "GET") {
    Object.assign(request.parameters, {
      sendBody: true,
      contentType: "form-urlencoded",
      specifyBody: "string",
      body,
    });
  }
  await api("PUT", `/api/v1/workflows/${workflowId}`, payload(work));
  await api("POST", `/api/v1/workflows/${workflowId}/activate`);
  const active = await api("GET", `/api/v1/workflows/${workflowId}`);
  if (active.versionId !== active.activeVersionId)
    throw new Error("draft != active durante operação Stripe");
  await fetch(`${base}/webhook/${hookPath}`);
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const executions = await api(
      "GET",
      `/api/v1/executions?workflowId=${workflowId}&limit=10&includeData=true`,
    );
    const execution = executions.data.find(
      (item) => item.data?.resultData?.runData?.[requestName],
    );
    if (!execution) continue;
    const run = execution.data.resultData.runData[requestName][0];
    if (execution.status !== "success")
      throw new Error(
        `Stripe request falhou: ${execution.data.resultData.error?.message}`,
      );
    return { executionId: execution.id, data: run.data.main[0][0].json };
  }
  throw new Error("Execução Stripe não encontrada");
}

try {
  const subscriptions = await stripe(
    "GET",
    "/v1/subscriptions?status=all&limit=100&expand[]=data.items.data.price",
  );
  const oldPriceIds = new Set([
    "price_1U35F9HkvKNdqMufd58XEIq2",
    "price_1U35FAHkvKNdqMuf7dtT8vrs",
  ]);
  const linkedSubscriptions = [];
  for (const subscription of subscriptions.data.data || []) {
    const matches = (subscription.items?.data || []).filter((item) =>
      oldPriceIds.has(item.price?.id),
    );
    if (matches.length)
      linkedSubscriptions.push({
        id: subscription.id,
        status: subscription.status,
        prices: matches.map((item) => item.price.id),
      });
  }
  console.log(
    JSON.stringify(
      {
        subscription_audit_execution: subscriptions.executionId,
        existing_subscriptions: linkedSubscriptions,
      },
      null,
      2,
    ),
  );

  const pricesResult = await stripe(
    "GET",
    `/v1/prices?product=${productId}&active=true&limit=100`,
  );
  const prices = pricesResult.data.data || [];
  async function ensurePrice(amount, interval, lookupKey) {
    const existing = prices.find(
      (price) =>
        price.currency === "brl" &&
        price.unit_amount === amount &&
        price.recurring?.interval === interval &&
        price.recurring?.interval_count === 1,
    );
    if (existing)
      return {
        price: existing,
        created: false,
        executionId: pricesResult.executionId,
      };
    const encoded = new URLSearchParams({
      currency: "brl",
      unit_amount: String(amount),
      product: productId,
      "recurring[interval]": interval,
      "recurring[interval_count]": "1",
      lookup_key: lookupKey,
    }).toString();
    const result = await stripe("POST", "/v1/prices", encoded);
    return {
      price: result.data,
      created: true,
      executionId: result.executionId,
    };
  }
  const monthly = await ensurePrice(99700, "month", "recepta_completo_mensal");
  const annual = await ensurePrice(836400, "year", "recepta_completo_anual");

  const linksResult = await stripe(
    "GET",
    "/v1/payment_links?active=true&limit=100&expand[]=data.line_items",
  );
  async function ensureLink(priceId) {
    const existing = (linksResult.data.data || []).find((link) =>
      (link.line_items?.data || []).some((item) => item.price?.id === priceId),
    );
    if (existing)
      return {
        link: existing,
        created: false,
        executionId: linksResult.executionId,
      };
    const encoded = new URLSearchParams({
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
    }).toString();
    const result = await stripe("POST", "/v1/payment_links", encoded);
    return {
      link: result.data,
      created: true,
      executionId: result.executionId,
    };
  }
  const monthlyLink = await ensureLink(monthly.price.id);
  const annualLink = await ensureLink(annual.price.id);
  console.log(
    JSON.stringify(
      {
        monthly: {
          id: monthly.price.id,
          amount: monthly.price.unit_amount,
          currency: monthly.price.currency,
          interval: monthly.price.recurring?.interval,
          created: monthly.created,
          payment_link_id: monthlyLink.link.id,
          payment_link_url: monthlyLink.link.url,
          link_created: monthlyLink.created,
        },
        annual: {
          id: annual.price.id,
          amount: annual.price.unit_amount,
          currency: annual.price.currency,
          interval: annual.price.recurring?.interval,
          created: annual.created,
          payment_link_id: annualLink.link.id,
          payment_link_url: annualLink.link.url,
          link_created: annualLink.created,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await api("PUT", `/api/v1/workflows/${workflowId}`, payload(original));
  if (original.active)
    await api("POST", `/api/v1/workflows/${workflowId}/activate`);
  const restored = await api("GET", `/api/v1/workflows/${workflowId}`);
  console.log(
    JSON.stringify({
      restored_version: restored.versionId,
      active_version: restored.activeVersionId,
      equal: restored.versionId === restored.activeVersionId,
      qa_nodes_remaining: restored.nodes.filter((node) =>
        node.name.includes(suffix),
      ).length,
    }),
  );
}
