import { NextResponse } from 'next/server'

/**
 * Pop-up de prise de RDV Medibox à intégrer sur le site Medibox.
 *
 *   <script src="https://hub.diploma-sante.fr/api/booking/medibox.js" defer></script>
 *   <a href="#rdv" data-medibox-rdv>Prendre rendez-vous</a>
 *
 * Tout élément [data-medibox-rdv] (ou lien vers #rdv-medibox) ouvre la pop-up ;
 * en JS : window.MediboxRDV.open(). Styles isolés (Shadow DOM), aucune dépendance.
 * Charte du site medibox.fr (même gabarit que sa pop-up « Je candidate ») ; le logo
 * est lu sur le site (/assets/img/logo-medibox-blanc.webp). Créneaux en heure de Paris.
 * Événements : dataLayer « medibox_rdv_reserve » et window « medibox:rdv-booked ».
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
  var TZ = 'Europe/Paris'
  var DURATION_MIN = 30
  var FIRST_HOUR = 9
  var LAST_HOUR = 22 // dernier créneau à 21:30
  var DAYS_AHEAD = 60
  var PHONE = '09 78 45 20 63'
  var PHONE_HREF = 'tel:+33978452063'
  var LOGO = '/assets/img/logo-medibox-blanc.webp'
  var CLASSES = ['Seconde', 'Première', 'Terminale', 'PASS / L.AS', 'Réorientation', 'Parent', 'Autre']
  var CLASSES_CRM = { 'PASS / L.AS': 'Étudiant en PASS / L.AS', 'Réorientation': 'Bac+1 / Réorientation', 'Parent': 'Parent d’élève' }
  var OFFRES = ['Medibox Excellence', 'Medibox Coaching', 'Terminale Santé', 'Stage de pré-rentrée', 'Je ne sais pas encore']
  var OFFRES_CRM = { 'Medibox Excellence': 'Medibox Excellence (PASS / L.AS)' }

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(7,5,13,.55);opacity:0;transition:opacity .22s ease;',
    'font-family:"Proxima Nova",system-ui,-apple-system,sans-serif;color:#140E2E;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}',
    '.ov.on{opacity:1}',
    'button,input{font:inherit;color:inherit}',
    'button{cursor:pointer}',
    'button:focus{outline:none}',
    'button:focus-visible,input:focus-visible{outline:2px solid #8B5CF6;outline-offset:2px}',
    '.win{position:relative;width:100%;max-width:900px;height:min(640px,calc(100vh - 48px));height:min(640px,calc(100dvh - 48px));background:#fff;border-radius:20px;overflow:hidden;display:grid;grid-template-columns:280px minmax(0,1fr);',
    'box-shadow:0 24px 60px rgba(7,5,13,.3);transform:translateY(10px);transition:transform .28s cubic-bezier(.2,.8,.25,1)}',
    '.ov.on .win{transform:none}',

    /* Panneau gauche */
    '.side{background:#140E2E;color:#fff;padding:32px 26px 24px;display:flex;flex-direction:column;gap:24px;overflow-y:auto}',
    '.logo{height:24px;width:auto;display:block;align-self:flex-start}',
    '.kick{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#A99BE0;margin-bottom:6px}',
    '.side h2{margin:0;font-size:21px;line-height:1.2;letter-spacing:-.01em;font-weight:700}',
    '.side p{margin:8px 0 0;font-size:14px;line-height:1.55;color:rgba(255,255,255,.7)}',
    '.recap{border-top:1px solid rgba(255,255,255,.12);padding:4px 0 0}',
    '.recap div{display:flex;align-items:center;gap:12px;padding:11px 0;font-size:14px}',
    '.recap div+div{border-top:1px solid rgba(255,255,255,.08)}',
    '.recap svg{width:16px;height:16px;color:#A99BE0;flex:none}',
    '.recap .k{color:rgba(255,255,255,.6);min-width:52px}',
    '.recap .v{font-weight:700;margin-left:auto;text-align:right}',
    '.recap .v.vide{color:rgba(255,255,255,.35);font-weight:400}',
    '.recap .loc{display:block;font-size:12px;font-weight:400;color:#A99BE0}',
    '.help{margin-top:auto;font-size:13px;color:rgba(255,255,255,.6)}',
    '.help a{color:#D9CCFF;font-weight:700;text-decoration:none;white-space:nowrap}',

    /* Panneau droit */
    '.main{position:relative;display:flex;flex-direction:column;min-height:0}',
    '.head{display:flex;align-items:center;gap:14px;padding:24px 30px 18px;border-bottom:1px solid #EEEAF8}',
    '.handle{display:none;position:absolute;top:8px;left:50%;margin-left:-22px;width:44px;height:5px;border-radius:3px;background:#E6E0FA}',
    '.back{width:38px;height:38px;border-radius:50%;border:1px solid #E6E0FA;background:#fff;display:grid;place-items:center;color:#4C2FA8;flex:none}',
    '.back svg{width:18px;height:18px}',
    '.title{flex:1;min-width:0}',
    '.title strong{display:block;font-size:19px;letter-spacing:-.01em;line-height:1.25}',
    '.title span{display:block;font-size:13.5px;color:#685E7E;margin-top:2px}',
    '.x{width:38px;height:38px;border-radius:50%;border:1px solid #E6E0FA;background:#fff;color:#140E2E;display:grid;place-items:center;flex:none}',
    '.x svg{width:18px;height:18px}',
    '.steps{display:flex;gap:6px;margin-top:10px}',
    '.steps i{height:3px;flex:1;border-radius:2px;background:#EEEAF8;max-width:32px}',
    '.steps i.on{background:#6D4FD0}',
    '.body{flex:1;min-height:0;overflow-y:auto;padding:22px 30px 26px;scroll-behavior:smooth}',
    '.foot{padding:16px 30px 20px;border-top:1px solid #EEEAF8;display:flex;align-items:center;gap:14px;background:#fff}',
    '.foot .sum{flex:1;min-width:0;font-size:14px;color:#685E7E}',
    '.foot .sum b{color:#140E2E}',

    /* Étape 1 : créneau */
    '.lbl{font-size:12px;font-weight:700;letter-spacing:.04em;color:#685E7E;text-transform:uppercase;margin:0 0 10px}',
    '.week{display:flex;align-items:center;gap:10px;margin-bottom:14px}',
    '.week strong{flex:1;font-size:15.5px;text-align:center}',
    '.nav{width:34px;height:34px;border-radius:10px;border:1px solid #E6E0FA;background:#fff;display:grid;place-items:center;color:#4C2FA8}',
    '.nav svg{width:18px;height:18px}',
    '.nav:disabled{opacity:.35;cursor:default}',
    '.days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}',
    '.day{border:1px solid #E6E0FA;background:#fff;border-radius:12px;padding:9px 0 8px;display:flex;flex-direction:column;align-items:center;gap:2px;transition:border-color .15s,background .15s}',
    '.day small{font-size:11.5px;font-weight:700;color:#685E7E;text-transform:uppercase;letter-spacing:.04em}',
    '.day b{font-size:17px;font-weight:700;line-height:1.2}',
    '.day:hover:not(:disabled){border-color:#6D4FD0}',
    '.day:disabled{background:#FAFAFC;border-color:#F1EFF6;color:#C9C5D6;cursor:default}',
    '.day:disabled small{color:#C9C5D6}',
    '.day.on{background:#6D4FD0;border-color:#6D4FD0;color:#fff}',
    '.day.on small{color:rgba(255,255,255,.8)}',
    '.slots{margin-top:22px}',
    '.grp+.grp{margin-top:16px}',
    '.grp .lbl{margin-bottom:8px}',
    '.chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}',
    '.slot{border:1px solid #E6E0FA;background:#fff;border-radius:10px;padding:10px 0;font-size:14.5px;font-weight:600;color:#140E2E;font-variant-numeric:tabular-nums;transition:border-color .15s,background .15s}',
    '.slot:hover{border-color:#6D4FD0}',
    '.slot.on{background:#6D4FD0;border-color:#6D4FD0;color:#fff}',
    '.empty{border:1px dashed #E6E0FA;border-radius:16px;padding:26px 20px;text-align:center;color:#685E7E;font-size:14.5px}',
    '.tz{display:flex;align-items:center;gap:7px;margin-top:16px;font-size:12.5px;color:#8A8C96}',
    '.tz svg{width:14px;height:14px}',

    /* Étape 2 : coordonnées */
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
    '.f{display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.f label,.f .lbl{font-size:12px;font-weight:700;letter-spacing:.04em;color:#685E7E;text-transform:none;margin:0}',
    '.f input{font-size:16px;color:#140E2E;width:100%;padding:12px 14px;border:1px solid #DCD6EE;border-radius:12px;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s}',
    '.f input:focus{border-color:#6D4FD0;box-shadow:0 0 0 3px rgba(109,79,208,.12)}',
    '.f input::placeholder{color:#B3ACC6}',
    '.f.bad input{border-color:#E5484D}',
    '.f.bad .pill:not(.on){border-color:#F4B4B6}',
    '.f .msg{display:none;font-size:12.5px;color:#C2272D;font-weight:600}',
    '.f.bad .msg{display:block}',
    '.blk{margin-top:18px}',
    '.pills{display:flex;flex-wrap:wrap;gap:8px}',
    '.pill{font-size:14px;font-weight:600;padding:9px 14px;border-radius:10px;border:1px solid #DCD6EE;background:#fff;color:#140E2E;transition:border-color .15s,background .15s}',
    '.pill:hover{border-color:#6D4FD0}',
    '.pill.on{background:#F3F0FC;border-color:#6D4FD0;color:#4C2FA8}',
    '.dep{max-width:150px}',
    '.info{display:flex;gap:10px;align-items:flex-start;margin-top:20px;font-size:13.5px;color:#685E7E;line-height:1.5}',
    '.info svg{width:16px;height:16px;flex:none;margin-top:2px;color:#6D4FD0}',
    '.legal{margin:14px 0 0;font-size:12px;line-height:1.5;color:#8A8C96}',
    '.legal a{color:inherit}',
    '.alert{margin-bottom:16px;background:#FEF3F2;border:1px solid #FDA29B;color:#B42318;border-radius:12px;padding:11px 14px;font-size:14px;font-weight:600}',

    /* Boutons */
    '.cta{min-height:48px;border:0;border-radius:12px;background:#6D4FD0;color:#fff;font-size:15.5px;font-weight:700;padding:0 24px;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;transition:background .15s}',
    '.cta:hover:not(:disabled){background:#5B3FC0}',
    '.cta:disabled{background:#ECE8F6;color:#A8A1BC;cursor:not-allowed}',
    '.cta svg{width:18px;height:18px}',
    '.ghost{min-height:44px;border-radius:10px;border:1px solid #DCD6EE;background:#fff;color:#241A36;font-size:15px;font-weight:700;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;gap:9px;text-decoration:none;transition:border-color .15s}',
    '.ghost:hover{border-color:#6D4FD0}',
    '.ghost svg{width:17px;height:17px;color:#6D4FD0}',
    '.spin{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:sp .7s linear infinite}',
    '@keyframes sp{to{transform:rotate(360deg)}}',

    /* Étape 3 : confirmation */
    '.ok{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 0 8px}',
    '.ok .badge{width:52px;height:52px;border-radius:50%;background:#F3F0FC;color:#6D4FD0;display:grid;place-items:center;margin-bottom:16px}',
    '.ok .badge svg{width:24px;height:24px}',
    '.ok h3{margin:0;font-size:22px;letter-spacing:-.01em;line-height:1.2}',
    '.ok p{margin:8px auto 0;max-width:420px;color:#685E7E;font-size:15px}',
    '.card{margin:22px auto 0;width:100%;max-width:420px;text-align:left;border:1px solid #E6E0FA;border-radius:14px;padding:4px 16px;background:#fff}',
    '.card div{display:flex;gap:12px;align-items:center;padding:12px 0;font-size:14.5px}',
    '.card div+div{border-top:1px solid #EEEAF8}',
    '.card svg{width:16px;height:16px;color:#6D4FD0;flex:none}',
    '.card b{font-weight:700}',
    '.adds{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:20px}',

    /* Mobile : panneau qui monte du bas */
    '@media (max-width:760px){',
    '.ov{padding:0;align-items:flex-end}',
    '.win{display:flex;flex-direction:column;border-radius:24px 24px 0 0;max-width:none;height:auto;max-height:94vh;max-height:94dvh;transform:translateY(100%)}',
    '.main{flex:1 1 auto;min-height:0}',
    '.ov.on .win{transform:none}',
    '.side{display:none}',
    '.handle{display:block}',
    '.head{padding:22px 18px 14px}',
    '.body{padding:18px 18px 22px}',
    '.foot{padding:12px 18px calc(14px + env(safe-area-inset-bottom))}',
    '.foot .sum{font-size:13px}',
    '.grid{grid-template-columns:1fr}',
    '.days{gap:5px}',
    '.day{border-radius:12px;padding:8px 0 7px}',
    '.day b{font-size:17px}',
    '.chips{grid-template-columns:repeat(4,minmax(0,1fr))}',
    '.cta{padding:0 18px}',
    '}',
    '@media (prefers-reduced-motion:reduce){.ov,.win,.cta{transition:none}.cta:hover:not(:disabled){transform:none}.body{scroll-behavior:auto}}'
  ].join('\n')

  // ─── Icônes (lucide) ────────────────────────────────────────────────────────
  var I = {
    cal: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    hour: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    plus: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M12 14v4"/><path d="M10 16h4"/>',
    dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'
  }
  function ic(n, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + '</svg>'
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';' }) }

  // ─── Dates en heure de Paris ────────────────────────────────────────────────
  // Les créneaux sont des heures de Paris, quel que soit le fuseau du visiteur
  // (pages Antilles, Réunion, Guyane…).
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  var JOURS_C = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  var partsFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })
  function parisParts(ms) {
    var o = {}
    partsFmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value })
    return { y: +o.year, m: +o.month - 1, d: +o.day, h: +o.hour % 24, mi: +o.minute }
  }
  function parisOffset(ms) {
    var p = parisParts(ms)
    return Date.UTC(p.y, p.m, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000
  }
  // Heure murale de Paris → instant UTC (gère les changements d'heure).
  function parisToUtc(y, m, d, h, mi) {
    var guess = Date.UTC(y, m, d, h, mi)
    var t = guess - parisOffset(guess)
    return guess - parisOffset(t)
  }
  function pad(n) { return (n < 10 ? '0' : '') + n }
  function hm(p) { return pad(p.h) + ':' + pad(p.mi) }
  function dayKey(y, m, d) { return Date.UTC(y, m, d) } // jour calendaire (minuit UTC)
  function kParts(k) { var x = new Date(k); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), w: x.getUTCDay() } }
  function longDay(k) { var p = kParts(k); return JOURS[p.w] + ' ' + p.d + ' ' + MOIS[p.m] }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
  function localHm(ms) { var x = new Date(ms); return pad(x.getHours()) + ':' + pad(x.getMinutes()) }
  var sameTz = (function () {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone === TZ } catch (e) { return true }
  })()

  function todayKey() { var p = parisParts(Date.now()); return dayKey(p.y, p.m, p.d) }
  function slotsOf(k) {
    var p = kParts(k), out = []
    for (var h = FIRST_HOUR; h < LAST_HOUR; h++) {
      for (var mi = 0; mi < 60; mi += DURATION_MIN) {
        var s = parisToUtc(p.y, p.m, p.d, h, mi)
        out.push({ start: s, end: s + DURATION_MIN * 60000, h: h, day: k, label: pad(h) + ':' + pad(mi) })
      }
    }
    return out
  }

  // ─── Attribution (mêmes cookies _dpa_* que le site) ─────────────────────────
  function cookie(n) {
    try {
      var c = document.cookie.split(';').map(function (x) { return x.trim() }).filter(function (x) { return x.indexOf(n + '=') === 0 })[0]
      return c ? decodeURIComponent(c.slice(n.length + 1)) : null
    } catch (e) { return null }
  }
  function tracking() {
    var out = [], utm = {}
    try {
      var qs = new URLSearchParams(location.search)
      ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'].forEach(function (k) { if (qs.get(k)) utm[k] = qs.get(k) })
      if (!utm.utm_source && cookie('_dpa_utm')) utm = JSON.parse(cookie('_dpa_utm')) || {}
    } catch (e) {}
    Object.keys(utm).forEach(function (k) { out.push(k.replace('utm_', '') + '=' + utm[k]) })
    out.push('page=' + location.pathname)
    return out
  }

  // ─── État ───────────────────────────────────────────────────────────────────
  var S
  function fresh() {
    var t = todayKey()
    var first = t + 86400000 // à partir de demain
    var w = kParts(first).w
    return {
      step: 1, today: t, first: first, last: t + DAYS_AHEAD * 86400000,
      week: first - ((w + 6) % 7) * 86400000, // lundi de la semaine de demain
      firstWeek: first - ((w + 6) % 7) * 86400000,
      day: null, slot: null,
      f: { prenom: '', nom: '', email: '', tel: '', dep: '', classe: '', offre: '' },
      bad: {}, sending: false, error: null
    }
  }

  // ─── Validation ─────────────────────────────────────────────────────────────
  function phoneDigits(v) { return v.replace(/[^\d+]/g, '') }
  function normPhone(v) {
    var d = phoneDigits(v)
    if (d.charAt(0) === '+') return d
    if (d.slice(0, 2) === '00') return '+' + d.slice(2)
    if (d.charAt(0) === '0') return '+33' + d.slice(1)
    return '+33' + d
  }
  var RULES = {
    prenom: function (v) { return v.trim().length > 0 || 'Indiquez votre prénom.' },
    nom: function (v) { return v.trim().length > 0 || 'Indiquez votre nom.' },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Adresse e-mail invalide.' },
    tel: function (v) { var d = phoneDigits(v).replace(/^\+/, ''); return (d.length >= 9 && d.length <= 15) || 'Numéro de téléphone invalide.' },
    dep: function (v) { return /^(\d{2,3}|2[ABab])$/.test(v.trim()) || 'Deux ou trois chiffres, ex. 75.' },
    classe: function (v) { return !!v || 'Choisissez votre situation.' },
    offre: function (v) { return !!v || 'Choisissez un accompagnement.' }
  }
  function check(k) { var r = RULES[k](S.f[k]); return r === true ? null : r }

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  var host, root, ov, els = {}

  function sideHtml() {
    var date = S.day ? longDay(S.day) : null
    var heure = S.slot ? S.slot.label : null
    return '<img class="logo" src="' + LOGO + '" alt="Medibox" onerror="this.style.display=\'none\'">' +
      '<div><div class="kick">Entretien individuel</div>' +
      '<h2>Rendez-vous avec un conseiller</h2>' +
      '<p>Faisons le point sur votre parcours et l’accompagnement le plus adapté. Gratuit et sans engagement.</p></div>' +
      '<div class="recap">' +
      '<div>' + ic('cal') + '<span class="k">Date</span><span class="v' + (date ? '' : ' vide') + '">' + (date ? cap(date) : 'À choisir') + '</span></div>' +
      '<div>' + ic('clock') + '<span class="k">Heure</span><span class="v' + (heure ? '' : ' vide') + '">' + (heure ? heure + ' – ' + hm(parisParts(S.slot.end)) +
        (!sameTz ? '<span class="loc">' + localHm(S.slot.start) + ' chez vous</span>' : '') : 'À choisir') + '</span></div>' +
      '<div>' + ic('hour') + '<span class="k">Durée</span><span class="v">' + DURATION_MIN + ' min</span></div>' +
      '<div>' + ic('video') + '<span class="k">Lieu</span><span class="v">Google Meet</span></div>' +
      '</div>' +
      '<div class="help">Une question ? <a href="' + PHONE_HREF + '">' + PHONE + '</a></div>'
  }

  var TITLES = {
    1: ['Choisissez un créneau', 'Entretien de ' + DURATION_MIN + ' min en visioconférence'],
    2: ['Vos coordonnées', 'Pour vous envoyer la confirmation et le lien de visio'],
    3: ['Rendez-vous confirmé', 'Entretien de ' + DURATION_MIN + ' min en visioconférence']
  }
  function headHtml() {
    var t = TITLES[S.step]
    return '<span class="handle"></span>' +
      (S.step === 2 ? '<button class="back" data-a="back" aria-label="Modifier le créneau">' + ic('left') + '</button>' : '') +
      '<div class="title"><strong id="mbx-t">' + t[0] + '</strong><span>' + t[1] + '</span>' +
      '<div class="steps" aria-hidden="true"><i class="on"></i><i' + (S.step > 1 ? ' class="on"' : '') + '></i><i' + (S.step > 2 ? ' class="on"' : '') + '></i></div></div>' +
      '<button class="x" data-a="close" aria-label="Fermer">' + ic('x') + '</button>'
  }

  function step1() {
    var h = '', wk = S.week, prevOk = wk > S.firstWeek
    var a = kParts(wk), b = kParts(wk + 6 * 86400000)
    var range = a.m === b.m ? a.d + ' – ' + b.d + ' ' + MOIS[b.m] : a.d + ' ' + MOIS_C[a.m] + ' – ' + b.d + ' ' + MOIS_C[b.m]
    h += '<div class="week"><button class="nav" data-a="wprev" aria-label="Semaine précédente"' + (prevOk ? '' : ' disabled') + '>' + ic('left') + '</button>' +
      '<strong>' + range + '</strong>' +
      '<button class="nav" data-a="wnext" aria-label="Semaine suivante"' + (wk + 7 * 86400000 <= S.last ? '' : ' disabled') + '>' + ic('right') + '</button></div>'
    h += '<div class="days" role="listbox" aria-label="Jour">'
    for (var i = 0; i < 7; i++) {
      var k = wk + i * 86400000, p = kParts(k)
      var ok = k >= S.first && k <= S.last
      h += '<button class="day' + (S.day === k ? ' on' : '') + '" data-a="day" data-v="' + k + '" role="option" aria-selected="' + (S.day === k) + '"' +
        (ok ? '' : ' disabled') + ' aria-label="' + longDay(k) + '"><small>' + JOURS_C[p.w] + '</small><b>' + p.d + '</b></button>'
    }
    h += '</div><div class="slots" id="mbx-slots">'
    if (!S.day) {
      h += '<div class="empty">Sélectionnez un jour pour voir les horaires disponibles.</div>'
    } else {
      var groups = [['Matin', 0, 12], ['Après-midi', 12, 18], ['Soir', 18, 24]]
      var all = slotsOf(S.day)
      groups.forEach(function (g) {
        var list = all.filter(function (s) { return s.h >= g[1] && s.h < g[2] })
        if (!list.length) return
        h += '<div class="grp"><div class="lbl">' + g[0] + '</div><div class="chips">' +
          list.map(function (s) {
            var on = S.slot && S.slot.start === s.start
            return '<button class="slot' + (on ? ' on' : '') + '" data-a="slot" data-v="' + s.start + '" aria-pressed="' + !!on + '">' + s.label + '</button>'
          }).join('') + '</div></div>'
      })
      h += '<div class="tz">' + ic('globe') + 'Horaires à l’heure de Paris' + (sameTz ? '' : ' — l’heure locale s’affiche une fois le créneau choisi') + '</div>'
    }
    return h + '</div>'
  }

  function field(k, label, attrs) {
    var e = S.bad[k]
    return '<div class="f' + (e ? ' bad' : '') + '" data-k="' + k + '"><label for="mbx-' + k + '">' + label + '</label>' +
      '<input id="mbx-' + k + '" data-f="' + k + '" value="' + esc(S.f[k]) + '" ' + attrs + (e ? ' aria-invalid="true"' : '') + '>' +
      '<span class="msg">' + (e || '') + '</span></div>'
  }
  function pills(k, label, list) {
    var e = S.bad[k]
    return '<div class="f blk' + (e ? ' bad' : '') + '" data-k="' + k + '"><span class="lbl" id="mbx-l-' + k + '">' + label + '</span>' +
      '<div class="pills" role="radiogroup" aria-labelledby="mbx-l-' + k + '">' + list.map(function (o) {
        var on = S.f[k] === o
        return '<button type="button" class="pill' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-a="pill" data-k="' + k + '" data-v="' + esc(o) + '">' + esc(o) + '</button>'
      }).join('') + '</div><span class="msg">' + (e || '') + '</span></div>'
  }

  function step2() {
    return (S.error ? '<div class="alert" role="alert">' + esc(S.error) + '</div>' : '') +
      '<div class="grid">' +
      field('prenom', 'Prénom', 'autocomplete="given-name" placeholder="Camille"') +
      field('nom', 'Nom', 'autocomplete="family-name" placeholder="Durand"') +
      field('email', 'E-mail', 'type="email" autocomplete="email" inputmode="email" placeholder="camille@exemple.fr"') +
      field('tel', 'Téléphone', 'type="tel" autocomplete="tel" placeholder="06 12 34 56 78"') +
      '</div>' +
      pills('classe', 'Vous êtes', CLASSES) +
      pills('offre', 'Accompagnement qui vous intéresse', OFFRES) +
      '<div class="blk">' + field('dep', 'Département', 'class="dep" inputmode="numeric" maxlength="3" autocomplete="postal-code" placeholder="75"') + '</div>' +
      '<div class="info">' + ic('video') + '<span>Le lien Google Meet vous est envoyé par e-mail et SMS dès la confirmation.</span></div>' +
      '<p class="legal">En confirmant, vous acceptez que Medibox utilise ces informations pour organiser votre entretien. <a href="/confidentialite/">Politique de confidentialité</a></p>'
  }

  function step3() {
    var s = S.slot, endP = parisParts(s.end)
    var prenom = S.f.prenom.trim()
    return '<div class="ok"><div class="badge">' + ic('check', 3) + '</div>' +
      '<h3>C’est confirmé' + (prenom ? ', ' + esc(prenom) : '') + '</h3>' +
      '<p>Votre entretien est réservé. La confirmation et le lien Google Meet arrivent par e-mail et par SMS.</p>' +
      '<div class="card">' +
      '<div>' + ic('cal') + '<b>' + cap(longDay(S.day)) + '</b></div>' +
      '<div>' + ic('clock') + '<span><b>' + s.label + ' – ' + hm(endP) + '</b> (heure de Paris)' + (sameTz ? '' : ' · ' + localHm(s.start) + ' chez vous') + '</span></div>' +
      '<div>' + ic('video') + '<span>Visioconférence Google Meet · ' + DURATION_MIN + ' min</span></div>' +
      '</div>' +
      '<div class="adds"><a class="ghost" href="' + gcalUrl() + '" target="_blank" rel="noopener">' + ic('plus') + 'Google Agenda</a>' +
      '<button class="ghost" data-a="ics">' + ic('dl') + 'Apple / Outlook</button></div></div>'
  }

  function footHtml() {
    if (S.step === 1) {
      return '<div class="sum">' + (S.slot ? '<b>' + cap(longDay(S.day)) + '</b> à <b>' + S.slot.label + '</b>' : 'Choisissez un jour puis un horaire') + '</div>' +
        '<button class="cta" data-a="next"' + (S.slot ? '' : ' disabled') + '>Continuer' + ic('arrow') + '</button>'
    }
    if (S.step === 2) {
      return '<div class="sum"><b>' + cap(longDay(S.day)) + '</b> à <b>' + S.slot.label + '</b></div>' +
        '<button class="cta" data-a="submit"' + (S.sending ? ' disabled' : '') + '>' +
        (S.sending ? '<span class="spin"></span>Réservation…' : 'Confirmer le rendez-vous') + '</button>'
    }
    return '<div class="sum"></div><button class="cta" data-a="close">Terminer</button>'
  }

  function render(scrollTop) {
    els.side.innerHTML = sideHtml()
    els.head.innerHTML = headHtml()
    els.body.innerHTML = S.step === 1 ? step1() : S.step === 2 ? step2() : step3()
    els.foot.innerHTML = footHtml()
    if (scrollTop) els.body.scrollTop = 0
  }
  function renderSideFoot() {
    els.side.innerHTML = sideHtml()
    els.foot.innerHTML = footHtml()
  }

  // ─── Agenda ─────────────────────────────────────────────────────────────────
  function icsDate(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') }
  var EV_TITLE = 'Entretien Medibox (visio)'
  var EV_DESC = 'Entretien individuel avec un conseiller Medibox. Le lien Google Meet vous a été envoyé par e-mail et SMS.'
  function gcalUrl() {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(EV_TITLE) +
      '&dates=' + icsDate(S.slot.start) + '/' + icsDate(S.slot.end) + '&details=' + encodeURIComponent(EV_DESC) + '&ctz=' + TZ
  }
  function downloadIcs() {
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Medibox//RDV//FR', 'BEGIN:VEVENT',
      'UID:' + S.slot.start + '-medibox@medibox.fr', 'DTSTAMP:' + icsDate(Date.now()),
      'DTSTART:' + icsDate(S.slot.start), 'DTEND:' + icsDate(S.slot.end),
      'SUMMARY:' + EV_TITLE, 'DESCRIPTION:' + EV_DESC, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    var a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    a.download = 'entretien-medibox.ics'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(function () { URL.revokeObjectURL(a.href) }, 1000)
  }

  // ─── Envoi ──────────────────────────────────────────────────────────────────
  function submit() {
    var bad = {}, firstBad = null
    ;['prenom', 'nom', 'email', 'tel', 'classe', 'offre', 'dep'].forEach(function (k) {
      var e = check(k); if (e) { bad[k] = e; if (!firstBad) firstBad = k }
    })
    S.bad = bad; S.error = null
    if (firstBad) {
      render()
      var el = els.body.querySelector('[data-k="' + firstBad + '"]')
      if (el) { el.scrollIntoView({ block: 'center' }); var i = el.querySelector('input,button'); if (i) i.focus({ preventScroll: true }) }
      return
    }
    S.sending = true; render()
    var f = S.f
    var notes = 'RDV Medibox — Visioconférence — [Tracking: ' + tracking().join(' | ') + ']'
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
        prospect_phone: normPhone(f.tel),
        start_at: new Date(S.slot.start).toISOString(),
        end_at: new Date(S.slot.end).toISOString(),
        source: 'prospect',
        formation_type: OFFRES_CRM[f.offre] || f.offre,
        meeting_type: 'visio',
        meeting_link: null,
        departement: f.dep.trim().toUpperCase(),
        classe_actuelle: CLASSES_CRM[f.classe] || f.classe,
        call_notes: notes
      })
    }).then(function (r) {
      return r.json().catch(function () { return {} }).then(function (j) {
        if (r.ok) {
          S.step = 3
          try {
            (window.dataLayer = window.dataLayer || []).push({ event: 'medibox_rdv_reserve', rdv_date: new Date(S.slot.start).toISOString() })
            window.dispatchEvent(new CustomEvent('medibox:rdv-booked', { detail: { start: S.slot.start } }))
          } catch (e) {}
        } else if (r.status === 409) {
          S.step = 1; S.slot = null
          S.error = null
          setTimeout(function () { alertSlotTaken() }, 0)
        } else {
          S.error = j.error || 'La réservation n’a pas abouti. Réessayez dans un instant.'
        }
      })
    }).catch(function () {
      S.error = 'Connexion impossible. Vérifiez votre réseau et réessayez.'
    }).then(function () {
      S.sending = false; render(true)
    })
  }
  function alertSlotTaken() {
    var s = els.body.querySelector('#mbx-slots')
    if (s) s.insertAdjacentHTML('afterbegin', '<div class="alert" role="alert">Ce créneau vient d’être pris. Choisissez-en un autre.</div>')
  }

  // ─── Pop-up ─────────────────────────────────────────────────────────────────
  function build() {
    host = document.createElement('div')
    host.id = 'medibox-rdv-popup'
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<div class="ov" role="dialog" aria-modal="true" aria-labelledby="mbx-t"><div class="win">' +
      '<aside class="side"></aside>' +
      '<section class="main"><header class="head"></header><div class="body" tabindex="-1"></div><footer class="foot"></footer></section>' +
      '</div></div>'
    ov = root.querySelector('.ov')
    els = { side: root.querySelector('.side'), head: root.querySelector('.head'), body: root.querySelector('.body'), foot: root.querySelector('.foot') }

    ov.addEventListener('click', function (e) {
      if (e.target === ov) return close()
      var b = e.target.closest('[data-a]')
      if (!b || b.disabled) return
      var a = b.getAttribute('data-a'), v = b.getAttribute('data-v')
      if (a === 'close') return close()
      if (a === 'submit') return submit()
      if (a === 'ics') return downloadIcs()
      if (a === 'wprev' || a === 'wnext') { S.week += (a === 'wnext' ? 7 : -7) * 86400000; return render() }
      if (a === 'day') {
        S.day = +v
        if (S.slot && S.slot.day !== S.day) S.slot = null
        render()
        var sl = els.body.querySelector('#mbx-slots')
        var g = sl && sl.querySelector('.grp')
        if (g) g.scrollIntoView({ block: 'nearest' })
        return
      }
      if (a === 'slot') {
        S.slot = slotsOf(S.day).filter(function (s) { return s.start === +v })[0]
        els.body.querySelectorAll('.slot').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on) })
        return renderSideFoot()
      }
      if (a === 'next') { S.step = 2; S.bad = {}; render(true); var i = els.body.querySelector('input'); if (i && window.innerWidth > 760) i.focus({ preventScroll: true }); return }
      if (a === 'back') { S.step = 1; S.error = null; return render(true) }
      if (a === 'pill') {
        var k = b.getAttribute('data-k')
        S.f[k] = v
        b.parentNode.querySelectorAll('.pill').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on) })
        if (S.bad[k]) { delete S.bad[k]; b.closest('.f').classList.remove('bad') }
      }
    })

    ov.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-f')
      if (!k) return
      S.f[k] = e.target.value
      if (S.bad[k] && !check(k)) { delete S.bad[k]; e.target.closest('.f').classList.remove('bad'); e.target.removeAttribute('aria-invalid') }
    })
    // Validation à la sortie du champ (seulement s'il a été rempli).
    ov.addEventListener('focusout', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-f')
      if (!k || !S.f[k]) return
      var err = check(k), fEl = e.target.closest('.f')
      if (err) { S.bad[k] = err; fEl.classList.add('bad'); fEl.querySelector('.msg').textContent = err; e.target.setAttribute('aria-invalid', 'true') }
    })
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && S.step === 2 && e.target.tagName === 'INPUT') { e.preventDefault(); submit() }
      if (e.key !== 'Tab') return
      // Garde le focus dans la pop-up.
      var f = Array.prototype.filter.call(root.querySelectorAll('button:not([disabled]),input,a[href]'), function (x) { return x.offsetParent !== null })
      if (!f.length) return
      var cur = root.activeElement
      if (e.shiftKey && cur === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && cur === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    })
  }

  var prevOverflow = '', closeTimer = null, lastFocus = null
  function onKey(e) { if (e.key === 'Escape') close() }

  function open() {
    if (!host) build()
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; host.remove() }
    if (host.isConnected) return
    if (!S || S.step === 3 || S.today !== todayKey()) S = fresh()
    lastFocus = document.activeElement
    document.body.appendChild(host)
    prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    render(true)
    requestAnimationFrame(function () { ov.classList.add('on'); els.body.focus({ preventScroll: true }) })
  }

  function close() {
    if (!host || !host.isConnected) return
    ov.classList.remove('on')
    document.removeEventListener('keydown', onKey)
    document.documentElement.style.overflow = prevOverflow
    closeTimer = setTimeout(function () { closeTimer = null; host.remove() }, 260)
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true })
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
