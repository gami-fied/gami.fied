# React components and live updates

`@gami.fied/react` gives your app ready-made pieces of the gamification screen: a level bar, a badge grid, streaks, a leaderboard, challenges, a notification feed and toasts that pop up the moment something is earned. It is MIT licensed, and every piece is optional.

```bash
npm install @gami.fied/react @gami.fied/sdk
```

## How it connects

Your **server** creates a short-lived token for the signed-in player with an API key. The **browser** uses only that token, which can read that one player's data and nothing else.

```ts
// On your server (never in the browser)
import { Gami } from '@gami.fied/sdk';

declare const currentUser: { id: string };

const gami = new Gami({ apiKey: process.env.GAMI_API_KEY! });
const { token } = await gami.endUserTokens.create({ userId: currentUser.id, expiresInSeconds: 900 });
// send `token` to the page
```

```tsx
// In your React app
import { GamiProvider, LevelProgress, StreakCalendar, BadgeGrid, Leaderboard, ToastHost } from '@gami.fied/react';
import '@gami.fied/react/styles.css';

export function Rewards({ token }: { token: string }) {
  return (
    <GamiProvider endUserToken={token} baseUrl="https://api.example.com">
      <LevelProgress />
      <StreakCalendar />
      <BadgeGrid />
      <Leaderboard period="weekly" limit={10} />
      <ToastHost position="bottom-right" />
    </GamiProvider>
  );
}
```

Tokens last up to an hour. Create a new one when the page loads or the old one expires, and pass it to a new `GamiProvider`. If you have set allowed origins on the project, the site has to be on the list.

## Components

| Component | Shows | Useful props |
| :--- | :--- | :--- |
| `LevelProgress` | Level, XP and progress to the next level | |
| `BadgeGrid` | Achievements with tiers and progress bars. Secret badges appear once earned | `showLocked` |
| `StreakCalendar` | Each streak, its run on a calendar, and "do it today" when it is at risk | `streak`, `weeks` |
| `Leaderboard` | Top players and the player's own place | `period`, `limit` |
| `ChallengeList` | Open challenges with steps and when repeating ones start over | |
| `NotificationFeed` | Recent notifications, with new ones added live | `limit` |
| `ToastHost` | A toast for each new notification | `duration`, `position`, `renderToast` |
| `ProgressBar` | A labelled bar, for your own screens | `fraction`, `label`, `detail` |

Each also has a hook if you want to draw it yourself: `useMe`, `useStreaks`, `useAchievementProgress`, `useChallenges`, `useLeaderboard(period, limit)` and `useNotifications(limit)`. They return `{ data, loading, error, refresh }`, keep what is on screen while they refresh, and fetch again by themselves whenever a live update arrives. `useGami()` gives you the client, whether the live stream is connected, and the notifications received so far.

## Styling

`styles.css` is small and uses CSS variables, so you can restyle by setting them on a parent element:

```css
.my-rewards {
  --gami-accent: #7c3aed;
  --gami-radius: 12px;
}
```

It follows `prefers-color-scheme`, respects reduced motion, and every piece is a landmark with a label for screen readers. Skip the file entirely and style the `gami-*` class names yourself if you prefer.

## Live updates

With `live` on (the default), the provider keeps one connection open to `GET /v1/me/stream`. Toasts and numbers then change as events are processed, without polling. You can use the same stream without React:

```ts
const live = gami.me.subscribe({
  onNotification: (n) => showToast(n.title, n.message),
  onXp: ({ totalXp }) => setXp(totalXp),
  onDisconnect: () => setStatus('reconnecting'),
});
// when the page closes
live.close();
```

The stream is server-sent events:

| Event | Data |
| :--- | :--- |
| `ready` | `{ userId }`, sent when it opens |
| `notification` | `{ id, type, title, message, data, createdAt }`. Its SSE `id` is a position you can send back as `Last-Event-ID` |
| `xp` | `{ totalXp }`, when the balance changes |

A reconnect with `Last-Event-ID` resumes exactly where it stopped, so nothing is missed or repeated, and the SDK does this for you with a growing pause between attempts. A browser's `EventSource` can't send headers, so the token may be passed as `?access_token=`. A comment is sent every 25 seconds to keep proxies from closing the connection (nginx buffering is switched off for it). Each player can hold 5 streams at once.

The worker tells the API that something changed through Redis, and the API reads the player's new rows from the database. If a nudge is lost, the stream catches up on its own within 15 seconds.

The dashboard uses a similar stream (`GET /api/projects/:projectId/stream`, for signed-in staff only) to refresh the Leaderboard, Events and user pages as things happen, with a Live badge showing the connection.
