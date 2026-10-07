/**
 * Stamps module.json for a release: the exact version, and a download URL pinned to that tag.
 * `manifest` stays on releases/latest/download, where the release uploads this stamped copy, so
 * Foundry's update check always sees the newest version. Reads VERSION and REPO; fails loudly if
 * either is missing rather than shipping "undefined" in a URL.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.env['VERSION'];
const repo = process.env['REPO'];
if (!version || !repo || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('VERSION (x.y.z) and REPO must both be set. Received:', { version, repo });
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('module.json', 'utf8'));
manifest.version = version;
manifest.manifest = `https://github.com/${repo}/releases/latest/download/module.json`;
manifest.download = `https://github.com/${repo}/releases/download/v${version}/module.zip`;
writeFileSync('module.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Stamped module.json as ${version}.`);
