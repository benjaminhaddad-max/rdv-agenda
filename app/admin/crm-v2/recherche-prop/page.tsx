import { redirect } from 'next/navigation'

/** Fusionnée dans Propriétés : la recherche de contacts se fait depuis la fiche d'une propriété. */
export default function RecherchePropPage() {
  redirect('/admin/crm-v2/proprietes')
}
