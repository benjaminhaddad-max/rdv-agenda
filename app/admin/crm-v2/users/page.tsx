import { redirect } from 'next/navigation'

/** « Utilisateurs » est remplacé par la page Équipe (onglets Télépros / Closers / Admins). */
export default function UsersV2Page() {
  redirect('/admin/crm-v2/equipe?tab=admins')
}
