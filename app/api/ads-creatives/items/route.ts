import { NextRequest, NextResponse, after } from 'next/server'
import { notifyCreativesUploaded, resolveAdsAccess } from '@/lib/ads-creatives-server'
import { ADS_CREATIVES_BUCKET, ADS_CREATIVES_MAX_FOLDER_BYTES, ITEM_ROLES, type ItemRole, type FolderFile } from '@/lib/ads-creatives'

/**
 * POST /api/ads-creatives/items — { token?, campaign_id, role, kind: 'folder', label, files: [{ path, name, size }], added_by? }
 *   (campaign_id = ads_campaigns.id, stocké dans la colonne event_id)
 *   { …, role: 'guide', kind: 'file', path, label, size } — PDF d'un guide
 *   (les anciens kinds 'link' / 'file' restent acceptés)
 * PATCH /api/ads-creatives/items — { token?, id, remove_paths?: string[], add_files?: [{ path, name, size }] }
 *   Modifier un dossier : retirer des fichiers (supprimés du stockage) et/ou en ajouter.
 *   Un dossier vidé est supprimé.
 * DELETE /api/ads-creatives/items?id=…[&token=…]
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const event_id = String(body.campaign_id || body.event_id || '').trim()
  const role = String(body.role || '') as ItemRole
  // PDF du guide : toujours un fichier seul
  const kind = role === 'guide' ? 'file' : body.kind === 'folder' ? 'folder' : body.kind === 'file' ? 'file' : 'link'
  if (!event_id || !ITEM_ROLES.includes(role)) {
    return NextResponse.json({ error: 'event_id / role invalides' }, { status: 400 })
  }

  let url: string | null = null
  let path: string | null = null
  let files: FolderFile[] | null = null
  if (kind === 'folder') {
    files = (Array.isArray(body.files) ? body.files : [])
      .map((f: Partial<FolderFile>) => ({ path: String(f.path || ''), name: String(f.name || '').slice(0, 300), size: Number(f.size) || 0 }))
      .filter((f: FolderFile) => f.path.startsWith(`${event_id}/`))
    if (!files || files.length === 0) return NextResponse.json({ error: 'Dossier vide' }, { status: 400 })
    if (files.reduce((n, f) => n + f.size, 0) > ADS_CREATIVES_MAX_FOLDER_BYTES) {
      return NextResponse.json({ error: 'Dossier trop lourd (10 Go max)' }, { status: 400 })
    }
  } else if (kind === 'link') {
    url = String(body.url || '').trim()
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 400 })
    }
  } else {
    path = String(body.path || '').trim()
    if (!path.startsWith(`${event_id}/`)) return NextResponse.json({ error: 'Fichier invalide' }, { status: 400 })
  }

  const { data, error } = await access.db
    .from('event_ad_creative_items')
    .insert({
      event_id,
      role,
      kind,
      url,
      path,
      label: String(body.label || '').trim().slice(0, 200) || null,
      size: files ? files.reduce((n, f) => n + f.size, 0) : Number(body.size) || null,
      files,
      file_count: files ? files.length : null,
      added_by: String(body.added_by || '').trim().slice(0, 80) || null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Dossier de créas déposé : mail au responsable Ads (sans bloquer la réponse)
  if (kind === 'folder' && (role === 'static' || role === 'video')) {
    after(() =>
      notifyCreativesUploaded(access.db, {
        campaignId: event_id,
        role,
        label: data.label,
        fileCount: data.file_count,
        addedBy: data.added_by,
      }).catch((e) => console.error('[ads-creatives] mail dépôt', e)),
    )
  }
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest) {
  const access = await resolveAdsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const id = req.nextUrl.searchParams.get('id') || ''
  const { data, error } = await access.db.from('event_ad_creative_items').delete().eq('id', id).select('path, files').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const paths = [data?.path, ...((data?.files as FolderFile[] | null) || []).map((f) => f.path)].filter(Boolean) as string[]
  // Storage : 1000 objets max par appel
  for (let i = 0; i < paths.length; i += 1000) {
    await access.db.storage.from(ADS_CREATIVES_BUCKET).remove(paths.slice(i, i + 1000))
  }
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const id = String(body.id || '')
  const { data: item, error: getError } = await access.db.from('event_ad_creative_items').select('*').eq('id', id).maybeSingle()
  if (getError) return NextResponse.json({ error: getError.message }, { status: 500 })
  if (!item) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  if (item.kind !== 'folder') return NextResponse.json({ error: 'Seuls les dossiers sont modifiables' }, { status: 400 })

  const current = (item.files as FolderFile[] | null) || []
  const remove = new Set((Array.isArray(body.remove_paths) ? body.remove_paths : []).map(String))
  const removed = current.filter((f) => remove.has(f.path))
  const added: FolderFile[] = (Array.isArray(body.add_files) ? body.add_files : [])
    .map((f: Partial<FolderFile>) => ({ path: String(f.path || ''), name: String(f.name || '').slice(0, 300), size: Number(f.size) || 0 }))
    .filter((f: FolderFile) => f.path.startsWith(`${item.event_id}/`))
  // Un fichier ajouté avec le même nom remplace l'ancien
  const addedNames = new Set(added.map((f) => f.name))
  const replaced = current.filter((f) => !remove.has(f.path) && addedNames.has(f.name))
  const files = [...current.filter((f) => !remove.has(f.path) && !addedNames.has(f.name)), ...added]
    .sort((a, b) => a.name.localeCompare(b.name))
  const size = files.reduce((n, f) => n + f.size, 0)
  if (size > ADS_CREATIVES_MAX_FOLDER_BYTES) return NextResponse.json({ error: 'Dossier trop lourd (10 Go max)' }, { status: 400 })

  let updated = null
  if (files.length === 0) {
    const { error } = await access.db.from('event_ad_creative_items').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { data, error } = await access.db
      .from('event_ad_creative_items')
      .update({ files, file_count: files.length, size })
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    updated = data
  }
  const paths = [...removed, ...replaced].map((f) => f.path).filter((p) => !added.some((a) => a.path === p))
  for (let i = 0; i < paths.length; i += 1000) {
    await access.db.storage.from(ADS_CREATIVES_BUCKET).remove(paths.slice(i, i + 1000))
  }
  return NextResponse.json({ item: updated })
}
