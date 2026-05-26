import { sendBookingConfirmationEmail } from '../lib/email-reminders';

(async () => {
  const res = await sendBookingConfirmationEmail(
    { prospectEmail: 'aaron@diploma-sante.fr' },
    'Aaron',
    'jeudi 14 mai à 10h30',
    'presentiel',
    '100 quai de la Rapée 75012 Paris',
    'test-appt-booking',
  );
  if (res.ok) {
    console.log('✅ Mail de confirmation immédiate envoyé à aaron@diploma-sante.fr');
  } else {
    console.error('❌ Erreur :', res.error);
    process.exit(1);
  }
})().catch((err) => {
  console.error('❌ Exception :', err);
  process.exit(1);
});
