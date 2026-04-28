import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/workflows/generate-ai
 *
 * Body : { description: string }
 *
 * Génère un workflow complet à partir d'une description en langage naturel.
 * Utilise Claude Opus 4.6 avec adaptive thinking + JSON structuré.
 *
 * Le workflow est créé en base en status='draft' et l'ID est renvoyé.
 */

const anthropic = new Anthropic()

// Schéma JSON décrit dans le prompt système. On valide manuellement à la
// réception (la réponse de Claude n'est pas parfaite à 100%, on défensif).
const SYSTEM_PROMPT = `Tu es un expert CRM qui aide à concevoir des workflows d'automatisation pour Diploma Santé (école santé : PASS, LAS, médecine, dentaire, kiné, etc.).

Tu dois transformer une description en français en un workflow JSON structuré.

# Structure de sortie

Renvoie UNIQUEMENT un JSON valide (pas de markdown, pas d'explication), avec ce format exact :

{
  "name": "Nom court du workflow",
  "description": "Description interne 1-2 phrases",
  "trigger_type": "form_submitted" | "property_changed" | "contact_created" | "manual",
  "trigger_config": { ... },
  "steps": [ { "step_type": "...", "config": { ... }, "label": "..." } ]
}

# Types de trigger disponibles

- "form_submitted" : déclenche quand un formulaire est soumis. trigger_config = { form_slug?: string }. Si aucun form spécifique, laisser config vide.
- "property_changed" : déclenche quand une propriété change. trigger_config = { property: "hs_lead_status", to?: "Pré-inscrit" }
- "contact_created" : déclenche quand un contact est créé. trigger_config = {}
- "manual" : déclenchement manuel uniquement. trigger_config = {}

# Types de step disponibles

1. "send_email" — Envoie un email.
   config: { subject: string, html: string, reply_to?: string }
   Variables disponibles dans subject/html : {{prenom}}, {{nom}}, {{email}}, {{classe}}
   Le HTML doit être propre, responsive, charte Diploma Santé (bleu #2ea3f2 → #0038f0, gold #ccac71).

2. "send_sms" — Envoie un SMS via SMS Factor.
   config: { sender: string, text: string }
   sender : "DiploSante", "Diploma", "PrepaMed", "Edumove", "PASS-LAS" (max 11 chars alphanumériques)
   text : court (idéalement < 130 chars = 2 segments). Variables idem email.

3. "create_task" — Crée une tâche pour le commercial.
   config: { title: string, description?: string, priority?: "low"|"normal"|"high"|"urgent", task_type?: "call_back"|"follow_up"|"email"|"meeting"|"other", due_in_minutes?: number }

4. "wait" — Attend une durée fixe.
   config: { duration_minutes: number, unit: "minute"|"hour"|"day" }
   Note : duration_minutes doit être en MINUTES (ex : 1 jour = 1440, 1h = 60). unit est juste un hint UI.

5. "wait_until" — Attend jusqu'à une heure précise.
   config: { until_hour: number (0-23), until_minute: number (0-59), day_offset: number (0=aujourd'hui ou demain si passé, 1=demain, etc.) }

6. "update_property" — Modifie une propriété du contact.
   config: { property: string, value: string }
   Propriétés courantes : hs_lead_status, classe_actuelle, formation_souhaitee, origine

7. "webhook" — Appelle une URL externe.
   config: { url: string, method: "POST"|"GET"|"PUT"|"PATCH" }

# Règles importantes

- Les emails doivent avoir un sujet ET un html non vides.
- Préfère wait_until pour les délais > 12h (envoyer à 9h le lendemain plutôt qu'à 3h du matin).
- Utilise les variables {{prenom}} pour personnaliser.
- Les tâches doivent avoir un title clair et un task_type pertinent.
- Pour les SMS de relance, utilise un sender adapté.
- Garde les workflows simples : 3 à 8 étapes max.
- Ne renvoie JAMAIS de markdown, de commentaires JS/JSON, de texte avant/après le JSON.

# Exemple

Description : "Quand un lycéen remplit le form Bienvenue, lui envoyer un email de bienvenue, attendre 1 jour, lui envoyer un SMS pour proposer un RDV, attendre 2 jours, créer une tâche au commercial pour rappeler s'il n'a pas pris RDV"

Sortie attendue :
{
  "name": "Bienvenue lycéen → SMS J+1 → RDV J+3",
  "description": "Séquence de bienvenue avec relance SMS et tâche commercial",
  "trigger_type": "form_submitted",
  "trigger_config": {},
  "steps": [
    { "step_type": "send_email", "config": { "subject": "Bienvenue {{prenom}} chez Diploma Santé", "html": "<p>Bonjour {{prenom}},</p><p>Merci pour votre inscription...</p>" } },
    { "step_type": "wait_until", "config": { "until_hour": 10, "until_minute": 0, "day_offset": 1 } },
    { "step_type": "send_sms", "config": { "sender": "DiploSante", "text": "Bonjour {{prenom}}, prenez RDV pour votre bilan d'orientation : https://diploma-sante.fr/rdv" } },
    { "step_type": "wait", "config": { "duration_minutes": 2880, "unit": "day" } },
    { "step_type": "create_task", "config": { "title": "Rappeler {{prenom}}", "task_type": "call_back", "priority": "high" } }
  ]
}
`

interface GeneratedStep {
  step_type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>
  label?: string
}

interface GeneratedWorkflow {
  name: string
  description?: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  steps: GeneratedStep[]
}

const ALLOWED_TRIGGERS = ['form_submitted', 'property_changed', 'contact_created', 'manual']
const ALLOWED_STEP_TYPES = ['send_email', 'send_sms', 'create_task', 'wait', 'wait_until', 'update_property', 'webhook']

function validateWorkflow(data: unknown): { ok: true; workflow: GeneratedWorkflow } | { ok: false; error: string } {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Réponse non-objet' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = data as any
  if (typeof w.name !== 'string' || !w.name.trim()) return { ok: false, error: 'name manquant' }
  if (!ALLOWED_TRIGGERS.includes(w.trigger_type)) return { ok: false, error: `trigger_type invalide: ${w.trigger_type}` }
  if (!Array.isArray(w.steps)) return { ok: false, error: 'steps doit être un array' }
  for (const [i, s] of w.steps.entries()) {
    if (!s || typeof s !== 'object') return { ok: false, error: `step ${i} non-objet` }
    if (!ALLOWED_STEP_TYPES.includes(s.step_type)) return { ok: false, error: `step ${i} step_type invalide: ${s.step_type}` }
    if (s.config && typeof s.config !== 'object') return { ok: false, error: `step ${i} config doit être un objet` }
  }
  return {
    ok: true,
    workflow: {
      name: w.name.trim(),
      description: typeof w.description === 'string' ? w.description : undefined,
      trigger_type: w.trigger_type,
      trigger_config: w.trigger_config && typeof w.trigger_config === 'object' ? w.trigger_config : {},
      steps: w.steps.map((s: GeneratedStep) => ({
        step_type: s.step_type,
        config: s.config ?? {},
        label: typeof s.label === 'string' ? s.label : undefined,
      })),
    },
  }
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurée' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const description = String(body.description || '').trim()
  if (!description) {
    return NextResponse.json({ error: 'description requise' }, { status: 400 })
  }
  if (description.length > 2000) {
    return NextResponse.json({ error: 'description trop longue (max 2000 chars)' }, { status: 400 })
  }

  // Appel Claude avec adaptive thinking + streaming pour éviter les timeouts
  let rawText = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },  // Opus 4.6 : adaptive thinking
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Génère le workflow JSON correspondant à cette description :\n\n${description}` },
      ],
    }
    const stream = anthropic.messages.stream(params)
    const final = await stream.finalMessage()
    for (const block of final.content) {
      if (block.type === 'text') rawText += block.text
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur Anthropic inconnue'
    return NextResponse.json({ error: `Génération IA échouée: ${msg}` }, { status: 500 })
  }

  // Parse le JSON. Claude peut parfois rajouter des ```json même si on dit non.
  let cleaned = rawText.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({
      error: 'JSON invalide généré par l\'IA',
      raw_text: rawText.slice(0, 500),
    }, { status: 500 })
  }

  const validation = validateWorkflow(parsed)
  if (!validation.ok) {
    return NextResponse.json({ error: `Workflow invalide: ${validation.error}`, generated: parsed }, { status: 400 })
  }
  const wf = validation.workflow

  // Création en base
  const db = createServiceClient()
  const { data: created, error: createErr } = await db
    .from('crm_workflows')
    .insert({
      name:               wf.name,
      description:        wf.description || `Généré par IA — ${new Date().toLocaleDateString('fr-FR')}`,
      status:             'draft',
      trigger_type:       wf.trigger_type,
      trigger_config:     wf.trigger_config,
      enrollment_filters: {},
      re_enroll:          false,
    })
    .select()
    .single()
  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message || 'Création workflow échouée' }, { status: 500 })
  }

  // Steps
  if (wf.steps.length > 0) {
    const rows = wf.steps.map((s, i) => ({
      workflow_id:     created.id,
      sequence:        i,
      step_type:       s.step_type,
      config:          s.config ?? {},
      label:           s.label ?? null,
      skip_if_filters: {},
    }))
    const { error: stepsErr } = await db.from('crm_workflow_steps').insert(rows)
    if (stepsErr) {
      // Si les steps échouent, on supprime le workflow vide pour pas polluer
      await db.from('crm_workflows').delete().eq('id', created.id)
      return NextResponse.json({ error: `Insertion steps échouée: ${stepsErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok:       true,
    workflow: created,
    steps_count: wf.steps.length,
  })
}
