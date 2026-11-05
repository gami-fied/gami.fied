export const product = {
  name: 'Gami.Fied',
  edition: 'community',
  // Release images set GAMI_VERSION from their tag. A test keeps this in step with package.json.
  version: process.env.GAMI_VERSION ?? '1.0.0-rc.2',
  build: process.env.GAMI_BUILD_ID ?? 'local'
};
