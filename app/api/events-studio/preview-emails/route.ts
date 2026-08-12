// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'

const EVENTS_SUPABASE_URL = 'https://jhopwqpbaiyjfoggvcaf.supabase.co'
const EVENTS_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3B3cXBiYWl5amZvZ2d2Y2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTI2OTEsImV4cCI6MjA4ODYyODY5MX0.rz3TJZryPxEf3P5kQgpzQkwN9aF8_F4eo4F03CEYVPs'

type Ev = {
  name: string
  event_date: string
  event_time_end?: string | null
  zoom_join_url?: string | null
  description?: string | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const template = searchParams.get('template')
  if (!template) {
    return new NextResponse('Paramètre "template" requis. Ex: ?template=confirmation&prenom=Aaron', { status: 400 })
  }

  const firstName = searchParams.get('prenom') || 'Jean'
  const templateMap: Record<string, string> = {
    confirmation: 'confirmation',
    'j-7': 'j-7',
    'j-1': 'j-1',
    'j-0-matin': 'j-0-matin',
    'j-0-10h': 'j-0-matin',
    'j-0-5min': 'j-0-5min',
    'j-0-18h25': 'j-0-5min',
  }
  const type = templateMap[template]
  if (!type) {
    return new NextResponse(
      'Template invalide. Templates disponibles : confirmation, j-7, j-1, j-0-matin, j-0-5min',
      { status: 400 },
    )
  }

  let ev: Ev = {
    name: 'Comment financer ses études de Santé en Europe ?',
    event_date: '2026-04-15T18:30:00+02:00',
    event_time_end: '19:15',
    zoom_join_url: 'https://us02web.zoom.us/j/83013598154',
    description:
      "Avec la participation exceptionnelle du LCL, partenaire officiel d'Edumove, découvrez toutes les solutions pour financer vos études de santé en Europe.",
  }

  const eventId = searchParams.get('event_id')
  if (eventId) {
    try {
      const resp = await fetch(
        `${EVENTS_SUPABASE_URL}/rest/v1/events?select=*&id=eq.${encodeURIComponent(eventId)}&limit=1`,
        {
          headers: {
            apikey: EVENTS_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${EVENTS_SUPABASE_ANON_KEY}`,
          },
        },
      )
      const data = await resp.json()
      if (Array.isArray(data) && data.length > 0) ev = data[0]
    } catch {
      /* sample data */
    }
  }

  const html = buildEmail(firstName, ev, type)
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  })
}

function fmtDate(ev: Ev) {
  const d = new Date(ev.event_date);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
}

function fmtTime(ev: Ev) {
  const d = new Date(ev.event_date);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', 'h');
}

function fmtDuration(ev: Ev) {
  if (!ev.event_time_end) return '45 minutes';
  const d = new Date(ev.event_date);
  const startH = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Paris' });
  const [sh, sm] = startH.split(':').map(Number);
  const [eh, em] = ev.event_time_end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins >= 60) return mins % 60 === 0 ? `${mins / 60} heure${mins > 60 ? 's' : ''}` : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
  return `${mins} minutes`;
}

function baseTemplate(content) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Edumove \u2014 Webinaire</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

<!-- Header -->
<tr>
<td style="background-color:#1B1D3A;padding:28px 32px;text-align:center;">
<img src="https://www.edumove.fr/edumove-logo.svg" alt="Edumove" width="140" style="display:inline-block;filter:brightness(0) invert(1);" />
</td>
</tr>

<!-- Content -->
<tr>
<td style="padding:32px;">
${content}
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function ctaButton(text, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
<tr>
<td style="background-color:#EC680A;border-radius:8px;">
<a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;text-align:center;">${text}</a>
</td>
</tr>
</table>`;
}

function eventInfoBlock(ev: Ev) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin:20px 0;">
<tr>
<td style="padding:20px;">
<p style="margin:0 0 8px;font-size:13px;color:#64748b;">\ud83d\udcc5 <strong style="color:#1B1D3A;">${fmtDate(ev)}</strong> \u00e0 <strong style="color:#1B1D3A;">${fmtTime(ev)}</strong></p>
<p style="margin:0 0 8px;font-size:13px;color:#64748b;">\u23f1\ufe0f Dur\u00e9e : ${fmtDuration(ev)}</p>
<p style="margin:0;font-size:13px;color:#64748b;">\ud83d\udcbb En ligne via Zoom</p>
</td>
</tr>
</table>`;
}

// ════════════════════════════════════
// 5 TEMPLATES
// ════════════════════════════════════

function buildEmail(prenom: string, ev: Ev, type: string) {
  const n = ev.name;
  const zoom = ev.zoom_join_url || 'https://us02web.zoom.us/j/83013598154';

  switch (type) {
    case 'confirmation':
      return baseTemplate(`
<h1 style="margin:0 0 20px;font-size:24px;color:#1B1D3A;font-weight:700;">Inscription confirm\u00e9e ! \u2705</h1>
<p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
  Bonjour ${prenom},
</p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
  Votre inscription au webinaire <strong style="color:#1B1D3A;">"${n}"</strong> est bien confirm\u00e9e.
</p>
${ev.description ? `<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">${ev.description}</p>` : ''}

${eventInfoBlock(ev)}

<p style="margin:16px 0;font-size:15px;color:#334155;line-height:1.6;">
  Vous recevrez le lien de connexion Zoom par email le jour du webinaire. En attendant, vous pouvez d\u00e9couvrir nos formations.
</p>

${ctaButton("D\u00e9couvrir nos formations", "https://www.edumove.fr/formations/medecine")}

<p style="margin:16px 0 0;font-size:13px;color:#94a3b8;text-align:center;">
  Des questions ? R\u00e9pondez directement \u00e0 cet email ou appelez-nous au +33 1 89 74 42 57
</p>
`);

    case 'j-7':
      return baseTemplate(`
<h1 style="margin:0 0 20px;font-size:24px;color:#1B1D3A;font-weight:700;">Plus qu'une semaine ! \ud83d\udcc5</h1>
<p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
  Bonjour ${prenom},
</p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
  Le webinaire <strong style="color:#1B1D3A;">"${n}"</strong> a lieu dans exactement <strong>7 jours</strong>.
</p>

${eventInfoBlock(ev)}

<p style="margin:16px 0;font-size:15px;color:#334155;line-height:1.6;">
  <strong>Au programme :</strong>
</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#334155;line-height:1.8;">
  <li>Les solutions de financement (pr\u00eat, bourses, aides)</li>
  <li>Le remboursement diff\u00e9r\u00e9 : comment \u00e7a marche</li>
  <li>L'accompagnement Edumove pour votre dossier</li>
  <li>Session questions / r\u00e9ponses en direct</li>
</ul>

<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
  En attendant, d\u00e9couvrez notre guide complet sur le financement :
</p>

${ctaButton("Guide financement", "https://www.edumove.fr/financement")}
`);

    case 'j-1':
      return baseTemplate(`
<h1 style="margin:0 0 20px;font-size:24px;color:#1B1D3A;font-weight:700;">C'est demain ! \ud83c\udfaf</h1>
<p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
  Bonjour ${prenom},
</p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
  Le webinaire <strong style="color:#1B1D3A;">"${n}"</strong> a lieu <strong>demain</strong>.
</p>

${eventInfoBlock(ev)}

<p style="margin:16px 0;font-size:15px;color:#334155;line-height:1.6;">
  Pr\u00e9parez vos questions ! Un repr\u00e9sentant et l'\u00e9quipe Edumove seront l\u00e0 pour y r\u00e9pondre en direct.
</p>

<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
  Le lien Zoom vous sera envoy\u00e9 demain matin par email.
</p>

${ctaButton("En savoir plus", "https://www.edumove.fr/financement")}
`);

    case 'j-0-matin':
      return baseTemplate(`
<h1 style="margin:0 0 20px;font-size:24px;color:#1B1D3A;font-weight:700;">C'est ce soir ! \ud83d\ude80</h1>
<p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
  Bonjour ${prenom},
</p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
  Le webinaire <strong style="color:#1B1D3A;">"${n}"</strong> a lieu <strong>ce soir \u00e0 ${fmtTime(ev)}</strong>.
</p>

${eventInfoBlock(ev)}

<p style="margin:16px 0;font-size:15px;color:#334155;line-height:1.6;">
  Voici votre lien pour rejoindre le webinaire :
</p>

${ctaButton("Rejoindre le webinaire Zoom", zoom)}

<p style="margin:16px 0;font-size:14px;color:#64748b;line-height:1.6;text-align:center;">
  Le lien sera actif \u00e0 partir de ${fmtTime(ev).replace(/(\d+)h/, (_, h) => h + 'h')}. Connectez-vous quelques minutes en avance pour v\u00e9rifier votre micro et cam\u00e9ra.
</p>
`);

    case 'j-0-5min':
      return baseTemplate(`
<h1 style="margin:0 0 20px;font-size:24px;color:#1B1D3A;font-weight:700;">On commence dans 5 minutes !</h1>
<p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
  Bonjour ${prenom},
</p>
<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
  Le webinaire commence dans quelques minutes. Rejoignez-nous maintenant !
</p>

${ctaButton("Rejoindre maintenant", zoom)}

<p style="margin:16px 0;font-size:13px;color:#94a3b8;text-align:center;">
  Si le bouton ne fonctionne pas, copiez ce lien : ${zoom}
</p>
`);

    default:
      return baseTemplate(`<p>Template inconnu</p>`);
  }
}
