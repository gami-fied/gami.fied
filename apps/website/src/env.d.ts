interface ImportMetaEnv {
  /** The site's public address. Defaults to https://gami.fied.cc. */
  readonly PUBLIC_SITE_URL?: string;
  /** `true` on previews and forks: adds noindex everywhere and turns analytics off. */
  readonly PUBLIC_NOINDEX?: string;
  /** `plausible` or `umami`. Leave unset for no analytics. */
  readonly PUBLIC_ANALYTICS_PROVIDER?: string;
  /** The analytics script address, ideally on your own instance. */
  readonly PUBLIC_ANALYTICS_SCRIPT?: string;
  /** The site's domain for Plausible, or its website ID for Umami. */
  readonly PUBLIC_ANALYTICS_SITE?: string;
  /** Where "Join the waitlist" goes, such as a form. Without it the pricing page links to GitHub. */
  readonly PUBLIC_WAITLIST_URL?: string;
  /** A contact address shown on the legal pages. Without it they point to GitHub issues. */
  readonly PUBLIC_CONTACT_EMAIL?: string;
  /** The demo instance the API explorer sends requests to. Without it the explorer only documents. */
  readonly PUBLIC_DEMO_URL?: string;
  /** The status page. The footer links to it only when this is set. */
  readonly PUBLIC_STATUS_URL?: string;
  readonly PUBLIC_DEMO_API_URL?: string;
  /** A demo project API key, filled in for "try it". Public by design, so use a demo project only. */
  readonly PUBLIC_DEMO_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
