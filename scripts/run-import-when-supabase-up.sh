#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

probe_code() {
  node -e "const fs=require('fs');const src=fs.readFileSync('.env.local','utf8');const env={};for(const raw of src.split(/\r?\n/)){const l=raw.trim();if(!l||l.startsWith('#'))continue;const i=l.indexOf('=');if(i<0)continue;const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();v=v.replace(/^['\\\"]+|['\\\"]+$/g,'');env[k]=v;} const base=(env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/^['\\\"]+|['\\\"]+$/g,'');const key=(env.SUPABASE_SERVICE_ROLE_KEY||'').replace(/^['\\\"]+|['\\\"]+$/g,'');fetch(base+'/rest/v1/crm_contacts?select=hubspot_contact_id&limit=1',{headers:{apikey:key,Authorization:'Bearer '+key}}).then(r=>{console.log(String(r.status));}).catch(()=>{console.log('000');});"
}

echo "[import-waiter] started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
while true; do
  code="$(probe_code)"
  echo "[import-waiter] $(date -u +%Y-%m-%dT%H:%M:%SZ) supabase_http=$code"

  if [[ "$code" == "000" || "$code" == "521" || "$code" == "522" || "$code" == "524" ]]; then
    sleep 60
    continue
  fi

  echo "[import-waiter] supabase reachable, running import..."
  set +e
  PYTHONUNBUFFERED=1 python3 scripts/import-hubspot-exports-2026.py --execute --batch-size 10 --retries 60 --timeout-s 15
  import_exit=$?
  set -e

  if [[ $import_exit -eq 0 ]]; then
    echo "[import-waiter] import finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    break
  fi

  echo "[import-waiter] import failed (exit=$import_exit), retrying in 60s..."
  sleep 60
done
