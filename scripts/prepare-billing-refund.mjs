import fs from "node:fs";
import { buildRefundWorkflow } from "./billing-refund-workflow.mjs";

// Read-only against production. No PUT, activate or publish operation.
const base = (process.env.N8N_BASE_URL || "https://n8n.zapscout.com.br").replace(/\/$/, "");
const id = "cf1An4BYT9A0LuHi";
const r = await fetch(`${base}/api/v1/workflows/${id}`, { headers: { "X-N8N-API-KEY": process.env.N8N_API_KEY } });
if (!r.ok) throw new Error(`Backup GET HTTP ${r.status}`);
const text = await r.text(); const source = JSON.parse(text);
if (!source.active || source.versionId !== source.activeVersionId) throw new Error("Fonte ativa não confirmada");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync("tmp-backup-workflows-deletados", { recursive: true });
const backup = `tmp-backup-workflows-deletados/${id}-antes-reembolso-${stamp}.json`;
fs.writeFileSync(backup, text);
const candidate = buildRefundWorkflow(source);
fs.mkdirSync("tmp-qa-reembolso", { recursive: true });
fs.writeFileSync("tmp-qa-reembolso/candidate.json", JSON.stringify(candidate));
fs.writeFileSync("tmp-qa-reembolso/candidate-meta.json", JSON.stringify({ id, versionId: source.versionId, backup }));
console.log(JSON.stringify({ backup, sourceVersion: source.versionId, nodesAdded: candidate.nodes.length - source.nodes.length, productionChanged: false }));
