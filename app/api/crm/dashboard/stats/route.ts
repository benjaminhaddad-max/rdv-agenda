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
    awaitCount(db.from('crm_contacts').select('*', { count: 'exact', head: true }).gte('contact_createdate', todayStart.toISOString())),
    awaitCount(db.from('crm_contacts').select('*', { count: 'exact', head: true }).gte('contact_createdate', day7.toISOString())),
    awaitCount(db.from('crm_contacts').select('*', { count: 'exact', head: true }).gte('contact_createdate', day30.toISOString())),

    // Série journalière sur 30 jours : 30 count queries en parallèle (un par jour) car
    // PostgREST plafonne à 1000 rows même avec .limit(50_000)
    Promise.all(Array.from({ length: 30 }, (_, i) => {
      const dayStart = new Date(now.getTime() - (29 - i) * 86_400_000)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart.getTime() + 86_400_000)
      return awaitCount(
        db.from('crm_contacts').select('*', { count: 'exact', head: true })
          .gte('contact_createdate', dayStart.toISOString())
          .lt('contact_createdate', dayEnd.toISOString())
      ).then(count => ({ date: dayStart.toISOString().slice(0, 10), count }))
    })),

    // Leads par origine / statut / classe : RPC qui font le GROUP BY côté DB
    // (PostgREST plafonne à 1000 rows, donc l'agrégat JS était sous-évalué)
    db.rpc('dashboard_leads_by_source_30d'),
    db.rpc('dashboard_leads_by_stage'),
    db.rpc('dashboard_leads_by_class_30d'),

    // Deals
    awaitCount(db.from('crm_deals').select('*', { count: 'exact', head: true }).not('dealstage', 'in', '(closedwon,closedlost)')),
    awaitCount(db.from('crm_deals').select('*', { count: 'exact', head: true })
      .eq('dealstage', 'closedwon')
      .gte('closedate', monthStart.toISOString())),

    // Tasks
    awaitCount(db.from('crm_tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending').lt('due_at', todayStart.toISOString())),
    awaitCount(db.from('crm_tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending').gte('due_at', todayStart.toISOString()).lt('due_at', tomorrowStart.toISOString())),
    awaitCount(db.from('crm_tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending').gte('due_at', todayStart.toISOString()).lt('due_at', new Date(todayStart.getTime() + 7 * 86_400_000).toISOString())),

    // Workflows
    awaitCount(db.from('crm_workflows').select('*', { count: 'exact', head: true }).eq('status', 'active')),
    awaitCount(db.from('crm_workflow_executions').select('*', { count: 'exact', head: true }).in('status', ['running', 'waiting'])),

    // Top owners par nb leads 30j (RPC GROUP BY côté DB)
    db.rpc('dashboard_top_owners_30d'),

    // Dernières soumissions de formulaire
    db.from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, recent_conversion_event, recent_conversion_date, hs_lead_status, hubspot_owner_id')
      .not('recent_conversion_date', 'is', null)
      .order('recent_conversion_date', { ascending: false })
      .limit(10),
  ])

  // Leads sparkline : déjà sous forme [{ date, count }] grâce aux 30 counts en parallèle
  const dailySeries = leadsSeries as Array<{ date: string; count: number }>

  // Les RPC renvoient déjà des { label, count } / { owner_id, count } dédupliqués + triés
  const topSources = ((leadsBySource.data ?? []) as Array<{ label: string; count: number }>)
    .map(r => ({ label: r.label, count: Number(r.count) }))
  const topStages = ((leadsByStage.data ?? []) as Array<{ label: string; count: number }>)
    .map(r => ({ label: r.label, count: Number(r.count) }))
  const classCounts: Record<string, number> = {}
  for (const r of ((leadsByClass.data ?? []) as Array<{ label: string; count: number }>)) {
    classCounts[r.label] = Number(r.count)
  }

  // Top owners : on enrichit avec les noms via crm_owners
  const ownerRows = ((topOwners.data ?? []) as Array<{ owner_id: string; count: number }>)
  const ownerIds = ownerRows.map(o => o.owner_id)
  let ownersInfo: Array<{ hubspot_owner_id: string; firstname: string | null; lastname: string | null; email: string | null }> = []
  if (ownerIds.length > 0) {
    const { data } = await db.from('crm_owners')
      .select('hubspot_owner_id, firstname, lastname, email')
      .in('hubspot_owner_id', ownerIds)
    ownersInfo = (data ?? []) as typeof ownersInfo
  }
  const topOwnersPayload = ownerRows.map(({ owner_id, count }) => {
    const o = ownersInfo.find(x => x.hubspot_owner_id === owner_id)
    const name = o ? [o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || owner_id : owner_id
    return { owner_id, name, count: Number(count) }
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
