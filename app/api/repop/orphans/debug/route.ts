/**
 * GET /api/repop/orphans/debug
 * Debug endpoint to understand why orphans search returns 0
 */

import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

async function hubspotFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const text = await res.text()
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) }
  } catch {
    return { ok: res.ok, status: res.status, data: text }
  }
}

export async function GET() {
  const results: Record<string, unknown> = {}

  // Test 1: contacts with num_associated_deals = 0 + recent_conversion_date
  const test1 = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'num_associated_deals', operator: 'EQ', value: '0' },
          { propertyName: 'recent_conversion_date', operator: 'HAS_PROPERTY' },
        ],
      }],
      properties: ['email', 'firstname', 'lastname', 'recent_conversion_date', 'first_conversion_date', 'num_conversion_events'],
      limit: 3,
    }),
  })
  results['test1_no_deals_with_conversion'] = {
    total: test1.data?.total ?? 'error',
    status: test1.status,
    sample: test1.data?.results?.slice(0, 3).map((r: { properties: Record<string, string> }) => ({
      name: `${r.properties.firstname} ${r.properties.lastname}`,
      recent_conversion_date: r.properties.recent_conversion_date,
      first_conversion_date: r.properties.first_conversion_date,
      num_conversion_events: r.properties.num_conversion_events,
    })),
    error: !test1.ok ? test1.data : undefined,
  }

  // Test 2: just contacts with recent_conversion_date (no deal filter)
  const test2 = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'recent_conversion_date', operator: 'HAS_PROPERTY' },
        ],
      }],
      properties: ['email', 'firstname', 'lastname', 'num_associated_deals', 'recent_conversion_date', 'first_conversion_date'],
      limit: 5,
    }),
  })
  results['test2_any_with_conversion'] = {
    total: test2.data?.total ?? 'error',
    status: test2.status,
    sample: test2.data?.results?.slice(0, 5).map((r: { properties: Record<string, string> }) => ({
      name: `${r.properties.firstname} ${r.properties.lastname}`,
      num_deals: r.properties.num_associated_deals,
      recent_conv: r.properties.recent_conversion_date,
      first_conv: r.properties.first_conversion_date,
    })),
  }

  // Test 3: contacts with num_associated_deals = 0 (no conversion filter)
  const test3 = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'num_associated_deals', operator: 'EQ', value: '0' },
        ],
      }],
      properties: ['email', 'firstname', 'lastname', 'num_associated_deals', 'recent_conversion_date'],
      limit: 5,
    }),
  })
  results['test3_no_deals_any'] = {
    total: test3.data?.total ?? 'error',
    status: test3.status,
    sample: test3.data?.results?.slice(0, 5).map((r: { properties: Record<string, string> }) => ({
      name: `${r.properties.firstname} ${r.properties.lastname}`,
      num_deals: r.properties.num_associated_deals,
      recent_conv: r.properties.recent_conversion_date,
    })),
  }

  return NextResponse.json(results, { status: 200 })
}
