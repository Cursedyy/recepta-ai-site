// Check: getClientIp nao pode aceitar o IP que o cliente escreveu no XFF.
// Se falhar, o rate limit de login/reset volta a ser burlavel com um header.
import assert from "node:assert/strict";
import { getClientIp } from "./api/_lib/rate-limit.js";

const req = (headers, remote = "10.0.0.1") => ({
  headers,
  socket: { remoteAddress: remote },
});

// Cliente forja o XFF; a borda da Vercel acrescenta o IP real no FIM.
assert.equal(
  getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" })),
  "203.0.113.9",
  "deve usar o ultimo hop, nao o valor forjado pelo cliente",
);

// Headers da borda tem prioridade sobre o XFF.
assert.equal(
  getClientIp(
    req({ "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "203.0.113.9" }),
  ),
  "203.0.113.9",
);
assert.equal(
  getClientIp(req({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "203.0.113.9" })),
  "203.0.113.9",
);

// Sem header nenhum: cai no socket.
assert.equal(getClientIp(req({})), "10.0.0.1");
assert.equal(getClientIp(req({ "x-forwarded-for": "  " })), "10.0.0.1");

console.log("getClientIp: OK");
