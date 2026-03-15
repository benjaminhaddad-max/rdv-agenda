-- Migration : table de configuration des types de RDV publics
-- À exécuter dans le SQL Editor Supabase

CREATE TABLE IF NOT EXISTS rdv_types (
  id          SERIAL PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,  -- 'parcoursup' | 'medecine' | 'information' | 'inscription'
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '📅',
  btn_label   TEXT NOT NULL,
  formation   TEXT NOT NULL,
  tag         TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Données initiales
INSERT INTO rdv_types (key, title, subtitle, description, icon, btn_label, formation, tag, sort_order) VALUES
(
  'parcoursup',
  'Accompagnement Parcoursup',
  'Optimisez votre dossier d''admission',
  'Un expert vous guide pas-à-pas dans la construction de vos vœux Parcoursup pour maximiser vos chances d''admission.',
  '🎓',
  'Parler à un Expert Parcoursup',
  'Accompagnement Parcoursup',
  'Parcoursup',
  1
),
(
  'medecine',
  'Coaching Orientation Médecine',
  'Spécial PASS / L.AS / 3ème année',
  'Vous êtes en reconversion depuis la médecine ? Découvrez les filières paramédicales adaptées à votre profil.',
  '🩺',
  'Étudiant en 3ème année de médecine',
  'Coaching Orientation Médecine',
  'Médecine',
  2
),
(
  'information',
  'Rendez-vous d''information',
  'Découvrez nos formations',
  'Orthophonie, kinésithérapie, sage-femme… Explorez nos programmes, les conditions d''accès et les débouchés.',
  '💡',
  'Prendre un RDV d''information',
  'Rendez-vous d''information',
  'Information',
  3
),
(
  'inscription',
  'Rendez-vous d''inscription',
  'Rejoindre Diploma Santé',
  'Rencontrez notre responsable des admissions pour finaliser votre dossier et intégrer une de nos formations.',
  '✍️',
  'Responsable des admissions',
  'Rendez-vous d''inscription',
  'Inscription',
  4
)
ON CONFLICT (key) DO NOTHING;
