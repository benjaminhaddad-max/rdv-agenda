/**
 * Espace télépro › « Mes mails » (lib/admissions-mail.ts, migration v70).
 *
 * GET  → fils de la boîte admissions@ échangés avec les contacts du télépro
 *        (un admin voit tout, ou vise un télépro avec ?user_id=) ;
 *        ?count=1 → nombre de réponses non lues ; ?search=… → ses contacts (nouveau mail).
 * POST { contact_id, text, subject?, thread_id? } → envoie depuis admissions@
 *        (réponse dans le fil si thread_id, sinon nouveau mail au contact).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { memoryRateLimit } from '@/lib/rate-limit'
import {
  listThreads, missingAdmissionsMigration, ownedContact, resolveViewer, searchOwnedContacts, sendAdmissionsMail, unreadCount,
} from '@/lib/admissions-mail'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function fail(e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  if (missingAdmissionsMigration(message)) {
    return NextResponse.json({ error: 'Migration v70 (boîte admissions) pas encore appliquée dans Supabase', missing_migration: true }, { status: 503 })
  }
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response
  const db = createServiceClient()
  const who = await resolveViewer(db, authz.ctx, req.nextUrl.searchParams.get('user_id'))
  if (!who) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  try {
    const search = req.nextUrl.searchParams.get('search')
    if (search !== null) return NextResponse.json({ contacts: await searchOwnedContacts(db, who.viewer, search) })
    if (req.nextUrl.searchParams.get('count') === '1') {
      return NextResponse.json({ unread: await unreadCount(db, who.viewer) })
    }
    const threads = await listThreads(db, who.viewer)
    return NextResponse.json({ threads, unread: threads.reduce((n, t) => n + t.unread, 0) })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response
  const rl = memoryRateLimit(`admissions-mail:${authz.ctx.appUserId}`, { limit: 30, windowMs: 60 * 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Trop de mails envoyés, réessaie dans un moment' }, { status: 429 })
  const body = await req.json().catch(() => ({}))
  const contactId = String(body.contact_id || '').trim()
  const text = String(body.text || '').trim()
  const threadId = body.thread_id ? String(body.thread_id).replace(/[^A-Za-z0-9-]/g, '') : null
  if (!contactId || !text) return NextResponse.json({ error: 'Contact et message requis' }, { status: 400 })

  const db = createServiceClient()
  const who = await resolveViewer(db, authz.ctx, null)
  if (!who) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  const contact = await ownedContact(db, who.viewer, contactId)
  if (!contact) return NextResponse.json({ error: 'Ce contact ne fait pas partie des tiens' }, { status: 403 })

  try {
    let to = String(contact.email || '').trim()
    let subject = String(body.subject || '').trim()
    let inReplyTo: string | null = null
    if (threadId) {
      const { data: last } = await db.from('admissions_emails')
        .select('contact_id, contact_email, from_email, direction, subject, message_id_header')
        .eq('gmail_thread_id', threadId).order('sent_at', { ascending: false }).limit(10)
      const rows = (last || []).filter(r => r.contact_id === contactId)
      if (!rows.length) return NextResponse.json({ error: 'Fil introuvable' }, { status: 404 })
      const lastIn = rows.find(r => r.direction === 'in')
      to = String(lastIn?.from_email || rows[0].contact_email || to).trim()
      inReplyTo = (lastIn || rows[0]).message_id_header || null
      const base = String(rows[0].subject || subject || 'Votre rendez-vous Diploma Santé')
      subject = /^re\s*:/i.test(base) ? base : `Re: ${base}`
    }
    if (!/^[^\s@,<>]+@[^\s@,<>]+$/.test(to)) return NextResponse.json({ error: 'Pas d’adresse email valide sur ce contact' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: 'Objet requis' }, { status: 400 })

    const row = await sendAdmissionsMail(db, {
      contactId, to, subject, text, threadId, inReplyTo,
      author: { id: who.user.id, name: who.user.name || null },
    })
    return NextResponse.json({ ok: true, email: row })
  } catch (e) {
    return fail(e)
  }
}
