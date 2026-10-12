'use client'

/**
 * PDF d'un guide (guides uniquement) : dépôt d'un fichier PDF (glisser-déposer
 * ou sélection), même upload reprenable que les dossiers de créas.
 * Plusieurs versions possibles : la plus récente est affichée en premier.
 */

import { useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { Download, FileText, FileUp, Trash2 } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { formatBytes, frDay, parisDay, type AdsEventRow, type CreativeItem, type FolderFile } from '@/lib/ads-creatives'
import { uploadOne } from './FolderLane'
import { TONES, iconBtn } from './ui'

export default function GuidePdfLane({
  ev, token, author, fileUrl, onAdded, onRemove, flash,
}: {
  ev: AdsEventRow
  token?: string
  author: string
  fileUrl: (f: FolderFile) => string
  onAdded: (item: CreativeItem) => void
  onRemove: (ev: AdsEventRow, item: CreativeItem) => void
  flash: (m: string) => void
}) {
  const items = ev.items.filter((i) => i.role === 'guide').reverse()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return flash('Le guide doit être un PDF')
    setProgress({ sent: 0, total: file.size })
    try {
      const res = await fetch('/api/ads-creatives/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, campaign_id: ev.id, folder: `guide-${Date.now()}`, fileName: file.name, size: file.size }),
      })
      const slot = await res.json()
      if (!res.ok) throw new Error(slot.error || 'Upload impossible')
      await uploadOne(slot.path, slot.token, file, (sent) => setProgress({ sent, total: file.size }))
      const r = await fetch('/api/ads-creatives/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, campaign_id: ev.id, role: 'guide', kind: 'file', path: slot.path, label: file.name, size: file.size, added_by: author || null }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Erreur')
      onAdded(json.item)
      flash('PDF du guide déposé')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Upload impossible')
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (!progress) upload(e.dataTransfer.files?.[0])
  }

  const href = (it: CreativeItem) => fileUrl({ path: it.path || '', name: it.label || 'guide.pdf', size: it.size || 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <div key={it.id} style={{ ...row, ...(i === 0 ? { borderColor: TONES.done.border, background: TONES.done.bg } : { opacity: 0.7 }) }}>
          <FileText size={18} style={{ color: '#dc2626', flexShrink: 0 }} />
          <a href={href(it)} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
            <div style={name}>{it.label}</div>
            <div style={{ fontSize: 11, color: crmV2.textMuted }}>
              {i === 0 && items.length > 1 ? 'Dernière version · ' : i > 0 ? 'Ancienne version · ' : ''}
              {formatBytes(it.size || 0)}{it.added_by ? ` · ${it.added_by}` : ''} · {frDay(parisDay(it.created_at))}
            </div>
          </a>
          <a href={href(it)} download style={iconBtn} title="Télécharger"><Download size={14} /></a>
          <button type="button" onClick={() => onRemove(ev, it)} style={iconBtn} title="Supprimer"><Trash2 size={13} /></button>
        </div>
      ))}

      {progress ? (
        <div style={drop}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, marginBottom: 6 }}>Envoi du PDF…</div>
            <div style={{ height: 6, borderRadius: 3, background: crmV2.bgMuted, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((progress.sent / Math.max(1, progress.total)) * 100)}%`, background: crmV2.goldGradient }} />
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{ ...drop, cursor: 'pointer', ...(dragOver ? { borderColor: crmV2.gold, background: crmV2.goldSoft } : {}) }}
        >
          <FileUp size={18} style={{ color: crmV2.goldDark }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text }}>{items.length ? 'Déposer une nouvelle version' : 'Déposer le PDF du guide'}</div>
            <div style={{ fontSize: 12, color: crmV2.textFaint }}>Glisser ici ou cliquer · PDF</div>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  )
}

const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: crmV2.radius,
  borderWidth: 1, borderStyle: 'solid', borderColor: crmV2.borderLight, background: crmV2.bgHover,
}
const name: CSSProperties = {
  fontSize: 13, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const drop: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: crmV2.radius,
  borderWidth: 1.5, borderStyle: 'dashed', borderColor: crmV2.borderStrong, background: crmV2.bgHover,
}
