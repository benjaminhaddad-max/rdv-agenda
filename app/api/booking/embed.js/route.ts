import { NextResponse } from 'next/server'

/**
 * Widget inline de prise de RDV — remplace l'iframe /embed/rdv.
 *
 * Intégration INLINE (page web, l'iframe s'agrandit toute seule) :
 *   <div data-diploma-rdv-inline></div>
 *   <script src="https://hub.diploma-sante.fr/api/booking/embed.js" async></script>
 *
 * Intégration POPUP Divi / modal (hauteur fixe, scroll DANS l'iframe) :
 *   <div data-diploma-rdv-popup data-height="680px"></div>
 *   <script src="https://hub.diploma-sante.fr/api/booking/embed.js" async></script>
 *
 * IMPORTANT : ne pas mélanger auto-resize et popup Divi.
 * Dans une popup, utiliser data-diploma-rdv-popup (pas data-diploma-rdv-inline).
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
  return `/* Diploma Santé — RDV embed (inline ou popup) */
(function(){
  "use strict";
  if (window.DiplomaRdvEmbed) return;

  var HOST = ${JSON.stringify(host)};
  var INLINE_SELECTOR = '[data-diploma-rdv-inline]';
  var POPUP_SELECTOR = '[data-diploma-rdv-popup]';
  var MIN_HEIGHT = 560;
  var DEFAULT_POPUP_HEIGHT = 680;

  function findOwnScript() {
    if (document.currentScript) return document.currentScript;
    var all = document.querySelectorAll('script[src*="/api/booking/embed.js"]');
    if (all.length) return all[all.length - 1];
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  }

  function copyUtmParams(base) {
    try {
      var qs = new URLSearchParams(location.search);
      ['utm_source','utm_medium','utm_campaign','utm_content','ref'].forEach(function(k){
        var v = qs.get(k);
        if (v) base.set(k, v);
      });
    } catch(e){ /* ignore */ }
    return base;
  }

  function buildIframeSrc(popup) {
    var params = copyUtmParams(new URLSearchParams());
    if (popup) params.set('popup', '1');
    var str = params.toString();
    return HOST + '/embed/rdv' + (str ? '?' + str : '');
  }

  function parseHeight(value, fallback) {
    if (!value) return fallback;
    if (value.endsWith('vh')) {
      var n = parseFloat(value);
      if (!isNaN(n)) return Math.round(window.innerHeight * n / 100);
    }
    if (value.endsWith('px')) {
      var px = parseInt(value, 10);
      if (!isNaN(px)) return px;
    }
    var num = parseInt(value, 10);
    return !isNaN(num) ? num : fallback;
  }

  function mountInline(container) {
    if (container.dataset.mounted) return;
    container.dataset.mounted = '1';

    var iframe = document.createElement('iframe');
    iframe.src = buildIframeSrc(false);
    iframe.style.cssText = 'border:0;width:100%;min-height:' + MIN_HEIGHT + 'px;height:' + MIN_HEIGHT + 'px;max-width:100%;display:block;background:transparent;';
    iframe.setAttribute('title', 'Prise de rendez-vous Diploma Santé');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('scrolling', 'no');
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

  function mountPopup(container) {
    if (container.dataset.mounted) return;
    container.dataset.mounted = '1';

    var height = parseHeight(
      container.dataset.height || container.style.height,
      DEFAULT_POPUP_HEIGHT
    );

    container.style.overflow = 'hidden';
    container.style.width = '100%';
    if (!container.style.height) container.style.height = height + 'px';

    var iframe = document.createElement('iframe');
    iframe.src = buildIframeSrc(true);
    iframe.style.cssText = 'border:0;width:100%;height:100%;max-width:100%;display:block;background:transparent;';
    iframe.setAttribute('title', 'Prise de rendez-vous Diploma Santé');
    iframe.setAttribute('loading', 'eager');
    iframe.setAttribute('scrolling', 'yes');
    iframe.setAttribute('data-no-lazy', '1');
    iframe.allow = 'clipboard-write';
    container.appendChild(iframe);
  }

  function init() {
    var popupContainers = document.querySelectorAll(POPUP_SELECTOR);
    var inlineContainers = document.querySelectorAll(INLINE_SELECTOR);

    if (!popupContainers.length && !inlineContainers.length) {
      var ownScript = findOwnScript();
      var auto = document.createElement('div');
      auto.setAttribute('data-diploma-rdv-inline', '');
      auto.dataset.autocreated = '1';
      if (ownScript && ownScript.parentNode) {
        ownScript.parentNode.insertBefore(auto, ownScript);
      } else {
        document.body.appendChild(auto);
      }
      inlineContainers = [auto];
    }

    Array.prototype.forEach.call(popupContainers, mountPopup);
    Array.prototype.forEach.call(inlineContainers, mountInline);
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
