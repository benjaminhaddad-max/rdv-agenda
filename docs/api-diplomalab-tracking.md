# Suivi d'activité Diplomalab → CRM

Chaque action d'un inscrit dans Diplomalab (connexion, exercice terminé, cours consulté…) est envoyée au CRM et apparaît dans **l'activité centrale de sa fiche contact** (onglet « Diplomalab »), regroupée par session, avec l'exercice, la matière, le score et le temps passé.

## Appel à faire

À appeler **depuis le serveur de Diplomalab** (jamais depuis le navigateur : la clé doit rester secrète).

```
POST https://hub.diploma-sante.fr/api/external/app-activity
Authorization: Bearer <DIPLOMALAB_TRACKING_KEY>
Content-Type: application/json
```

Un événement, ou un lot `{ "events": [ ... ] }` (100 max par appel).

```json
{
  "email": "eleve@exemple.fr",
  "event": "exercise_completed",
  "event_id": "attempt-8f3a2",
  "session_id": "sess-2026-10-02-abc",
  "occurred_at": "2026-10-02T09:12:00Z",
  "user_id": "diplomalab-user-123",
  "exercise": { "id": "ex-42", "name": "Cinétique enzymatique", "subject": "Biochimie", "chapter": "Enzymes" },
  "score": 16,
  "max_score": 20,
  "duration_seconds": 640
}
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `email` / `phone` / `contact_id` | au moins un | Retrouve la fiche CRM (l'email utilisé au formulaire d'inscription) |
| `event` | oui | Nom de l'action (liste ci-dessous, ou libre) |
| `event_id` | conseillé | Identifiant unique : un renvoi du même événement est ignoré |
| `session_id` | conseillé | Regroupe les actions d'une même session (sinon : regroupement par jour) |
| `occurred_at` | non | Date ISO 8601, défaut = maintenant |
| `label` | non | Libellé affiché à la place du libellé par défaut |
| `exercise` | non | `id`, `name`, `subject` (matière), `chapter` |
| `score`, `max_score`, `success` | non | Affiché en vert (≥ 50 % ou `success: true`) / rouge |
| `duration_seconds` | non | Temps passé sur l'action |
| `details` | non | Objet de valeurs simples (texte, nombre, booléen) |

### Noms d'événements reconnus

`signup`, `login`, `logout`, `exercise_started`, `exercise_completed`, `exercise_abandoned`, `quiz_started`, `quiz_completed`, `exam_started`, `exam_completed`, `lesson_viewed`, `lesson_completed`, `video_watched`, `document_downloaded`, `flashcards_reviewed`.

Tout autre nom est accepté et affiché tel quel (ou via `label`).

## Réponse

```json
{ "accepted": 1, "rejected": 0, "results": [{ "index": 0, "status": "ok" }] }
```

`status` vaut `ok`, `invalid` (champ manquant) ou `contact_not_found` (aucune fiche CRM avec cet email / téléphone). `401` si la clé est absente ou fausse.

L'envoi ne doit jamais bloquer l'application : appel asynchrone, sans attendre la réponse côté élève, et en ignorant les erreurs.

## Exemple (Node / Next.js)

```ts
export async function trackDiplomalab(event: Record<string, unknown>) {
  fetch('https://hub.diploma-sante.fr/api/external/app-activity', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DIPLOMALAB_TRACKING_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  }).catch(() => {})
}

// À la fin d'un exercice :
trackDiplomalab({
  email: user.email,
  event: 'exercise_completed',
  event_id: attempt.id,
  session_id: session.id,
  exercise: { id: exo.id, name: exo.title, subject: exo.subject },
  score: attempt.score,
  max_score: exo.maxScore,
  duration_seconds: attempt.durationSeconds,
})
```
