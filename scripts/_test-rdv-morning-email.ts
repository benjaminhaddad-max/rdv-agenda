import { sendMorningEmail } from '../lib/email-reminders';

(async () => {
  // Variante 1 : RDV NON confirmé la veille → CTA "Confirmer ma présence" affiché
  const r1 = await sendMorningEmail(
    { prospectEmail: 'aaron@diploma-sante.fr' },
    'Aaron',
    '10h30',
    'visio',
    'https://meet.google.com/abc-defg-hij',
    'test-appt-1',
    false, // isConfirmed = false → CTA affiché
    'test-token-1234',
  );
  console.log(r1.ok ? '✅ Mail matin (NON confirmé, visio) envoyé' : `❌ ${r1.error}`);

  // Variante 2 : RDV DÉJÀ confirmé → pas de CTA
  const r2 = await sendMorningEmail(
    { prospectEmail: 'aaron@diploma-sante.fr' },
    'Aaron',
    '14h00',
    null,
    null,
    'test-appt-2',
    true, // isConfirmed = true → pas de CTA
    'test-token-5678',
  );
  console.log(r2.ok ? '✅ Mail matin (DÉJÀ confirmé, présentiel) envoyé' : `❌ ${r2.error}`);
})().catch((err) => {
  console.error('❌ Exception :', err);
  process.exit(1);
});
