const resposta = $("Processar Resposta IA").first().json;
const falhou = Boolean(
  $json.error || $json.code >= 400 || $json.statusCode >= 400,
);

return [
  {
    json: {
      ...resposta,
      envio_audio_ok: !falhou,
    },
  },
];
