-- Contenu structuré éditable par étape de programme (paragraphes, CTA, liens)
ALTER TABLE email_program_steps
  ADD COLUMN IF NOT EXISTS content_json JSONB;
