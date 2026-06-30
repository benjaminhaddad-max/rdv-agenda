-- Expéditeurs Brevo par marque (Last Chance Médecine)
UPDATE email_brands SET
  sender_email = 'contact@afem-edu.fr',
  sender_name = 'AFEM',
  reply_to = 'contact@afem-edu.fr',
  active = true
WHERE slug = 'afem';

UPDATE email_brands SET
  sender_email = 'contact@hermione.co',
  sender_name = 'Club Hermione',
  reply_to = 'contact@hermione.co',
  active = true
WHERE slug = 'hermione';

UPDATE email_brands SET
  sender_email = 'contact@prepamedecine.fr',
  sender_name = 'PrépaMédecine.fr',
  reply_to = 'contact@prepamedecine.fr',
  active = true
WHERE slug = 'prepamedecine';

UPDATE email_brands SET
  sender_email = 'contact@numerusclub.fr',
  sender_name = 'Numerus Club',
  reply_to = 'contact@numerusclub.fr',
  active = false
WHERE slug = 'numerus';
