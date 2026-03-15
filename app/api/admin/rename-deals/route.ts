import { NextResponse } from 'next/server'
import { hubspotFetch, PIPELINE_2026_2027, STAGES } from '@/lib/hubspot'

// Stages à renommer : RDV pris, Délai de réflexion, À Replanifier
const STAGES_TO_RENAME = [STAGES.rdvPris, STAGES.delaiReflexion, STAGES.aReplanifier]

const CONTACT_PROPS = 'firstname,lastname,classe_actuelle,diploma_sante___formation_demandee'

function buildDealName(contact: {
  firstname?: string
  lastname?: string
  classe_actuelle?: string
  diploma_sante___formation_demandee?: string
}, fallback: string): string {
  const nom = [contact.lastname, contact.firstname].filter(Boolean).join(' ').trim()
  const classe = contact.classe_actuelle?.trim()
  const formation = contact.diploma_sante___formation_demandee?.trim()
  const parts = [nom || fallback, classe, formation].filter(Boolean)
  return parts.join(' - ')
}

// ─── GET — aperçu des renommages prévus (dry run) ─────────────────────────
export async function GET() {
  try {
    const previews: Array<{ dealId: string; oldName: string; newName: string; contactId: string }> = []

    for (const stage of STAGES_TO_RENAME) {
      let after: string | undefined

      do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = {
          filterGroups: [{
            filters: [
              { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_2026_2027 },
              { propertyName: 'dealstage', operator: 'EQ', value: stage },
            ],
          }],
          properties: ['dealname', 'dealstage'],
          limit: 100,
        }
        if (after) body.after = after

        const data = await hubspotFetch('/crm/v3/objects/deals/search', {
          method: 'POST',
          body: JSON.stringify(body),
        })

        // Récupérer les contacts associés en batch
        const deals = data.results ?? []
        const dealIds: string[] = deals.map((d: { id: string }) => d.id)

        if (dealIds.length > 0) {
          // Associations deals → contacts
          const assocRes = await hubspotFetch('/crm/v4/associations/deals/contacts/batch/read', {
            method: 'POST',
            body: JSON.stringify({ inputs: dealIds.map((id: string) => ({ id })) }),
          })

          const dealContactMap = new Map<string, string>()
          for (const r of (assocRes.results ?? [])) {
            const contactId = r.to?.[0]?.toObjectId ?? r.to?.[0]?.id
            if (contactId) dealContactMap.set(String(r.from.id), String(contactId))
          }

          // Fetch contacts en batch
          const contactIds = [...new Set(dealContactMap.values())]
          const contactMap = new Map<string, { firstname?: string; lastname?: string; classe_actuelle?: string; diploma_sante___formation_demandee?: string }>()

          for (let i = 0; i < contactIds.length; i += 100) {
            const chunk = contactIds.slice(i, i + 100)
            try {
              const cRes = await hubspotFetch('/crm/v3/objects/contacts/batch/read', {
                method: 'POST',
                body: JSON.stringify({ inputs: chunk.map((id: string) => ({ id })), properties: CONTACT_PROPS.split(',') }),
              })
              for (const c of (cRes.results ?? [])) {
                contactMap.set(c.id, c.properties)
              }
            } catch { /* best-effort */ }
          }

          for (const deal of deals) {
            const contactId = dealContactMap.get(deal.id)
            const contact = contactId ? contactMap.get(contactId) : undefined
            const newName = contact
              ? buildDealName(contact, deal.properties.dealname)
              : deal.properties.dealname
            if (newName !== deal.properties.dealname) {
              previews.push({ dealId: deal.id, oldName: deal.properties.dealname, newName, contactId: contactId ?? '' })
            }
          }

          await new Promise(r => setTimeout(r, 200))
        }

        after = data.paging?.next?.after ?? undefined
      } while (after)
    }

    return NextResponse.json({ count: previews.length, previews })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── POST — applique les renommages ───────────────────────────────────────
export async function POST() {
  try {
    const renamed: Array<{ dealId: string; newName: string }> = []
    const errors: Array<{ dealId: string; error: string }> = []

    for (const stage of STAGES_TO_RENAME) {
      let after: string | undefined

      do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = {
          filterGroups: [{
            filters: [
              { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_2026_2027 },
              { propertyName: 'dealstage', operator: 'EQ', value: stage },
            ],
          }],
          properties: ['dealname'],
          limit: 100,
        }
        if (after) body.after = after

        const data = await hubspotFetch('/crm/v3/objects/deals/search', {
          method: 'POST',
          body: JSON.stringify(body),
        })

        const deals = data.results ?? []
        const dealIds: string[] = deals.map((d: { id: string }) => d.id)

        if (dealIds.length > 0) {
          const assocRes = await hubspotFetch('/crm/v4/associations/deals/contacts/batch/read', {
            method: 'POST',
            body: JSON.stringify({ inputs: dealIds.map((id: string) => ({ id })) }),
          })

          const dealContactMap = new Map<string, string>()
          for (const r of (assocRes.results ?? [])) {
            const contactId = r.to?.[0]?.toObjectId ?? r.to?.[0]?.id
            if (contactId) dealContactMap.set(String(r.from.id), String(contactId))
          }

          const contactIds = [...new Set(dealContactMap.values())]
          const contactMap = new Map<string, { firstname?: string; lastname?: string; classe_actuelle?: string; diploma_sante___formation_demandee?: string }>()

          for (let i = 0; i < contactIds.length; i += 100) {
            const chunk = contactIds.slice(i, i + 100)
            try {
              const cRes = await hubspotFetch('/crm/v3/objects/contacts/batch/read', {
                method: 'POST',
                body: JSON.stringify({ inputs: chunk.map((id: string) => ({ id })), properties: CONTACT_PROPS.split(',') }),
              })
              for (const c of (cRes.results ?? [])) contactMap.set(c.id, c.properties)
            } catch { /* best-effort */ }
          }

          // Renommer les deals en batch (chunks de 100)
          const updates: Array<{ id: string; properties: { dealname: string } }> = []
          for (const deal of deals) {
            const contactId = dealContactMap.get(deal.id)
            const contact = contactId ? contactMap.get(contactId) : undefined
            if (!contact) continue
            const newName = buildDealName(contact, deal.properties.dealname)
            if (newName !== deal.properties.dealname) {
              updates.push({ id: deal.id, properties: { dealname: newName } })
            }
          }

          for (let i = 0; i < updates.length; i += 100) {
            const chunk = updates.slice(i, i + 100)
            try {
              await hubspotFetch('/crm/v3/objects/deals/batch/update', {
                method: 'POST',
                body: JSON.stringify({ inputs: chunk }),
              })
              renamed.push(...chunk.map(u => ({ dealId: u.id, newName: u.properties.dealname })))
            } catch (e) {
              errors.push(...chunk.map(u => ({ dealId: u.id, error: String(e) })))
            }
            await new Promise(r => setTimeout(r, 200))
          }
        }

        after = data.paging?.next?.after ?? undefined
      } while (after)
    }

    return NextResponse.json({ renamed_count: renamed.length, renamed, errors })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
