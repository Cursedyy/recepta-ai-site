-- Campos editaveis pela propria clinica no /clinica/painel, separados de
-- ia_config (que fica fora do alcance da clinica: persona/prompt da IA).

alter table public.clinicas
  add column config_editavel jsonb not null default '{
    "precos": [],
    "horarios": {},
    "convenios": [],
    "mensagem_identidade": ""
  }'::jsonb;

-- Shape esperado (validado no server, nao no banco):
-- {
--   "precos": [{ "nome": "Consulta clinica geral", "valor": 180.00 }],
--   "horarios": {
--     "segunda": [{ "inicio": "08:00", "fim": "18:00" }],
--     "terca": [...], "quarta": [...], "quinta": [...], "sexta": [...],
--     "sabado": [], "domingo": []
--   },
--   "convenios": ["Unimed", "Particular"],
--   "mensagem_identidade": "Oi! Aqui e a secretaria virtual da Clinica X."
-- }
