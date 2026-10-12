-- v80 — Cycles de vente par lead
--
-- Un contact peut vivre plusieurs cycles de vente : un par saison et par
-- produit (ex. Terminale Santé 2026-2027 en octobre, puis Prépa PASS / LAS
-- 2027-2028 s'il n'a pas pris), parfois deux dans la même année.
--
--   crm_cycle_products     catalogue modifiable + règles de suggestion
--                          (classe actuelle → produit, cette saison ou la suivante)
--   crm_sales_cycles       les cycles ; un seul « courant » par contact
--   crm_sales_cycle_events historique (ouverture, statut, clôture, modif)
--
-- Le statut du lead (crm_contacts.hs_lead_status) reste LA valeur que tout le
-- monde lit et écrit : c'est le statut du cycle courant. Le trigger ci-dessous
-- range chaque changement de statut dans le bon cycle — aucune des écritures
-- existantes (RDV pris, A replanifier, plateforme d'inscription, imports,
-- workflows…) n'a besoin d'être modifiée.
--
-- Règles du trigger :
--   - pas de cycle courant → on en ouvre un (saison du statut, sinon saison en cours) ;
--   - cycle courant ouvert → il prend le nouveau statut ; statut d'inscription
--     (Pré-inscrit / En finalisation / Finalisé / Inscrit) → gagné ; Annulé → perdu ;
--   - cycle courant clos (gagné / perdu / reporté) : un statut d'inscription de la
--     même saison le met à jour, tout autre statut ouvre automatiquement un
--     nouveau cycle (relance) — un cycle clos n'est jamais réécrit.
--
-- Les transactions (crm_deals) ne sont pas touchées : elles restent en base
-- pour les stats, l'interface ne les montre plus.

-- ── Saison commerciale en cours (bascule au 1er août) ───────────────────────
CREATE OR REPLACE FUNCTION crm_current_season() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN extract(month FROM now() AT TIME ZONE 'Europe/Paris') >= 8
    THEN extract(year FROM now() AT TIME ZONE 'Europe/Paris')::int || '-' || (extract(year FROM now() AT TIME ZONE 'Europe/Paris')::int + 1)
    ELSE (extract(year FROM now() AT TIME ZONE 'Europe/Paris')::int - 1) || '-' || extract(year FROM now() AT TIME ZONE 'Europe/Paris')::int
  END
$$;

-- Saison portée par un statut (« Pré-inscrit 2027/2028 » → 2027-2028), sinon NULL
CREATE OR REPLACE FUNCTION crm_status_season(p_status text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_status ~ '\d{4}/\d{4}\s*$'
    THEN replace(substring(p_status FROM '(\d{4}/\d{4})\s*$'), '/', '-')
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION crm_status_is_enrolled(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(btrim(p_status) ~ '^(Inscrit|(Pré-inscrit|En finalisation|Finalisé) (Medibox )?\d{4}/\d{4})$', false)
$$;

CREATE OR REPLACE FUNCTION crm_status_is_cancelled(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(btrim(p_status) ~ '^Annulé (Medibox )?\d{4}/\d{4}$', false)
$$;

-- ── Catalogue produits ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_cycle_products (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  brand       text NOT NULL DEFAULT 'diploma',      -- diploma | medibox | linova | edumove
  active      boolean NOT NULL DEFAULT true,
  sort        int NOT NULL DEFAULT 100,
  -- Suggestions : [{"classe":"Première","offset":0}] = à proposer à un élève de
  -- Première pour la saison en cours (offset 1 = saison suivante).
  suggest     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO crm_cycle_products (code, label, brand, sort, suggest) VALUES
  ('premiere_elite',        'Première Élite',                     'diploma', 10,  '[{"classe":"Seconde","offset":1},{"classe":"Première","offset":0}]'),
  ('terminale_sante',       'Terminale Santé',                    'diploma', 20,  '[{"classe":"Première","offset":1},{"classe":"Terminale","offset":0}]'),
  ('prepa_pass_las',        'Prépa PASS / LAS',                   'diploma', 30,  '[{"classe":"Terminale","offset":1},{"classe":"PASS","offset":0},{"classe":"LAS 1","offset":0},{"classe":"LAS 2","offset":0},{"classe":"LSPS 1","offset":0},{"classe":"Etudes Sup.","offset":0},{"classe":"Etudes Sup.","offset":1}]'),
  ('paes',                  'PAES (prépa PES)',                   'diploma', 40,  '[{"classe":"Terminale","offset":1},{"classe":"Etudes Sup.","offset":0},{"classe":"Etudes Sup.","offset":1},{"classe":"PASS","offset":1},{"classe":"LAS 1","offset":1}]'),
  ('licence_portail_sante', 'Licence Portail Santé',              'diploma', 50,  '[{"classe":"Terminale","offset":1}]'),
  ('stage_prerentree_las',  'Stage pré-rentrée S2 (LAS)',         'diploma', 60,  '[{"classe":"LAS 1","offset":0},{"classe":"LAS 2","offset":0},{"classe":"LAS 3","offset":0},{"classe":"LSPS 1","offset":0}]'),
  ('diploma_lab',           'Accès Diploma Lab',                  'diploma', 70,  '[{"classe":"PASS","offset":0},{"classe":"LAS 1","offset":0},{"classe":"LSPS 1","offset":0}]'),
  ('medibox',               'Medibox',                            'medibox', 80,  '[{"classe":"PASS","offset":0},{"classe":"LAS 1","offset":0},{"classe":"LAS 2","offset":0},{"classe":"LSPS 1","offset":0}]'),
  ('linova_bts',            'BTS Biologie médicale (Linova)',     'linova',  90,  '[{"classe":"Terminale","offset":1},{"classe":"Etudes Sup.","offset":0}]'),
  ('edumove',               'Études de santé à l''étranger (Edumove)', 'edumove', 100, '[{"classe":"Terminale","offset":1},{"classe":"Etudes Sup.","offset":0},{"classe":"PASS","offset":1},{"classe":"LAS 1","offset":1}]')
ON CONFLICT (code) DO NOTHING;

-- ── Cycles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_sales_cycles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_contact_id text NOT NULL,
  saison             text NOT NULL,                  -- '2026-2027'
  product_code       text,                           -- crm_cycle_products.code (NULL = à définir)
  product_label      text,                           -- libellé figé (ou produit libre)
  status             text,                           -- statut du lead pendant ce cycle
  etat               text NOT NULL DEFAULT 'ouvert' CHECK (etat IN ('ouvert','gagne','perdu','reporte')),
  motif              text,                           -- raison de clôture
  is_current         boolean NOT NULL DEFAULT true,
  parent_cycle_id    uuid,
  telepro_user_id    text,
  closer_owner_id    text,
  opened_at          timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz,
  opened_by          text,
  closed_by          text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_sales_cycles_one_current
  ON crm_sales_cycles (hubspot_contact_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS crm_sales_cycles_contact_idx
  ON crm_sales_cycles (hubspot_contact_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS crm_sales_cycles_pilotage_idx
  ON crm_sales_cycles (saison, product_code, etat) WHERE is_current;

CREATE TABLE IF NOT EXISTS crm_sales_cycle_events (
  id                 bigserial PRIMARY KEY,
  cycle_id           uuid NOT NULL,
  hubspot_contact_id text NOT NULL,
  kind               text NOT NULL,                  -- open | status | close | edit
  old_value          text,
  new_value          text,
  at                 timestamptz NOT NULL DEFAULT now(),
  by                 text
);
CREATE INDEX IF NOT EXISTS crm_sales_cycle_events_cycle_idx ON crm_sales_cycle_events (cycle_id, at DESC);

ALTER TABLE crm_cycle_products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sales_cycles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sales_cycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_cycle_products, crm_sales_cycles, crm_sales_cycle_events FROM anon, authenticated;

-- ── Trigger : statut du lead → cycle courant ────────────────────────────────
CREATE OR REPLACE FUNCTION crm_sync_sales_cycle_from_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cur        crm_sales_cycles%ROWTYPE;
  st         text := nullif(btrim(new.hs_lead_status), '');
  st_season  text;
  enrolled   boolean;
  cancelled  boolean;
  has_cur    boolean;
  new_id     uuid;
BEGIN
  IF st IS NULL THEN RETURN new; END IF;
  IF tg_op = 'UPDATE' AND new.hs_lead_status IS NOT DISTINCT FROM old.hs_lead_status THEN RETURN new; END IF;
  -- Les fonctions crm_open_sales_cycle* gèrent le cycle elles-mêmes.
  IF coalesce(current_setting('crm.skip_cycle_trigger', true), '') = '1' THEN RETURN new; END IF;

  st_season := crm_status_season(st);
  enrolled  := crm_status_is_enrolled(st);
  cancelled := crm_status_is_cancelled(st);

  SELECT * INTO cur FROM crm_sales_cycles
   WHERE hubspot_contact_id = new.hubspot_contact_id AND is_current
   LIMIT 1;
  has_cur := FOUND;

  -- Cycle courant ouvert, ou clos mais même saison et statut d'inscription : mise à jour sur place
  IF has_cur AND (cur.etat = 'ouvert' OR ((enrolled OR cancelled) AND st_season IS NOT DISTINCT FROM cur.saison)) THEN
    UPDATE crm_sales_cycles SET
      status     = st,
      etat       = CASE WHEN enrolled THEN 'gagne' WHEN cancelled THEN 'perdu' ELSE etat END,
      motif      = CASE WHEN cancelled THEN coalesce(motif, 'Inscription annulée') ELSE motif END,
      closed_at  = CASE WHEN (enrolled OR cancelled) AND etat = 'ouvert' THEN now() ELSE closed_at END,
      -- Produit pas encore choisi : la saison suit celle du statut
      saison     = CASE WHEN st_season IS NOT NULL AND product_code IS NULL AND product_label IS NULL THEN st_season ELSE saison END,
      updated_at = now()
     WHERE id = cur.id;
    INSERT INTO crm_sales_cycle_events (cycle_id, hubspot_contact_id, kind, old_value, new_value)
    VALUES (cur.id, new.hubspot_contact_id, 'status', cur.status, st);
    RETURN new;
  END IF;

  -- Pas de cycle, ou cycle clos → nouveau cycle (relance automatique)
  IF has_cur THEN
    UPDATE crm_sales_cycles SET is_current = false, updated_at = now() WHERE id = cur.id;
  END IF;
  INSERT INTO crm_sales_cycles (hubspot_contact_id, saison, status, etat, motif, closed_at, parent_cycle_id,
                                telepro_user_id, closer_owner_id, opened_by)
  VALUES (new.hubspot_contact_id,
          coalesce(st_season, crm_current_season()),
          st,
          CASE WHEN enrolled THEN 'gagne' WHEN cancelled THEN 'perdu' ELSE 'ouvert' END,
          CASE WHEN cancelled THEN 'Inscription annulée' ELSE NULL END,
          CASE WHEN enrolled OR cancelled THEN now() ELSE NULL END,
          CASE WHEN has_cur THEN cur.id ELSE NULL END,
          new.telepro_user_id::text,
          new.closer_du_contact_owner_id::text,
          'auto')
  RETURNING id INTO new_id;
  INSERT INTO crm_sales_cycle_events (cycle_id, hubspot_contact_id, kind, new_value, by)
  VALUES (new_id, new.hubspot_contact_id, 'open', st, 'auto');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sales_cycle_status_upd ON crm_contacts;
CREATE TRIGGER trg_crm_sales_cycle_status_upd
AFTER UPDATE OF hs_lead_status ON crm_contacts
FOR EACH ROW
WHEN (old.hs_lead_status IS DISTINCT FROM new.hs_lead_status)
EXECUTE FUNCTION crm_sync_sales_cycle_from_status();

DROP TRIGGER IF EXISTS trg_crm_sales_cycle_status_ins ON crm_contacts;
CREATE TRIGGER trg_crm_sales_cycle_status_ins
AFTER INSERT ON crm_contacts
FOR EACH ROW
EXECUTE FUNCTION crm_sync_sales_cycle_from_status();

-- ── Ouvrir un nouveau cycle (fiche contact, fiche RDV, actions groupées) ────
-- Clôt le cycle courant (p_close_etat : perdu | reporte | gagne, NULL = le
-- laisser dans son état s'il est déjà clos, sinon « reporte »), ouvre le
-- nouveau et pose le statut du lead (par défaut « Recyclé »).
-- Contact sans cycle enregistré : son statut actuel est d'abord archivé en
-- cycle clos, pour garder l'historique.
CREATE OR REPLACE FUNCTION crm_open_sales_cycle(
  p_contact_ids   text[],
  p_saison        text,
  p_product_code  text,
  p_product_label text,
  p_status        text DEFAULT 'Recyclé',
  p_close_etat    text DEFAULT NULL,
  p_close_motif   text DEFAULT NULL,
  p_by            text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  cid      text;
  c        crm_contacts%ROWTYPE;
  cur      crm_sales_cycles%ROWTYPE;
  has_cur  boolean;
  parent   uuid;
  new_id   uuid;
  n        int := 0;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'Recyclé');
  v_close  text;
BEGIN
  IF p_close_etat IS NOT NULL AND p_close_etat NOT IN ('perdu','reporte','gagne') THEN
    RAISE EXCEPTION 'p_close_etat invalide : %', p_close_etat;
  END IF;
  PERFORM set_config('crm.skip_cycle_trigger', '1', true);

  FOREACH cid IN ARRAY p_contact_ids LOOP
    SELECT * INTO c FROM crm_contacts WHERE hubspot_contact_id = cid;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT * INTO cur FROM crm_sales_cycles WHERE hubspot_contact_id = cid AND is_current LIMIT 1;
    has_cur := FOUND;
    parent := NULL;

    IF has_cur THEN
      v_close := CASE WHEN cur.etat <> 'ouvert' THEN coalesce(p_close_etat, cur.etat) ELSE coalesce(p_close_etat, 'reporte') END;
      UPDATE crm_sales_cycles SET
        is_current = false,
        etat       = v_close,
        motif      = coalesce(p_close_motif, motif),
        closed_at  = coalesce(closed_at, now()),
        closed_by  = coalesce(closed_by, p_by),
        updated_at = now()
       WHERE id = cur.id;
      IF cur.etat = 'ouvert' OR v_close <> cur.etat THEN
        INSERT INTO crm_sales_cycle_events (cycle_id, hubspot_contact_id, kind, old_value, new_value, by)
        VALUES (cur.id, cid, 'close', cur.etat, v_close || coalesce(' — ' || p_close_motif, ''), p_by);
      END IF;
      parent := cur.id;
    ELSIF nullif(btrim(c.hs_lead_status), '') IS NOT NULL THEN
      -- Historique implicite : le statut actuel devient un cycle clos
      v_close := CASE WHEN crm_status_is_enrolled(c.hs_lead_status) THEN 'gagne' ELSE coalesce(p_close_etat, 'reporte') END;
      INSERT INTO crm_sales_cycles (hubspot_contact_id, saison, status, etat, motif, is_current, opened_at, closed_at,
                                    telepro_user_id, closer_owner_id, opened_by, closed_by)
      VALUES (cid,
              coalesce(crm_status_season(c.hs_lead_status),
                       CASE WHEN c.createdate IS NULL THEN crm_current_season()
                            WHEN extract(month FROM c.createdate) >= 8 THEN extract(year FROM c.createdate)::int || '-' || (extract(year FROM c.createdate)::int + 1)
                            ELSE (extract(year FROM c.createdate)::int - 1) || '-' || extract(year FROM c.createdate)::int END),
              c.hs_lead_status, v_close, p_close_motif, false,
              coalesce(c.createdate, now()), now(),
              c.telepro_user_id::text, c.closer_du_contact_owner_id::text, 'auto', p_by)
      RETURNING id INTO parent;
      INSERT INTO crm_sales_cycle_events (cycle_id, hubspot_contact_id, kind, old_value, new_value, by)
      VALUES (parent, cid, 'close', c.hs_lead_status, v_close || coalesce(' — ' || p_close_motif, ''), p_by);
    END IF;

    INSERT INTO crm_sales_cycles (hubspot_contact_id, saison, product_code, product_label, status, etat, parent_cycle_id,
                                  telepro_user_id, closer_owner_id, opened_by)
    VALUES (cid, coalesce(nullif(p_saison, ''), crm_current_season()), nullif(p_product_code, ''), nullif(p_product_label, ''),
            v_status, 'ouvert', parent, c.telepro_user_id::text, c.closer_du_contact_owner_id::text, p_by)
    RETURNING id INTO new_id;
    INSERT INTO crm_sales_cycle_events (cycle_id, hubspot_contact_id, kind, old_value, new_value, by)
    VALUES (new_id, cid, 'open', c.hs_lead_status, v_status, p_by);

    IF c.hs_lead_status IS DISTINCT FROM v_status THEN
      UPDATE crm_contacts SET
        hs_lead_status = v_status,
        hubspot_raw    = coalesce(hubspot_raw, '{}'::jsonb) || jsonb_build_object('hs_lead_status', v_status),
        synced_at      = now()
       WHERE hubspot_contact_id = cid;
      INSERT INTO crm_property_history (hubspot_contact_id, property_name, value, changed_at, source_type, source_label)
      VALUES (cid, 'hs_lead_status', v_status, clock_timestamp(), 'CRM_UI', 'Nouveau cycle de vente');
    END IF;
    n := n + 1;
  END LOOP;

  PERFORM set_config('crm.skip_cycle_trigger', '', true);
  RETURN n;
END;
$$;

-- Appelable uniquement par les routes API (service role), jamais en direct par le navigateur
REVOKE EXECUTE ON FUNCTION crm_open_sales_cycle(text[], text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION crm_sync_sales_cycle_from_status() FROM PUBLIC, anon, authenticated;

-- ── Historique : dossiers de la plateforme d'inscription → cycles ───────────
-- Un cycle par (contact, saison, marque) déjà vendu ou tenté. Le plus récent
-- devient le cycle courant seulement si le statut du lead est encore celui-là
-- (sinon le contact a déjà « rebasculé » : son prochain changement de statut
-- ouvrira un nouveau cycle).
INSERT INTO crm_sales_cycles (hubspot_contact_id, saison, product_code, product_label, status, etat, motif,
                              is_current, opened_at, closed_at, opened_by)
SELECT p.hubspot_contact_id, p.saison,
       CASE WHEN p.brand = 'medibox' THEN 'medibox' ELSE NULL END,
       p.formation,
       CASE p.stage WHEN 'en_cours_inscription' THEN 'Inscription en cours' WHEN 'preinscrit' THEN 'Pré-inscrit'
                    WHEN 'finalisation' THEN 'En finalisation' WHEN 'finalise' THEN 'Finalisé' ELSE 'Annulé' END
         || CASE WHEN p.brand = 'medibox' THEN ' Medibox' ELSE '' END || ' ' || replace(p.saison, '-', '/'),
       CASE p.stage WHEN 'annule' THEN 'perdu' WHEN 'en_cours_inscription' THEN 'ouvert' ELSE 'gagne' END,
       CASE p.stage WHEN 'annule' THEN 'Inscription annulée' ELSE NULL END,
       false, coalesce(p.detected_at, now()),
       CASE WHEN p.stage <> 'en_cours_inscription' THEN coalesce(p.updated_at, p.detected_at, now()) ELSE NULL END,
       'import plateforme'
  FROM crm_pre_inscriptions p
 WHERE p.stage IS NOT NULL AND p.saison ~ '^\d{4}-\d{4}$'
   AND EXISTS (SELECT 1 FROM crm_contacts c WHERE c.hubspot_contact_id = p.hubspot_contact_id)
   AND NOT EXISTS (SELECT 1 FROM crm_sales_cycles s WHERE s.hubspot_contact_id = p.hubspot_contact_id AND s.opened_by = 'import plateforme'
                   AND s.saison = p.saison AND s.status LIKE '%' || replace(p.saison, '-', '/'));

UPDATE crm_sales_cycles s SET is_current = true
  FROM (
    SELECT DISTINCT ON (hubspot_contact_id) id
      FROM crm_sales_cycles
     WHERE opened_by = 'import plateforme'
     ORDER BY hubspot_contact_id, saison DESC, (etat = 'gagne') DESC, opened_at DESC
  ) last
 WHERE s.id = last.id
   AND EXISTS (SELECT 1 FROM crm_contacts c WHERE c.hubspot_contact_id = s.hubspot_contact_id AND btrim(c.hs_lead_status) = s.status)
   AND NOT EXISTS (SELECT 1 FROM crm_sales_cycles o WHERE o.hubspot_contact_id = s.hubspot_contact_id AND o.is_current);

NOTIFY pgrst, 'reload schema';
