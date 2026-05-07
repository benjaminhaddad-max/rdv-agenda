import { send48hConfirmEmail } from '../lib/email-reminders';

(async () => {
  const res = await send48hConfirmEmail(
    { prospectEmail: 'aaron@diploma-sante.fr' },
    'Aaron',
    'jeudi 14 mai à 10h30',
    null,
    'test-token-1234',
    'test-appt-id',
  );
  if (res.ok) {
    console.log('✅ Mail de confirmation RDV (présentiel) envoyé à aaron@diploma-sante.fr');
  } else {
    console.error('❌ Erreur :', res.error);
    process.exit(1);
  }
})().catch((err) => {
  console.error('❌ Exception :', err);
  process.exit(1);
});
