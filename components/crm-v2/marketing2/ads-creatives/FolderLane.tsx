'use client'

/**
 * Colonnes « Créas statiques » / « Créas vidéo » : dépôt d'un dossier complet
 * (sélection ou glisser-déposer, 10 Go max), upload reprenable TUS direct vers
 * Supabase Storage (token signé, header x-signature), puis liste des dossiers.
 */

import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import * as tus from 'tus-js-client'
import { ChevronDown, ChevronRight, Download, Eye, FolderOpen, FolderUp, Trash2 } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  ADS_CREATIVES_BUCKET, ADS_CREATIVES_MAX_FOLDER_BYTES, CREATIVE_MAX, CREATIVE_UNIT, countCreatives,
  formatBytes, frDay, parisDay,
  type AdsEventRow, type CreativeItem, type CreativeRole, type FolderFile,
} from '@/lib/ads-creatives'
import { TONES, iconBtn } from './ui'
import { CreativeThumbs, CreativeViewer } from './CreativePreview'

const STORAGE_HOST = (() => {
  try {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname.split('.')[0]
    return `https://${ref}.storage.supabase.co`
  } catch {
    return ''
  }
})()

type PickedFile = { file: File; rel: string }

/** Parcourt récursivement un dossier glissé-déposé. */
async function readDroppedEntry(entry: FileSystemEntry, prefix = ''): Promise<PickedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    return [{ file, rel: `${prefix}${entry.name}` }]
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const out: PickedFile[] = []
  // readEntries renvoie les entrées par lots : on boucle jusqu'à un lot vide.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
    if (batch.length === 0) break
    for (const child of batch) out.push(...(await readDroppedEntry(child, `${prefix}${entry.name}/`)))
  }
  return out
}

export function uploadOne(path: string, signature: string, file: File, onProgress: (sent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${STORAGE_HOST}/storage/v1/upload/resumable/sign`,
      headers: { 'x-signature': signature, 'x-upsert': 'true' },
      chunkSize: 6 * 1024 * 1024, // imposé par Supabase
      retryDelays: [0, 2000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: ADS_CREATIVES_BUCKET,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
      },
      onProgress: (sent) => onProgress(sent),
      onError: (err) => {
        const status = (err as tus.DetailedError).originalResponse?.getStatus?.()
        reject(new Error(status === 413
          ? `« ${file.name} » dépasse la taille max autorisée par le stockage`
          : err.message))
      },
      onSuccess: () => resolve(),
    })
    upload.start()
  })
}

export default function FolderLane({
  ev, role, token, fileUrl, onAddFolder, onRemove, flash,
}: {
  ev: AdsEventRow
  role: CreativeRole
  token?: string
  fileUrl: (f: FolderFile) => string
  onAddFolder: (ev: AdsEventRow, role: CreativeRole, label: string, files: FolderFile[]) => Promise<void>
  onRemove: (ev: AdsEventRow, item: CreativeItem) => void
  flash: (m: string) => void
}) {
  const items = ev.items.filter((i) => i.role === role)
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ sent: number; total: number; name: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    // webkitdirectory n'est pas dans les types React : on le pose à la main.
    inputRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  const upload = async (picked: PickedFile[]) => {
    const files = picked.filter((p) => !p.file.name.startsWith('.') && p.file.size > 0)
    if (files.length === 0) return flash('Dossier vide')
    const total = files.reduce((n, p) => n + p.file.size, 0)
    if (total > ADS_CREATIVES_MAX_FOLDER_BYTES) return flash(`Dossier trop lourd (${formatBytes(total)}) — 10 Go max`)
    const label = files[0].rel.includes('/') ? files[0].rel.split('/')[0] : 'Dossier'
    const folder = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const sentBy = new Map<string, number>()
    const report = () => setProgress({ sent: [...sentBy.values()].reduce((a, b) => a + b, 0), total, name: label })
    report()

    try {
      const done: FolderFile[] = []
      const queue = [...files]
      // 3 envois en parallèle
      const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          const res = await fetch('/api/ads-creatives/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, campaign_id: ev.id, folder, fileName: p.rel, size: p.file.size }),
          })
          const slot = await res.json()
          if (!res.ok) throw new Error(slot.error || 'Upload impossible')
          const key = p.rel
          await uploadOne(slot.path, slot.token, p.file, (sent) => { sentBy.set(key, sent); report() })
          sentBy.set(key, p.file.size)
          report()
          done.push({ path: slot.path, name: p.rel, size: p.file.size })
        }
      }
      await Promise.all([worker(), worker(), worker()])
      done.sort((a, b) => a.name.localeCompare(b.name))
      await onAddFolder(ev, role, label, done)
      flash(`Dossier « ${label} » déposé (${done.length} fichier${done.length > 1 ? 's' : ''})`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Upload impossible')
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onPick = (list: FileList | null) => {
    if (!list) return
    upload(Array.from(list).map((file) => ({
      file,
      rel: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    })))
  }

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (progress) return
    const entries = Array.from(e.dataTransfer.items)
      .map((it) => it.webkitGetAsEntry?.())
      .filter((x): x is FileSystemEntry => !!x)
    if (!entries.some((x) => x.isDirectory)) return flash('Glisse un dossier (pas des fichiers seuls)')
    const all: PickedFile[] = []
    for (const entry of entries) all.push(...(await readDroppedEntry(entry)))
    upload(all)
  }

  const max = CREATIVE_MAX[role]
  const [one, many] = CREATIVE_UNIT[role]
  const count = countCreatives(ev.items, role)
  const over = count > max

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...briefBox, ...(over ? briefOver : {}) }}>
        <span><b>{max} {many} différentes max</b> par événement</span>
        {items.length > 0 && (
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {count} / {max} {count > 1 ? many : one}{over ? ' · au-dessus du max' : ''}
          </span>
        )}
      </div>
      {items.map((it) => (
        <FolderRow key={it.id} item={it} fileUrl={fileUrl} onRemove={() => onRemove(ev, it)} />
      ))}

      {progress ? (
        <div style={dropZone}>
          <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, marginBottom: 6 }}>
            Envoi de « {progress.name} »…
          </div>
          <div style={{ height: 6, borderRadius: 3, background: crmV2.bgMuted, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.round((progress.sent / Math.max(1, progress.total)) * 100)}%`,
              background: crmV2.goldGradient, transition: 'width .3s',
            }} />
          </div>
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>
            {formatBytes(progress.sent)} / {formatBytes(progress.total)} — garde la page ouverte
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{ ...dropZone, cursor: 'pointer', ...(dragOver ? dropZoneActive : {}) }}
        >
          <FolderUp size={18} style={{ color: crmV2.goldDark }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text }}>
              {items.length ? 'Ajouter un autre dossier' : 'Déposer le dossier'}
            </div>
            <div style={{ fontSize: 12, color: crmV2.textFaint }}>Glisser ici ou cliquer · 10 Go max</div>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => onPick(e.target.files)} />
    </div>
  )
}

function FolderRow({ item, fileUrl, onRemove }: { item: CreativeItem; fileUrl: (f: FolderFile) => string; onRemove: () => void }) {
  const [open, setOpen] = useState(true)
  const [viewing, setViewing] = useState<number | null>(null)
  const files = item.files || []
  // Sans `name` : URL signée affichée dans le navigateur (aperçu) au lieu d'un téléchargement.
  const previewUrl = (f: FolderFile) => fileUrl({ ...f, name: '' })
  const downloadAll = () => {
    // Téléchargements successifs (le navigateur peut demander d'autoriser les téléchargements multiples).
    files.forEach((f, i) => setTimeout(() => {
      const a = document.createElement('a')
      a.href = fileUrl(f)
      a.download = f.name.split('/').pop() || 'fichier'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }, i * 700))
  }

  // Ancien format (lien / fichier seul, avant les dossiers)
  if (item.kind !== 'folder') {
    const href = item.kind === 'link' ? item.url || '#' : fileUrl({ path: item.path || '', name: item.label || 'fichier', size: 0 })
    return (
      <div style={folderRow}>
        <FolderOpen size={16} style={{ color: crmV2.goldDark, flexShrink: 0 }} />
        <a href={href} target="_blank" rel="noreferrer" style={{ ...folderName, color: crmV2.link }}>{item.label || item.url}</a>
        <button type="button" onClick={onRemove} style={iconBtn} aria-label="Supprimer"><Trash2 size={13} /></button>
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${TONES.done.border}`, borderRadius: crmV2.radius, background: TONES.done.bg, overflow: 'hidden' }}>
      <div style={{ ...folderRow, border: 'none', background: 'transparent' }}>
        <button type="button" onClick={() => setOpen((v) => !v)} style={iconBtn} aria-label="Voir les fichiers">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <FolderOpen size={16} style={{ color: crmV2.goldDark, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
          <div style={folderName}>{item.label}</div>
          <div style={{ fontSize: 11, color: crmV2.textMuted }}>
            {item.file_count ?? files.length} fichier{(item.file_count ?? files.length) > 1 ? 's' : ''} · {formatBytes(item.size || 0)}
            {item.added_by ? ` · ${item.added_by}` : ''} · {frDay(parisDay(item.created_at))}
          </div>
        </div>
        {files.length > 0 && (
          <button type="button" onClick={() => setViewing(0)} style={iconBtn} aria-label="Aperçu" title="Aperçu des créas"><Eye size={15} /></button>
        )}
        <button type="button" onClick={downloadAll} style={iconBtn} aria-label="Tout télécharger" title="Tout télécharger"><Download size={14} /></button>
        <button type="button" onClick={onRemove} style={iconBtn} aria-label="Supprimer" title="Supprimer"><Trash2 size={13} /></button>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${TONES.done.border}`, background: crmV2.bg, maxHeight: 420, overflowY: 'auto' }}>
          <CreativeThumbs files={files} previewUrl={previewUrl} onOpen={setViewing} />
        </div>
      )}
      {viewing !== null && files[viewing] && (
        <CreativeViewer
          files={files}
          index={viewing}
          previewUrl={previewUrl}
          downloadUrl={fileUrl}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}

/* ─── Styles ──────────────────────────────────────────────────────── */

const dropZone: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: crmV2.radius,
  border: `1.5px dashed ${crmV2.borderStrong}`, background: crmV2.bgHover, flexWrap: 'wrap',
}
const dropZoneActive: CSSProperties = { borderColor: crmV2.gold, background: crmV2.goldSoft }
const briefBox: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  fontSize: 12, color: crmV2.textMuted, padding: '6px 10px', borderRadius: crmV2.radiusSm,
  background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`,
}
const briefOver: CSSProperties = { color: '#c2410c', background: '#fff7ed', borderColor: '#fed7aa' }
const folderRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: crmV2.radius,
  border: `1px solid ${crmV2.borderLight}`, background: crmV2.bgHover, minWidth: 0,
}
const folderName: CSSProperties = {
  fontSize: 13, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', flex: 1, minWidth: 0,
}
