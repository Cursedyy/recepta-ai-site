const entrada = $("Parser da Mensagem").first().json;
return [
  {
    json: {
      ...entrada,
      mensagem:
        "A leitura de pedidos médicos, receitas e carteirinhas está disponível somente no plano Completo. Pode enviar a informação por texto ou falar com a clínica.",
      visao_imagem_ok: false,
      imagem_limitacao_tier: true,
    },
  },
];
