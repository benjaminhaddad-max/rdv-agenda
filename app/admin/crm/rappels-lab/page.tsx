import { redirect } from 'next/navigation'
import { LAB_CALLBACK_VIEW_ID } from '@/lib/crm-views'

/** Ancienne page dédiée : les demandes de rappel Lab sont désormais une vue
 *  (et un filtre avancé) du tableau Contacts. */
export default function RappelsLabRedirect() {
  redirect(`/admin/crm?view_id=${LAB_CALLBACK_VIEW_ID}`)
}
