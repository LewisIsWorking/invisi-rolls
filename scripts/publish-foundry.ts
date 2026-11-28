/**
 * Registers the release on foundryvtt.com, so the package page lists the new version without anyone
 * adding it by hand. Uses Foundry's Package Release API, reading the stamped module.json for the
 * version and compatibility. Reads FOUNDRY_RELEASE_TOKEN and REPO; DRY_RUN=true validates only,
 * and needs no token: it checks the release body and the manifest's install URLs locally
 * and prints the body without sending anything.
 */
import { readFileSync } from 'node:fs';

interface ModuleManifest {
  id?: unknown;
  version?: unknown;
  compatibility?: {
    minimum?: unknown;
    verified?: unknown;
    maximum?: unknown;
  };
  manifest?: unknown;
  download?: unknown;
}

const dryRun = process.env['DRY_RUN'] === 'true';
const token = process.env['FOUNDRY_RELEASE_TOKEN'];
const repo = process.env['REPO'];
if (!repo || (!token && !dryRun)) {
  console.error('REPO must be set, and FOUNDRY_RELEASE_TOKEN is required unless DRY_RUN=true.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('module.json', 'utf8')) as ModuleManifest;
if (!manifest || typeof manifest !== 'object') {
  console.error('module.json must contain an object.');
  process.exit(1);
}

const tag = typeof manifest.version === 'string' ? `v${manifest.version}` : '';
const body = {
  id: manifest.id,
  'dry-run': dryRun,
  release: {
    version: manifest.version,
    // Pinned to the tag: releases/latest/download would move on to the next version.
    manifest: `https://github.com/${repo}/releases/download/${tag}/module.json`,
    notes: `https://github.com/${repo}/releases/tag/${tag}`,
    compatibility: manifest.compatibility,
  },
};

const problems: string[] = [];
if (typeof body.id !== 'string' || !body.id) problems.push('manifest id is missing');
if (typeof body.release.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(body.release.version)) {
  problems.push(`release version is not semver: ${String(body.release.version)}`);
}
for (const key of ['minimum', 'verified', 'maximum'] as const) {
  const value = manifest.compatibility?.[key];
  if (typeof value !== 'string' || !value) {
    problems.push(`compatibility.${key} is missing`);
  }
}
for (const key of ['manifest', 'notes'] as const) {
  if (!body.release[key].startsWith(`https://github.com/${repo}/releases/`)) {
    problems.push(`release ${key} does not point at this repo's releases: ${body.release[key]}`);
  }
}
// The install-critical URLs baked into the manifest itself: a repo rename or transfer that
// updates the workflow but not these would break every Foundry client's update check.
for (const key of ['manifest', 'download'] as const) {
  const value = manifest[key];
  if (typeof value !== 'string' || !value.startsWith(`https://github.com/${repo}/releases/`)) {
    problems.push(`module.json ${key} does not point at this repo's releases: ${String(value)}`);
  }
}
if (problems.length > 0) {
  console.error(`Release body invalid:\n${problems.join('\n')}`);
  process.exit(1);
}

// Without a token there is nothing to send to: the local validation above is the whole dry run.
if (dryRun && !token) {
  console.log(`Release body valid (no token, nothing sent):\n${JSON.stringify(body, null, 2)}`);
  process.exit(0);
}

const response = await fetch('https://foundryvtt.com/_api/packages/release_version/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: token as string },
  body: JSON.stringify(body),
});
const text = await response.text();
console.log(`foundryvtt.com answered ${response.status}: ${text}`);
if (!response.ok || !text.includes('"success"')) process.exit(1);
