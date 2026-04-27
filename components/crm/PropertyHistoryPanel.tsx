'use client'

import { useEffect, useState } from 'react'
import { X, History, FileText, Workflow, Database, User, Mail, Globe } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface HistoryRow {
  id: number
  value: string | null
  changed_at: string
  source_type: string | null
  source_id: string | null
  source_label: string | null
  source_metadata?: Record<string, unknown>
}

interface Option {
  label: string
  value: string
}

interface Props {
  contactId: string
  propertyName: string
  propertyLabel: string
  /** options pour décoder les valeurs d'enums HubSpot (optionnel) */
  options?: Option[]
  onClose: () => void
}

// Mapping des sourceType HubSpot → label humain + icône
const SOURCE_INFO: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  FORM:                 { label: 'Formulaire',     icon: <FileText size={12} />, color: 'text-rose-700 bg-rose-50' },
  WORKFLOW:             { label: 'Workflow',       icon: <Workflow size={12} />, color: 'text-violet-700 bg-violet-50' },
  CRM_UI:               { label: 'CRM (manuel)',   icon: <User size={12} />,     color: 'text-blue-700 bg-blue-50' },
  IMPORT:               { label: 'Import',         icon: <Database size={12} />, color: 'text-amber-700 bg-amber-50' },
  INTEGRATION:          { label: 'Intégration',    icon: <Globe size={12} />,    color: 'text-emerald-700 bg-emerald-50' },
  EMAIL:                { label: 'E-mail',         icon: <Mail size={12} />,     color: 'text-blue-700 bg-blue-50' },
  API:                  { label: 'API',            icon: <Database size={12} />, color: 'text-slate-700 bg-slate-100' },
  ANALYTICS:            { label: 'Analytics',      icon: <Globe size={12} />,    color: 'text-emerald-700 bg-emerald-50' },
  CONTACTS_WEB:         { label: 'CRM HubSpot',    icon: <User size={12} />,     color: 'text-blue-700 bg-blue-50' },
  MIGRATION:            { label: 'Migration',      icon: <Database size={12} />, color: 'text-amber-700 bg-amber-50' },
  CALCULATED:           { label: 'Calculé',        icon: <Database size={12} />, color: 'text-slate-700 bg-slate-100' },
  TASK:                 { label: 'Tâche',          icon: <FileText size={12} />, color: 'text-slate-700 bg-slate-100' },
  ENGAGEMENT:           { label: 'Engagement',     icon: <FileText size={12} />, color: 'text-slate-700 bg-slate-100' },
  COMPANY_INSIGHTS:     { label: 'Société',        icon: <Globe size={12} />,    color: 'text-slate-700 bg-slate-100' },
  USER_ACTIVATION_DATA: { label: 'Activation',     icon: <User size={12} />,     color: 'text-slate-700 bg-slate-100' },
}

function decodeValue(value: string | null, options?: Option[]): string {
  if (value === null || value === '') return '—'
  if (!options || options.length === 0) return value
  // valeur multi : "PASS;LAS"
  if (value.includes(';')) {
    return value.split(';').map(v => options.find(o => o.value === v)?.label || v).join(', ')
  }
  return options.find(o => o.value === value)?.label || value
}

export default function PropertyHistoryPanel({
  contactId, propertyName, propertyLabel, options, onClose,
}: Props) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/crm/contacts/${contactId}/property-history?name=${encodeURIComponent(propertyName)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setHistory(d.history || [])
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [contactId, propertyName])

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-[#2ea3f2]/10 to-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#2ea3f2]/15 text-[#0038f0] flex items-center justify-center">
              <History size={16} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Historique</div>
              <h2 className="text-sm font-semibold text-slate-800">{propertyLabel}</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Chargement…</div>
          )}
          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">{err}</div>
          )}
          {!loading && !err && history && history.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">
              Aucun historique pour cette propriété.
            </div>
          )}
          {!loading && !err && history && history.length > 0 && (
            <ul className="relative pl-5">
              <div className="absolute left-1.5 top-1 bottom-1 w-px bg-slate-200" />
              {history.map((h, idx) => {
                const sInfo = h.source_type ? SOURCE_INFO[h.source_type] : undefined
                const isFirst = idx === 0
                return (
                  <li key={h.id} className="relative pb-4">
                    <div className={`absolute -left-3.5 top-1 w-3 h-3 rounded-full ring-4 ring-white ${isFirst ? 'bg-[#2ea3f2]' : 'bg-slate-300'}`} />
                    <div className={`bg-white border rounded-lg p-3 ${isFirst ? 'border-[#2ea3f2]/30 shadow-sm' : ''}`}>
                      <div className="text-sm font-semibold text-slate-800 break-words">
                        {decodeValue(h.value, options)}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {sInfo ? (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${sInfo.color}`}>
                            {sInfo.icon}
                            {sInfo.label}
                          </span>
                        ) : h.source_type ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-700 bg-slate-100">
                            {h.source_type}
                          </span>
                        ) : null}
                        {h.source_label && (
                          <span className="text-[10px] text-slate-500 truncate">{h.source_label}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        <span title={format(new Date(h.changed_at), "d MMMM yyyy 'à' HH:mm:ss", { locale: fr })}>
                          {format(new Date(h.changed_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                        </span>
                        <span className="mx-1">·</span>
                        <span>{formatDistanceToNow(new Date(h.changed_at), { addSuffix: true, locale: fr })}</span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-2 text-[11px] text-slate-400 bg-slate-50">
          {history && history.length > 0 && `${history.length} version${history.length > 1 ? 's' : ''}`}
        </div>
      </div>
    </div>
  )
}
