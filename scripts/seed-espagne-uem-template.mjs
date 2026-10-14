#!/usr/bin/env bun
/**
 * Upsert le modèle email « Études de santé en Espagne - UEM » (Hiba) dans email_templates.
 * Envoyable depuis une fiche contact (QuickActionModal → Email → Modèle).
 * Usage: bun run scripts/seed-espagne-uem-template.mjs
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  try {
    for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i < 0) continue
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* ignore */
  }
}

loadEnv()

const NAME = 'Études de santé en Espagne - UEM'
const SUBJECT = 'Études de santé en Espagne - UEM'
const LINK = 'https://hostudents.com/servicios-legales/informe-tecnico-academico/'

const p = (html) => `<p style="margin:0 0 14px;">${html}</p>`
const ul = (items) =>
  `<ul style="margin:0 0 14px;padding-left:22px;">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join('')}</ul>`
const h = (txt) => `<p style="margin:22px 0 12px;font-weight:bold;">${txt}</p>`

const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;">
${p('Bonjour,')}
${p('Comme convenu voici les informations demandées :')}
${p('<strong>Pour l’Espagne : UNIVERSIDAD EUROPEA</strong>')}
${p('<strong>Campus disponibles :</strong> Madrid, Malaga, Valence, Alicante, Canaries')}
${p('<strong>Filières proposées :</strong> Médecine, Dentaire, Kinésithérapie, Vétérinaire, Orthophonie')}
${p('<strong>Langue d’enseignement :</strong> Anglais ou Espagnol (une seule filière en français : Kinésithérapie, mais pas dans toutes les villes)')}
${p('<strong>Procédure d’inscription :</strong>')}
${h('ÉTAPE 1 : Obtention du Rapport Technique Académique')}
${p('Cette étape est obligatoire et permet d’évaluer votre dossier académique pour l’admission.')}
${p(`<strong>Demande d’évaluation :</strong> Rendez-vous sur le lien suivant et remplissez le formulaire : <a href="${LINK}" style="color:#2563eb;">${LINK}</a>`)}
${p('<strong>Création du compte Homologation Student Service :</strong> Après soumission du formulaire, vous recevrez un email. Cliquez sur le lien du portail, puis sur « Connexion » &gt; « Nouveau sur Homologation Student Service ». Remplissez les informations demandées.')}
${p('<strong>Activation et connexion :</strong> Activez votre compte via l’email reçu et connectez-vous.')}
${p('<strong>Renseignement du dossier :</strong> Remplissez toutes les informations sur le portail :')}
${ul(['Type de service : « Rapport technique académique »', 'Université : « Universidad Europea »', 'Type d’étude : « Licence »'])}
${p('<strong>Paiement :</strong> Après étude de votre demande, réglez les frais d’évaluation de 60€ par carte bancaire.')}
${p('<strong>Réception du rapport :</strong> Vous recevrez votre rapport par email avec une note sur 20. Ce document est indispensable pour la suite.')}
${h('ÉTAPE 2 : Envoi des documents')}
${p('Une fois le rapport académique obtenu, envoyez-moi par mail :')}
${ul(['Le Rapport Technique Académique', 'Vos bulletins de 1ère fusionnés en un seul PDF', 'Votre passeport', 'La ville, la filière et la langue dans laquelle vous souhaitez candidater'])}
${p('Je vérifierai que votre note est cohérente avec votre choix de filière (certaines formations à Madrid exigent un rapport académique élevé).')}
${p('Je reste à votre disposition.')}
${p('Hiba')}
</div>`

const text = `Bonjour,

Comme convenu voici les informations demandées :

Pour l'Espagne : UNIVERSIDAD EUROPEA

Campus disponibles : Madrid, Malaga, Valence, Alicante, Canaries

Filières proposées : Médecine, Dentaire, Kinésithérapie, Vétérinaire, Orthophonie

Langue d'enseignement : Anglais ou Espagnol (une seule filière en français : Kinésithérapie, mais pas dans toutes les villes)

Procédure d'inscription :

ÉTAPE 1 : Obtention du Rapport Technique Académique

Cette étape est obligatoire et permet d'évaluer votre dossier académique pour l'admission.

Demande d'évaluation : Rendez-vous sur le lien suivant et remplissez le formulaire : ${LINK}

Création du compte Homologation Student Service : Après soumission du formulaire, vous recevrez un email. Cliquez sur le lien du portail, puis sur « Connexion » > « Nouveau sur Homologation Student Service ». Remplissez les informations demandées.

Activation et connexion : Activez votre compte via l'email reçu et connectez-vous.

Renseignement du dossier : Remplissez toutes les informations sur le portail :

- Type de service : « Rapport technique académique »
- Université : « Universidad Europea »
- Type d'étude : « Licence »

Paiement : Après étude de votre demande, réglez les frais d'évaluation de 60€ par carte bancaire.

Réception du rapport : Vous recevrez votre rapport par email avec une note sur 20. Ce document est indispensable pour la suite.

ÉTAPE 2 : Envoi des documents

Une fois le rapport académique obtenu, envoyez-moi par mail :

- Le Rapport Technique Académique
- Vos bulletins de 1ère fusionnés en un seul PDF
- Votre passeport
- La ville, la filière et la langue dans laquelle vous souhaitez candidater

Je vérifierai que votre note est cohérente avec votre choix de filière (certaines formations à Madrid exigent un rapport académique élevé).

Je reste à votre disposition.

Hiba`

const payload = {
  name: NAME,
  description: 'Infos Universidad Europea (Espagne) + procédure Rapport Technique Académique — signé Hiba',
  subject: SUBJECT,
  html_body: html,
  text_body: text,
  category: 'general',
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^['"]+|['"]+$/g, '')
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^['"]+|['"]+$/g, '')
if (!supabaseUrl || !supabaseKey) {
  console.error('Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.local')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

const { data: existing, error: findErr } = await db
  .from('email_templates')
  .select('id')
  .eq('name', NAME)
  .limit(1)
if (findErr) {
  console.error(findErr.message)
  process.exit(1)
}

if (existing && existing.length > 0) {
  const { error } = await db.from('email_templates').update(payload).eq('id', existing[0].id)
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  console.log(`Mis à jour : ${NAME} (${existing[0].id})`)
} else {
  const { data, error } = await db.from('email_templates').insert(payload).select('id').single()
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  console.log(`Créé : ${NAME} (${data.id})`)
}
