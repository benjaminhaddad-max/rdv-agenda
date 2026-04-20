import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/forms/[slug]/embed.js — Retourne un script JS qui injecte le formulaire
 *
 * Utilisation sur le site cible :
 * <div data-diploma-form="inscription-pass"></div>
 * <script src="https://rdv-agenda.vercel.app/api/forms/inscription-pass/embed.js" async></script>
 */
export async function GET(req: Request, { params }: Params) {
  // Le paramètre est nommé "id" pour conformité Next.js mais contient le slug
  const { id: slug } = await params
  const db = createServiceClient()

  const url = new URL(req.url)
  const host = url.origin // https://rdv-agenda.vercel.app

  // Vérifie que le formulaire existe et est publié
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
      'cache-control': 'public, max-age=300', // 5 min cache CDN
      'access-control-allow-origin': '*',
    },
  })
}

function generateEmbedScript(host: string, slug: string): string {
  return `/* Diploma Santé — Form Embed */
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

    var iframe = document.createElement('iframe');
    iframe.src = HOST + '/embed/forms/' + SLUG + (location.search || '');
    iframe.style.cssText = 'border:0;width:100%;min-height:500px;max-width:100%;';
    iframe.setAttribute('title', 'Formulaire');
    iframe.setAttribute('loading', 'lazy');
    iframe.allow = 'clipboard-write';
    container.appendChild(iframe);

    // Auto-resize via postMessage
    window.addEventListener('message', function(e) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type !== 'diploma-form-resize') return;
      if (e.data.slug !== SLUG) return;
      if (typeof e.data.height === 'number') {
        iframe.style.height = e.data.height + 'px';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`
}
