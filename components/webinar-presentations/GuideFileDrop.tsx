'use client'

import { useRef, useState } from 'react'
import { FileUp, Loader2, Upload } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'

export default function GuideFileDrop({
  onExtracted,
}: {
  onExtracted: (text: string, filename: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filename, setFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/webinar-presentations/extract-guide', {
        method: 'POST',
        body,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lecture impossible')
      setFilename(file.name)
      onExtracted(String(data.text || ''), file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        hidden
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void upload(file)
        }}
        style={{
          width: '100%',
          border: `2px dashed ${dragging ? crmV2.gold : crmV2.borderStrong}`,
          background: dragging ? crmV2.goldSoft : '#fff',
          borderRadius: 14,
          padding: '28px 18px',
          cursor: busy ? 'wait' : 'pointer',
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: crmV2.gold }}>
          {busy ? <Loader2 size={26} className="animate-spin" /> : <Upload size={26} />}
        </div>
        <div style={{ fontWeight: 800, fontSize: 15, color: crmV2.text }}>
          {busy ? 'Lecture du guide…' : 'Dépose ton guide ici, ou clique pour l’uploader'}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: crmV2.textMuted }}>
          PDF, Word (.docx) ou fichier texte — max 15 Mo
        </div>
        {filename && (
          <div style={{
            marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: crmV2.bgSoft, borderRadius: 999, padding: '6px 12px',
            fontSize: 12, fontWeight: 700, color: crmV2.text,
          }}>
            <FileUp size={13} /> {filename}
          </div>
        )}
      </button>
      {error && <div style={{ marginTop: 8, color: crmV2.danger, fontSize: 13 }}>{error}</div>}
    </div>
  )
}
