'use client'

/**
 * Aperçu des créas d'un dossier sans les télécharger : vignettes (images,
 * vidéos, PDF) + visionneuse plein écran (flèches ← →, Échap pour fermer).
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, FileText, File as FileIcon, Play, Trash2, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { formatBytes, type FolderFile } from '@/lib/ads-creatives'

export type PreviewKind = 'image' | 'video' | 'pdf' | 'other'

export function previewKind(name: string): PreviewKind {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'm4v', 'webm', 'ogv'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

/** Nom affiché : chemin relatif sans le dossier racine. */
export function shortName(f: FolderFile): string {
  return f.name.includes('/') ? f.name.split('/').slice(1).join('/') : f.name
}

/** Image : miniature redimensionnée par Supabase (repli sur l'original si la transformation échoue). */
function ImageThumb({ src }: { src: string }) {
  const [full, setFull] = useState(false)
  return <img src={full ? src : `${src}&w=300`} alt="" loading="lazy" style={thumbMedia} onError={() => setFull(true)} />
}

export function CreativeThumbs({
  files, previewUrl, onOpen, onDelete,
}: {
  files: FolderFile[]
  previewUrl: (f: FolderFile) => string
  onOpen: (index: number) => void
  /** Retirer un fichier du dossier (bouton corbeille sur la vignette) */
  onDelete?: (f: FolderFile) => void
}) {
  return (
    <div style={grid}>
      {files.map((f, i) => {
        const kind = previewKind(f.name)
        return (
          <div key={f.path} style={{ position: 'relative', minWidth: 0 }}>
          <button type="button" onClick={() => onOpen(i)} style={thumbBtn} title={shortName(f)}>
            <div style={thumbBox}>
              {kind === 'image' && <ImageThumb src={previewUrl(f)} />}
              {kind === 'video' && (
                <>
                  {/* #t=0.5 : le navigateur affiche une image de la vidéo comme vignette */}
                  <video src={`${previewUrl(f)}#t=0.5`} preload="metadata" muted playsInline style={thumbMedia} />
                  <span style={playBadge}><Play size={14} fill="#fff" /></span>
                </>
              )}
              {kind === 'pdf' && <FileText size={26} style={{ color: crmV2.textFaint }} />}
              {kind === 'other' && <FileIcon size={26} style={{ color: crmV2.textFaint }} />}
            </div>
            <div style={thumbName}>{shortName(f)}</div>
          </button>
          {onDelete && (
            <button type="button" onClick={() => onDelete(f)} style={deleteBadge} aria-label="Retirer ce fichier" title="Retirer ce fichier du dossier">
              <Trash2 size={12} />
            </button>
          )}
          </div>
        )
      })}
    </div>
  )
}

export function CreativeViewer({
  files, index, previewUrl, downloadUrl, onIndex, onClose,
}: {
  files: FolderFile[]
  index: number
  previewUrl: (f: FolderFile) => string
  downloadUrl: (f: FolderFile) => string
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const f = files[index]
  const kind = previewKind(f.name)
  const [failedAt, setFailedAt] = useState<number | null>(null)
  const failed = failedAt === index
  const go = (d: number) => onIndex((index + d + files.length) % files.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = e.key === 'Escape' ? onClose : e.key === 'ArrowRight' ? () => go(1) : e.key === 'ArrowLeft' ? () => go(-1) : null
      if (!action) return
      // Capture + arrêt : Échap ferme la visionneuse sans fermer aussi le volet de la campagne.
      e.stopImmediatePropagation()
      action()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const url = previewUrl(f)
  const fallback = (
    <div style={{ color: '#cbd5e1', textAlign: 'center', fontSize: 14, lineHeight: 1.6 }}>
      <FileIcon size={40} style={{ marginBottom: 8 }} />
      <div>Aperçu indisponible pour ce format.</div>
      <a href={downloadUrl(f)} style={{ color: '#fff', fontWeight: 600 }}>Télécharger le fichier</a>
    </div>
  )

  return createPortal(
    <div style={overlay} onClick={onClose}>
      <div style={topBar} onClick={(e) => e.stopPropagation()}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(f)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{index + 1} / {files.length} · {formatBytes(f.size)}</div>
        </div>
        <a href={downloadUrl(f)} style={barBtn} title="Télécharger"><Download size={18} /></a>
        <button type="button" onClick={onClose} style={barBtn} title="Fermer (Échap)"><X size={20} /></button>
      </div>

      <div style={stage} onClick={(e) => e.stopPropagation()}>
        {failed || kind === 'other' ? fallback : (
          <>
            {kind === 'image' && <img key={url} src={url} alt={shortName(f)} style={media} onError={() => setFailedAt(index)} />}
            {kind === 'video' && <video key={url} src={url} controls autoPlay playsInline style={media} onError={() => setFailedAt(index)} />}
            {kind === 'pdf' && <iframe key={url} src={url} title={shortName(f)} style={{ width: '100%', height: '100%', border: 'none', background: '#fff', borderRadius: 6 }} />}
          </>
        )}
      </div>

      {files.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); go(-1) }} style={{ ...navBtn, left: 12 }} aria-label="Précédente"><ChevronLeft size={26} /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); go(1) }} style={{ ...navBtn, right: 12 }} aria-label="Suivante"><ChevronRight size={26} /></button>
        </>
      )}
    </div>,
    document.body,
  )
}

/* ─── Styles ──────────────────────────────────────────────────────── */

const grid: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, padding: 10,
}
const deleteBadge: CSSProperties = {
  position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.65)', color: '#fff',
}
const thumbBtn: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, padding: 0, border: 'none', background: 'transparent',
  cursor: 'pointer', textAlign: 'left', minWidth: 0, width: '100%', fontFamily: 'inherit',
}
const thumbBox: CSSProperties = {
  position: 'relative', aspectRatio: '1 / 1', borderRadius: crmV2.radiusSm, overflow: 'hidden',
  background: crmV2.bgMuted, border: `1px solid ${crmV2.borderLight}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const thumbMedia: CSSProperties = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }
const playBadge: CSSProperties = {
  position: 'absolute', right: 6, bottom: 6, width: 26, height: 26, borderRadius: '50%',
  background: 'rgba(15,23,42,.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const thumbName: CSSProperties = {
  fontSize: 11, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(2,6,23,.92)',
  display: 'flex', flexDirection: 'column',
}
const topBar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', color: '#fff', fontSize: 14,
}
const barBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8,
  border: 'none', background: 'rgba(255,255,255,.1)', color: '#fff', cursor: 'pointer', flexShrink: 0,
}
const stage: CSSProperties = {
  flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 64px 24px',
}
const media: CSSProperties = { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }
const navBtn: CSSProperties = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%',
  border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
