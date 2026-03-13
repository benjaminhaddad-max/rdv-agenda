import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase'

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const appointmentId = formData.get('appointmentId') as string | null

    if (!audioFile || !appointmentId) {
      return NextResponse.json({ error: 'Missing audio or appointmentId' }, { status: 400 })
    }

    if (!DEEPGRAM_API_KEY) {
      return NextResponse.json({ error: 'DEEPGRAM_API_KEY not configured' }, { status: 500 })
    }

    // ── Step 1: Transcribe with Deepgram ──────────────────────────────
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

    const dgResponse = await fetch(
      'https://api.deepgram.com/v1/listen?language=fr&model=nova-2&smart_format=true&punctuate=true&diarize=true&paragraphs=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': audioFile.type || 'audio/webm',
        },
        body: audioBuffer,
      }
    )

    if (!dgResponse.ok) {
      const err = await dgResponse.text()
      console.error('Deepgram error:', err)
      return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
    }

    const dgData = await dgResponse.json()
    const transcript =
      dgData.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript ||
      dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      ''

    if (!transcript || transcript.trim().length < 20) {
      return NextResponse.json(
        { error: 'Transcript too short or empty', transcript },
        { status: 422 }
      )
    }

    // ── Step 2: Generate report with Claude ───────────────────────────
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Tu es un assistant qui analyse des rendez-vous commerciaux pour Diploma Santé (école de santé). Voici la transcription d'un RDV entre un closer et un prospect.

TRANSCRIPTION :
${transcript}

Génère deux champs au format JSON strict (pas de markdown, pas de \`\`\`, juste le JSON) :

{
  "report_summary": "Un résumé structuré du RDV en 3-6 phrases : contexte du prospect, points clés abordés, objections ou freins identifiés, niveau d'intérêt, et prochaines étapes convenues.",
  "report_telepro_advice": "Un conseil concis (1-3 phrases) pour le télépro qui a placé ce RDV : ce qui a bien fonctionné dans le profil/timing, et ce qu'il pourrait améliorer pour les prochains placements similaires."
}`,
        },
      ],
    })

    const aiText =
      message.content[0].type === 'text' ? message.content[0].text : ''

    let report: { report_summary: string; report_telepro_advice: string }
    try {
      report = JSON.parse(aiText)
    } catch {
      // Fallback: use raw text as summary
      report = {
        report_summary: aiText.slice(0, 1000),
        report_telepro_advice: '',
      }
    }

    // ── Step 3: Save to database ──────────────────────────────────────
    const db = createServiceClient()
    await db
      .from('rdv_appointments')
      .update({
        report_summary: report.report_summary,
        report_telepro_advice: report.report_telepro_advice,
      })
      .eq('id', appointmentId)

    return NextResponse.json({
      report_summary: report.report_summary,
      report_telepro_advice: report.report_telepro_advice,
      transcript_length: transcript.length,
    })
  } catch (err) {
    console.error('transcribe-meeting error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
