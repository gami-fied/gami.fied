/** @type {import('next').NextConfig} */
// The Content-Security-Policy is set per request in src/proxy.ts, because it carries a nonce.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig = {
  reactStrictMode: true,
  // No `X-Powered-By: Next.js`: it tells a scanner what to try, and helps no one else.
  poweredByHeader: false,
  // A second copy can run beside `next dev` when it builds into its own folder, for example for the page walk.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Docker builds use a self-contained server. Symlinks make this awkward on Windows.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  allowedDevOrigins: ['127.0.0.1'],
  // Shared interface pieces and the rule builder are TypeScript source in packages/ui.
  transpilePackages: ['@gami/ui'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
