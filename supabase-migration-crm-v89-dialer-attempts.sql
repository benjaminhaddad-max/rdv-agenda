-- v89 — dialer_attempts : session d'appels automatique des télépros (Aircall)
--
-- Le télépro lance une « session d'appels » dans /telepro : la plateforme prend
-- ses leads dans l'ordre de « À traiter aujourd'hui », lance chaque appel depuis
-- sa ligne Aircall (POST /v1/users/:id/calls), rappelle tout de suite quand ça
-- ne répond pas (double appel) et reprogramme une relance plus tard dans la
-- journée quand le passage échoue. Une ligne = un appel lancé par la session.
--
-- round_no : passage du jour sur ce lead (1 = premier passage, 2 = relance plus tard…)
-- try_no   : appel dans le passage (1 = premier appel, 2 = double appel…)
-- outcome  : résultat technique remonté par le webhook Aircall
-- qualification : ce que le télépro a coché (rdv, a_rappeler, repondeur…)
-- Réglages (double appel, délai de relance…) : crm_settings « dialer_settings ».

CREATE TABLE IF NOT EXISTS dialer_attempts (
  id                  BIGSERIAL PRIMARY KEY,
  rdv_user_id         UUID NOT NULL REFERENCES rdv_users(id) ON DELETE CASCADE,
  hubspot_contact_id  TEXT NOT NULL,
  phone               TEXT NOT NULL,
  day_key             TEXT NOT NULL,
  round_no            INT NOT NULL DEFAULT 1,
  try_no              INT NOT NULL DEFAULT 1,
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'dialing'
                      CHECK (status IN ('dialing', 'in_call', 'ended', 'failed')),
  outcome             TEXT CHECK (outcome IN ('answered', 'no_answer', 'voicemail')),
  qualification       TEXT,
  aircall_call_id     BIGINT,
  aircall_user_id     BIGINT,
  aircall_number_id   BIGINT,
  duration_sec        INT,
  error               TEXT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at         TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  qualified_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dialer_attempts_user_day
  ON dialer_attempts (rdv_user_id, day_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dialer_attempts_contact_day
  ON dialer_attempts (hubspot_contact_id, day_key);
CREATE INDEX IF NOT EXISTS idx_dialer_attempts_phone_open
  ON dialer_attempts (phone, started_at DESC) WHERE ended_at IS NULL;

-- Lu et écrit uniquement par l'API (service role)
ALTER TABLE dialer_attempts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dialer_attempts TO postgres, service_role;
GRANT USAGE, SELECT ON SEQUENCE dialer_attempts_id_seq TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
