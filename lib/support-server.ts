import { createServiceClient } from '@/lib/supabase'
import { SUPPORT_BUCKET, type SupportAttachment, type SupportMessage } from '@/lib/support'

/** Valide les pièces jointes envoyées par le client : uniquement des fichiers uploadés par cet utilisateur. */
export function sanitizeAttachments(raw: unknown, appUserId: string): SupportAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: SupportAttachment[] = []
  for (const a of raw.slice(0, 20)) {
    if (!a || typeof a !== 'object') continue
    const { path, name, mime, size } = a as Record<string, unknown>
    if (typeof path !== 'string' || !path.startsWith(`${appUserId}/`) || path.includes('..')) continue
    out.push({
      path,
      name: typeof name === 'string' ? name.slice(0, 200) : path.split('/').pop() || 'fichier',
      mime: typeof mime === 'string' ? mime.slice(0, 100) : 'application/octet-stream',
      size: typeof size === 'number' ? size : 0,
    })
  }
  return out
}

/** Ajoute une URL signée (1 h) à chaque pièce jointe des messages. */
export async function signMessageAttachments(messages: SupportMessage[]): Promise<SupportMessage[]> {
  const paths = messages.flatMap(m => (m.attachments || []).map(a => a.path))
  if (paths.length === 0) return messages
  const db = createServiceClient()
  const { data } = await db.storage.from(SUPPORT_BUCKET).createSignedUrls(paths, 3600)
  const byPath = new Map((data || []).map(d => [d.path, d.signedUrl]))
  return messages.map(m => ({
    ...m,
    attachments: (m.attachments || []).map(a => ({ ...a, url: byPath.get(a.path) || undefined })),
  }))
}
