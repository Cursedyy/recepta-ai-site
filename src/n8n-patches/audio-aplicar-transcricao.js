const ctx = $("Configuração da Clínica").first().json;
const texto = typeof $json.text === "string" ? $json.text.trim() : "";
const transcricao =
  texto ||
  ctx.mensagem_audio_padrao ||
  "Não consegui ouvir o áudio. Pode enviar em texto?";

return [
  {
    json: {
      ...ctx,
      mensagem: transcricao,
      transcricao_audio_ok: Boolean(texto),
    },
  },
];
