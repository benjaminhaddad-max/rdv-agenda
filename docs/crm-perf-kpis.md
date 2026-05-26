# CRM Perf KPIs (avant / après)

## KPIs utilisateur

- Temps d'affichage initial de la liste CRM (objectif: -30%)
- Temps pour appliquer un filtre (objectif: < 800 ms perçu)
- Fluidité du scroll sur 100+ lignes (objectif: pas de saccade visible)
- Temps API affiché dans l'UI CRM (badge `API ...ms`) pour validation rapide

## KPIs API

- `GET /api/crm/dashboard/stats` temps serveur (header `X-Response-Time-Ms`)
- `POST /api/crm/views/counts` temps serveur (header `X-Response-Time-Ms`)
- `GET /api/crm/contacts` temps serveur (header `X-Response-Time-Ms`)
- Nombre de requêtes déclenchées lors d'un changement de filtre

## KPIs charge

- Nombre moyen d'appels `/api/crm/views/counts` par session
- Nombre d'appels redondants au chargement CRM
- Taille moyenne payload `contacts` et temps de réponse perçu

## Méthode de suivi simple

1. Mesurer sur un compte réel avec DevTools (Network + Performance)
2. Noter 3 scénarios : ouverture page, filtre rapide, navigation views
3. Comparer avant/après sur les mêmes scénarios
