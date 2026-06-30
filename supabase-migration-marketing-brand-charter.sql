-- Chartes graphiques email (couleurs, logos, typo)
ALTER TABLE email_brands
  ADD COLUMN IF NOT EXISTS secondary_color TEXT,
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS background_color TEXT,
  ADD COLUMN IF NOT EXISTS text_color TEXT,
  ADD COLUMN IF NOT EXISTS font_family TEXT,
  ADD COLUMN IF NOT EXISTS logo_text TEXT,
  ADD COLUMN IF NOT EXISTS charter_source_url TEXT,
  ADD COLUMN IF NOT EXISTS tone TEXT;

UPDATE email_brands SET
  website_url = 'https://afem-edu.fr',
  sender_name = 'AFEM',
  primary_color = '#479143',
  secondary_color = '#65bd7d',
  accent_color = '#3a8a52',
  background_color = '#f5f7f9',
  text_color = '#212326',
  font_family = 'Inter, Arial, sans-serif',
  logo_url = 'https://www.afem-edu.fr/assets/logo.png',
  charter_source_url = 'https://afem-edu.fr',
  tone = 'Association, outils gratuits PASS/LAS'
WHERE slug = 'afem';

UPDATE email_brands SET
  website_url = 'https://hermione.co',
  sender_name = 'Club Hermione',
  primary_color = '#551077',
  secondary_color = '#2b0a3d',
  accent_color = '#F4AB34',
  background_color = '#E8E8DE',
  text_color = '#1C0328',
  font_family = 'Inter, Arial, sans-serif',
  logo_url = 'https://hermione.co/wp-content/uploads/2022/03/cropped-favicon.png',
  charter_source_url = 'https://hermione.co',
  tone = 'Coaching méthode PASS/LAS'
WHERE slug = 'hermione';

UPDATE email_brands SET
  website_url = 'https://prepamedecine.fr',
  sender_name = 'PrépaMédecine.fr',
  primary_color = '#046bd2',
  secondary_color = '#0353a4',
  accent_color = '#10b981',
  background_color = '#f8fafc',
  text_color = '#0f172a',
  font_family = 'Inter, Arial, sans-serif',
  logo_url = 'https://prepamedecine.fr/logo-prepamedecine.svg',
  charter_source_url = 'https://prepamedecine.fr',
  tone = 'Comparateur prépas indépendant'
WHERE slug = 'prepamedecine';

UPDATE email_brands SET
  name = 'Numerus Club',
  website_url = 'https://www.numerusclub.fr',
  sender_name = 'Numerus Club',
  primary_color = '#C45A3D',
  secondary_color = '#A8492F',
  accent_color = '#E8A48A',
  background_color = '#F4ECE0',
  text_color = '#2A1F1A',
  font_family = 'Georgia, serif',
  logo_text = 'Numerus Club',
  logo_url = NULL,
  charter_source_url = 'https://www.numerusclub.fr/devenir-coach.html',
  tone = 'Club coachs étudiants PASS/LAS'
WHERE slug = 'numerus';

NOTIFY pgrst, 'reload schema';
