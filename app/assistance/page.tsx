import type { Metadata } from 'next'
import Link from 'next/link'

// Page publique (hors auth, voir middleware.ts) — « URL d'assistance »
// déclarée dans App Store Connect pour l'app Hub Diploma.

export const metadata: Metadata = {
  title: 'Assistance — Hub Diploma',
  description: 'Aide et contact pour l’application Hub Diploma.',
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Qui peut utiliser Hub Diploma ?',
    a: 'Hub Diploma est réservé aux collaborateurs de Diploma Santé. Les comptes sont créés par l’administration ; il n’est pas possible de s’inscrire depuis l’application.',
  },
  {
    q: 'J’ai oublié mon mot de passe',
    a: 'Sur l’écran de connexion, utilisez « Mot de passe oublié » : un lien de réinitialisation est envoyé sur votre adresse e-mail professionnelle.',
  },
  {
    q: 'Je n’ai pas encore de compte',
    a: 'Demandez à votre responsable ou à l’administration Diploma Santé de vous créer un accès avec le bon rôle (conseiller, télé-prospecteur, administration).',
  },
  {
    q: 'L’application affiche « Pas de connexion »',
    a: 'Hub Diploma a besoin d’Internet pour afficher les contacts et les rendez-vous. Vérifiez votre réseau Wi-Fi ou 4G/5G puis appuyez sur « Réessayer ».',
  },
  {
    q: 'Supprimer mon compte ou mes données',
    a: 'Écrivez à contact@diploma-sante.fr depuis votre adresse professionnelle : la suppression est effectuée sous 30 jours.',
  },
]

export default function AssistancePage() {
  return (
    <main className="min-h-screen bg-[#f5f8fa] px-4 py-10 text-[#2d3e50] sm:py-16">
      <article className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dfe3eb] sm:p-10">
        <header className="mb-8 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-hub-diploma-mark.png" alt="" width={40} height={40} className="rounded-lg" />
          <div>
            <h1 className="text-2xl font-semibold text-[#12314D]">Assistance Hub Diploma</h1>
            <p className="text-sm text-[#516f90]">L’outil CRM et rendez-vous des équipes Diploma Santé</p>
          </div>
        </header>

        <section className="mb-8 rounded-xl bg-[#e5f5f8] p-5 text-[15px]">
          <h2 className="mb-1 font-semibold text-[#12314D]">Nous contacter</h2>
          <p>
            Une question, un bug ? Écrivez à{' '}
            <a className="font-medium text-[#0091ae] underline" href="mailto:contact@diploma-sante.fr">contact@diploma-sante.fr</a>.
            Les collaborateurs connectés peuvent aussi ouvrir un ticket depuis le menu « Service technique ».
          </p>
        </section>

        <section className="space-y-5 text-[15px] leading-relaxed">
          <h2 className="text-lg font-semibold text-[#12314D]">Questions fréquentes</h2>
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <h3 className="font-semibold">{q}</h3>
              <p className="text-[#516f90]">{a}</p>
            </div>
          ))}
        </section>

        <footer className="mt-10 border-t border-[#dfe3eb] pt-6 text-sm">
          <Link href="/confidentialite" className="text-[#0091ae] underline">Politique de confidentialité</Link>
          <span className="mx-2 text-[#cbd6e2]">·</span>
          <Link href="/login" className="text-[#0091ae] underline">Se connecter</Link>
        </footer>
      </article>
    </main>
  )
}
