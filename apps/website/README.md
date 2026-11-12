# Gami.Fied website

The public site at `gami.fied.cc`: marketing pages, the docs, and later the playground and the live demo (PLAN.md, Phase 9). It is built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build), and it shares its colours and fonts with the dashboard through `@gami/ui`.

## Work on it

From the repository root:

```bash
pnpm install
pnpm --filter @gami/website dev
```

The site runs at `http://localhost:4321`, and the docs at `/docs`.

| Command | What it does |
| --- | --- |
| `pnpm --filter @gami/website dev` | Development server with instant reload |
| `pnpm --filter @gami/website build` | Static build into `apps/website/dist` |
| `pnpm --filter @gami/website preview` | Serve the build locally |
| `pnpm --filter @gami/website typecheck` | `astro check` |
| `pnpm --filter @gami/website lint` | ESLint, including `.astro` files |

Add packages with the CLI (`pnpm --filter @gami/website add <name>`, or `pnpm astro add <integration>` inside this folder) rather than editing versions by hand, so each one comes in at its latest release.

## Layout

```text
src/
├─ pages/            # routes: home, features, compare, pricing, blog, changelog, legal, 404, RSS, robots.txt, Open Graph images
├─ content/docs/     # docs pages served by Starlight under /docs
├─ content/blog/     # blog posts in Markdown or MDX
├─ layouts/          # SiteLayout frames every marketing page
├─ components/       # Seo, Analytics, header and footer
├─ lib/              # site facts (site.ts), feature areas (features.ts), Open Graph pages (og.ts), blog and analytics helpers
├─ styles/           # site.css for marketing pages, docs.css for Starlight
└─ assets/           # the brand mark used in docs and social cards
```

## Settings

All optional. Copy `.env.example` to `.env` to change them locally; in CI they come from repository variables.

| Variable | Default | What it does |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | `https://gami.fied.cc` | Canonical links, the sitemap and social cards |
| `PUBLIC_NOINDEX` | `false` | `true` on previews: noindex everywhere, and no analytics |
| `PUBLIC_ANALYTICS_PROVIDER` | none | `plausible` or `umami` |
| `PUBLIC_ANALYTICS_SCRIPT` | none | The provider's script address |
| `PUBLIC_ANALYTICS_SITE` | none | The Plausible domain, or the Umami website ID |
| `PUBLIC_WAITLIST_URL` | none | Where the pricing page's waitlist buttons go. Without it they link to GitHub |
| `PUBLIC_CONTACT_EMAIL` | none | Contact address on the legal pages. Without it they point to GitHub issues |

Analytics is cookie-free, so the site needs no consent banner. Count a click by adding `data-track="<event>"` to an element; the event names are in `src/lib/analytics.ts`.

## Search and social cards

- Each page sets its title, description and card through `SiteLayout`'s `title`, `description` and `og` props. Cards are drawn at build time from `src/lib/og.ts`: add an entry there for each new page.
- Starlight builds `sitemap-index.xml` for the whole site, and the docs search index (Pagefind).
- `robots.txt` lets search engines in on the live site, and keeps them out of previews.

## Hosting

The site is static, so any CDN works. `.github/workflows/website.yml` builds it on every change and deploys it to Cloudflare Pages once these are set in the repository: secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and optionally variables `CLOUDFLARE_PAGES_PROJECT` and `WEBSITE_URL`. Pushes to `master` go to production; every pull request gets a preview, linked in a comment.

To serve it at `gami.fied.cc`, add the domain to the Pages project in Cloudflare, which sets up HTTPS. The live demo will run separately at `demo.gami.fied.cc` (WEB-25).
