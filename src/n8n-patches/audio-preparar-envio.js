return (async () => {
const resposta = $("Processar Resposta IA").first().json;
const entrada = $input.first();
let audioBase64 = null;
let conversaoErro = null;

try {
  // O n8n pode manter o binário em filesystem-v2. Nunca envie esse marcador
  // à UazAPI: o endpoint exige o conteúdo Base64 real.
  const buffer = await this.helpers.getBinaryDataBuffer(0, "data");
  if (buffer && buffer.length > 0) audioBase64 = buffer.toString("base64");
  else conversaoErro = "binário de áudio vazio";
} catch (erro) {
  conversaoErro = String(erro?.message || erro);
}

return [
  {
    json: {
      ...resposta,
      tts_ok: Boolean(audioBase64),
      audio_base64: audioBase64,
      tts_conversion_error: conversaoErro,
    },
    binary: entrada.binary,
  },
];
})();
