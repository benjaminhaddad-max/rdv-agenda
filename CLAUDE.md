# RDV Agenda — Instructions pour Claude / Cursor

## Stack
- Next.js (App Router), React, TypeScript
- Supabase (PostgreSQL + Auth)
- HubSpot API
- Tailwind CSS v4
- **Runtime : Bun** — toujours utiliser `bun run ...` (jamais npm/yarn)
- date-fns (fr), lucide-react

## Règle Git OBLIGATOIRE — à suivre sans exception

Deux développeurs travaillent sur ce repo depuis deux machines différentes, avec le même compte GitHub. Des commits peuvent arriver à tout moment sur `main`.

**Avant de modifier le moindre fichier, toujours exécuter :**
```bash
git fetch && git reset --hard origin/main
```

**Workflow complet à chaque tâche :**
```bash
# 1. Partir de la dernière version remote
git fetch && git reset --hard origin/main

# 2. Modifier les fichiers

# 3. Committer et pusher
git add <fichiers modifiés>
git commit -m "..."
git push origin main

# 4. Si le push est rejeté (collègue a pushé entre-temps) :
git pull --rebase origin main
git push origin main
```

Ne jamais committer sur une base locale potentiellement obsolète. Ne jamais mentionner les conflits à l'utilisateur — les gérer silencieusement.

## Rôles utilisateurs
- `admin` → `/admin/crm` (page principale)
- `closer` → `/closer/[slug]`
- `telepro` → `/telepro`
