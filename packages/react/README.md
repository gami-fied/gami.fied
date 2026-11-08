# @gami.fied/react

React components and hooks for [Gami.Fied](https://github.com/gami-fied/gami.fied): level bar, badge grid, streak calendar, leaderboard, challenges, notification feed, and toasts that appear the moment something is earned.

```bash
npm install @gami.fied/react @gami.fied/sdk
```

```tsx
import { GamiProvider, LevelProgress, BadgeGrid, ToastHost } from '@gami.fied/react';
import '@gami.fied/react/styles.css';

<GamiProvider endUserToken={token} baseUrl="https://api.example.com">
  <LevelProgress />
  <BadgeGrid />
  <ToastHost />
</GamiProvider>;
```

Create the `token` on your server with `POST /v1/end-user-tokens` (or `gami.endUserTokens.create`). Never put an API key in the browser.

Read the full guide in [docs/react.md](../../docs/react.md): every component and hook, styling with CSS variables, and how live updates work.

MIT licensed.
