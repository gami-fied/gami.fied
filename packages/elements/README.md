# @gami.fied/elements

[Gami.Fied](https://github.com/gami-fied/gami.fied) as HTML elements, for sites that do not use React: Vue, Svelte, Angular, or a plain page. They are the same components as [`@gami.fied/react`](../react), with the same look.

## With a script tag

```html
<script src="https://unpkg.com/@gami.fied/elements/dist/gami-elements.js"></script>
<script>
  // The token comes from your server (POST /v1/end-user-tokens). Never put an API key in a page.
  GamiElements.configure({ baseUrl: 'https://gami.example.com', token: tokenFromYourServer });
</script>

<gami-level-progress></gami-level-progress>
<gami-leaderboard period="weekly" limit="5"></gami-leaderboard>
<gami-toasts></gami-toasts>
```

The script is about 290 KB (around 90 KB compressed) because it carries React with it. If your site already uses a bundler, import the package instead:

```js
import { configure } from '@gami.fied/elements';
configure({ baseUrl: 'https://gami.example.com', token });
```

## Elements

| Element | Attributes |
| :--- | :--- |
| `<gami-level-progress>` | |
| `<gami-badge-grid>` | `show-locked` |
| `<gami-streak-calendar>` | `streak`, `weeks` |
| `<gami-leaderboard>` | `period` (`all_time`, `daily`, `weekly`, `monthly`), `limit` |
| `<gami-challenge-list>` | |
| `<gami-notification-feed>` | `limit` |
| `<gami-notification-inbox>` | `limit`, `mark-on-click` |
| `<gami-toasts>` | `duration`, `position` |
| `<gami-mystery-box>` | `box`. Fires a `gami-open` event with what a try gave |
| `<gami-season-pass>` | `pass` |
| `<gami-shared-goals>` | |
| `<gami-team-card>` | |
| `<gami-journey-path>` | `journey` |
| `<gami-cosmetic-locker>` | |

Changing an attribute updates the element. A boolean attribute is on when present, and off with `="false"`.

## How it behaves

- **One connection.** Every element on the page shares one client and one live stream.
- **Tokens expire.** Call `GamiElements.setToken(newToken)` with a fresh one from your server.
- **Styles stay apart.** Each element draws inside a shadow root, so your CSS and its CSS do not affect each other. Colours and sizes are CSS variables, which do reach inside, so set them on the element or any parent:

  ```css
  gami-leaderboard {
    --gami-accent: #2563eb;
    --gami-radius: 0;
  }
  ```

- **Your own calls.** `GamiElements.client()` returns the SDK client the elements use.
- **Buttons that change things** (opening a box, claiming a pass reward, buying a cosmetic) need a token created with `access: "write"`.
