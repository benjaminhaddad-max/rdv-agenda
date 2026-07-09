-- Module Contrats d'alternance — Diploma Santé
-- Tables isolées, aucune modification des tables CRM existantes.
-- Exécuter une seule fois après les migrations CRM.

-- ─── Entreprises ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alternance_companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raison_sociale  TEXT NOT NULL,
  siret           TEXT,
  siren           TEXT,
  adresse_numero  TEXT,
  adresse_voie    TEXT,
  adresse_complement TEXT,
  code_postal     TEXT,
  ville           TEXT,
  telephone       TEXT,
  email           TEXT,
  code_ape        TEXT,
  convention_collective TEXT,
  code_idcc       TEXT,
  opco            TEXT,
  effectif        INTEGER,
  type_employeur  TEXT,
  employeur_specifique TEXT,
  representant_legal_nom TEXT,
  representant_legal_fonction TEXT,
  signataire_nom  TEXT,
  signataire_fonction TEXT,
  maitre1_nom     TEXT,
  maitre1_prenom  TEXT,
  maitre1_naissance DATE,
  maitre1_email   TEXT,
  maitre1_emploi   TEXT,
  maitre1_diplome TEXT,
  maitre1_niveau  TEXT,
  maitre2_nom     TEXT,
  maitre2_prenom  TEXT,
  maitre2_naissance DATE,
  maitre2_email   TEXT,
  maitre2_emploi   TEXT,
  maitre2_diplome TEXT,
  maitre2_niveau  TEXT,
  caisse_retraite TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alternance_companies_siret ON alternance_companies(siret);
CREATE INDEX IF NOT EXISTS idx_alternance_companies_raison ON alternance_companies(raison_sociale);

-- ─── Étudiants ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alternance_students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  prenom          TEXT NOT NULL,
  email           TEXT NOT NULL,
  dossier_status  TEXT NOT NULL DEFAULT 'pending'
    CHECK (dossier_status IN ('pending', 'link_sent', 'completed', 'validated')),
  -- Champs complétés par l'étudiant via lien sécurisé
  nom_usage       TEXT,
  adresse_numero  TEXT,
  adresse_voie    TEXT,
  adresse_complement TEXT,
  code_postal     TEXT,
  ville           TEXT,
  telephone       TEXT,
  date_naissance  DATE,
  sexe            TEXT CHECK (sexe IS NULL OR sexe IN ('M', 'F')),
  departement_naissance TEXT,
  commune_naissance TEXT,
  nationalite     TEXT,
  nir             TEXT,
  regime_social   TEXT,
  sportif_haut_niveau BOOLEAN,
  rqth            BOOLEAN,
  equivalence_jeunes BOOLEAN,
  extension_boe   BOOLEAN,
  situation_avant TEXT,
  dernier_diplome_prepare TEXT,
  derniere_classe TEXT,
  diplome_obtenu  TEXT,
  projet_creation_entreprise BOOLEAN,
  representant_legal_nom TEXT,
  representant_legal_adresse_numero TEXT,
  representant_legal_adresse_voie TEXT,
  representant_legal_adresse_complement TEXT,
  representant_legal_code_postal TEXT,
  representant_legal_ville TEXT,
  representant_legal_email TEXT,
  -- Lien optionnel vers contact CRM
  crm_contact_id  TEXT,
  form_token      TEXT UNIQUE,
  form_token_expires_at TIMESTAMPTZ,
  form_sent_at    TIMESTAMPTZ,
  form_completed_at TIMESTAMPTZ,
  validated_at    TIMESTAMPTZ,
  validated_by    UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_by      UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alternance_students_email ON alternance_students(email);
CREATE INDEX IF NOT EXISTS idx_alternance_students_status ON alternance_students(dossier_status);
CREATE INDEX IF NOT EXISTS idx_alternance_students_token ON alternance_students(form_token);

-- ─── Contrats ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alternance_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES alternance_companies(id) ON DELETE RESTRICT,
  student_id      UUID NOT NULL REFERENCES alternance_students(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_signature', 'signed', 'active', 'ended', 'archived')),
  -- Informations contrat
  type_contrat    TEXT,
  type_avenant    TEXT,
  numero_contrat_precedent TEXT,
  date_signature  DATE,
  date_debut      DATE,
  date_fin        DATE,
  date_debut_formation_pratique DATE,
  date_effet_avenant DATE,
  duree_hebdo_heures NUMERIC(4,1),
  duree_hebdo_minutes INTEGER,
  machines_dangereuses BOOLEAN,
  salaire_brut    NUMERIC(10,2),
  pourcentage_smic NUMERIC(5,2),
  remuneration_annee1 JSONB DEFAULT '[]',
  remuneration_annee2 JSONB DEFAULT '[]',
  remuneration_annee3 JSONB DEFAULT '[]',
  remuneration_annee4 JSONB DEFAULT '[]',
  avantages_nature_nourriture NUMERIC(10,2),
  avantages_nature_logement NUMERIC(10,2),
  avantages_nature_autre TEXT,
  caisse_retraite TEXT,
  -- Formation
  diplome_prepare TEXT,
  diplome_intitule TEXT,
  code_diplome    TEXT,
  code_rncp       TEXT,
  formation       TEXT,
  cfa_nom         TEXT,
  cfa_uai         TEXT,
  cfa_siret       TEXT,
  cfa_entreprise  BOOLEAN,
  cfa_adresse_numero TEXT,
  cfa_adresse_voie TEXT,
  cfa_adresse_complement TEXT,
  cfa_code_postal TEXT,
  cfa_ville       TEXT,
  cfa_date_debut  DATE,
  cfa_date_fin_examens DATE,
  cfa_duree_heures INTEGER,
  cfa_duree_distance INTEGER,
  lieu_formation_nom TEXT,
  lieu_formation_uai TEXT,
  lieu_formation_siret TEXT,
  lieu_formation_adresse_numero TEXT,
  lieu_formation_adresse_voie TEXT,
  lieu_formation_adresse_complement TEXT,
  lieu_formation_code_postal TEXT,
  lieu_formation_ville TEXT,
  maitre_id       INTEGER DEFAULT 1 CHECK (maitre_id IN (1, 2)),
  notes           TEXT,
  created_by      UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alternance_contracts_company ON alternance_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_alternance_contracts_student ON alternance_contracts(student_id);
CREATE INDEX IF NOT EXISTS idx_alternance_contracts_status ON alternance_contracts(status);

-- ─── Documents ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alternance_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID REFERENCES alternance_contracts(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES alternance_students(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES alternance_companies(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL
    CHECK (doc_type IN (
      'cerfa', 'convention', 'avenant', 'piece_identite', 'cv',
      'diplome', 'rib', 'autre'
    )),
  label           TEXT NOT NULL,
  file_url        TEXT,
  file_name       TEXT,
  mime_type       TEXT,
  generated       BOOLEAN NOT NULL DEFAULT false,
  version         INTEGER NOT NULL DEFAULT 1,
  metadata        JSONB DEFAULT '{}',
  created_by      UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alternance_documents_contract ON alternance_documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_alternance_documents_type ON alternance_documents(doc_type);

-- ─── Mapping PDF (V2 : remplissage auto CERFA / convention) ─────────────────
CREATE TABLE IF NOT EXISTS alternance_pdf_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key    TEXT NOT NULL,
  template_version TEXT NOT NULL DEFAULT '1',
  label           TEXT NOT NULL,
  field_mappings  JSONB NOT NULL DEFAULT '[]',
  template_path   TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_key, template_version)
);

-- Mapping CERFA 10103*14 par défaut (champs PDF à renseigner quand modèle fourni)
INSERT INTO alternance_pdf_mappings (template_key, template_version, label, field_mappings)
VALUES (
  'cerfa_10103_14',
  '14',
  'CERFA Contrat d''apprentissage 10103*14',
  '[
    {"db": "company.raison_sociale", "pdf": "employeur_denomination"},
    {"db": "company.adresse_voie", "pdf": "employeur_voie"},
    {"db": "company.code_postal", "pdf": "employeur_cp"},
    {"db": "company.ville", "pdf": "employeur_commune"},
    {"db": "company.telephone", "pdf": "employeur_tel"},
    {"db": "company.email", "pdf": "employeur_email"},
    {"db": "company.siret", "pdf": "employeur_siret"},
    {"db": "company.code_ape", "pdf": "employeur_ape"},
    {"db": "company.effectif", "pdf": "employeur_effectif"},
    {"db": "company.code_idcc", "pdf": "employeur_idcc"},
    {"db": "student.nom", "pdf": "apprenti_nom_naissance"},
    {"db": "student.prenom", "pdf": "apprenti_prenom"},
    {"db": "student.nir", "pdf": "apprenti_nir"},
    {"db": "student.date_naissance", "pdf": "apprenti_date_naissance"},
    {"db": "contract.date_signature", "pdf": "contrat_date_conclusion"},
    {"db": "contract.date_debut", "pdf": "contrat_date_debut"},
    {"db": "contract.date_fin", "pdf": "contrat_date_fin"},
    {"db": "contract.diplome_prepare", "pdf": "formation_diplome"},
    {"db": "contract.code_rncp", "pdf": "formation_rncp"}
  ]'::jsonb
) ON CONFLICT (template_key, template_version) DO NOTHING;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION alternance_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_alternance_companies_updated
    BEFORE UPDATE ON alternance_companies
    FOR EACH ROW EXECUTE FUNCTION alternance_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_alternance_students_updated
    BEFORE UPDATE ON alternance_students
    FOR EACH ROW EXECUTE FUNCTION alternance_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_alternance_contracts_updated
    BEFORE UPDATE ON alternance_contracts
    FOR EACH ROW EXECUTE FUNCTION alternance_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
