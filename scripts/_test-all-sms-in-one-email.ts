import { sendBrevoEmail } from '../lib/brevo';
import {
  buildBookingSms,
  build48hSms,
  build24hRelanceSms,
  build1hSms,
  build5minSms,
} from '../lib/smsfactor';

const TO = 'aaron@diploma-sante.fr';

const EXAMPLE = {
  firstName: 'Aaron',
  dateStr: 'mercredi 28 mai à 14h00',
  heureStr: '14h00',
  campus: '100 quai de la Rapée 75012 Paris',
  visioLink: 'https://rdv-agenda.vercel.app/visio/rdv-test-aaron',
  token: 'test-token-1234',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function line(title: string, content: string): string {
  return `
    <div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
      <div style="font:700 12px Arial,sans-serif;color:#0f172a;margin:0 0 6px;text-transform:uppercase;letter-spacing:.04em">${esc(title)}</div>
      <div style="font:14px Arial,sans-serif;color:#334155;line-height:1.55">${esc(content)}</div>
    </div>
  `;
}

async function main() {
  const sms = {
    bookingVisio: buildBookingSms(EXAMPLE.firstName, EXAMPLE.dateStr, 'visio', EXAMPLE.visioLink),
    bookingPresentiel: buildBookingSms(EXAMPLE.firstName, EXAMPLE.dateStr, 'presentiel', EXAMPLE.campus),
    j2Visio: build48hSms(EXAMPLE.firstName, EXAMPLE.dateStr, 'visio', EXAMPLE.token, EXAMPLE.visioLink),
    j2Presentiel: build48hSms(EXAMPLE.firstName, EXAMPLE.dateStr, 'presentiel', EXAMPLE.token, EXAMPLE.campus),
    j1NotConfirmed: build24hRelanceSms(EXAMPLE.firstName, EXAMPLE.dateStr, 'presentiel', EXAMPLE.token, false, EXAMPLE.campus),
    j1Confirmed: build24hRelanceSms(EXAMPLE.firstName, EXAMPLE.dateStr, 'presentiel', EXAMPLE.token, true, EXAMPLE.campus),
    visio1h: build1hSms(EXAMPLE.firstName, EXAMPLE.heureStr, 'visio', EXAMPLE.visioLink),
    visio5min: build5minSms(EXAMPLE.firstName, 'visio', EXAMPLE.visioLink),
  };

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:760px">
      <h2 style="margin:0 0 8px">Récapitulatif de tous les SMS RDV</h2>
      <p style="margin:0 0 18px;color:#475569">Mail de test auto-généré avec les templates SMS actuels.</p>
      ${line('Prise de RDV immédiate - visio', sms.bookingVisio)}
      ${line('Prise de RDV immédiate - présentiel', sms.bookingPresentiel)}
      ${line('J-2 (48h) - visio', sms.j2Visio)}
      ${line('J-2 (48h) - présentiel', sms.j2Presentiel)}
      ${line('J-1 - non confirmé', sms.j1NotConfirmed)}
      ${line('J-1 - déjà confirmé', sms.j1Confirmed)}
      ${line('Visio H-1', sms.visio1h)}
      ${line('Visio H-5 min', sms.visio5min)}
    </div>
  `;

  await sendBrevoEmail({
    to: [{ email: TO }],
    subject: 'Test - Tous les SMS RDV dans un seul mail',
    htmlContent: html,
    tags: ['test', 'sms', 'recap'],
  });

  console.log(`✅ Mail récap SMS envoyé à ${TO}`);
}

main().catch((err) => {
  console.error('❌ Exception:', err);
  process.exit(1);
});
