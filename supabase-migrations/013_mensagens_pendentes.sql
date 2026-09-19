-- Tabela de debounce: mensagens pendentes aguardando janela de agrupamento
-- Usada pelo workflow de Atendimento para agrupar mensagens rapidas do paciente
CREATE TABLE IF NOT EXISTS mensagens_pendentes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatid TEXT NOT NULL,
  telefone TEXT NOT NULL,
  texto TEXT NOT NULL,
  token TEXT,
  clinica TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rapida por telefone + clinica
CREATE INDEX IF NOT EXISTS idx_mensagens_pendentes_telefone
  ON mensagens_pendentes (telefone, created_at DESC);

-- RLS: apenas service_role acessa (n8n usa service_role key)
ALTER TABLE mensagens_pendentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON mensagens_pendentes
  FOR ALL USING (auth.role() = 'service_role');
