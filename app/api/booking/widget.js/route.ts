import { NextResponse } from 'next/server'

/**
 * Widget popup de prise de RDV type Calendly.
 *
 * Intégration sur le site :
 *   <script src="https://VOTRE-DOMAINE/api/booking/widget.js" async></script>
 *   <button data-diploma-rdv>Prendre rendez-vous</button>
 *
 * Tout élément portant l'attribut data-diploma-rdv ouvre la popup.
 * API JS optionnelle : window.DiplomaRdv.open() / window.DiplomaRdv.close()
 *
 * IMPORTANT : script totalement indépendant du système de formulaires
 * (/api/forms/[slug]/embed.js). Namespace dédié "diploma-rdv-*",
 * aucun style ni sélecteur partagé → zéro risque de collision.
 */

export async function GET(req: Request) {
  const url = new URL(req.url)
  const host = url.origin

  return new NextResponse(generateWidgetScript(host), {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=60',
      'access-control-allow-origin': '*',
    },
  })
}

function generateWidgetScript(host: string): string {
  return `/* Diploma Santé — Widget RDV (popup type Calendly) */
(function(){
  "use strict";
  if (window.DiplomaRdv) return; // déjà chargé

  var HOST = ${JSON.stringify(host)};
  var OVERLAY_ID = 'diploma-rdv-overlay';
  var STYLE_ID = 'diploma-rdv-widget-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:2147483000;background:rgba(20,28,40,0.62);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;opacity:0;transition:opacity .18s ease;}',
      '#' + OVERLAY_ID + '.diploma-rdv-visible{opacity:1;}',
      '#' + OVERLAY_ID + ' .diploma-rdv-modal{position:relative;background:#fff;border-radius:12px;width:100%;max-width:820px;height:min(720px,calc(100vh - 32px));box-shadow:0 12px 48px rgba(0,0,0,0.28);overflow:hidden;transform:translateY(8px);transition:transform .18s ease;}',
      '#' + OVERLAY_ID + '.diploma-rdv-visible .diploma-rdv-modal{transform:translateY(0);}',
      '#' + OVERLAY_ID + ' .diploma-rdv-close{position:absolute;top:10px;right:10px;z-index:2;width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,0.92);color:#1d2f4b;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;}',
      '#' + OVERLAY_ID + ' .diploma-rdv-close:hover{background:#eef2f7;}',
      '#' + OVERLAY_ID + ' .diploma-rdv-frame{border:0;width:100%;height:100%;display:block;}',
    ].join('\\n');
    document.head.appendChild(s);
  }

  function buildIframeSrc() {
    var src = HOST + '/embed/rdv';
    try {
      // Transmet les UTM de la page hôte à l'iframe (tracking origine)
      var qs = new URLSearchParams(location.search);
      var keep = new URLSearchParams();
      ['utm_source','utm_medium','utm_campaign','utm_content','ref'].forEach(function(k){
        var v = qs.get(k);
        if (v) keep.set(k, v);
      });
      var str = keep.toString();
      if (str) src += '?' + str;
    } catch(e){ /* ignore */ }
    return src;
  }

  function close() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.remove('diploma-rdv-visible');
    setTimeout(function(){
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 180);
    document.removeEventListener('keydown', onKeydown);
    document.documentElement.style.overflow = '';
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function open() {
    if (document.getElementById(OVERLAY_ID)) return;
    injectStyles();

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Prise de rendez-vous Diploma Santé');

    var modal = document.createElement('div');
    modal.className = 'diploma-rdv-modal';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'diploma-rdv-close';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.innerHTML = '\\u2715';
    closeBtn.addEventListener('click', close);

    var iframe = document.createElement('iframe');
    iframe.className = 'diploma-rdv-frame';
    iframe.src = buildIframeSrc();
    iframe.setAttribute('title', 'Prise de rendez-vous Diploma Santé');
    iframe.allow = 'clipboard-write';

    modal.appendChild(closeBtn);
    modal.appendChild(iframe);
    overlay.appendChild(modal);

    // Clic sur le fond sombre → ferme
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeydown);
    document.documentElement.style.overflow = 'hidden';

    // Animation d'entrée
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ overlay.classList.add('diploma-rdv-visible'); });
    });
  }

  // Fermeture demandée depuis l'iframe (bouton "Fermer" après confirmation)
  window.addEventListener('message', function(e){
    if (e.data && e.data.type === 'diploma-rdv-close') close();
  });

  // Délégation : tout élément [data-diploma-rdv] ouvre la popup
  // (fonctionne aussi pour les éléments ajoutés après coup)
  document.addEventListener('click', function(e){
    var el = e.target;
    while (el && el !== document.documentElement) {
      if (el.hasAttribute && el.hasAttribute('data-diploma-rdv')) {
        e.preventDefault();
        open();
        return;
      }
      el = el.parentNode;
    }
  }, true);

  window.DiplomaRdv = { open: open, close: close };
})();
`
}
