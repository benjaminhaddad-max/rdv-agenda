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

Tout le monde travaille et pousse directement sur `main`. Workflow à chaque tâche :

```bash
# 1. Avant de toucher un fichier : récupérer le travail du collègue
git pull --rebase --autostash origin main

# 2. Modifier les fichiers

# 3. Juste avant de pousser : re-récupérer, puis pousser tout de suite
git add <fichiers modifiés>
git commit -m "..."
git pull --rebase --autostash origin main
git push origin main
# Push rejeté (collègue a pushé entre-temps) → refaire les 2 dernières lignes
```

- Ne jamais utiliser `git reset --hard` (efface le travail non commité).
- Petits commits, poussés dès qu'une modif marche — ne pas garder de travail local des heures.
- En cas de conflit pendant le rebase : garder les DEUX modifs (la sienne et celle du collègue), jamais écraser le code de l'autre. Gérer ça silencieusement.
- Ne jamais déployer avec `vercel --prod` / `vercel deploy` en local : la prod se déploie uniquement via le push sur `main` (sinon on écrase les commits de l'autre en prod).

## Rôles utilisateurs
- `admin` → `/admin/crm` (page principale)
- `closer` → `/closer/[slug]`
- `telepro` → `/telepro`
