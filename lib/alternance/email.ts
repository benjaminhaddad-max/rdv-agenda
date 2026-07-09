import { sendBrevoEmail, htmlToText } from '@/lib/brevo'

export async function sendStudentDossierEmail(params: {
  to: string
  prenom: string
  nom: string
  dossierUrl: string
}) {
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0e1e35">
      <p style="color:#C9A84C;font-weight:600;font-size:12px;margin:0 0 8px">DIPLOMA SANTÉ — ALTERNANCE</p>
      <h1 style="font-size:20px;margin:0 0 16px">Complétez votre dossier d'apprentissage</h1>
      <p>Bonjour ${params.prenom} ${params.nom},</p>
      <p>Pour finaliser votre contrat d'alternance avec Diploma Santé, merci de compléter votre dossier en ligne :</p>
      <p style="margin:24px 0">
        <a href="${params.dossierUrl}" style="background:#C9A84C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
          Accéder à mon dossier
        </a>
      </p>
      <p style="font-size:12px;color:#4a6070">Ce lien est personnel et valable 30 jours.</p>
      <p style="font-size:12px;color:#4a6070">Si le bouton ne fonctionne pas :<br><a href="${params.dossierUrl}">${params.dossierUrl}</a></p>
    </div>
  `

  await sendBrevoEmail({
    subject: 'Diploma Santé — Complétez votre dossier alternance',
    htmlContent: html,
    textContent: htmlToText(html),
    to: [{ email: params.to, name: `${params.prenom} ${params.nom}` }],
    tags: ['alternance', 'dossier-etudiant'],
  })
}

export async function notifyDossierCompleted(params: {
  adminEmail: string
  prenom: string
  nom: string
}) {
  const html = `
    <p>Le dossier alternance de <strong>${params.prenom} ${params.nom}</strong> a été complété par l'étudiant.</p>
    <p><a href="https://hub.diploma-sante.fr/admin/crm/alternance/etudiants">Valider dans le CRM →</a></p>
  `
  await sendBrevoEmail({
    subject: `Dossier alternance complété — ${params.prenom} ${params.nom}`,
    htmlContent: html,
    textContent: htmlToText(html),
    to: [{ email: params.adminEmail }],
    tags: ['alternance', 'dossier-complete'],
  })
}
