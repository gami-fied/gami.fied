/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig = {
  reactStrictMode: true,
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
