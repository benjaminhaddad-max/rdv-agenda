import { NextRequest, NextResponse } from 'next/server'

const EVENTS_SUPABASE_URL = 'https://jhopwqpbaiyjfoggvcaf.supabase.co'
const EVENTS_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3B3cXBiYWl5amZvZ2d2Y2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTI2OTEsImV4cCI6MjA4ODYyODY5MX0.rz3TJZryPxEf3P5kQgpzQkwN9aF8_F4eo4F03CEYVPs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  if (!code) {
    return new NextResponse('Code manquant', { status: 400 })
  }

  try {
    const resp = await fetch(
      `${EVENTS_SUPABASE_URL}/rest/v1/registrations?select=first_name,last_name,qr_code,events(name,article,event_date,event_time_end,location,zoom_join_url)&qr_code=eq.${encodeURIComponent(code)}&limit=1`,
      {
        headers: {
          apikey: EVENTS_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${EVENTS_SUPABASE_ANON_KEY}`,
        },
      },
    )
    const data = await resp.json()
    if (!Array.isArray(data) || data.length === 0) {
      return new NextResponse('QR Code introuvable', { status: 404 })
    }

    const reg = data[0]
    const ev = reg.events
    const isVisio = !!ev.zoom_join_url

    const d = new Date(ev.event_date)
    const dateStr = d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const timeStart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    const timeEnd = ev.event_time_end || ''
    const timeStr = timeEnd ? `${timeStart} - ${timeEnd}` : timeStart
    const lieu = isVisio ? 'En ligne (visioconférence)' : ev.location || 'À confirmer'
    const qrImageUrl = `${EVENTS_SUPABASE_URL}/functions/v1/qr-image?code=${encodeURIComponent(code)}`
    const titleCase = (s: string) =>
      s ? s.toLowerCase().replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase()) : ''
    const fullName =
      `${titleCase(reg.first_name || '')} ${titleCase(reg.last_name || '')}`.trim() || 'Participant'

    const art = ev.article || 'la'
    let aLa: string
    if (art === "l'") aLa = "à l'"
    else if (art === 'le') aLa = 'au '
    else if (art === 'les') aLa = 'aux '
    else aLa = 'à ' + art + ' '
    const eventFullName = aLa + ev.name

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>QR Code - ${ev.name}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:#F5F2EC;font-family:'DM Sans',Arial,sans-serif;display:flex;flex-direction:column;align-items:center;padding:24px 16px}
.card{background:#FFF;border-radius:20px;max-width:420px;width:100%;overflow:hidden;box-shadow:0 8px 32px rgba(28,36,54,0.12)}
.logo-wrap{background:#FFFFFF;padding:28px 24px 20px;text-align:center}
.logo{width:200px;display:block;margin:0 auto}
.header{background:#1C2436;padding:32px 24px;text-align:center}
.check{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:rgba(194,171,130,0.2);border-radius:50%;margin-bottom:16px}
.title{font-family:'DM Serif Display',Georgia,serif;font-size:22px;color:#FFF;line-height:1.3;margin:0 0 8px}
.subtitle{font-size:14px;color:rgba(255,255,255,0.65);line-height:1.5}
.body{padding:28px 24px;text-align:center}
.qr-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#C2AB82;font-weight:700;margin-bottom:16px}
.qr-wrap{background:#F5F2EC;border-radius:16px;padding:24px;display:inline-block;margin-bottom:20px}
.qr-img{width:220px;height:220px;border-radius:8px;border:3px solid #1C2436;display:block}
.present{font-size:14px;color:#3D4B5C;line-height:1.6;margin-bottom:24px}
.present strong{color:#1C2436}
.sep{width:48px;height:2px;background:linear-gradient(90deg,transparent,#C2AB82,transparent);margin:0 auto 20px}
.details{background:#F5F2EC;border-radius:12px;padding:20px;text-align:left}
.detail-row{display:flex;align-items:flex-start;margin-bottom:12px}
.detail-row:last-child{margin-bottom:0}
.detail-icon{font-size:18px;margin-right:10px;flex-shrink:0}
.detail-label{font-size:11px;color:#8B95A5;text-transform:uppercase;letter-spacing:0.5px}
.detail-value{font-size:15px;color:#1C2436;font-weight:600;margin-top:2px}
.tip{background:#F5F2EC;border-left:3px solid #C2AB82;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 24px 24px;text-align:left}
.tip p{font-size:13px;color:#3D4B5C;font-style:italic;line-height:1.5}
.tip strong{font-style:normal}
.footer{background:#1C2436;padding:20px 24px;text-align:center}
.footer p{font-size:12px;color:rgba(255,255,255,0.4)}
.footer a{color:#C2AB82;text-decoration:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo-wrap">
    <img src="https://26711031.fs1.hubspotusercontent-eu1.net/hubfs/26711031/logo-diploma-bleu.png" alt="Diploma Santé" class="logo">
  </div>
  <div class="header">
    <div class="check">
      <svg viewBox="0 0 24 24" fill="none" stroke="#C2AB82" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h1 class="title">Votre participation ${eventFullName} est confirmée !</h1>
    <p class="subtitle">Vous trouverez ci-dessous le QR code à présenter à votre arrivée</p>
  </div>
  <div class="body">
    <p class="qr-label">Votre QR Code personnel</p>
    <div class="qr-wrap">
      <img src="${qrImageUrl}" alt="QR Code" class="qr-img">
    </div>
    <p class="present">Présentez ce QR code <strong>à l'entrée de l'événement</strong></p>
    <div class="sep"></div>
    <div class="details">
      <div class="detail-row">
        <span class="detail-icon">&#128100;</span>
        <div><p class="detail-label">Participant</p><p class="detail-value">${fullName}</p></div>
      </div>
      <div class="detail-row">
        <span class="detail-icon">&#128197;</span>
        <div><p class="detail-label">Date</p><p class="detail-value">${dateStr}</p></div>
      </div>
      <div class="detail-row">
        <span class="detail-icon">&#128336;</span>
        <div><p class="detail-label">Horaire</p><p class="detail-value">${timeStr}</p></div>
      </div>
      <div class="detail-row">
        <span class="detail-icon">&#128205;</span>
        <div><p class="detail-label">Lieu</p><p class="detail-value">${lieu}</p></div>
      </div>
    </div>
  </div>
  <div class="tip">
    <p>Astuce : faites une <strong>capture d'écran</strong> pour y accéder facilement le jour J !</p>
  </div>
  <div class="footer">
    <p>&copy; 2026 <a href="mailto:admissions@diploma-sante.fr">Diploma Santé</a></p>
  </div>
</div>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch {
    return new NextResponse('Erreur serveur', { status: 500 })
  }
}
