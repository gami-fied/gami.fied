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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
