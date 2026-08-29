import { chromium } from "playwright";
import { fileURLToPath } from "url";

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;font-family:"Poppins",sans-serif;
  background:#151749;color:#fff;overflow:hidden;position:relative}
.glow{position:absolute;width:820px;height:820px;border-radius:50%;
  background:radial-gradient(circle,rgba(175,168,235,.28) 0%,rgba(175,168,235,0) 68%);
  right:-260px;top:-300px}
.glow2{position:absolute;width:620px;height:620px;border-radius:50%;
  background:radial-gradient(circle,rgba(38,32,92,.85) 0%,rgba(38,32,92,0) 70%);
  left:-200px;bottom:-260px}
.wrap{position:relative;padding:64px 72px;height:100%;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px}
.brand svg{width:44px;height:44px;color:#afa8eb}
.brand span{font-size:27px;font-weight:700;letter-spacing:-.02em}
h1{font-size:63px;line-height:1.1;font-weight:800;letter-spacing:-.035em;max-width:960px}
h1 em{font-style:normal;color:#afa8eb}
p.sub{margin-top:22px;font-size:27px;line-height:1.45;color:#cfcce8;font-weight:400;max-width:880px}
.pills{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.pill{display:flex;align-items:center;gap:9px;font-size:20px;font-weight:600;
  background:rgba(255,255,255,.08);border:1px solid rgba(175,168,235,.32);
  padding:12px 22px;border-radius:999px;color:#efeefb}
.pill i{width:8px;height:8px;border-radius:50%;background:#7ee0a8;display:block}
.url{font-size:21px;font-weight:600;color:#afa8eb}
.row{display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
</style></head><body>
<div class="glow"></div><div class="glow2"></div>
<div class="wrap">
  <div class="brand">
    <svg viewBox="0 0 100 100" fill="currentColor"><g transform="translate(0 50)">
      <path d="M 34 -34 C -1.7 -15.9, -1.7 15.9, 34 34 C 69.7 15.9, 69.7 -15.9, 34 -34 Z"/>
      <path d="M 66 -34 C 30.3 -15.9, 30.3 15.9, 66 34 C 101.7 15.9, 101.7 -15.9, 66 -34 Z" opacity=".55"/>
    </g></svg><span>Recepta AI</span>
  </div>
  <div>
    <h1>Secretária virtual com IA<br>para <em>clínicas e consultórios</em></h1>
    <p class="sub">Atende o WhatsApp da sua clínica 24h: tira dúvidas, agenda e remarca consultas.</p>
  </div>
  <div class="row">
    <div class="pills">
      <div class="pill"><i></i>7 dias grátis</div>
      <div class="pill">Sem cartão</div>
      <div class="pill">Sem fidelidade</div>
    </div>
    <div class="url">receptaai.com.br</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: process.argv[2], type: "jpeg", quality: 90 });
await browser.close();
console.log("ok");
