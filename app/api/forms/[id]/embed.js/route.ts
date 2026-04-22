import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const { id: slug } = await params
  const db = createServiceClient()

  const url = new URL(req.url)
  const host = url.origin

  const { data: form } = await db
    .from('forms')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!form) {
    return new NextResponse('// Form not found or not published', {
      status: 404,
      headers: { 'content-type': 'application/javascript' },
    })
  }

  const js = generateEmbedScript(host, slug)

  return new NextResponse(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  })
}

function generateEmbedScript(host: string, slug: string): string {
  return `/* Diploma Santé — Form Embed (card stylisée, personnalisable via réglages) */
(function(){
  "use strict";
  var HOST = ${JSON.stringify(host)};
  var SLUG = ${JSON.stringify(slug)};
  var SELECTOR = '[data-diploma-form="' + SLUG + '"]';

  function init() {
    var containers = document.querySelectorAll(SELECTOR);
    if (!containers.length) return;
    containers.forEach(mount);
  }

  function mount(container) {
    if (container.dataset.mounted) return;
    container.dataset.mounted = "1";

    var mode = container.dataset.mode || 'inline';
    if (mode === 'iframe') return mountIframe(container);

    container.innerHTML = '<div style="padding:40px 20px;color:#888;font-size:13px;text-align:center;">Chargement du formulaire…</div>';

    fetch(HOST + '/api/forms/' + encodeURIComponent(SLUG) + '/public')
      .then(function(r){ if (!r.ok) throw new Error('Form not found'); return r.json(); })
      .then(function(form){ render(container, form); })
      .catch(function(err){
        container.innerHTML = '<div style="padding:20px;color:#c00;font-size:13px;text-align:center;">Erreur : ' + err.message + '</div>';
      });
  }

  function mountIframe(container) {
    var iframe = document.createElement('iframe');
    iframe.src = HOST + '/embed/forms/' + SLUG + (location.search || '');
    iframe.style.cssText = 'border:0;width:100%;min-height:560px;max-width:100%;';
    iframe.setAttribute('title', 'Formulaire');
    iframe.setAttribute('loading', 'lazy');
    iframe.allow = 'clipboard-write';
    container.appendChild(iframe);
    window.addEventListener('message', function(e) {
      if (!e.data || e.data.type !== 'diploma-form-resize' || e.data.slug !== SLUG) return;
      if (typeof e.data.height === 'number') iframe.style.height = e.data.height + 'px';
    });
  }

  // ─── Rendu du formulaire (inline, styled card) ────────────────
  function render(container, form) {
    container.innerHTML = '';

    // Couleurs depuis la config du formulaire (personnalisables dans l'admin)
    var bgColor = form.bg_color || '#e5c78a';
    var primaryColor = form.primary_color || '#1a2f4b';
    var textColor = form.text_color || '#1a2f4b';
    var inputBg = lighten(bgColor, 0.45);

    injectStyles(SLUG, { bg: bgColor, primary: primaryColor, text: textColor, inputBg: inputBg });

    var card = document.createElement('div');
    card.className = 'diploma-form-' + SLUG + ' diploma-form';

    var formEl = document.createElement('form');
    formEl.className = 'diploma-form__form';
    formEl.noValidate = true;

    if (form.title) {
      var h = document.createElement('h3');
      h.className = 'diploma-form__title';
      h.textContent = form.title;
      card.appendChild(h);
    }
    if (form.subtitle) {
      var s = document.createElement('p');
      s.className = 'diploma-form__subtitle';
      s.textContent = form.subtitle;
      card.appendChild(s);
    }

    // UTM pré-remplis
    var prefilled = {};
    try { new URLSearchParams(location.search).forEach(function(v, k){ prefilled[k] = v; }); } catch(e){}

    (form.fields || []).forEach(function(f){
      if (f.field_type === 'hidden') {
        var hi = document.createElement('input');
        hi.type = 'hidden'; hi.name = f.field_key;
        hi.value = prefilled[f.field_key] || f.default_value || '';
        formEl.appendChild(hi);
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'diploma-form__field';

      var el;
      switch (f.field_type) {
        case 'textarea':
          el = document.createElement('textarea');
          el.rows = 3;
          break;
        case 'select':
          el = document.createElement('select');
          var opt0 = document.createElement('option');
          opt0.value = ''; opt0.textContent = f.placeholder || '— Choisir —';
          opt0.disabled = true; opt0.selected = true;
          el.appendChild(opt0);
          (f.options || []).forEach(function(o){
            var op = document.createElement('option');
            op.value = o.value; op.textContent = o.label;
            el.appendChild(op);
          });
          break;
        case 'radio':
          el = document.createElement('div');
          el.className = 'diploma-form__radios';
          (f.options || []).forEach(function(o){
            var rl = document.createElement('label');
            rl.className = 'diploma-form__radio';
            var rin = document.createElement('input');
            rin.type = 'radio'; rin.name = f.field_key; rin.value = o.value;
            if (f.required) rin.required = true;
            rl.appendChild(rin);
            rl.appendChild(document.createTextNode(' ' + o.label));
            el.appendChild(rl);
          });
          break;
        case 'checkbox':
          el = document.createElement('div');
          el.className = 'diploma-form__checkboxes';
          (f.options || []).forEach(function(o){
            var cl = document.createElement('label');
            cl.className = 'diploma-form__checkbox';
            var cin = document.createElement('input');
            cin.type = 'checkbox'; cin.name = f.field_key; cin.value = o.value;
            cl.appendChild(cin);
            cl.appendChild(document.createTextNode(' ' + o.label));
            el.appendChild(cl);
          });
          break;
        default:
          el = document.createElement('input');
          el.type = (f.field_type === 'email' ? 'email' :
                    f.field_type === 'phone' ? 'tel' :
                    f.field_type === 'number' ? 'number' :
                    f.field_type === 'date'   ? 'date' : 'text');
      }
      if (el.tagName && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        el.className = 'diploma-form__input';
        el.name = f.field_key;
        if (f.placeholder) el.placeholder = f.placeholder;
        if (f.required) el.required = true;
        var pre = prefilled[f.field_key] || f.default_value;
        if (pre) el.value = pre;
      }
      wrap.appendChild(el);

      if (f.help_text) {
        var help = document.createElement('div');
        help.className = 'diploma-form__help';
        help.textContent = f.help_text;
        wrap.appendChild(help);
      }
      formEl.appendChild(wrap);
    });

    // Honeypot
    if (form.honeypot_enabled) {
      var hp = document.createElement('input');
      hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1;
      hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
      formEl.appendChild(hp);
    }

    // Bouton submit
    var btnWrap = document.createElement('div');
    btnWrap.className = 'diploma-form__actions';
    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'diploma-form__submit';
    btn.textContent = form.submit_label || 'Soumettre';
    btnWrap.appendChild(btn);
    formEl.appendChild(btnWrap);

    // Error message area
    var errEl = document.createElement('div');
    errEl.className = 'diploma-form__error';
    formEl.appendChild(errEl);

    formEl.addEventListener('submit', function(e){
      e.preventDefault();
      errEl.textContent = '';
      errEl.style.display = 'none';
      btn.disabled = true;
      var origLabel = btn.textContent;
      btn.textContent = 'Envoi…';

      var data = {};
      Array.prototype.forEach.call(formEl.elements, function(el){
        if (!el.name || el.name === 'website') return;
        if (el.type === 'checkbox') {
          if (!data[el.name]) data[el.name] = [];
          if (el.checked) data[el.name].push(el.value);
        } else if (el.type === 'radio') {
          if (el.checked) data[el.name] = el.value;
        } else {
          data[el.name] = el.value;
        }
      });
      Object.keys(data).forEach(function(k){ if (Array.isArray(data[k])) data[k] = data[k].join(','); });

      var utm = {};
      try {
        var qs = new URLSearchParams(location.search);
        ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){
          var v = qs.get(k); if (v) utm[k] = v;
        });
      } catch(e){}

      var hpInput = formEl.querySelector('input[name="website"]');
      var payload = Object.assign({
        data: data,
        hp: hpInput ? hpInput.value : '',
        source_url: location.href,
      }, utm);

      fetch(HOST + '/api/forms/' + encodeURIComponent(SLUG) + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, body:j}; }); })
      .then(function(res){
        if (!res.ok) {
          errEl.textContent = res.body.error || 'Erreur inconnue';
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = origLabel;
          return;
        }
        if (res.body.redirect_url) { location.href = res.body.redirect_url; return; }
        var success = document.createElement('div');
        success.className = 'diploma-form__success';
        success.innerHTML = '<div style="font-size:40px;margin-bottom:10px;">✓</div>' +
          '<div class="diploma-form__success-title">Merci !</div>' +
          '<div class="diploma-form__success-text">' + escapeHtml(res.body.success_message || 'Votre message a bien été envoyé.') + '</div>';
        formEl.replaceWith(success);
      })
      .catch(function(err){
        errEl.textContent = err.message || 'Erreur réseau';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = origLabel;
      });
    });

    card.appendChild(formEl);
    container.appendChild(card);
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  function lighten(hex, amount) {
    // Fonction simple : applique une version claire du hex (pour le fond input)
    // Si on ne peut pas parser, on renvoie blanc
    try {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map(function(c){ return c+c; }).join('');
      var r = parseInt(h.substr(0,2), 16);
      var g = parseInt(h.substr(2,2), 16);
      var b = parseInt(h.substr(4,2), 16);
      r = Math.round(r + (255 - r) * amount);
      g = Math.round(g + (255 - g) * amount);
      b = Math.round(b + (255 - b) * amount);
      return '#' + [r,g,b].map(function(x){ return x.toString(16).padStart(2,'0'); }).join('');
    } catch(e) { return '#ffffff'; }
  }

  // Styles du formulaire — scope via classe unique par slug
  function injectStyles(slugId, c) {
    var id = 'diploma-form-styles-' + slugId;
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    var scope = '.diploma-form-' + slugId;
    s.textContent = [
      scope + '{background:' + c.bg + ';border-radius:18px;padding:28px 32px;color:' + c.text + ';font-family:inherit;max-width:520px;box-sizing:border-box;margin:0 auto;box-shadow:0 10px 40px rgba(0,0,0,0.08);}',
      scope + ' .diploma-form__form{display:flex;flex-direction:column;gap:14px;}',
      scope + ' .diploma-form__title{font-family:inherit;margin:0 0 4px;font-size:24px;font-weight:700;text-align:center;color:' + c.text + ';line-height:1.2;}',
      scope + ' .diploma-form__subtitle{margin:0 0 12px;font-size:14px;opacity:0.75;text-align:center;color:' + c.text + ';}',
      scope + ' .diploma-form__field{display:flex;flex-direction:column;gap:4px;}',
      scope + ' .diploma-form__input{width:100%;box-sizing:border-box;padding:14px 18px;border:1px solid rgba(0,0,0,0.08);border-radius:999px;font-family:inherit;font-size:15px;background:' + c.inputBg + ';color:' + c.text + ';outline:none;transition:border-color .15s,box-shadow .15s;}',
      scope + ' .diploma-form__input:focus{border-color:' + c.text + ';box-shadow:0 0 0 3px rgba(0,0,0,0.05);}',
      scope + ' .diploma-form__input::placeholder{color:' + c.text + ';opacity:0.5;}',
      scope + ' textarea.diploma-form__input{border-radius:18px;padding:14px 18px;resize:vertical;min-height:90px;}',
      scope + ' select.diploma-form__input{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%228%22 viewBox=%220 0 12 8%22><path fill=%22none%22 stroke=%22%231a2f4b%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M1 1l5 5 5-5%22/></svg>");background-repeat:no-repeat;background-position:right 18px center;padding-right:44px;}',
      scope + ' .diploma-form__help{font-size:12px;opacity:0.7;padding-left:10px;}',
      scope + ' .diploma-form__radios,' + scope + ' .diploma-form__checkboxes{display:flex;flex-direction:column;gap:6px;padding:4px 0;}',
      scope + ' .diploma-form__radio,' + scope + ' .diploma-form__checkbox{display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;color:' + c.text + ';}',
      scope + ' .diploma-form__actions{margin-top:6px;}',
      scope + ' .diploma-form__submit{display:block;width:100%;padding:16px 24px;border:none;border-radius:999px;font-family:inherit;font-size:15px;font-weight:700;color:#fff;background:' + c.primary + ';cursor:pointer;transition:opacity .15s,transform .05s;}',
      scope + ' .diploma-form__submit:hover{opacity:0.92;}',
      scope + ' .diploma-form__submit:active{transform:translateY(1px);}',
      scope + ' .diploma-form__submit:disabled{opacity:0.6;cursor:default;}',
      scope + ' .diploma-form__error{display:none;padding:10px 14px;border-radius:10px;background:rgba(239,68,68,0.12);color:#c00;font-size:13px;}',
      scope + ' .diploma-form__success{text-align:center;padding:40px 20px;color:' + c.text + ';}',
      scope + ' .diploma-form__success-title{font-size:22px;font-weight:700;margin-bottom:6px;}',
      scope + ' .diploma-form__success-text{font-size:14px;opacity:0.8;}',
    ].join('\\n');
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`
}
