import { NextResponse } from 'next/server'

/**
 * Pop-up de prise de RDV Medibox à intégrer sur le site Medibox.
 *
 *   <script src="https://hub.diploma-sante.fr/api/booking/medibox.js" defer></script>
 *   <a href="#rdv" data-medibox-rdv>Prendre rendez-vous</a>
 *
 * Tout élément [data-medibox-rdv] (ou lien vers #rdv-medibox) ouvre la pop-up ;
 * en JS : window.MediboxRDV.open(). Styles isolés (Shadow DOM), aucune dépendance.
 * Les RDV sont créés via POST /api/appointments (CORS autorisé pour les domaines
 * Medibox, cf. isMediboxBookingOrigin) → toujours en marque Medibox.
 */

export async function GET(req: Request) {
  const host = new URL(req.url).origin
  return new NextResponse(SCRIPT.replace('__HOST__', JSON.stringify(host)), {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      'access-control-allow-origin': '*',
    },
  })
}

const SCRIPT = String.raw`/* Medibox — pop-up de prise de RDV */
(function () {
  'use strict'
  if (window.MediboxRDV) return

  // ─── Réglages ───────────────────────────────────────────────────────────────
  var API_URL = __HOST__ + '/api/appointments'
  var EVENT_TITLE = "Rendez-vous d'entretien Medibox"
  var EVENT_DURATION_MIN = 30
  var EVENT_DESCRIPTION =
    'Un conseiller Medibox fait le point avec vous sur votre projet, votre faculté et ' +
    'l’accompagnement le plus adapté. L’entretien se déroule à distance, en visioconférence.'
  var SLOT_START_HOUR = 9
  var SLOT_END_HOUR = 22
  var CLASSE_OPTIONS = ['Seconde', 'Première', 'Terminale', 'Étudiant en PASS / L.AS',
    'Bac+1 / Réorientation', 'Parent d’élève', 'Autre']
  var FORMATION_OPTIONS = ['Medibox Excellence (PASS / L.AS)', 'Medibox Coaching',
    'Terminale Santé', 'Stage de pré-rentrée', 'Je ne sais pas encore']

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.ov{--violet:#6D4FD0;--violet-dark:#4C2FA8;--violet-bright:#8B5CF6;--lavender:#C4B5FD;--ink:#140E2E;--muted:#685E7E;--pale:#F3F0FC;--input-bg:#F9F8FE;--input-border:#E6E0FA;--border:#E4DEEE;',
    '--gradient:linear-gradient(135deg,#4C2FA8 0%,#6D4FD0 55%,#8B5CF6 100%);',
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;',
    'background:rgba(7,5,13,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
    'font-family:"Proxima Nova",system-ui,-apple-system,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;',
    'opacity:0;transition:opacity .2s ease}',
    '.ov.on{opacity:1}',
    'button,input,select{font-family:inherit}',
    'button:focus{outline:none}',
    'button:focus-visible{outline:2px solid #8B5CF6;outline-offset:2px}',
    '.panel:focus{outline:none}',
    '.panel{position:relative;width:100%;max-width:780px;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow-y:auto;border-radius:26px;border:1.5px solid transparent;',
    'background:linear-gradient(#fff,#fff) padding-box,linear-gradient(140deg,#C4B5FD 0%,#8B5CF6 45%,#E6E0FA 100%) border-box;',
    'box-shadow:0 30px 70px -26px rgba(7,5,13,.85),0 0 70px -24px rgba(167,139,250,.75);transform:translateY(12px);transition:transform .2s ease}',
    '.ov.on .panel{transform:none}',
    '.x{position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:50%;border:none;background:var(--pale);color:var(--violet-dark);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1}',
    '.recap{padding:26px 64px 22px 28px;border-bottom:1px solid var(--border)}',
    '.recap h2{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:0 0 10px;color:var(--ink)}',
    '.meta{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:14px;font-weight:700;color:var(--muted);margin-bottom:12px}',
    '.meta span,.list span{display:inline-flex;align-items:center;gap:7px}',
    '.meta .when{color:var(--violet-dark)}',
    'svg.ic{width:16px;height:16px;color:var(--violet-bright);flex-shrink:0}',
    '.recap p{font-size:15px;color:#54565F;line-height:1.55;margin:0;max-width:560px}',
    '.back{width:40px;height:40px;border-radius:50%;margin-bottom:14px;border:1.5px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--violet-dark)}',
    '.back svg.ic,.x svg.ic,.nav svg.ic{color:currentColor}',
    '.step{padding:24px 28px 32px}',
    '.step h3{font-size:18px;font-weight:800;margin:0 0 18px;color:var(--ink)}',
    '.cols{display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start}',
    '.cal{width:340px;max-width:100%;flex:1 1 300px}',
    '.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}',
    '.nav{width:36px;height:36px;border-radius:10px;border:none;background:var(--pale);cursor:pointer;color:var(--violet-dark);display:flex;align-items:center;justify-content:center}',
    '.nav:disabled{background:transparent;cursor:default;color:#CFC9DD}',
    '.month{font-size:16px;font-weight:800;text-transform:capitalize}',
    '.grid{display:grid;grid-template-columns:repeat(7,1fr)}',
    '.dow{text-align:center;font-size:11.5px;color:var(--muted);font-weight:700;padding:4px 0;margin-bottom:6px}',
    '.days{row-gap:4px;font-variant-numeric:tabular-nums}',
    '.days>div{display:flex;justify-content:center}',
    '.day{width:40px;height:40px;border-radius:50%;border:none;font-size:14.5px;font-weight:700;cursor:pointer;background:var(--pale);color:var(--violet-dark)}',
    '.day:disabled{font-weight:400;cursor:default;background:transparent;color:#B5AEC6}',
    '.day.today{border:1.5px solid var(--lavender)}',
    '.day.sel{background:var(--gradient);color:#fff;border:none;box-shadow:0 8px 18px -6px rgba(109,79,208,.7)}',
    '.tz{display:flex;align-items:center;gap:7px;margin-top:18px;font-size:13px;color:var(--muted);font-weight:600}',
    '.tz svg.ic{color:var(--muted);width:15px;height:15px}',
    '.slots-col{flex:1 1 220px;min-width:0}',
    '.placeholder{border:1.5px dashed var(--input-border);border-radius:16px;padding:28px 20px;text-align:center;font-size:14.5px;color:var(--muted);line-height:1.5}',
    '.slots-date{font-size:15px;font-weight:800;margin-bottom:12px;text-transform:capitalize}',
    '.slots{display:flex;flex-direction:column;gap:9px;max-height:380px;overflow-y:auto;padding-right:4px;font-variant-numeric:tabular-nums}',
    '.slot{background:#fff;border:1.5px solid var(--input-border);border-radius:12px;padding:13px 0;color:var(--violet-dark);font-size:15px;font-weight:700;cursor:pointer}',
    '.slot:hover{border-color:var(--violet);background:var(--pale)}',
    '.pending{display:flex;gap:7px}',
    '.pending div{flex:1;background:var(--ink);color:#fff;border-radius:12px;padding:13px 0;text-align:center;font-size:15px;font-weight:700}',
    '.pending button{flex:1;background:var(--gradient);color:#fff;border:none;border-radius:12px;padding:13px 0;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 10px 22px -10px rgba(109,79,208,.85)}',
    '.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:16px}',
    'label{display:block;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--violet-dark);margin-bottom:7px}',
    '.in{width:100%;min-height:52px;border:1.5px solid var(--input-border);border-radius:12px;padding:13px 16px;font-size:16px;color:var(--ink);outline:none;background:var(--input-bg);margin:0}',
    '.in:focus{background:#fff;border-color:var(--violet-bright);box-shadow:0 0 0 4px rgba(139,92,246,.16)}',
    '.in::placeholder{color:#A8A1BC}',
    'select.in{cursor:pointer}',
    'select.in.empty{color:#A8A1BC}',
    '.note{display:flex;align-items:flex-start;gap:10px;background:var(--pale);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--violet-dark);font-weight:600;line-height:1.5;margin-bottom:18px}',
    '.note svg.ic{width:18px;height:18px;color:currentColor;margin-top:1px}',
    '.err{background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:11px 14px;color:#b91c1c;font-size:14px;margin-bottom:14px}',
    '.cta{width:100%;min-height:58px;border-radius:14px;border:none;background:var(--gradient);color:#fff;font-size:17px;font-weight:800;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 14px 30px -10px rgba(109,79,208,.85)}',
    '.cta:disabled{background:#ECE8F6;color:#A8A1BC;cursor:not-allowed;box-shadow:none}',
    '.cta,.pending button{transition:transform .15s ease}',
    '.cta:not(:disabled):hover,.pending button:hover{transform:translateY(-2px)}',
    '.rgpd{font-size:12.5px;color:var(--muted);line-height:1.6;margin:14px 0 0;text-align:center}',
    '.success{padding:44px 28px 46px;text-align:center}',
    '.check{width:64px;height:64px;border-radius:50%;margin:0 auto 20px;padding:3px;background:conic-gradient(from -90deg,#8B5CF6,#C4B5FD,#8B5CF6)}',
    '.check div{width:100%;height:100%;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center}',
    '.check svg.ic{color:var(--violet)}',
    '.success h2{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0 0 8px;color:var(--ink)}',
    '.success>p{font-size:15px;color:var(--muted);margin:0 auto 26px;line-height:1.55;max-width:420px}',
    '.box{display:inline-block;text-align:left;background:var(--input-bg);border:1.5px solid var(--input-border);border-radius:16px;padding:18px 22px;max-width:440px;width:100%}',
    '.box strong{display:block;font-size:16px;font-weight:800;margin-bottom:12px}',
    '.list{display:flex;flex-direction:column;gap:9px;font-size:14.5px;color:#54565F;font-weight:600}',
    '.done{margin-top:26px;background:#fff;color:#241A36;border:1.5px solid #D6D7E6;border-radius:12px;padding:12px 22px;font-size:15px;font-weight:700;cursor:pointer}',
    '@media (max-width:560px){.ov{padding:0;align-items:flex-end}.panel{max-height:94vh;max-height:94dvh;border-radius:22px 22px 0 0}',
    '.recap{padding:22px 60px 18px 18px}.step,.success{padding-left:18px;padding-right:18px}.day{width:38px;height:38px}}',
    '@media (prefers-reduced-motion:reduce){.ov,.panel,.cta,.pending button{transition:none}.cta:not(:disabled):hover,.pending button:hover{transform:none}}'
  ].join('\n')

  // ─── Icônes (lucide) ────────────────────────────────────────────────────────
  var P = {
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    cal: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  }
  function icon(name, size, sw) {
    var s = size ? ' style="width:' + size + 'px;height:' + size + 'px"' : ''
    return '<svg class="ic"' + s + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[name] + '</svg>'
  }

  // ─── Dates ──────────────────────────────────────────────────────────────────
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  var WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
  function pad(n) { return (n < 10 ? '0' : '') + n }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) }
  function longDate(d) { return WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';' }) }

  // ─── État ───────────────────────────────────────────────────────────────────
  var host, root, ov, app, lastFocus, today, thisMonth, firstAvailable, S

  function initialState() {
    today = startOfDay(new Date())
    firstAvailable = addDays(today, 1) // réservation à partir de demain
    thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    return {
      step: 'date', month: thisMonth, date: null, pending: null, slot: null,
      form: { prenom: '', nom: '', email: '', phone: '', departement: '', classe: '', formation: '' },
      submitting: false, error: null
    }
  }

  function utmParams() {
    var p = new URLSearchParams(location.search), out = []
    ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'].forEach(function (k) {
      if (p.get(k)) out.push(k.replace('utm_', '') + '=' + p.get(k))
    })
    return out
  }

  function slotsFor(date) {
    var out = []
    var c = new Date(date); c.setHours(SLOT_START_HOUR, 0, 0, 0)
    var limit = new Date(date); limit.setHours(SLOT_END_HOUR, 0, 0, 0)
    while (c < limit) {
      var e = new Date(c.getTime() + EVENT_DURATION_MIN * 60000)
      if (e > limit) break
      out.push({ start: c.toISOString(), end: e.toISOString() })
      c = e
    }
    return out
  }

  function formValid() {
    var f = S.form
    return !!(f.prenom.trim() && f.nom.trim() && /\S+@\S+\.\S+/.test(f.email.trim()) && f.phone.trim() &&
      /^\d{2,3}$|^2[ABab]$/.test(f.departement.trim()) && f.classe && f.formation)
  }

  function normalizePhone(raw) {
    var d = raw.replace(/[^\d+]/g, '')
    if (d.charAt(0) === '+') return d
    if (d.charAt(0) === '0') return '+33' + d.slice(1)
    return '+33' + d
  }

  function slotRecap() {
    var s = new Date(S.slot.start), e = new Date(S.slot.end)
    return hhmm(s) + ' – ' + hhmm(e) + ', ' + longDate(s)
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  function render() {
    var h = '<button class="x" data-a="close" aria-label="Fermer">' + icon('x', 20) + '</button>'
    if (S.step !== 'success') {
      h += '<div class="recap">'
      if (S.step === 'form') h += '<button class="back" data-a="back" aria-label="Retour au choix du créneau">' + icon('back', 19) + '</button>'
      h += '<h2 id="mbx-title">' + EVENT_TITLE + '</h2><div class="meta">' +
        '<span>' + icon('clock') + ' ' + EVENT_DURATION_MIN + ' min</span>' +
        '<span>' + icon('video') + ' Visioconférence Google Meet</span>' +
        (S.step === 'form' ? '<span class="when">' + icon('cal') + ' ' + slotRecap() + '</span>' : '') +
        '</div><p>' + EVENT_DESCRIPTION + '</p></div>'
    }
    if (S.step === 'date') h += renderDate()
    else if (S.step === 'form') h += renderForm()
    else h += renderSuccess()
    app.innerHTML = h
  }

  function renderDate() {
    var m = S.month
    var canPrev = m > thisMonth
    var h = '<div class="step"><h3>Choisissez la date et l’heure</h3><div class="cols"><div class="cal">' +
      '<div class="cal-head"><button class="nav" data-a="prev" aria-label="Mois précédent"' + (canPrev ? '' : ' disabled') + '>' + icon('left', 20) + '</button>' +
      '<div class="month">' + MONTHS[m.getMonth()] + ' ' + m.getFullYear() + '</div>' +
      '<button class="nav" data-a="next" aria-label="Mois suivant">' + icon('right', 20) + '</button></div>' +
      '<div class="grid">' + ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(function (d) { return '<div class="dow">' + d + '</div>' }).join('') + '</div>' +
      '<div class="grid days">'
    var offset = (m.getDay() + 6) % 7
    for (var i = 0; i < offset; i++) h += '<div></div>'
    var d = new Date(m), count = offset
    while (d.getMonth() === m.getMonth()) {
      var avail = d >= firstAvailable
      var sel = S.date && sameDay(d, S.date)
      var cls = 'day' + (sel ? ' sel' : '') + (sameDay(d, today) && !sel ? ' today' : '')
      h += '<div><button class="' + cls + '" data-a="day" data-v="' + d.getTime() + '" aria-pressed="' + !!sel + '"' +
        (avail ? '' : ' disabled') + '>' + d.getDate() + '</button></div>'
      d = addDays(d, 1); count++
    }
    while (count % 7 !== 0) { h += '<div></div>'; count++ }
    h += '</div><div class="tz">' + icon('globe') + ' Heure de Paris</div></div><div class="slots-col">'
    if (!S.date) {
      h += '<div class="placeholder">Sélectionnez un jour pour afficher les créneaux disponibles.</div>'
    } else {
      h += '<div class="slots-date">' + WEEKDAYS[S.date.getDay()] + ' ' + S.date.getDate() + ' ' + MONTHS[S.date.getMonth()] + '</div><div class="slots">'
      slotsFor(S.date).forEach(function (s, idx) {
        var t = hhmm(new Date(s.start))
        if (S.pending && S.pending.start === s.start) {
          h += '<div class="pending"><div>' + t + '</div><button data-a="confirm-slot" data-v="' + idx + '">Suivant</button></div>'
        } else {
          h += '<button class="slot" data-a="slot" data-v="' + idx + '">' + t + '</button>'
        }
      })
      h += '</div>'
    }
    return h + '</div></div></div>'
  }

  function field(id, label, attrs) {
    return '<div><label for="mbx-' + id + '">' + label + '</label><input id="mbx-' + id + '" class="in" data-f="' + id + '" value="' +
      esc(S.form[id]) + '" ' + attrs + '></div>'
  }
  function select(id, label, options) {
    return '<label for="mbx-' + id + '">' + label + '</label><select id="mbx-' + id + '" class="in' + (S.form[id] ? '' : ' empty') + '" data-f="' + id + '">' +
      '<option value="" disabled' + (S.form[id] ? '' : ' selected') + '>Sélectionnez…</option>' +
      options.map(function (o) { return '<option' + (S.form[id] === o ? ' selected' : '') + '>' + esc(o) + '</option>' }).join('') + '</select>'
  }

  function renderForm() {
    var ok = formValid()
    return '<div class="step"><h3>Vos informations</h3><div class="fields">' +
      field('prenom', 'Prénom', 'autocomplete="given-name" placeholder="Camille"') +
      field('nom', 'Nom', 'autocomplete="family-name" placeholder="Durand"') +
      field('email', 'E-mail', 'type="email" autocomplete="email" placeholder="camille@exemple.fr"') +
      field('phone', 'Téléphone', 'type="tel" autocomplete="tel" placeholder="06 12 34 56 78"') +
      field('departement', 'Département', 'inputmode="numeric" maxlength="3" placeholder="Ex. 33"') +
      '<div>' + select('classe', 'Classe actuelle', CLASSE_OPTIONS) + '</div>' +
      '</div><div style="margin-bottom:18px">' + select('formation', 'Accompagnement souhaité', FORMATION_OPTIONS) + '</div>' +
      '<div class="note">' + icon('video') + '<span>L’entretien a lieu en visioconférence. Le lien Google Meet vous est envoyé par e-mail dès la réservation.</span></div>' +
      (S.error ? '<div class="err" role="alert">' + esc(S.error) + '</div>' : '') +
      '<button class="cta" data-a="submit"' + (ok && !S.submitting ? '' : ' disabled') + '>' +
      (S.submitting ? 'Réservation en cours…' : 'Confirmer mon rendez-vous') + '</button>' +
      '<p class="rgpd">En confirmant, vous acceptez que Medibox utilise ces informations pour organiser votre entretien, conformément au RGPD.</p></div>'
  }

  function renderSuccess() {
    return '<div class="success"><div class="check"><div>' + icon('check', 30, 3) + '</div></div>' +
      '<h2 id="mbx-title">Votre rendez-vous est réservé</h2>' +
      '<p>Une confirmation vous est envoyée par e-mail et par SMS, avec le lien de la visioconférence.</p>' +
      '<div class="box"><strong>' + EVENT_TITLE + '</strong><div class="list">' +
      '<span>' + icon('cal') + ' ' + slotRecap() + '</span>' +
      '<span>' + icon('video') + ' Visioconférence Google Meet</span>' +
      '<span>' + icon('globe') + ' Heure de Paris</span></div></div>' +
      '<div><button class="done" data-a="close">Fermer</button></div></div>'
  }

  // ─── Soumission ─────────────────────────────────────────────────────────────
  function submit() {
    if (!formValid() || !S.slot) { S.error = 'Veuillez remplir tous les champs obligatoires.'; return render() }
    S.submitting = true; S.error = null; render()
    var f = S.form
    var utm = utmParams()
    var notes = ['RDV Medibox — Visioconférence', utm.length ? '[Tracking: ' + utm.join(' | ') + ']' : '']
      .filter(Boolean).join(' — ')

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        web_booking: true,
        brand: 'medibox',
        prospect_name: f.prenom.trim() + ' ' + f.nom.trim(),
        prospect_firstname: f.prenom.trim(),
        prospect_lastname: f.nom.trim(),
        prospect_email: f.email.trim(),
        prospect_phone: normalizePhone(f.phone),
        start_at: S.slot.start,
        end_at: S.slot.end,
        source: 'prospect',
        formation_type: f.formation,
        meeting_type: 'visio',
        meeting_link: null,
        departement: f.departement.trim(),
        classe_actuelle: f.classe,
        call_notes: notes
      })
    }).then(function (res) {
      if (res.ok) {
        S.step = 'success'
        try { window.dispatchEvent(new CustomEvent('medibox:rdv-booked', { detail: { start: S.slot.start } })) } catch (e) {}
        return
      }
      return res.json().catch(function () { return {} }).then(function (d) {
        S.error = d.error || 'Une erreur est survenue. Veuillez réessayer.'
      })
    }).catch(function () {
      S.error = 'Erreur réseau. Veuillez réessayer.'
    }).then(function () {
      S.submitting = false; render(); ov.querySelector('.panel').scrollTop = 0
    })
  }

  // ─── Pop-up ─────────────────────────────────────────────────────────────────
  function build() {
    host = document.createElement('div')
    host.id = 'medibox-rdv-popup'
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
    root.innerHTML = '<style>' + CSS + '</style><div class="ov" role="dialog" aria-modal="true" aria-labelledby="mbx-title">' +
      '<div class="panel" tabindex="-1"></div></div>'
    ov = root.querySelector('.ov')
    app = root.querySelector('.panel')

    ov.addEventListener('click', function (e) {
      if (e.target === ov) return close()
      var b = e.target.closest('[data-a]')
      if (!b || b.disabled) return
      var a = b.getAttribute('data-a'), v = b.getAttribute('data-v')
      if (a === 'close') return close()
      if (a === 'submit') return submit()
      if (a === 'prev') S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1)
      else if (a === 'next') S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1)
      else if (a === 'day') { S.date = new Date(Number(v)); S.pending = null }
      else if (a === 'slot') S.pending = slotsFor(S.date)[Number(v)]
      else if (a === 'confirm-slot') { S.slot = slotsFor(S.date)[Number(v)]; S.step = 'form'; S.error = null }
      else if (a === 'back') { S.step = 'date'; S.pending = null }
      render()
      if (a === 'confirm-slot' || a === 'back') app.scrollTop = 0
    })

    // Saisie : mise à jour de l'état sans re-render (garde le focus).
    function onInput(e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-f')
      if (!k) return
      S.form[k] = e.target.value
      if (e.target.tagName === 'SELECT') e.target.classList.toggle('empty', !e.target.value)
      var cta = app.querySelector('.cta')
      if (cta) cta.disabled = !formValid() || S.submitting
    }
    ov.addEventListener('input', onInput)
    ov.addEventListener('change', onInput)
  }

  var prevOverflow = '', closeTimer = null
  function onKey(e) { if (e.key === 'Escape') close() }

  function open() {
    if (!host) build()
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; host.remove() }
    if (host.isConnected) return
    if (!S || S.step === 'success') S = initialState()
    lastFocus = document.activeElement
    document.body.appendChild(host)
    prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    render()
    requestAnimationFrame(function () { ov.classList.add('on'); app.focus({ preventScroll: true }) })
  }

  function close() {
    if (!host || !host.isConnected) return
    ov.classList.remove('on')
    document.removeEventListener('keydown', onKey)
    document.documentElement.style.overflow = prevOverflow
    closeTimer = setTimeout(function () { closeTimer = null; host.remove() }, 200)
    if (lastFocus && lastFocus.focus) lastFocus.focus()
  }

  // Tout élément [data-medibox-rdv] (ou lien vers #rdv-medibox) ouvre la pop-up.
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-medibox-rdv], a[href="#rdv-medibox"]')
    if (!t) return
    e.preventDefault()
    open()
  })

  window.MediboxRDV = { open: open, close: close }
  if (location.hash === '#rdv-medibox') open()
})()
`
