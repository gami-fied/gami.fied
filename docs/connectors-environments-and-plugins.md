# Connectors, environments, expressions and plugins

## Connectors

A connector receives events from a service you already use and turns them into events here, where they run your rules like any other. Create one on the **Connectors** page. Each has its own URL, `/v1/connectors/<id>`.

| Service | How it signs | What arrives |
| --- | --- | --- |
| Segment | A secret made for you, sent as `Authorization: Bearer <secret>` (or Segment's `X-Signature`) | `track` calls become events, named like `order_completed`. `identify` calls fill in the user's name, email and metadata |
| RudderStack | The same secret, as a bearer token or basic-auth user name | The same as Segment |
| Stripe | The endpoint's signing secret (`whsec_...`), checked against `Stripe-Signature` with a five-minute window | `stripe.<type>`, such as `stripe.invoice.paid`, with `amount` in the main currency unit, `amountCents`, `currency` and `customer` |
| GitHub | The webhook secret, checked against `X-Hub-Signature-256` | `github.<event>` or `github.<event>.<action>`; a merged pull request is `github.pull_request.merged` |

Details:

- The signature is checked against the exact bytes received. A request with a wrong or missing signature gets `401`, and the connector shows the error.
- Each message's own ID (Segment's `messageId`, Stripe's event ID, GitHub's delivery ID) is the idempotency key, so a service retrying never creates a second event.
- Stripe finds the user in the object's metadata under `gami_user_id` (or a key you choose), then falls back to the Stripe customer ID.
- Segment and RudderStack skip visitors who are not signed in, unless you turn on anonymous visitors.
- **Only these events** limits a connector to the event types you list.
- Segment and RudderStack secrets are shown once. **New secret** replaces one; the old one stops working at once.

Connectors are managed from the dashboard only. API keys cannot read or change them, because they hold secrets.

## Environments and promotion

Mark a project as **production**, **staging** or **development** in its settings. Keys made for staging and development projects start `gami_test_`, and production keys start `gami_live_`, so a key's prefix always says where it belongs. Existing keys keep their prefix when the setting changes.

Set **Promotes to** on a staging project, then open **Promote changes** to compare it with production. Promotion copies the game design:

currencies, achievements, levels, streaks, segments, leagues, rules, challenges, boosts, limits and store rewards.

- Items are matched by key (by name for rules, boosts and limits, by number for levels).
- References are fixed on the way: a limit on a rule points at the production rule, a reward uses the production currency, and an achievement action uses the production achievement.
- Only new and changed items are offered, and you choose which to copy. Everything chosen is copied in one transaction.
- Promotion never deletes. Items only in production are left alone.
- Each promoted rule gets a new version in production, so it can be rolled back.
- Store stock is not copied over a live count. Player data (users, XP, purchases) is never copied.
- Both projects must be in one organization, and you must be an owner or admin of both.

## Expression conditions

When the rule builder cannot express a condition, add an **expression**: a [JSONLogic](https://jsonlogic.com) rule that reads the event's `type`, `userId`, `occurredAt` and `payload`.

```json
{ "all": [
  { "field": "payload.country", "operator": "equals", "value": "IN" },
  { "logic": { ">": [{ "*": [{ "var": "payload.price" }, { "var": "payload.quantity" }] }, 100] } }
] }
```

Supported operators: `var`, `missing`, `if`, `==`, `===`, `!=`, `!==`, `!`, `!!`, `and`, `or`, `>`, `>=`, `<`, `<=` (with three arguments for "between"), `in`, `cat`, `substr`, `+`, `-`, `*`, `/`, `%`, `min`, `max`, `some`, `all`, `none`, `lower`, `upper` and `length`.

Expressions only read the event. They cannot call functions, loop over code, or reach anything outside the data, and they are limited to 200 parts and 12 levels deep. Division by zero gives `null` instead of failing. Two pieces of text, such as ISO dates, compare as text.

## Plugins

A plugin adds rule actions of your own, such as sending a gift through your shop or updating your CRM. It is a module whose default export is the plugin (inside this repository, `definePlugin` from `@gami/rules` adds types, but a plain object works the same):

```js
// acme-plugin.mjs
export default {
  name: 'acme',
  version: '1.0.0',
  actions: {
    'acme.send_gift': {
      label: 'Send a gift',
      description: 'Ships a gift from the Acme shop',
      validate(params) {
        if (typeof params.sku !== 'string') throw new Error('acme.send_gift needs a sku');
      },
      async run({ userId, params, idempotencyKey }) {
        await fetch('https://shop.acme.example/gifts', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
          body: JSON.stringify({ user: userId, sku: params.sku }),
        });
      },
    },
  },
};
```

Load it by listing it in `GAMI_PLUGINS` for both the API and the worker, as package names or file paths separated by commas:

```bash
GAMI_PLUGINS=./plugins/acme-plugin.mjs
```

- Action types must be namespaced, such as `acme.send_gift`, so they never clash with built-ins.
- The API calls `validate` when a rule is saved, so a mistake is caught before it goes live.
- The worker calls `run` when the rule matches. Throwing marks the action failed and the event is retried, so pass `idempotencyKey` on to anything you call. It is the same for every retry of that action on that event.
- A plugin that cannot load stops start-up, so rules that use it never fail quietly.
- The rule builder offers loaded plugin actions next to the built-in ones, with their parameters as JSON.

An example lives in [`examples/plugins/acme-plugin.mjs`](../examples/plugins/acme-plugin.mjs).
