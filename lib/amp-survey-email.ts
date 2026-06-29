/**
 * Contenu e-mail sondage AMP (formulaire dans Gmail) + repli HTML sans liens sortants.
 */

export interface AmpSurveyEmailContent {
  prenom: string
  submitUrl: string
  contactToken: string
  senderName: string
}

export function buildAmpSurveyHtml({
  prenom,
  submitUrl,
  contactToken,
}: Pick<AmpSurveyEmailContent, 'prenom' | 'submitUrl' | 'contactToken'>): string {
  const safePrenom = escapeHtml(prenom)
  const safeToken = escapeHtml(contactToken)

  return `<!doctype html>
<html ⚡4email data-css-strict lang="fr">
<head>
  <meta charset="utf-8">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script async custom-element="amp-form" src="https://cdn.ampproject.org/v0/amp-form-0.1.js"></script>
  <script async custom-template="amp-mustache" src="https://cdn.ampproject.org/v0/amp-mustache-0.2.js"></script>
  <style amp4email-boilerplate>body{visibility:hidden}</style>
  <style amp-custom>
    body{font-family:Roboto,Arial,sans-serif;color:#12314d;font-size:15px;line-height:1.55;margin:0;padding:16px}
    h1{font-size:18px;margin:0 0 10px;font-weight:600}
    .card{border:1px solid #dadce0;border-radius:12px;padding:16px;background:#fafafa;margin:14px 0}
    label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
    select{width:100%;padding:10px;border:1px solid #dadce0;border-radius:8px;margin-bottom:12px;font-size:15px;box-sizing:border-box}
    button{width:100%;padding:12px;background:#12314d;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600}
    .ok{padding:12px;background:#e6f4ea;border-radius:8px;color:#137333;font-size:14px}
    .badge{font-size:11px;background:#fef7e0;color:#b06000;padding:3px 8px;border-radius:4px;display:inline-block;margin-bottom:10px}
    .hint{font-size:13px;color:#5f6368;margin:0 0 12px}
  </style>
</head>
<body>
  <span class="badge">⚡ Formulaire dans l'e-mail</span>
  <h1>Bonjour ${safePrenom} — 2 questions avant la rentrée médecine</h1>
  <p class="hint">Réponds ici : rien à ouvrir, tout se fait dans Gmail.</p>
  <div class="card">
    <form method="post" action-xhr="${submitUrl}" custom-validation-reporting="as-you-go">
      <input type="hidden" name="contact_token" value="${safeToken}">
      <input type="hidden" name="prenom" value="${safePrenom}">
      <label for="fac">Faculté visée (PASS/LAS)</label>
      <select id="fac" name="faculte_visee" required>
        <option value="">— Choisir —</option>
        <option value="paris-cite">Paris Cité</option>
        <option value="sorbonne">Sorbonne</option>
        <option value="saclay">Paris-Saclay</option>
        <option value="hesite">Pas encore fixé</option>
      </select>
      <label for="strat">Stratégie avant septembre</label>
      <select id="strat" name="strategie_prepa" required>
        <option value="">— Choisir —</option>
        <option value="prepa">Prépa privée</option>
        <option value="tutorat">Tutorat fac</option>
        <option value="mix">Les deux</option>
        <option value="hesite">Je ne sais pas</option>
      </select>
      <button type="submit">Envoyer mes réponses</button>
      <div submit-success>
        <template type="amp-mustache">
          <div class="ok">Merci {{prenom}} ! Réponses enregistrées ✓</div>
        </template>
      </div>
      <div submit-error>
        <template type="amp-mustache">
          <div class="ok" style="background:#fce8e6;color:#c5221f">Erreur — réessayez dans quelques secondes.</div>
        </template>
      </div>
    </form>
  </div>
</body>
</html>`
}

/**
 * Repli HTML : pas de liens cliquables (évite l'ouverture du navigateur).
 * Gmail affiche la version AMP si le domaine est whitelisté et le mail est multipart.
 */
export function buildAmpSurveyHtmlFallback({
  prenom,
  senderName,
}: Pick<AmpSurveyEmailContent, 'prenom' | 'senderName'>): string {
  const safePrenom = escapeHtml(prenom)
  const safeSender = escapeHtml(senderName)

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="font-family:Inter,Arial,sans-serif;color:#12314d;line-height:1.6;padding:20px;background:#f6f8fc">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
    <p style="font-size:11px;color:#b06000;background:#fef7e0;padding:6px 10px;border-radius:4px;margin:0 0 16px">
      Version classique affichée — le formulaire interactif (badge ⚡) n'est pas actif sur ce message.
      Vérifiez : e-mail envoyé en AMP, expéditeur enregistré chez Google, et « E-mails dynamiques » activé dans Gmail.
    </p>
    <h1 style="font-size:20px;margin:0 0 8px">Bonjour ${safePrenom}</h1>
    <p style="margin:0 0 16px;color:#5f6368;font-size:14px">
      <strong>2 questions</strong> pour préparer ta rentrée médecine (PASS/LAS). Ton nom et ton e-mail sont déjà connus — il reste la fac et ta stratégie.
    </p>
    <div style="border:1px solid #dadce0;border-radius:12px;padding:16px;background:#fafafa;margin-bottom:16px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#80868b">1. Faculté visée</p>
      <p style="margin:0 0 16px;font-size:14px;color:#9aa0a6">Paris Cité · Sorbonne · Saclay · Pas encore fixé</p>
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#80868b">2. Stratégie avant septembre</p>
      <p style="margin:0;font-size:14px;color:#9aa0a6">Prépa · Tutorat · Les deux · Je ne sais pas</p>
    </div>
    <p style="font-size:13px;color:#5f6368;margin:0">
      Sur <strong>Gmail mobile</strong>, le formulaire interactif apparaît automatiquement quand le domaine est activé.
      Sinon : Outlook / Apple Mail ne supportent pas les formulaires dans le mail.
    </p>
    <p style="margin-top:20px;font-size:13px">${safeSender}</p>
  </div>
</body></html>`
}

export function buildAmpSurveyPlainText(prenom: string): string {
  return `Bonjour ${prenom},

2 questions avant la rentrée médecine (PASS/LAS). Ouvrez ce message dans l'application Gmail pour répondre sans quitter le mail.

— Diploma Santé`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
