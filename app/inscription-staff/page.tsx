import { redirect } from 'next/navigation'

/** Lien court staff : 19 sept. (études de médecine) + 26 sept. (MMOPK). */
export default function InscriptionStaffPage() {
  redirect('/events-studio/?planning=diploma&set=premiers-presentiels')
}
