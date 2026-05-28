#!/usr/bin/env python3
"""
One-shot import from HubSpot CSV exports (contacts + deals).

Business rule:
- only update deals in pipeline 2026-2027
- only for these phases:
  - A REPLANIFIER
  - RDV DECOUVERTE PRIS
  - DELAI DE REFLEXION
- other phases are untouched
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set


DEFAULT_CONTACTS_CSV = "scripts/imports/hubspot-2026-05-28/contacts/tous-les-contacts.csv"
DEFAULT_DEALS_CSV = "scripts/imports/hubspot-2026-05-28/transactions/tous-les-transactions.csv"


def load_env_local(path: Path) -> None:
  if not path.exists():
    return
  for raw in path.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#"):
      continue
    if "=" not in line:
      continue
    k, v = line.split("=", 1)
    k = k.strip()
    v = v.strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
      v = v[1:-1]
    os.environ.setdefault(k, v)


def normalize(text: str) -> str:
  base = unicodedata.normalize("NFKD", text or "")
  base = "".join(ch for ch in base if not unicodedata.combining(ch))
  return base.lower().strip()


def parse_hs_datetime(raw: str) -> Optional[str]:
  s = (raw or "").strip()
  if not s:
    return None
  for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
    try:
      dt = datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
      return dt.isoformat().replace("+00:00", "Z")
    except ValueError:
      pass
  return None


def chunked(items: List[dict], size: int) -> Iterable[List[dict]]:
  for i in range(0, len(items), size):
    yield items[i : i + size]


def looks_owner_id(v: str) -> Optional[str]:
  s = (v or "").strip()
  if not s:
    return None
  return s


def map_stage_id(phase_label: str, env: dict) -> Optional[str]:
  n = normalize(phase_label)
  if "replanifier" in n:
    return env["HUBSPOT_STAGE_A_REPLANIFIER"]
  if "rdv" in n and "decouverte" in n and "pris" in n:
    return env["HUBSPOT_STAGE_RDV_PRIS"]
  if "delai" in n and "reflexion" in n:
    return env["HUBSPOT_STAGE_DELAI_REFLEXION"]
  return None


def in_pipeline_2026(pipeline_label: str) -> bool:
  return "2026-2027" in (pipeline_label or "")


@dataclass
class EnvConfig:
  supabase_url: str
  service_key: str
  pipeline_id_2026: str
  stage_a_replanifier: str
  stage_rdv_pris: str
  stage_delai_reflexion: str


class PostgrestClient:
  def __init__(self, base_url: str, service_key: str, timeout_s: int = 20, retries: int = 40):
    self.base_url = base_url.rstrip("/")
    self.service_key = service_key
    self.timeout_s = timeout_s
    self.retries = retries

  def upsert_rows(self, table: str, rows: List[dict], conflict_key: str) -> None:
    if not rows:
      return
    qs = urllib.parse.urlencode({"on_conflict": conflict_key})
    url = f"{self.base_url}/rest/v1/{table}?{qs}"
    data = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    headers = {
      "apikey": self.service_key,
      "Authorization": f"Bearer {self.service_key}",
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    for attempt in range(self.retries):
      req = urllib.request.Request(url, data=data, headers=headers, method="POST")
      try:
        with urllib.request.urlopen(req, timeout=self.timeout_s):
          return
      except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        retryable = e.code in (408, 409, 425, 429, 500, 502, 503, 504, 522, 524)
        if retryable and attempt < self.retries - 1:
          time.sleep(min(30, 2 ** min(attempt, 5)))
          continue
        raise RuntimeError(f"HTTP {e.code} upsert {table}: {body[:500]}")
      except Exception as e:  # noqa: BLE001
        msg = str(e)
        retryable = any(k in msg.lower() for k in ["timed out", "timeout", "522", "fetch failed", "connection reset"])
        if retryable and attempt < self.retries - 1:
          time.sleep(min(30, 2 ** min(attempt, 5)))
          continue
        raise RuntimeError(f"upsert {table} failed: {msg}")


def require_env() -> EnvConfig:
  required = {
    "NEXT_PUBLIC_SUPABASE_URL": os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip().strip('"'),
    "SUPABASE_SERVICE_ROLE_KEY": os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip('"'),
    "HUBSPOT_PIPELINE_ID": os.environ.get("HUBSPOT_PIPELINE_ID", "2313043166").strip().strip('"'),
    "HUBSPOT_STAGE_A_REPLANIFIER": os.environ.get("HUBSPOT_STAGE_A_REPLANIFIER", "3165428979").strip().strip('"'),
    "HUBSPOT_STAGE_RDV_PRIS": os.environ.get("HUBSPOT_STAGE_RDV_PRIS", "3165428980").strip().strip('"'),
    "HUBSPOT_STAGE_DELAI_REFLEXION": os.environ.get("HUBSPOT_STAGE_DELAI_REFLEXION", "3165428981").strip().strip('"'),
  }
  missing = [k for k, v in required.items() if not v]
  if missing:
    raise RuntimeError(f"Missing env vars: {', '.join(missing)}")
  return EnvConfig(
    supabase_url=required["NEXT_PUBLIC_SUPABASE_URL"],
    service_key=required["SUPABASE_SERVICE_ROLE_KEY"],
    pipeline_id_2026=required["HUBSPOT_PIPELINE_ID"],
    stage_a_replanifier=required["HUBSPOT_STAGE_A_REPLANIFIER"],
    stage_rdv_pris=required["HUBSPOT_STAGE_RDV_PRIS"],
    stage_delai_reflexion=required["HUBSPOT_STAGE_DELAI_REFLEXION"],
  )


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--contacts", default=DEFAULT_CONTACTS_CSV)
  parser.add_argument("--deals", default=DEFAULT_DEALS_CSV)
  parser.add_argument("--execute", action="store_true")
  parser.add_argument("--batch-size", type=int, default=20)
  parser.add_argument("--retries", type=int, default=40)
  parser.add_argument("--timeout-s", type=int, default=20)
  args = parser.parse_args()

  load_env_local(Path(".env.local"))
  env = require_env()
  now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

  stage_env = {
    "HUBSPOT_STAGE_A_REPLANIFIER": env.stage_a_replanifier,
    "HUBSPOT_STAGE_RDV_PRIS": env.stage_rdv_pris,
    "HUBSPOT_STAGE_DELAI_REFLEXION": env.stage_delai_reflexion,
  }

  selected_deals: List[dict] = []
  selected_contact_ids: Set[str] = set()
  phase_stats: Dict[str, int] = {}

  with open(args.deals, newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for r in reader:
      pipeline_label = (r.get("Pipeline") or "").strip()
      if not in_pipeline_2026(pipeline_label):
        continue

      phase_label = (r.get("Phase de la transaction") or "").strip()
      stage_id = map_stage_id(phase_label, stage_env)
      if not stage_id:
        continue

      deal_id = (r.get("ID de fiche d'informations") or "").strip()
      if not deal_id:
        continue

      contact_id = (r.get("Id Hubspot Contact") or "").strip() or None
      if contact_id:
        selected_contact_ids.add(contact_id)

      phase_stats[phase_label] = phase_stats.get(phase_label, 0) + 1

      selected_deals.append({
        "hubspot_deal_id": deal_id,
        "hubspot_contact_id": contact_id,
        "dealname": (r.get("Nom de la transaction") or "").strip() or None,
        "dealstage": stage_id,
        "pipeline": env.pipeline_id_2026,
        "hubspot_owner_id": looks_owner_id((r.get("Collaborateur de transaction") or "")),
        "teleprospecteur": ((r.get("Téléprospecteur") or "").strip() or None),
        "formation": (r.get("Diploma Santé - Formation") or "").strip() or None,
        "closedate": parse_hs_datetime(r.get("Date de fermeture") or ""),
        "createdate": parse_hs_datetime(r.get("Date de création") or ""),
        "description": (r.get("Description de la transaction") or "").strip() or None,
        "synced_at": now_iso,
      })

  selected_contacts: List[dict] = []
  if selected_contact_ids:
    with open(args.contacts, newline="", encoding="utf-8-sig") as f:
      reader = csv.DictReader(f)
      for r in reader:
        cid = (r.get("ID de fiche d'informations") or "").strip()
        if not cid or cid not in selected_contact_ids:
          continue
        selected_contacts.append({
          "hubspot_contact_id": cid,
          "firstname": (r.get("Prénom") or "").strip() or None,
          "lastname": (r.get("Nom") or "").strip() or None,
          "email": (r.get("E-mail") or "").strip() or None,
          "phone": (r.get("Numéro de téléphone") or "").strip() or None,
          "departement": (r.get("Département") or "").strip() or None,
          "classe_actuelle": (r.get("Classe actuelle") or "").strip() or None,
          "zone_localite": (r.get("Zone / Localité") or "").strip() or None,
          "hubspot_owner_id": (r.get("Propriétaire du contact") or "").strip() or None,
          "formation_demandee": (r.get("Diploma Santé - Formation demandée") or "").strip() or None,
          "synced_at": now_iso,
        })

  print(json.dumps({
    "mode": "execute" if args.execute else "dry-run",
    "deals_selected": len(selected_deals),
    "contacts_selected": len(selected_contacts),
    "distinct_contact_ids_from_deals": len(selected_contact_ids),
    "phase_breakdown": phase_stats,
    "pipeline_target": env.pipeline_id_2026,
  }, ensure_ascii=False, indent=2))

  if not args.execute:
    return

  client = PostgrestClient(
    env.supabase_url,
    env.service_key,
    timeout_s=max(5, args.timeout_s),
    retries=max(1, args.retries),
  )

  contact_upserted = 0
  total_contact_chunks = (len(selected_contacts) + args.batch_size - 1) // args.batch_size if selected_contacts else 0
  for idx, chunk in enumerate(chunked(selected_contacts, args.batch_size), start=1):
    print(json.dumps({"step": "contacts", "chunk": idx, "total_chunks": total_contact_chunks, "rows": len(chunk)}, ensure_ascii=False))
    client.upsert_rows("crm_contacts", chunk, "hubspot_contact_id")
    contact_upserted += len(chunk)

  deals_upserted = 0
  total_deal_chunks = (len(selected_deals) + args.batch_size - 1) // args.batch_size if selected_deals else 0
  for idx, chunk in enumerate(chunked(selected_deals, args.batch_size), start=1):
    print(json.dumps({"step": "deals", "chunk": idx, "total_chunks": total_deal_chunks, "rows": len(chunk)}, ensure_ascii=False))
    client.upsert_rows("crm_deals", chunk, "hubspot_deal_id")
    deals_upserted += len(chunk)

  print(json.dumps({
    "ok": True,
    "contacts_upserted": contact_upserted,
    "deals_upserted": deals_upserted,
  }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
