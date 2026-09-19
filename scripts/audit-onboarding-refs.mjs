// Auditoria de refs $json / $('Node') no workflow de Onboarding — insumo do F6.
import { readFileSync } from "fs";
const wf = JSON.parse(
  readFileSync(
    new URL("../tmp-backup-workflows-deletados/backup-voEwbw5fzNnn6bQq-20260913-184908.json", import.meta.url),
    "utf8",
  ),
);

for (const n of wf.nodes) {
  const s = JSON.stringify(n.parameters || {});
  const jsonRefs = [...new Set(s.match(/\$json[\w.[\]"'()]*/g) || [])];
  const nodeRefs = [...new Set(s.match(/\$\('[^']+'\)[\w.[\]"'()]*/g) || [])];
  console.log(`### ${n.name} (${n.type})`);
  if (jsonRefs.length) console.log("  $json:", jsonRefs.join(" | "));
  if (nodeRefs.length) console.log("  $():", nodeRefs.join(" | "));
}
