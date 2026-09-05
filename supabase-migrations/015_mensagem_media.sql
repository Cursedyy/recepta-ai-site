-- 015_mensagem_media.sql
-- Adiciona coluna mensagem_media para armazenar metadados de mídia (JSON)
-- separadamente do texto legível em mensagem.
--
-- Motivo: mensagem é usada tanto para exibição no painel quanto para o
-- histórico enviado ao Claude. Salvar JSON de mídia em mensagem poluiria
-- o prompt da IA com dados técnicos (mimetype, URL, etc).
--
-- A coluna mensagem_media recebe o JSON completo quando a mensagem é mídia:
-- {"mimetype":"image/jpeg","URL":"https://...","tipo":"imagem","text":"legenda"}
-- Para mensagens de texto, fica NULL.

ALTER TABLE conversas ADD COLUMN IF NOT EXISTS mensagem_media jsonb;
