# Translations

Players can read names, descriptions and notifications in their own language. You write each text once in your project's language, then add translations for the languages you support. A player sees a translation when one exists for their language, and your original text otherwise.

Translations are a feature the platform administrator can turn off for an organization.

## What can be translated

| Kind | Fields |
| --- | --- |
| Achievements, challenges, store rewards, mystery boxes, season passes, shared goals, journeys, cosmetics | Name and description |
| Levels, streaks, currencies, teams, items in a box | Name |
| Notifications | Title and message, per notification type |

Manage them under **Translations** in the dashboard: add a language by its tag, such as `fr` or `pt-BR`, and fill in what you want translated. Anything left empty shows the original.

## Which language a player gets

For every `/v1/me` request, the first of these that is set decides:

1. `?locale=pt-BR` on the request.
2. The language saved on the player.
3. The browser's `Accept-Language` header. Browsers send this by themselves, so a site needs no code for it.

A regional language falls back to the plain one: a player asking for `pt-BR` gets `pt-BR` text where it exists, then `pt`, then the original. Each text falls back by itself, so a half-translated language still shows what it has.

Notifications and emails are written when something happens, not when a page is loaded, so there is no browser to ask. They use the language **saved on the player**. Save it one of three ways:

```ts
// From the player's page. A read-only token is enough.
await gami.me.setLocale('pt-BR');

// From your server, when you create or update the user.
await fetch('https://gami.example.com/v1/users', {
  method: 'POST',
  headers: { 'x-api-key': process.env.GAMI_API_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ externalId: 'user_123', locale: 'pt-BR' }),
});
```

On a server, or to follow your app's own language picker, pass `locale` when you make the client: `new Gami({ endUserToken, locale: 'pt-BR' })`.

## Notification text

A notification translation is a template. Put a value from the notification in double braces:

| Type | Standard text | Values you can use |
| --- | --- | --- |
| `xp_awarded` | You earned `{{amount}}` XP! | `amount`, `reason`, `totalXp` |
| `achievement_unlocked` | Achievement unlocked: `{{achievementName}}` | `achievementName`, `achievementKey` |
| `level_up` | Congratulations! You reached Level `{{newLevel}}` (`{{levelName}}`). | `newLevel`, `levelName`, `previousLevel` |
| `challenge_completed` | Challenge completed: `{{challengeName}}` | `challengeName`, `challengeKey` |
| `points_expiring` | `{{amount}}` `{{currencyName}}` expire on `{{expiresAt}}`. | `amount`, `currencyName`, `expiresAt` |
| `prize_won` | You won `{{prizes}}`. | `title`, `prizes` |

Names inside a notification are translated too. With a Portuguese name for the achievement and the message `Você ganhou {{achievementName}}.`, a player whose language is `pt-BR` reads "Você ganhou Primeira lição."

When you have written a notification's text for a language, the email for that notification uses your title and message in a plain layout. Without one, the email keeps its standard English layout, with the names inside it translated.

## From the API

```bash
# Save texts for one language. An empty value removes that text.
curl -X PUT https://gami.example.com/api/projects/$PROJECT/translations \
  -H "content-type: application/json" -b cookies.txt \
  -d '{ "locale": "pt-BR", "entries": [
        { "type": "achievement", "key": "first_lesson", "field": "name", "value": "Primeira lição" }
      ] }'
```

`GET /api/projects/:projectId/translations?locale=pt-BR` returns the languages a project has, every text that can be translated with its original wording, and what is saved for that language. `DELETE /api/projects/:projectId/translations/:locale` removes a language.

Translations name things by key, so they are part of an organization export and import.

## Limits to know

- **A change can take up to 30 seconds to reach players.** Each API process remembers a language's texts for that long.
- **Stored notifications keep the language they were written in.** Changing a player's language does not rewrite their inbox.
- **Not translated yet:** campaign emails (streak reminders, weekly recaps, win-back), the standard email layout, a league's tier names, a challenge's step names, a `prize_won` list of prizes, and the text inside the React components such as "Loading…".
- **Server routes are not translated.** `/v1/users/:userId/...` answers in the project's own text. Use a player token for translated answers.
- **There is no machine translation.** Every text is one you wrote.
