# Web components

`@gami.fied/elements` gives you the Gami.Fied components as HTML elements, for sites that do not use React: Vue, Svelte, Angular, or a plain page. They are the same components as [`@gami.fied/react`](./react.md) and look the same.

## On a page

```html
<script src="https://unpkg.com/@gami.fied/elements/dist/gami-elements.js"></script>
<script>
  // The token comes from your server (POST /v1/end-user-tokens). Never put an API key in a page.
  GamiElements.configure({ baseUrl: 'https://gami.example.com', token: tokenFromYourServer });
</script>

<gami-level-progress></gami-level-progress>
<gami-leaderboard period="weekly" limit="5"></gami-leaderboard>
<gami-notification-inbox></gami-notification-inbox>
<gami-toasts></gami-toasts>
```

The script is about 290 KB, around 90 KB compressed, because it carries React inside it. You can also copy that file to your own site and serve it from there. With a bundler, install the package and call `configure` the same way:

```bash
npm install @gami.fied/elements
```

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

Changing an attribute updates the element. A boolean attribute is on when it is present, and off with `="false"`. An attribute that makes no sense, such as `limit="lots"`, is ignored and the default is used.

## How it behaves

- **One connection.** Every element on a page shares one client and one live stream, however many you use.
- **Nothing shows until `configure` is called.** Elements can be in the page first.
- **Tokens expire.** Fetch a new one from your server and call `GamiElements.setToken(newToken)`.
- **Styles stay apart.** Each element draws inside a shadow root, so your CSS does not reach into it and its CSS does not leak out.
- **Theming still works.** Colours and sizes are CSS variables, which do cross into a shadow root. Set them on the element or any parent:

  ```css
  gami-leaderboard {
    --gami-accent: #2563eb;
    --gami-radius: 0;
  }
  ```

- **Language.** Pass `locale: 'pt-BR'` to `configure` to follow your own language picker. Without it the browser's language is used. See [Translations](./translations.md).
- **Your own calls.** `GamiElements.client()` returns the SDK client the elements use, for example `GamiElements.client().me.setLocale('fr')`.
- **Buttons that change things** (opening a box, claiming a pass reward, buying a cosmetic) need a token created with `access: "write"`.

## In Vue and Svelte

Custom elements work as they are. Tell Vue not to look for a component of that name:

```js
// vite.config.js
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('gami-') } } });
```

```vue
<gami-mystery-box box="daily_chest" @gami-open="onOpen" />
```

In Svelte, use the tags directly and listen with `on:gami-open`.
