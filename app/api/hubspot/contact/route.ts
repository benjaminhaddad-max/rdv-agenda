import { NextRequest, NextResponse } from 'next/server'
import { getContact, searchContactByPhone, createHubSpotContact, updateContact } from '@/lib/hubspot'

// Extrait l'ID contact depuis n'importe quel format d'URL HubSpot :
// Ancien : https://app-eu1.hubspot.com/contacts/26711031/contact/78338004
// Nouveau : https://app-eu1.hubspot.com/contacts/26711031/record/0-1/733593946327
// Aussi   : simple nombre collé directement (ex: "733593946327")
function extractContactIdFromUrl(url: string): string | null {
  const trimmed = url.trim()

  // Si c'est juste un nombre → c'est directement l'ID
  if (/^\d+$/.test(trimmed)) return trimmed

  // Nouveau format : /record/0-1/{id}
  const recordMatch = trimmed.match(/\/record\/0-1\/(\d+)/)
  if (recordMatch) return recordMatch[1]

  // Ancien format : /contact/{id}
  const contactMatch = trimmed.match(/\/contact\/(\d+)/)
  if (contactMatch) return contactMatch[1]

  // Fallback : dernier segment numérique long de l'URL (avant le ?)
  const path = trimmed.split('?')[0]
  const segments = path.split('/')
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d{6,}$/.test(segments[i])) return segments[i]
  }

  return null
}

// POST /api/hubspot/contact — Créer un nouveau contact HubSpot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { firstname, lastname, email, phone, departement, classe_actuelle, formation } = body

    if (!firstname || !lastname || !email) {
      return NextResponse.json({ error: 'Prénom, nom et email requis' }, { status: 400 })
    }

    const contact = await createHubSpotContact({
      firstname,
      lastname,
      email,
      phone: phone || undefined,
      departement: departement ? String(departement) : undefined,
      classe_actuelle: classe_actuelle || undefined,
      diploma_sante___formation_demandee: formation || undefined,
    })
    return NextResponse.json(contact, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur HubSpot'
    // Doublon email → 409
    if (msg.includes('409') || msg.includes('existing')) {
      return NextResponse.json({ error: 'Un contact avec cet email existe déjà dans HubSpot' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/hubspot/contact — Mettre à jour les propriétés d'un contact HubSpot
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { contactId, properties } = body

    if (!contactId || !properties || Object.keys(properties).length === 0) {
      return NextResponse.json({ error: 'contactId et properties requis' }, { status: 400 })
    }

    const updated = await updateContact(contactId, properties)
    return NextResponse.json(updated)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur HubSpot'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/hubspot/contact?url=https://...  → chercher par lien HubSpot
// GET /api/hubspot/contact?phone=0612345678 → chercher par téléphone
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  const phone = searchParams.get('phone')

  try {
    if (url) {
      const contactId = extractContactIdFromUrl(url)
      if (!contactId) {
        return NextResponse.json(
          { error: 'URL invalide — colle le lien de la fiche contact HubSpot (l\'URL complète depuis la barre d\'adresse)' },
          { status: 400 }
        )
      }
      const contact = await getContact(contactId)
      return NextResponse.json({ results: [contact] })
    }

    if (phone) {
      const data = await searchContactByPhone(phone)
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Paramètre url ou phone requis' }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur HubSpot'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
