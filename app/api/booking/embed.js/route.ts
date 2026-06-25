import { NextResponse } from 'next/server'

/**
 * Widget inline de prise de RDV — remplace l'iframe /embed/rdv.
 *
 * Intégration sur le site :
 *   <div data-diploma-rdv-inline></div>
 *   <script src="https://hub.diploma-sante.fr/api/booking/embed.js" async></script>
 *
 * Le <div> est optionnel : sans container explicite, le script en crée un
 * automatiquement juste avant la balise <script>.
 *
 * IMPORTANT : attribut data-diploma-rdv-inline (pas data-diploma-rdv).
 * data-diploma-rdv = popup via /api/booking/widget.js
 * data-diploma-rdv-inline = formulaire affiché directement sur la page
 */

export async function GET(req: Request) {
  const url = new URL(req.url)
  const host = url.origin

  return new NextResponse(generateEmbedScript(host), {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=60',
      'access-control-allow-origin': '*',
    },
  })
}

function generateEmbedScript(host: string): string {
  return `/* Diploma Santé — RDV inline (remplace l'iframe /embed/rdv) */
(function(){
  "use strict";
  if (window.DiplomaRdvEmbed) return;

  var HOST = ${JSON.stringify(host)};
  var SELECTOR = '[data-diploma-rdv-inline]';
  var MIN_HEIGHT = 560;

  function findOwnScript() {
    if (document.currentScript) return document.currentScript;
    var all = document.querySelectorAll('script[src*="/api/booking/embed.js"]');
    if (all.length) return all[all.length - 1];
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  }

  function buildIframeSrc() {
    var src = HOST + '/embed/rdv';
    try {
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

  function mount(container) {
    if (container.dataset.mounted) return;
    container.dataset.mounted = '1';

    var iframe = document.createElement('iframe');
    iframe.src = buildIframeSrc();
    iframe.style.cssText = 'border:0;width:100%;min-height:' + MIN_HEIGHT + 'px;height:' + MIN_HEIGHT + 'px;max-width:100%;display:block;background:transparent;overflow:auto;';
    iframe.setAttribute('title', 'Prise de rendez-vous Diploma Santé');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('scrolling', 'yes');
    iframe.allow = 'clipboard-write';
    container.appendChild(iframe);

    function setHeight(h) {
      if (typeof h !== 'number' || h <= 0) return;
      iframe.style.height = Math.max(h, MIN_HEIGHT) + 'px';
    }

    window.addEventListener('message', function(e) {
      if (!e.data || e.data.type !== 'diploma-rdv-resize') return;
      setHeight(e.data.height);
    });
  }

  function init() {
    var containers = document.querySelectorAll(SELECTOR);
    if (!containers.length) {
      var ownScript = findOwnScript();
      var auto = document.createElement('div');
      auto.setAttribute('data-diploma-rdv-inline', '');
      auto.dataset.autocreated = '1';
      if (ownScript && ownScript.parentNode) {
        ownScript.parentNode.insertBefore(auto, ownScript);
      } else {
        document.body.appendChild(auto);
      }
      containers = [auto];
    }
    Array.prototype.forEach.call(containers, mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DiplomaRdvEmbed = { init: init };
})();
`
}
