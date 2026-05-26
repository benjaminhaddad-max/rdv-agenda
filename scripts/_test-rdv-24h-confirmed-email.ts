import { send24hRelanceEmail } from '../lib/email-reminders';

(async () => {
  const res = await send24hRelanceEmail(
    { prospectEmail: 'aaron@diploma-sante.fr' },
    'Aaron',
    'Demain à 10h30',
    'presentiel',
    '100 quai de la Rapée 75012 Paris',
    'test-token-1234',
    true,
    'test-appt-id-confirmed',
  );
  if (res.ok) {
    console.log('✅ Mail rappel J-1 (déjà confirmé) envoyé à aaron@diploma-sante.fr');
  } else {
    console.error('❌ Erreur :', res.error);
    process.exit(1);
  }
})().catch((err) => {
  console.error('❌ Exception :', err);
  process.exit(1);
});
