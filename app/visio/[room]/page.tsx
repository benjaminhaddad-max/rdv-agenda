/**
 * Page de visioconférence — /visio/[room]
 *
 * Affiche un formulaire "ton nom" en première intention (comme Jitsi), puis
 * connecte automatiquement à la room LiveKit avec micro/caméra activés.
 *
 * Aucune authentification — la room name (12 chars aléatoires) est le secret.
 */

import { Metadata } from 'next'
import VisioRoom from './VisioRoom'

interface PageProps {
  params: Promise<{ room: string }>
}

export const metadata: Metadata = {
  title: 'Rendez-vous visio — Diploma Santé',
  description: 'Rendez-vous en visioconférence',
}

export default async function VisioPage({ params }: PageProps) {
  const { room } = await params
  return <VisioRoom roomName={room} />
}
