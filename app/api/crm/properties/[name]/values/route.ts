import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/properties/[name]/values?object=contacts|deals
 *
 * Retourne les valeurs DISTINCTES réellement utilisées pour cette propriété
 * dans crm_contacts ou crm_deals, avec le compte par valeur.
 *
 * Cherche d'abord dans une colonne dédiée si elle existe, sinon dans
 * hubspot_raw->>'<name>'. Limite à 200 valeurs distinctes triées par count desc.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  const sp = req.nextUrl.searchParams
  const objectType = (sp.get('object') === 'deals' ? 'deals' : 'contacts') as 'contacts' | 'deals'

  // Sécurise le nom de propriété (lettres / chiffres / underscore uniquement)
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return NextResponse.json({ error: 'Nom de propriété invalide' }, { status: 400 })
  }

  const db = createServiceClient()
  const table = objectType === 'deals' ? 'crm_deals' : 'crm_contacts'

  // Tente d'abord la colonne dédiée. Si elle n'existe pas, Supabase retourne
  // une erreur sur la requête : on bascule sur hubspot_raw.
  let values: Array<{ value: string; count: number }> = []
  let source: 'column' | 'hubspot_raw' = 'column'

  try {
    const { data, error } = await db.rpc('crm_property_value_counts', {
      p_table: table,
      p_column: name,
      p_limit: 200,
    })
    if (error) throw error
    values = (data as Array<{ value: string; count: number }>) || []
  } catch {
    // Fallback : extraire depuis hubspot_raw (JSONB)
    source = 'hubspot_raw'
    try {
      const { data, error } = await db.rpc('crm_property_value_counts_jsonb', {
        p_table: table,
        p_property: name,
        p_limit: 200,
      })
      if (error) throw error
      values = (data as Array<{ value: string; count: number }>) || []
    } catch (e) {
      return NextResponse.json({
        error: 'Impossible de récupérer les valeurs. Faut probablement créer les RPC v23.',
        details: e instanceof Error ? e.message : String(e),
        values: [],
        source,
      }, { status: 200 })
    }
  }

  return NextResponse.json({
    values,
    total_distinct: values.length,
    source,
  })
}
