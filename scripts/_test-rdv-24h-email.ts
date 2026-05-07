import { send24hRelanceEmail } from '../lib/email-reminders';

(async () => {
  const res = await send24hRelanceEmail(
    { prospectEmail: 'aaron@diploma-sante.fr' },
    'Aaron',
    'Demain à 10h30',
    'visio',
    'test-token-1234',
    'test-appt-id',
  );
  if (res.ok) {
    console.log('✅ Mail rappel J-1 (avec CTA) envoyé à aaron@diploma-sante.fr');
  } else {
    console.error('❌ Erreur :', res.error);
    process.exit(1);
  }
})().catch((err) => {
  console.error('❌ Exception :', err);
  process.exit(1);
});
