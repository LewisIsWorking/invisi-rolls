/**
 * Keeps module.json's compatibility.verified on the newest STABLE Foundry build of its major version,
 * so the setup screen never shows the "Compatibility Risk" badge. Reads foundryvtt.com/releases,
 * writes the new build into module.json plus a patch changeset, and prints `verified=<build>` to
 * GITHUB_OUTPUT when it changed anything. Fails loudly if the page no longer parses.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('module.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const major = String(manifest.compatibility.maximum ?? manifest.compatibility.minimum).split('.')[0];
const current = String(manifest.compatibility.verified);

const html = await (await fetch('https://foundryvtt.com/releases/')).text();
// Each release is a "Release 14.369 Update Notes" link followed by its channel tag.
const stable: string[] = [];
let pending: string | null = null;
for (const m of html.matchAll(/title="Release (\d+\.\d+) Update Notes"|release-tag (\w+)/g)) {
  if (m[1]) pending = m[1];
  else if (pending) {
    if (m[2] === 'stable') stable.push(pending);
    pending = null;
  }
}
const build = (v: string): number => Number(v.split('.')[1] ?? 0);
const latest = stable.filter((v) => v.split('.')[0] === major).sort((a, b) => build(b) - build(a))[0];
if (!latest) {
  throw new Error(`No stable Foundry ${major} release found on foundryvtt.com/releases; the page may have changed.`);
}
// No process.exit: on Windows it can abort while fetch's handles are still closing.
if (current.split('.')[0] === major && build(current) >= build(latest)) {
  console.log(`Already verified for ${current} (latest stable ${latest}).`);
} else {
  bump(latest);
}

function bump(latest: string): void {
  manifest.compatibility.verified = latest;
  writeFileSync('module.json', `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(`.changeset/verified-foundry-${latest.replace('.', '-')}.md`, `---\n'${pkg.name}': patch\n---\n\nVerified for Foundry ${latest}.\n`);
  if (process.env['GITHUB_OUTPUT']) appendFileSync(process.env['GITHUB_OUTPUT'], `verified=${latest}\n`);
  console.log(`Verified bumped from ${current} to ${latest}.`);
}
