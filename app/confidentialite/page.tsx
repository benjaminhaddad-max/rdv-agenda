import type { Metadata } from 'next'
import Link from 'next/link'

// Page publique (hors auth, voir middleware.ts) — URL de politique de
// confidentialité déclarée dans App Store Connect / Play Console pour l'app
// Hub Diploma. Toute modif de fond doit rester cohérente avec la section
// « Confidentialité de l'app » d'App Store Connect (docs/app-store-hub-diploma.md).

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Hub Diploma',
  description: 'Données traitées par Hub Diploma, l’outil interne de Diploma Santé.',
}

const UPDATED = '8 octobre 2026'

export default function ConfidentialitePage() {
  return (
    <main className="min-h-screen bg-[#f5f8fa] px-4 py-10 text-[#2d3e50] sm:py-16">
      <article className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dfe3eb] sm:p-10">
        <header className="mb-8 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-hub-diploma-mark.png" alt="" width={40} height={40} className="rounded-lg" />
          <div>
            <h1 className="text-2xl font-semibold text-[#12314D]">Politique de confidentialité</h1>
            <p className="text-sm text-[#516f90]">Hub Diploma · dernière mise à jour : {UPDATED}</p>
          </div>
        </header>

        <div className="space-y-6 text-[15px] leading-relaxed">
          <p>
            Hub Diploma est l’outil interne de gestion de la relation (CRM) et des rendez-vous de
            Diploma Santé. Il est réservé aux collaborateurs de Diploma Santé (administration,
            conseillers, télé-prospecteurs) disposant d’un compte créé par l’établissement. Le
            responsable de traitement est <strong>Diploma Santé</strong>.
          </p>

          <Section title="Données traitées">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Compte collaborateur</strong> — nom, prénom, adresse e-mail professionnelle,
                rôle et rattachement. Sert à l’authentification et aux droits d’accès.
              </li>
              <li>
                <strong>Fiches contacts</strong> (élèves, familles, candidats) — coordonnées,
                informations de scolarité et d’orientation, historique des échanges, rendez-vous et
                notes saisies par les collaborateurs. Sert au suivi des demandes d’information et
                des inscriptions.
              </li>
              <li>
                <strong>Activité dans l’outil</strong> — actions réalisées (création, modification,
                appels, rendez-vous), journaux techniques et d’erreurs. Sert à la sécurité, à la
                traçabilité et au support.
              </li>
              <li>
                <strong>Audio et vidéo</strong> — uniquement pendant un rendez-vous en visio lancé
                par l’utilisateur ; la caméra et le micro ne sont jamais activés sans action de sa
                part.
              </li>
            </ul>
          </Section>

          <Section title="Ce que nous ne faisons pas">
            <p>
              Hub Diploma ne contient aucune publicité, aucun traceur publicitaire, aucun suivi
              entre applications ou sites tiers. Les données ne sont ni vendues ni partagées à des
              fins commerciales.
            </p>
          </Section>

          <Section title="Hébergement et sous-traitants">
            <p>
              Les données sont hébergées dans l’Union européenne ou chez des prestataires
              présentant des garanties conformes au RGPD, qui agissent uniquement sur nos
              instructions : Supabase (base de données et authentification), Vercel (hébergement
              de l’application), HubSpot (CRM), Aircall (téléphonie), Brevo et SMSFactor (e-mails
              et SMS), LiveKit (visio), Google Workspace (agenda).
            </p>
          </Section>

          <Section title="Conservation">
            <p>
              Les comptes collaborateurs sont supprimés à la fin de la collaboration. Les fiches
              contacts sont conservées pendant la durée nécessaire au suivi de l’inscription puis
              au maximum 3 ans après le dernier contact, conformément aux recommandations de la
              CNIL en matière de prospection.
            </p>
          </Section>

          <Section title="Vos droits">
            <p>
              Conformément au RGPD, vous disposez d’un droit d’accès, de rectification,
              d’effacement, de limitation et d’opposition sur vos données, ainsi que du droit
              d’introduire une réclamation auprès de la CNIL. Pour les exercer, ou pour demander la
              suppression d’un compte collaborateur, écrivez-nous à l’adresse ci-dessous.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Diploma Santé — <a className="text-[#0091ae] underline" href="mailto:contact@diploma-sante.fr">contact@diploma-sante.fr</a>
            </p>
          </Section>
        </div>

        <footer className="mt-10 border-t border-[#dfe3eb] pt-6 text-sm">
          <Link href="/assistance" className="text-[#0091ae] underline">Assistance</Link>
          <span className="mx-2 text-[#cbd6e2]">·</span>
          <Link href="/login" className="text-[#0091ae] underline">Se connecter</Link>
        </footer>
      </article>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-[#12314D]">{title}</h2>
      {children}
    </section>
  )
}
