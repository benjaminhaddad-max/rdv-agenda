import { redirect } from 'next/navigation'
import { COLD_CALL_VIEW_ID } from '@/lib/crm-views'

/** La réattribution est une vue du tableau Contacts (« À réattribuer »). */
export default function ReattributionRedirect() {
  redirect(`/admin/crm?view_id=${COLD_CALL_VIEW_ID}`)
}
