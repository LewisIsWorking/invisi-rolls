/**
 * Registers the release on foundryvtt.com, so the package page lists the new version without anyone
 * adding it by hand. Uses Foundry's Package Release API, reading the stamped module.json for the
 * version and compatibility. Reads FOUNDRY_RELEASE_TOKEN and REPO; DRY_RUN=true validates only.
 */
import { readFileSync } from 'node:fs';

const token = process.env['FOUNDRY_RELEASE_TOKEN'];
const repo = process.env['REPO'];
if (!repo) {
  console.error('REPO must be set.');
  process.exit(1);
}
if (!token) {
  // No package page yet (see docs/ROADMAP.md): the release itself already shipped in the
  // step above, so warn and skip instead of failing it.
  console.warn('FOUNDRY_RELEASE_TOKEN is not set; skipping the foundryvtt.com publish step.');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync('module.json', 'utf8'));
const tag = `v${manifest.version}`;
const body = {
  id: manifest.id,
  'dry-run': process.env['DRY_RUN'] === 'true',
  release: {
    version: manifest.version,
    // Pinned to the tag: releases/latest/download would move on to the next version.
    manifest: `https://github.com/${repo}/releases/download/${tag}/module.json`,
    notes: `https://github.com/${repo}/releases/tag/${tag}`,
    compatibility: manifest.compatibility,
  },
};

const response = await fetch('https://foundryvtt.com/_api/packages/release_version/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: token },
  body: JSON.stringify(body),
});
const text = await response.text();
console.log(`foundryvtt.com answered ${response.status}: ${text}`);
if (!response.ok || !text.includes('"success"')) process.exit(1);
