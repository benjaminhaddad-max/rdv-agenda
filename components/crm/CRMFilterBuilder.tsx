'use client'

/**
 * Composant réutilisable de construction de filtres CRM avancés.
 *
 * Reproduit la même UX que le panneau de filtres avancés de la page CRM
 * (app/admin/crm/page.tsx, section "Tous les filtres"), mais auto-suffisant :
 * il fetch lui-même ses listes de référence (owners, pipelines, lead statuses,
 * sources, zones, départements) au mount.
 *
 * Utilisé par le modal "Nouvelle campagne SMS" pour offrir la parité totale
 * avec les filtres du CRM, et persiste son état au format `CRMFilterGroup[]`
 * (même format que `crm_saved_views.filter_groups`).
 *
 * Props :
 *   groups        : groupes de filtres (state contrôlé par le parent)
 *   onChange      : appelé à chaque modification → setGroups(next)
 */

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Copy, X } from 'lucide-react'
import {
  CRM_FILTER_FIELDS, STAGE_OPTIONS, FORMATION_OPTIONS, CLASSE_OPTIONS, PERIOD_OPTIONS,
  CURRENT_PIPELINE_ID,
  opsForField, opNeedsValue, opIsMulti,
  type CRMFilterField, type CRMFilterOp, type CRMFilterGroup,
  type SelectOption,
} from '@/lib/crm-constants'
import { MultiSelectDropdown } from '@/components/crm/CRMSelects'
import { CRMFieldPicker, isCustomField, type CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'

interface RdvUser {
  id: string
  name: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

interface PipelineData {
  id: string
  label: string
  stages: { id: string; label: string; displayOrder: number }[]
}

interface HubspotOwner {
  hubspot_owner_id: string
  firstname?: string
  lastname?: string
  email?: string
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export default function CRMFilterBuilder({
  groups,
  onChange,
}: {
  groups: CRMFilterGroup[]
  onChange: (next: CRMFilterGroup[]) => void
}) {
  // ── Listes de référence ──────────────────────────────────────────────────
  const [closers, setClosers] = useState<RdvUser[]>([])
  const [telepros, setTelepros] = useState<RdvUser[]>([])
  const [hubspotOwners, setHubspotOwners] = useState<HubspotOwner[]>([])
  const [pipelinesData, setPipelinesData] = useState<PipelineData[]>([])
  const [pipelineOptions, setPipelineOptions] = useState<SelectOption[]>([])
  const [leadStatusOptions, setLeadStatusOptions] = useState<SelectOption[]>([])
  const [sourceOptions, setSourceOptions] = useState<SelectOption[]>([])
  const [zoneOptions, setZoneOptions] = useState<SelectOption[]>([])
  const [deptOptions, setDeptOptions] = useState<SelectOption[]>([])
  const [allCrmProps, setAllCrmProps] = useState<CrmPropertyMeta[]>([])

  useEffect(() => {
    fetch('/api/users?roles=closer,admin').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setClosers(d)
    }).catch(() => {})
    fetch('/api/users?role=telepro').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTelepros(d)
    }).catch(() => {})
    fetch('/api/crm/owners').then(r => r.json()).then(d => {
      if (Array.isArray(d.owners)) setHubspotOwners(d.owners)
    }).catch(() => {})
    fetch('/api/crm/pipelines').then(r => r.json()).then((rows: PipelineData[]) => {
      if (!Array.isArray(rows)) return
      setPipelinesData(rows)
      setPipelineOptions(rows.map(p => ({ id: p.id, label: p.label })))
    }).catch(() => {})
    fetch('/api/crm/properties?object=contacts&limit=2000').then(r => r.json()).then(d => {
      if (Array.isArray(d.properties)) setAllCrmProps(d.properties as CrmPropertyMeta[])
    }).catch(() => {})
    fetch('/api/crm/field-options').then(r => r.json()).then(d => {
      if (d.leadStatuses?.length) {
        setLeadStatusOptions(d.leadStatuses.map((v: string) => ({ id: v, label: v })))
      }
      if (d.sources?.length) {
        setSourceOptions(d.sources.map((v: string) => ({ id: v, label: v })))
      }
      if (d.zones?.length) {
        setZoneOptions(d.zones.map((v: string) => ({ id: v, label: v })))
      }
      if (d.departements?.length) {
        setDeptOptions(d.departements.map((v: string) => ({ id: v, label: v })))
      }
    }).catch(() => {})
  }, [])

  // ── Stages : pipeline actuel + anciens (préfixés [année]) ─────────────────
  const allStageOptions = useMemo<SelectOption[]>(() => {
    const negRe = /perdu|lost|ferm[eé]|annul|rejet/i
    const current = STAGE_OPTIONS.filter(o => o.id)
    const currentIds = new Set(current.map(o => o.id))
    const extra: SelectOption[] = []
    for (const p of pipelinesData) {
      if (p.id === CURRENT_PIPELINE_ID) continue
      const positive = p.stages.filter(s => !negRe.test(s.label))
      let pivot = positive.find(s => /pr[eé]inscription/i.test(s.label))
      if (!pivot && positive.length > 0) pivot = positive[Math.floor(positive.length / 2)]
      const minOrder = pivot?.displayOrder ?? Infinity
      const stages = p.stages.filter(s => s.displayOrder >= minOrder && !negRe.test(s.label))
      const yearMatch = p.label.match(/(\d{4})[^\d]*(\d{2,4})/)
      const yearTag = yearMatch ? `${yearMatch[1]}-${String(yearMatch[2]).slice(-2)}` : p.label
      for (const s of stages) {
        if (!currentIds.has(s.id)) extra.push({ id: s.id, label: `[${yearTag}] ${s.label}` })
      }
    }
    return [...current, ...extra]
  }, [pipelinesData])

  // ── Owners (closer + télépro) — fusion users + crm_owners ─────────────────
  const ownerOptions = useMemo<SelectOption[]>(() => {
    const map = new Map<string, SelectOption>()
    for (const u of [...closers, ...telepros]) {
      const id = u.hubspot_owner_id || u.hubspot_user_id
      if (id) map.set(id, { id, label: u.name })
    }
    for (const o of hubspotOwners) {
      if (!o.hubspot_owner_id || map.has(o.hubspot_owner_id)) continue
      const label = [o.firstname, o.lastname].filter(Boolean).join(' ').trim()
        || o.email
        || o.hubspot_owner_id
      map.set(o.hubspot_owner_id, { id: o.hubspot_owner_id, label })
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [closers, telepros, hubspotOwners])

  const closerOptions = ownerOptions
  const teleproOptions = useMemo<SelectOption[]>(() => {
    const map = new Map<string, SelectOption>()
    for (const u of telepros) {
      const id = u.hubspot_user_id || u.hubspot_owner_id
      if (id) map.set(id, { id, label: u.name })
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [telepros])

  // ── Mutations ────────────────────────────────────────────────────────────
  function addFilterGroup() {
    const g: CRMFilterGroup = {
      id: uid('g'),
      rules: [{ id: uid('r'), field: 'stage', operator: 'is', value: '' }],
    }
    onChange([...groups, g])
  }

  function deleteFilterGroup(id: string) {
    onChange(groups.filter(g => g.id !== id))
  }

  function duplicateFilterGroup(id: string) {
    const g = groups.find(x => x.id === id)
    if (!g) return
    const copy: CRMFilterGroup = {
      id: uid('g'),
      rules: g.rules.map(r => ({ ...r, id: uid('r') })),
    }
    onChange([...groups, copy])
  }

  function addRuleToGroup(groupId: string) {
    onChange(groups.map(g =>
      g.id === groupId
        ? { ...g, rules: [...g.rules, { id: uid('r'), field: 'stage' as CRMFilterField, operator: 'is' as CRMFilterOp, value: '' }] }
        : g
    ))
  }

  function removeRule(groupId: string, ruleId: string) {
    onChange(groups.map(g => {
      if (g.id !== groupId) return g
      const nextRules = g.rules.filter(r => r.id !== ruleId)
      return { ...g, rules: nextRules }
    }).filter(g => g.rules.length > 0))
  }

  function updateRule(groupId: string, ruleId: string, patch: Partial<{ field: CRMFilterField; operator: CRMFilterOp; value: string }>) {
    onChange(groups.map(g =>
      g.id !== groupId ? g : {
        ...g,
        rules: g.rules.map(r => r.id !== ruleId ? r : { ...r, ...patch }),
      }
    ))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {groups.map((group, gi) => (
        <div key={group.id}>
          {gi > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7c98b6', background: '#ffffff', padding: '2px 10px', border: '1px solid #cbd6e2', borderRadius: 4 }}>ou</span>
              <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
            </div>
          )}

          <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 10, padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#516f90' }}>Groupe {gi + 1}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => duplicateFilterGroup(group.id)} title="Dupliquer" style={iconBtn}><Copy size={13} /></button>
                <button type="button" onClick={() => deleteFilterGroup(group.id)} title="Supprimer" style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={13} /></button>
              </div>
            </div>

            {group.rules.map((rule, ri) => {
              const ops = opsForField(rule.field)
              const showVal = opNeedsValue(rule.operator)
              const fieldDef = CRM_FILTER_FIELDS.find(f => f.key === rule.field)
              const customName = isCustomField(rule.field)
              const customProp = customName ? allCrmProps.find(p => p.name === customName) : null
              let valueOptions: SelectOption[] = []
              if (customProp && customProp.options && customProp.options.length > 0) {
                valueOptions = customProp.options.map(o => ({ id: o.value, label: o.label }))
              } else {
                switch (rule.field) {
                  case 'stage':       valueOptions = allStageOptions; break
                  case 'formation':   valueOptions = FORMATION_OPTIONS.filter(o => o.id); break
                  case 'classe':      valueOptions = CLASSE_OPTIONS.filter(o => o.id); break
                  case 'closer':        valueOptions = closerOptions; break
                  case 'contact_owner': valueOptions = closerOptions; break
                  case 'telepro':       valueOptions = teleproOptions; break
                  case 'lead_status': valueOptions = leadStatusOptions; break
                  case 'source':      valueOptions = sourceOptions; break
                  case 'zone':        valueOptions = zoneOptions; break
                  case 'departement': valueOptions = deptOptions; break
                  case 'period':      valueOptions = PERIOD_OPTIONS.filter(o => o.id); break
                  case 'pipeline':    valueOptions = pipelineOptions; break
                  case 'prior_preinscription': valueOptions = [{ id: '1', label: 'Oui' }]; break
                }
              }
              const showSelect = (fieldDef?.type === 'select' && valueOptions.length > 0) || (customProp && valueOptions.length > 0)
              return (
                <div key={rule.id}>
                  {ri > 0 && <div style={{ fontSize: 11, color: '#3a5070', padding: '4px 0 4px 4px' }}>et</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: '8px 10px', position: 'relative' }}>
                    <button type="button" onClick={() => removeRule(group.id, rule.id)} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', color: '#7c98b6', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={12} /></button>
                    <CRMFieldPicker
                      value={rule.field}
                      onChange={(field) => updateRule(group.id, rule.id, { field: field as CRMFilterField, operator: 'is', value: '' })}
                      crmProps={allCrmProps}
                    />
                    {customName && (
                      <div style={{ fontSize: 10, color: '#94a3b8', padding: '0 4px' }}>
                        Filtre custom — non encore appliqué côté API. Pour cibler par cette propriété, utilise <a href="/admin/crm/recherche-prop" target="_blank" rel="noopener" style={{ color: '#2ea3f2', textDecoration: 'underline' }}>Recherche propriété</a> pour récupérer les numéros, puis colle-les dans l&apos;onglet « Liste de numéros ».
                      </div>
                    )}
                    <select value={rule.operator} onChange={e => updateRule(group.id, rule.id, { operator: e.target.value as CRMFilterOp })} style={selectStyle}>
                      {ops.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
                    </select>
                    {showVal && (
                      showSelect ? (
                        opIsMulti(rule.operator) ? (
                          <MultiSelectDropdown
                            options={valueOptions}
                            value={rule.value}
                            onChange={v => updateRule(group.id, rule.id, { value: v })}
                          />
                        ) : (
                          <select value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={{ ...selectStyle, color: rule.value ? '#ccac71' : '#7c98b6' }}>
                            <option value="">Rechercher…</option>
                            {valueOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                          </select>
                        )
                      ) : (
                        <input type="text" value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} placeholder="Valeur…" style={{ ...selectStyle, color: '#33475b', cursor: 'text' }} />
                      )
                    )}
                  </div>
                </div>
              )
            })}

            <button type="button" onClick={() => addRuleToGroup(group.id)} style={{ marginTop: 8, padding: '6px 12px', background: 'transparent', border: '1px solid #cbd6e2', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={11} /> Ajouter un filtre
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: groups.length > 0 ? 12 : 0 }}>
        {groups.length > 0 && (
          <>
            <div style={{ flex: 1, height: 1, background: '#cbd6e2' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#7c98b6' }}>ou</span>
          </>
        )}
        <button type="button" onClick={addFilterGroup} style={{ padding: '8px 14px', background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <Plus size={12} /> Ajouter un groupe de filtres
        </button>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#3a5070', cursor: 'pointer', display: 'flex', padding: 3,
}

const selectStyle: React.CSSProperties = {
  background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6, padding: '6px 8px',
  color: '#516f90', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%',
}
