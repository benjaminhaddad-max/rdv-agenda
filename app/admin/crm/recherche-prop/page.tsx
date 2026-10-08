import { redirect } from 'next/navigation'

/** Les propriétés sont désormais un onglet de Paramètres (recherche de contacts incluse dans la fiche). */
export default function Page() {
  redirect('/admin/crm-v2/parametres?tab=proprietes')
}
