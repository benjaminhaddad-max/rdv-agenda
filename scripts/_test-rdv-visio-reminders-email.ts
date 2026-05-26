import { sendVisio1hEmail, sendVisio5minEmail } from '../lib/email-reminders';

(async () => {
  const meetingLink = 'https://rdv-agenda.vercel.app/visio/rdv-test-aaron';

  const r1 = await sendVisio1hEmail(
    { prospectEmail: 'aaron@diploma-sante.fr' },
    'Aaron',
    '14h00',
    meetingLink,
    'test-appt-visio-1h',
  );
  console.log(r1.ok ? '✅ Mail visio H-1 envoyé' : `❌ H-1: ${r1.error}`);

  const r2 = await sendVisio5minEmail(
    { prospectEmail: 'aaron@diploma-sante.fr' },
    'Aaron',
    meetingLink,
    'test-appt-visio-5min',
  );
  console.log(r2.ok ? '✅ Mail visio H-5min envoyé' : `❌ H-5min: ${r2.error}`);

  if (!r1.ok || !r2.ok) process.exit(1);
})().catch((err) => {
  console.error('❌ Exception :', err);
  process.exit(1);
});
