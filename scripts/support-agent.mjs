#!/usr/bin/env bun
/**
 * Outil de l'agent « Support technique » (routine Claude locale, toutes les 10 min).
 *
 *   bun scripts/support-agent.mjs list
 *       → tickets à traiter (nouveau, ou en_cours bloqué > 45 min), avec tout le fil.
 *         Les pièces jointes sont téléchargées dans .support-inbox/<numéro>/ ;
 *         notes vocales et vidéos sont transcrites (Deepgram) et les vidéos découpées
 *         en images (ffmpeg) pour pouvoir être lues.
 *   bun scripts/support-agent.mjs list --author <rdv_users.id>
 *       → idem, limité à un auteur (routine prioritaire chaque minute).
 *   bun scripts/support-agent.mjs claim <ticketId>
 *       → passe le ticket en « en_cours » (le collègue voit que c'est pris).
 *   bun scripts/support-agent.mjs reply <ticketId> <fait|pas_fait|besoin_infos|en_cours|validation> <fichier-message.md> [prUrl]
 *       → publie la réponse dans le fil et met à jour le statut (prUrl requis pour « validation »).
 *   bun scripts/support-agent.mjs pending-validation
 *       → tickets en attente de validation par Aaron, avec l'URL de leur PR.
 *
 * Mode de mise en ligne selon l'auteur du ticket (author_id fixé côté serveur depuis la session) :
 *   DIRECT     → l'agent peut pousser sur main
 *   VALIDATION → l'agent ouvre une PR, Aaron merge, puis l'agent répond « fait »
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'support-attachments'
const INBOX = join(ROOT, '.support-inbox')
const STALE_CLAIM_MS = 45 * 60 * 1000

// Comptes autorisés à faire mettre en ligne directement (rdv_users.id)
const DIRECT_DEPLOY_USERS = {
  'b7b459bb-38bf-4867-ae9a-3a5161e7ae35': 'Aaron Sarfati',
  '2730ce84-e85d-4c15-baec-2263915a5ae4': 'Benjamin HADDAD',
  '93e6bd45-7683-4e84-a711-16947c06919f': 'Pascal Tawfik',
}

const env = { ...process.env }
for (const file of ['.env.local', '.env.production.local']) {
  const p = join(ROOT, file)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/\\n$/, '')
  }
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const [, , cmd, ...args] = process.argv

async function transcribe(filePath, mime) {
  if (!env.DEEPGRAM_API_KEY) return null
  try {
    const res = await fetch(
      'https://api.deepgram.com/v1/listen?language=fr&model=nova-2&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'Content-Type': mime || 'audio/webm' },
        body: readFileSync(filePath),
      },
    )
    if (!res.ok) return `(transcription échouée : HTTP ${res.status})`
    const j = await res.json()
    return j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '(aucune parole détectée)'
  } catch (e) {
    return `(transcription échouée : ${e.message})`
  }
}

function extractFrames(videoPath, outDir) {
  try {
    mkdirSync(outDir, { recursive: true })
    // 1 image toutes les 3 s, 20 max, largeur 1280
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', videoPath, '-vf', 'fps=1/3,scale=1280:-2', '-frames:v', '20', join(outDir, 'frame-%02d.jpg')])
    return readdirSync(outDir).filter(f => f.endsWith('.jpg')).map(f => join(outDir, f))
  } catch {
    return []
  }
}

async function materializeAttachments(ticketNumber, messages) {
  const dir = join(INBOX, String(ticketNumber))
  mkdirSync(dir, { recursive: true })
  for (const m of messages) {
    for (const a of m.attachments || []) {
      const local = join(dir, a.path.split('/').pop())
      if (!existsSync(local)) {
        const { data, error } = await db.storage.from(BUCKET).download(a.path)
        if (error || !data) { a.local = `(téléchargement impossible : ${error?.message})`; continue }
        writeFileSync(local, Buffer.from(await data.arrayBuffer()))
      }
      a.local = local
      const isAudio = a.mime?.startsWith('audio/')
      const isVideo = a.mime?.startsWith('video/')
      if (isAudio || isVideo) {
        const txtPath = `${local}.transcript.txt`
        if (!existsSync(txtPath)) writeFileSync(txtPath, (await transcribe(local, a.mime)) || '(pas de clé Deepgram)')
        a.transcript = readFileSync(txtPath, 'utf8')
      }
      if (isVideo) a.frames = extractFrames(local, `${local}.frames`)
    }
  }
}

async function list(onlyAuthorId) {
  const { data: tickets, error } = await db
    .from('support_tickets')
    .select('*')
    .in('status', ['nouveau', 'en_cours'])
    .match(onlyAuthorId ? { author_id: onlyAuthorId } : {})
    .order('priority', { ascending: false }) // urgente > normale > basse (ordre alpha inversé)
    .order('created_at', { ascending: true })
  if (error) throw error

  const now = Date.now()
  const todo = (tickets || []).filter(
    t => t.status === 'nouveau' || !t.claimed_at || now - new Date(t.claimed_at).getTime() > STALE_CLAIM_MS,
  )
  if (todo.length === 0) {
    console.log('AUCUN_TICKET')
    return
  }

  for (const t of todo) {
    const { data: messages } = await db
      .from('support_messages')
      .select('*')
      .eq('ticket_id', t.id)
      .order('created_at', { ascending: true })
    await materializeAttachments(t.number, messages || [])
    console.log('═'.repeat(80))
    console.log(`TICKET #${t.number}  id=${t.id}`)
    console.log(`Titre    : ${t.title}`)
    console.log(`Auteur   : ${t.author_name} (${t.author_role})   Priorité : ${t.priority}   Statut : ${t.status}`)
    console.log(`Créé le  : ${t.created_at}   Page d'origine : ${t.page_url || '—'}`)
    console.log(
      DIRECT_DEPLOY_USERS[t.author_id]
        ? 'MODE     : DIRECT — mise en ligne directe sur main autorisée'
        : 'MODE     : VALIDATION — modif de code uniquement via branche + PR, Aaron valide avant mise en ligne',
    )
    for (const m of messages || []) {
      console.log('─'.repeat(80))
      console.log(`[${m.created_at}] ${m.author_type === 'agent' ? 'AGENT (toi)' : m.author_name || 'collègue'} :`)
      console.log(m.body || '(pas de texte)')
      for (const a of m.attachments || []) {
        console.log(`  📎 ${a.name} (${a.mime}) → ${a.local}`)
        if (a.transcript) console.log(`     Transcription : ${a.transcript}`)
        if (a.frames?.length) console.log(`     Images extraites de la vidéo : ${a.frames.join(', ')}`)
      }
    }
  }
  console.log('═'.repeat(80))
  console.log(`${todo.length} ticket(s) à traiter.`)
}

async function claim(id) {
  const { error } = await db
    .from('support_tickets')
    .update({ status: 'en_cours', claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  console.log(`OK claim ${id}`)
}

async function pendingValidation() {
  const { data, error } = await db
    .from('support_tickets')
    .select('id, number, title, author_name, pr_url')
    .eq('status', 'validation')
    .order('created_at', { ascending: true })
  if (error) throw error
  if (!data?.length) { console.log('AUCUNE_VALIDATION'); return }
  for (const t of data) console.log(`#${t.number}  id=${t.id}  pr=${t.pr_url || '—'}  (${t.author_name}) ${t.title}`)
}

async function reply(id, status, messageFile, prUrl) {
  const allowed = ['fait', 'pas_fait', 'besoin_infos', 'en_cours', 'validation']
  if (!allowed.includes(status)) throw new Error(`Statut invalide (${allowed.join(', ')})`)
  const body = readFileSync(messageFile, 'utf8').trim()
  if (!body) throw new Error('Message vide')
  if (status === 'validation' && !prUrl) throw new Error('URL de PR requise pour le statut validation')

  const { error: e1 } = await db.from('support_messages').insert({
    ticket_id: id,
    author_type: 'agent',
    author_name: 'Support technique',
    body,
  })
  if (e1) throw e1

  const now = new Date().toISOString()
  const done = status === 'fait' || status === 'pas_fait'
  const { error: e2 } = await db
    .from('support_tickets')
    .update({
      status,
      claimed_at: status === 'en_cours' ? now : null,
      resolved_at: done ? now : null,
      last_message_at: now,
      unread_for_author: true,
      updated_at: now,
      ...(prUrl ? { pr_url: prUrl } : {}),
    })
    .eq('id', id)
  if (e2) throw e2
  console.log(`OK reply ${id} → ${status}`)
}

try {
  if (cmd === 'list') await list(args[0] === '--author' ? args[1] : undefined)
  else if (cmd === 'claim' && args[0]) await claim(args[0])
  else if (cmd === 'pending-validation') await pendingValidation()
  else if (cmd === 'reply' && args.length >= 3) await reply(args[0], args[1], args[2], args[3])
  else {
    console.error('Usage : list | claim <id> | reply <id> <statut> <fichier-message> [prUrl] | pending-validation')
    process.exit(1)
  }
} catch (e) {
  console.error('ERREUR', e.message || e)
  process.exit(1)
}
