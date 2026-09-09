-- 011_trial_nullable.sql
-- Torna trial_inicio e trial_fim nullable na tabela clinicas.
--
-- Motivo: o trial começa quando o WhatsApp da clínica conecta, não quando a
-- clínica é criada. O onboarding no n8n insere a linha com trial_inicio/trial_fim
-- nulos e a constraint NOT NULL derrubava todo insert do funil real.

alter table public.clinicas
  alter column trial_inicio drop not null;

alter table public.clinicas
  alter column trial_fim drop not null;
