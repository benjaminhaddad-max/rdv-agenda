import { NextResponse } from 'next/server'
import { listBrevoSenders, sendBrevoEmail, BREVO_DEFAULT_SENDER } from '@/lib/brevo'

// GET /api/brevo/test — Vérifie la connectivité Brevo (liste les senders)
export async function GET() {
  try {
    const data = await listBrevoSenders()
    return NextResponse.json({
      ok: true,
      defaultSender: BREVO_DEFAULT_SENDER,
      senders: data.senders,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// POST /api/brevo/test — Envoie un email de test
// Body : { to: "aaron@exemple.com", subject?: "...", html?: "..." }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const to = body.to as string
    if (!to) {
      return NextResponse.json({ error: 'Missing "to" field' }, { status: 400 })
    }

    const result = await sendBrevoEmail({
      subject: body.subject || '✅ Test Brevo depuis le CRM',
      htmlContent:
        body.html ||
        `<h2>Hello 👋</h2><p>Cet email confirme que Brevo est bien configuré sur votre CRM.</p><p><strong>Diploma Santé</strong></p>`,
      to: [{ email: to }],
      tags: ['test'],
    })

    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
