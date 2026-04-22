import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/forms/[slug]/embed.js — Retourne un script JS qui injecte le formulaire
 *
 * Utilisation sur le site cible :
 *
 *   Mode inline (par défaut, comme HubSpot — hérite du style du site) :
 *   <div data-diploma-form="inscription-pass"></div>
 *   <script src="https://rdv-agenda.vercel.app/api/forms/inscription-pass/embed.js" async></script>
 *
 *   Mode iframe (isolé, avec le design Diploma) :
 *   <div data-diploma-form="inscription-pass" data-mode="iframe"></div>
 *   <script src="https://rdv-agenda.vercel.app/api/forms/inscription-pass/embed.js" async></script>
 */
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
  return `/* Diploma Santé — Form Embed (mode: inline par défaut, iframe si data-mode="iframe") */
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

    if (mode === 'iframe') {
      mountIframe(container);
    } else {
      mountInline(container);
    }
  }

  // ─── MODE IFRAME (isolé) ──────────────────────────────────────
  function mountIframe(container) {
    var iframe = document.createElement('iframe');
    iframe.src = HOST + '/embed/forms/' + SLUG + (location.search || '');
    iframe.style.cssText = 'border:0;width:100%;min-height:500px;max-width:100%;';
    iframe.setAttribute('title', 'Formulaire');
    iframe.setAttribute('loading', 'lazy');
    iframe.allow = 'clipboard-write';
    container.appendChild(iframe);

    window.addEventListener('message', function(e) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type !== 'diploma-form-resize') return;
      if (e.data.slug !== SLUG) return;
      if (typeof e.data.height === 'number') {
        iframe.style.height = e.data.height + 'px';
      }
    });
  }

  // ─── MODE INLINE (hérite du style du site, comme HubSpot) ─────
  function mountInline(container) {
    // Marqueur de chargement minimal
    container.innerHTML = '<div style="padding:20px;color:#888;font-size:13px;text-align:center;">Chargement du formulaire…</div>';

    fetch(HOST + '/api/forms/' + encodeURIComponent(SLUG) + '/public')
      .then(function(r){ if (!r.ok) throw new Error('Form not found'); return r.json(); })
      .then(function(form){ render(container, form); })
      .catch(function(err){
        container.innerHTML = '<div style="padding:20px;color:#c00;font-size:13px;text-align:center;">Erreur : ' + err.message + '</div>';
      });
  }

  function render(container, form) {
    container.innerHTML = '';
    container.classList.add('diploma-form');

    var formEl = document.createElement('form');
    formEl.className = 'diploma-form__form';
    formEl.noValidate = true;

    if (form.title) {
      var h = document.createElement('h3');
      h.className = 'diploma-form__title';
      h.textContent = form.title;
      formEl.appendChild(h);
    }
    if (form.subtitle) {
      var s = document.createElement('p');
      s.className = 'diploma-form__subtitle';
      s.textContent = form.subtitle;
      formEl.appendChild(s);
    }

    var values = {};
    // Pré-rempli UTM
    try {
      var qs = new URLSearchParams(location.search);
      qs.forEach(function(v, k){ values[k] = v; });
    } catch(e){}

    (form.fields || []).forEach(function(f){
      if (f.field_type === 'hidden') {
        var hi = document.createElement('input');
        hi.type = 'hidden';
        hi.name = f.field_key;
        hi.value = values[f.field_key] || f.default_value || '';
        formEl.appendChild(hi);
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'diploma-form__field';

      var lab = document.createElement('label');
      lab.className = 'diploma-form__label';
      lab.textContent = f.label + (f.required ? ' *' : '');
      wrap.appendChild(lab);

      var el;
      switch (f.field_type) {
        case 'textarea':
          el = document.createElement('textarea');
          el.rows = 4;
          break;
        case 'select':
          el = document.createElement('select');
          var opt0 = document.createElement('option');
          opt0.value = '';
          opt0.textContent = f.placeholder || '— Choisir —';
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
                    f.field_type === 'date' ? 'date' : 'text');
      }
      if (el.tagName && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        el.className = 'diploma-form__input';
        el.name = f.field_key;
        if (f.placeholder) el.placeholder = f.placeholder;
        if (f.required) el.required = true;
        if (values[f.field_key] || f.default_value) el.value = values[f.field_key] || f.default_value;
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
    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'diploma-form__submit';
    btn.textContent = form.submit_label || 'Envoyer';
    btn.style.background = form.primary_color || '#ccac71';
    formEl.appendChild(btn);

    // Message d'erreur (placeholder)
    var errEl = document.createElement('div');
    errEl.className = 'diploma-form__error';
    errEl.style.cssText = 'display:none;padding:10px;border-radius:6px;background:rgba(239,68,68,0.1);color:#c00;font-size:13px;margin-top:12px;';
    formEl.appendChild(errEl);

    formEl.addEventListener('submit', function(e){
      e.preventDefault();
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
      // Join checkboxes arrays
      Object.keys(data).forEach(function(k){ if (Array.isArray(data[k])) data[k] = data[k].join(','); });

      var utm = {};
      try {
        var qs = new URLSearchParams(location.search);
        ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){
          var v = qs.get(k); if (v) utm[k] = v;
        });
      } catch(e){}

      var hp = formEl.querySelector('input[name="website"]');
      var payload = {
        data: data,
        hp: hp ? hp.value : '',
        source_url: location.href,
      };
      Object.assign(payload, utm);

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
        if (res.body.redirect_url) {
          location.href = res.body.redirect_url;
          return;
        }
        // Succès → remplace le formulaire
        var success = document.createElement('div');
        success.className = 'diploma-form__success';
        success.innerHTML = '<div style="text-align:center;padding:24px 16px;"><div style="font-size:40px;margin-bottom:8px;">✓</div><div style="font-size:18px;font-weight:600;margin-bottom:6px;">Merci !</div><div style="font-size:14px;opacity:0.8;">' + (res.body.success_message || 'Votre message a bien été envoyé.') + '</div></div>';
        formEl.replaceWith(success);
      })
      .catch(function(err){
        errEl.textContent = err.message || 'Erreur réseau';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = origLabel;
      });
    });

    container.appendChild(formEl);
    injectStylesOnce();
  }

  // Styles globaux minimaux — SEULEMENT les règles essentielles, le reste
  // hérite du site parent (polices, couleur de texte, etc.)
  function injectStylesOnce() {
    if (document.getElementById('diploma-form-styles')) return;
    var s = document.createElement('style');
    s.id = 'diploma-form-styles';
    s.textContent = [
      '.diploma-form { font-family: inherit; color: inherit; }',
      '.diploma-form__form { display: flex; flex-direction: column; gap: 14px; max-width: 560px; }',
      '.diploma-form__title { font-family: inherit; margin: 0 0 4px; font-size: 1.4em; font-weight: 700; }',
      '.diploma-form__subtitle { margin: 0 0 8px; font-size: 0.95em; opacity: 0.75; }',
      '.diploma-form__field { display: flex; flex-direction: column; gap: 5px; }',
      '.diploma-form__label { font-size: 0.85em; font-weight: 600; opacity: 0.85; }',
      '.diploma-form__input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.15); border-radius: 8px; font-family: inherit; font-size: 1em; background: #fff; color: inherit; outline: none; transition: border-color 0.15s; }',
      '.diploma-form__input:focus { border-color: rgba(0,0,0,0.35); }',
      '.diploma-form__help { font-size: 0.78em; opacity: 0.6; }',
      '.diploma-form__radios, .diploma-form__checkboxes { display: flex; flex-direction: column; gap: 6px; }',
      '.diploma-form__radio, .diploma-form__checkbox { display: flex; align-items: center; gap: 6px; font-size: 0.95em; cursor: pointer; }',
      '.diploma-form__submit { margin-top: 4px; padding: 12px 20px; border: none; border-radius: 8px; font-family: inherit; font-size: 1em; font-weight: 600; color: #fff; cursor: pointer; transition: opacity 0.15s; }',
      '.diploma-form__submit:hover { opacity: 0.9; }',
      '.diploma-form__submit:disabled { opacity: 0.6; cursor: default; }',
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
