import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/dashboard/stats
 *
 * Renvoie les KPI principaux pour le dashboard CRM :
 *  - leads (today/7d/30d + série journalière 30j)
 *  - leads_by_source / leads_by_stage / leads_by_class
 *  - deals (open / won this month)
 *  - tasks (overdue / today / week)
 *  - workflows (actifs + executions running)
 *  - top_owners (par nb de leads attribués sur 30j)
 *  - last_form_submissions (10 derniers)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function awaitCount(builder: any): Promise<number> {
  const { count } = await builder
  return (count as number | null) ?? 0
}

export async function GET() {
  const db = createServiceClient()
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const day7  = new Date(now.getTime() - 7  * 86_400_000)
  const day30 = new Date(now.getTime() - 30 * 86_400_000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000)

  // Lance les requêtes en parallèle
  const [
    leadsTodayCount,
    leads7dCount,
    leads30dCount,
    leadsSeries,
    leadsBySource,
    leadsByStage,
    leadsByClass,
    dealsOpenCount,
    dealsWonMonthCount,
    tasksOverdue,
    tasksToday,
    tasksWeek,
    activeWorkflows,
    runningExecutions,
    topOwners,
    lastSubs,
  ] = await Promise.all([
    // Leads created today / 7d / 30d
    awaitCount(db.from('crm_contacts').select('id', { count: 'exact', head: true }).gte('contact_createdate', todayStart.toISOString())),
    awaitCount(db.from('crm_contacts').select('id', { count: 'exact', head: true }).gte('contact_createdate', day7.toISOString())),
    awaitCount(db.from('crm_contacts').select('id', { count: 'exact', head: true }).gte('contact_createdate', day30.toISOString())),

    // Série journalière sur 30 jours (pour sparkline) — on fetch les dates et on bucket en JS
    db.from('crm_contacts')
      .select('contact_createdate')
      .gte('contact_createdate', day30.toISOString())
      .limit(50_000),

    // Leads par origine (top 8)
    db.from('crm_contacts')
      .select('origine')
      .gte('contact_createdate', day30.toISOString())
      .limit(50_000),

    // Leads par statut
    db.from('crm_contacts')
      .select('hs_lead_status')
      .not('hs_lead_status', 'is', null)
      .limit(100_000),

    // Leads par classe (filtre seulement Seconde / Première / Terminale)
    db.from('crm_contacts')
      .select('classe_actuelle')
      .in('classe_actuelle', ['Seconde', 'Première', 'Terminale'])
      .gte('contact_createdate', day30.toISOString())
      .limit(50_000),

    // Deals
    awaitCount(db.from('crm_deals').select('id', { count: 'exact', head: true }).not('dealstage', 'in', '(closedwon,closedlost)')),
    awaitCount(db.from('crm_deals').select('id', { count: 'exact', head: true })
      .eq('dealstage', 'closedwon')
      .gte('closedate', monthStart.toISOString())),

    // Tasks
    awaitCount(db.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('due_at', todayStart.toISOString())),
    awaitCount(db.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('due_at', todayStart.toISOString()).lt('due_at', tomorrowStart.toISOString())),
    awaitCount(db.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('due_at', todayStart.toISOString()).lt('due_at', new Date(todayStart.getTime() + 7 * 86_400_000).toISOString())),

    // Workflows
    awaitCount(db.from('crm_workflows').select('id', { count: 'exact', head: true }).eq('status', 'active')),
    awaitCount(db.from('crm_workflow_executions').select('id', { count: 'exact', head: true }).in('status', ['running', 'waiting'])),

    // Top owners par nb leads attribués sur 30j
    db.from('crm_contacts')
      .select('hubspot_owner_id')
      .gte('contact_createdate', day30.toISOString())
      .not('hubspot_owner_id', 'is', null)
      .limit(50_000),

    // Dernières soumissions de formulaire
    db.from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, recent_conversion_event, recent_conversion_date, hs_lead_status, hubspot_owner_id')
      .not('recent_conversion_date', 'is', null)
      .order('recent_conversion_date', { ascending: false })
      .limit(10),
  ])

  // Leads sparkline : bucket par jour
  const dailySeries: Array<{ date: string; count: number }> = []
  const buckets: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000)
    d.setHours(0, 0, 0, 0)
    const k = d.toISOString().slice(0, 10)
    buckets[k] = 0
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (leadsSeries.data ?? []) as Array<{ contact_createdate: string }>) {
    if (!row.contact_createdate) continue
    const k = String(row.contact_createdate).slice(0, 10)
    if (k in buckets) buckets[k]++
  }
  for (const k of Object.keys(buckets).sort()) {
    dailySeries.push({ date: k, count: buckets[k] })
  }

  // Leads par origine : compte
  const sourceCounts: Record<string, number> = {}
  for (const row of (leadsBySource.data ?? []) as Array<{ origine: string | null }>) {
    const key = row.origine || '— Sans origine —'
    sourceCounts[key] = (sourceCounts[key] || 0) + 1
  }
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }))

  // Leads par statut
  const stageCounts: Record<string, number> = {}
  for (const row of (leadsByStage.data ?? []) as Array<{ hs_lead_status: string | null }>) {
    const key = row.hs_lead_status || '—'
    stageCounts[key] = (stageCounts[key] || 0) + 1
  }
  const topStages = Object.entries(stageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }))

  // Leads par classe
  const classCounts: Record<string, number> = {}
  for (const row of (leadsByClass.data ?? []) as Array<{ classe_actuelle: string | null }>) {
    const key = row.classe_actuelle || '—'
    classCounts[key] = (classCounts[key] || 0) + 1
  }

  // Top owners — on récupère les noms via crm_owners
  const ownerCounts: Record<string, number> = {}
  for (const row of (topOwners.data ?? []) as Array<{ hubspot_owner_id: string | null }>) {
    if (!row.hubspot_owner_id) continue
    ownerCounts[row.hubspot_owner_id] = (ownerCounts[row.hubspot_owner_id] || 0) + 1
  }
  const ownerIds = Object.keys(ownerCounts)
  let ownersInfo: Array<{ hubspot_owner_id: string; firstname: string | null; lastname: string | null; email: string | null }> = []
  if (ownerIds.length > 0) {
    const { data } = await db.from('crm_owners')
      .select('hubspot_owner_id, firstname, lastname, email')
      .in('hubspot_owner_id', ownerIds.slice(0, 50))
    ownersInfo = (data ?? []) as typeof ownersInfo
  }
  const topOwnersPayload = Object.entries(ownerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const o = ownersInfo.find(x => x.hubspot_owner_id === id)
      const name = o ? [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || id : id
      return { owner_id: id, name, count }
    })

  return NextResponse.json({
    generated_at: now.toISOString(),
    leads: {
      today:       leadsTodayCount,
      last_7_days: leads7dCount,
      last_30_days: leads30dCount,
      daily_series: dailySeries,
    },
    sources: topSources,
    stages:  topStages,
    classes: classCounts,
    deals: {
      open:        dealsOpenCount,
      won_month:   dealsWonMonthCount,
    },
    tasks: {
      overdue: tasksOverdue,
      today:   tasksToday,
      week:    tasksWeek,
    },
    workflows: {
      active:             activeWorkflows,
      running_executions: runningExecutions,
    },
    top_owners: topOwnersPayload,
    last_submissions: lastSubs.data ?? [],
  })
}
