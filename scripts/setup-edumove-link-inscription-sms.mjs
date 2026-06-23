#!/usr/bin/env node
/**
 * Active le SMS auto Edumove après soumission du form « Inscription Link ».
 *
 *   node scripts/setup-edumove-link-inscription-sms.mjs
 */

import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const src = readFileSync('.env.local', 'utf8')
    for (const raw of src.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i < 0) continue
      const key = line.slice(0, i).trim()
      let val = line.slice(i + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = val
    }
  } catch { /* ignore */ }
}

loadEnvLocal()

async function main() {
  const { ensureEdumoveLinkInscriptionSmsWorkflowActive } = await import('../lib/edumove-link-inscription-sms.ts')
  const result = await ensureEdumoveLinkInscriptionSmsWorkflowActive()
  console.log('[edumove-link-inscription] Workflow actif:', JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
