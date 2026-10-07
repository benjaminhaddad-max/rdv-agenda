import { redirect } from 'next/navigation'
import { LAB_CALLBACK_VIEW_ID } from '@/lib/crm-views'

/** Les demandes de rappel Lab sont une vue du tableau Contacts. */
export default function RappelsLabRedirectV2() {
  redirect(`/admin/crm-v2?view_id=${LAB_CALLBACK_VIEW_ID}`)
}
