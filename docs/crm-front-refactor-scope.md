# CRM Front Refactor Scope (Perf + Usage)

## Ce qui est déjà fait dans ce passage

- suppression de code mort côté filtrage client dans `app/admin/crm/page.tsx`
- mémoïsation des options owners/closers/télépros pour éviter des recalculs inutiles
- correction de clé React sur les lignes de table dans `components/CRMContactsTable.tsx`
- chargement des compteurs de vues en 2 temps (vue active d'abord, puis full)
- rendu progressif de la table (chunks) pour réduire le temps du premier affichage

## Prochain découpage (sans changer le métier)

1. Extraire `useCrmContactsList` (fetch + pagination + cache + loading)
2. Extraire `useCrmReferenceData` (owners, users, pipelines, field options)
3. Isoler la barre de filtres et le panneau avancé dans des composants dédiés
4. Ajouter virtualisation lignes pour les très grandes listes
5. Synchroniser proprement les filtres dans l'URL (partage de vue)

## Règle de sécurité fonctionnelle du refactor

- ne pas changer les paramètres API existants
- ne pas changer les règles de filtrage métier
- ne pas changer le comportement des actions en masse
