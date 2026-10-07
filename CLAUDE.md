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

## Coordination automatique Ben / Aaron — `EN-COURS.md`

Le fichier `EN-COURS.md` (racine) dit qui travaille sur quoi en ce moment. Tout se fait **en silence** : ne jamais poser de question à l'utilisateur à ce sujet, ne jamais lui demander d'attendre ou de prévenir l'autre.

1. **Au début d'une tâche qui modifie du code** (après le `git pull`) : lire `EN-COURS.md` + les commits de l'autre des dernières heures (`git log origin/main --since=3.hours --format='%an %ar %s' --stat`).
2. **S'annoncer** : ajouter une ligne `- <Prénom> · <date heure> · <sujet> · <fichiers/dossiers visés>` (prénom = `git config user.name`), commit `chore(en-cours): …` et push immédiat.
3. **Si l'autre est sur les mêmes fichiers** : continuer quand même, mais en faisant attention — commits plus petits et poussés plus souvent, `git pull --rebase --autostash` avant chaque commit, ne jamais réécrire/supprimer son code, garder les deux modifs en cas de conflit. Le signaler en une ligne dans le compte rendu final, sans plus.
4. **À la fin de la tâche** (ou si elle est abandonnée) : retirer sa ligne, commit `chore(en-cours): …`, push.
5. Les lignes de plus de 4 h sont considérées comme périmées : les ignorer et les supprimer au passage.

Les commits qui ne touchent que `EN-COURS.md` ne déclenchent pas de déploiement Vercel (`ignoreCommand` dans `vercel.json`).

## Rôles utilisateurs
- `admin` → `/admin/crm` (page principale)
- `closer` → `/closer/[slug]`
- `telepro` → `/telepro`
