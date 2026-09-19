const entrada = $("Parser da Mensagem").first().json;
const erro = $json.error || $json.code >= 400 || $json.statusCode >= 400;
const outputText = String(
  $json.output_text ||
    ($json.output || [])
      .flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join(" ") ||
    "",
).trim();

// O prompt de visao manda responder exatamente FOTO_ILEGIVEL_NOVA_FOTO quando a
// foto nao da para ler. Isso chega como corpo 200 normal, nao como erro HTTP, e
// sem este teste o sentinela ia cru para a IA (visto na execucao 95413).
const ilegivel = /FOTO_ILEGIVEL_NOVA_FOTO/i.test(outputText);
const semLeitura = erro || !outputText || ilegivel;

const mensagem = semLeitura
  ? "Não consegui ler a imagem com segurança. Pode enviar uma foto mais nítida, bem iluminada e sem cortes?"
  : outputText;

return [
  {
    json: {
      ...entrada,
      mensagem,
      visao_imagem_ok: !semLeitura,
      imagem_fallback: Boolean(semLeitura),
      imagem_ilegivel: Boolean(ilegivel),
    },
  },
];
