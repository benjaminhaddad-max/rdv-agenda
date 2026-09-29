import type { Metadata } from 'next'
import PodcastLanding from './PodcastLanding'
import { PODCAST_DURATION, PODCAST_FEE, PODCAST_NAME } from '@/lib/podcast-casting'

const description = `Diploma Santé lance « ${PODCAST_NAME} », le podcast de ceux qui ont vécu la première année de médecine de l’intérieur. Interview de ${PODCAST_DURATION}, rémunérée ${PODCAST_FEE}. Candidatez en 2 minutes.`

export const metadata: Metadata = {
  title: `Podcast « ${PODCAST_NAME} » — Candidature | Diploma Santé`,
  description,
  openGraph: {
    title: `Participez au podcast « ${PODCAST_NAME} »`,
    description,
    type: 'website',
    locale: 'fr_FR',
  },
  robots: { index: false, follow: false },
}

export default function PodcastPage() {
  return <PodcastLanding />
}
