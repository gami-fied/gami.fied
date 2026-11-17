#!/usr/bin/env node
/**
 * Sets the release version everywhere it is written, or checks that every place agrees.
 *
 *   node scripts/set-version.mjs 1.4.0          set it everywhere
 *   node scripts/set-version.mjs --check        check every place matches the root package.json
 *   node scripts/set-version.mjs --check v1.4.0 also check a release tag matches, and that
 *                                               CHANGELOG.md has a section for it
 *
 * The private `@gami/*` workspace packages stay at 0.1.0 on purpose: they are never published.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Each place holds the version in the middle capture group. `minor` places hold `1.3.x`, the
 * supported line, and are only changed for a release that is not a pre-release.
 */
const PLACES = [
  { file: 'package.json', pattern: /("version": ")([^"]+)(")/ },
  { file: 'packages/sdk/package.json', pattern: /("version": ")([^"]+)(")/ },
  { file: 'packages/react/package.json', pattern: /("version": ")([^"]+)(")/ },
  { file: 'packages/elements/package.json', pattern: /("version": ")([^"]+)(")/ },
  {
    file: 'packages/config/src/product.ts',
    pattern: /(process\.env\.GAMI_VERSION \|\| ')([^']+)(')/,
  },
  {
    file: 'apps/api/src/public/openapi.ts',
    pattern: /(title: 'Gami\.Fied API',\s*version: ')([^']+)(')/,
  },
  { file: 'docs/openapi.json', pattern: /("title": "Gami\.Fied API",\s*"version": ")([^"]+)(")/ },
  { file: 'docs/data-export.md', pattern: /("appVersion": ")([^"]+)(")/ },
  {
    file: 'docs/deployment-and-production.md',
    pattern: /(\| `GAMI_VERSION` \| Image version to run \| `)([^`]+)(` \|)/,
  },
  { file: 'docs/install/upgrading.md', pattern: /(^GAMI_VERSION=)(\d\S*)()$/m },
  { file: 'docs/install/one-click.md', pattern: /(to a version such as `)([^`]+)(`)/ },
  { file: 'SECURITY.md', pattern: /(\| )(\d+\.\d+)(\.x\s*\|\s*Yes\s*\|)/, minor: true },
];

const read = (file) => readFileSync(join(root, file), 'utf8');

function expected(place, version) {
  return place.minor ? version.split('.').slice(0, 2).join('.') : version;
}

function current(place) {
  const match = read(place.file).match(place.pattern);
  if (!match)
    throw new Error(
      `${place.file}: the version was not found. Update the pattern in scripts/set-version.mjs.`
    );
  return match[2];
}

function set(version) {
  if (!SEMVER.test(version))
    throw new Error(`"${version}" is not a version such as 1.4.0 or 1.4.0-rc.1`);
  const prerelease = version.includes('-');
  for (const place of PLACES) {
    if (place.minor && prerelease) continue;
    const text = read(place.file);
    if (!place.pattern.test(text)) throw new Error(`${place.file}: the version was not found`);
    writeFileSync(
      join(root, place.file),
      text.replace(place.pattern, `$1${expected(place, version)}$3`)
    );
    console.log(`  ${place.file}`);
  }
  console.log(`\nSet ${version} in ${PLACES.length} places.`);
  if (!hasChangelogSection(version)) {
    console.log(
      `Next: add a "## [${version}] - <date>" section to CHANGELOG.md. The release notes are taken from it.`
    );
  }
}

function hasChangelogSection(version) {
  return read('CHANGELOG.md')
    .split('\n')
    .some((line) => line.startsWith(`## [${version}]`));
}

function check(tag) {
  const version = JSON.parse(read('package.json')).version;
  const problems = [];
  for (const place of PLACES) {
    if (place.minor && version.includes('-')) continue;
    const found = current(place);
    if (found !== expected(place, version))
      problems.push(`${place.file} says ${found}, expected ${expected(place, version)}`);
  }
  if (tag !== undefined) {
    const tagged = tag.replace(/^v/, '');
    if (tagged !== version)
      problems.push(`the tag ${tag} does not match package.json (${version})`);
    if (!hasChangelogSection(tagged)) problems.push(`CHANGELOG.md has no "## [${tagged}]" section`);
  }
  if (problems.length > 0) {
    console.error(`Versions disagree:\n${problems.map((line) => `  - ${line}`).join('\n')}`);
    console.error(`\nRun "node scripts/set-version.mjs ${version}" to set them all.`);
    process.exit(1);
  }
  console.log(`All ${PLACES.length} places say ${version}.`);
}

const args = process.argv.slice(2);
try {
  if (args[0] === '--check') check(args[1]);
  else if (args.length === 1) set(args[0]);
  else {
    console.error('Usage: node scripts/set-version.mjs <version> | --check [tag]');
    process.exit(2);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
