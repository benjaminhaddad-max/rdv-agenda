import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'

export async function GET() {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const db = createServiceClient()

  const [
    studentsPending,
    studentsLinkSent,
    studentsCompleted,
    contractsDraft,
    contractsPendingSig,
    contractsActive,
    contractsEnded,
    recentStudents,
    recentContracts,
  ] = await Promise.all([
    db.from('alternance_students').select('id', { count: 'exact', head: true }).in('dossier_status', ['pending', 'link_sent']),
    db.from('alternance_students').select('id', { count: 'exact', head: true }).eq('dossier_status', 'link_sent'),
    db.from('alternance_students').select('id', { count: 'exact', head: true }).eq('dossier_status', 'completed'),
    db.from('alternance_contracts').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    db.from('alternance_contracts').select('id', { count: 'exact', head: true }).eq('status', 'pending_signature'),
    db.from('alternance_contracts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('alternance_contracts').select('id', { count: 'exact', head: true }).eq('status', 'ended'),
    db.from('alternance_students').select('*').order('created_at', { ascending: false }).limit(5),
    db.from('alternance_contracts')
      .select('*, company:alternance_companies(raison_sociale), student:alternance_students(nom, prenom)')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return NextResponse.json({
    dossiers_incomplets: (studentsPending.count ?? 0) + (studentsCompleted.count ?? 0),
    etudiants_sans_formulaire: studentsPending.count ?? 0,
    contrats_en_attente: contractsDraft.count ?? 0,
    contrats_a_signer: contractsPendingSig.count ?? 0,
    contrats_en_cours: contractsActive.count ?? 0,
    contrats_termines: contractsEnded.count ?? 0,
    relances_a_faire: studentsLinkSent.count ?? 0,
    recent_students: recentStudents.data ?? [],
    recent_contracts: recentContracts.data ?? [],
  })
}
