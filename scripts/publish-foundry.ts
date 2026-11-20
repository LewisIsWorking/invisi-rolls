/**
 * Registers the release on foundryvtt.com, so the package page lists the new version without anyone
 * adding it by hand. Uses Foundry's Package Release API, reading the stamped module.json for the
 * version and compatibility. Reads FOUNDRY_RELEASE_TOKEN and REPO; DRY_RUN=true validates only,
 * and needs no token: it checks the release body and the manifest's install URLs locally
 * and prints the body without sending anything.
 */
import { readFileSync } from 'node:fs';
import { isDryRun, releaseBody, shouldSkip, validateRelease } from '../src/publish.ts';

const dryRun = isDryRun(process.env['DRY_RUN']);
const token = process.env['FOUNDRY_RELEASE_TOKEN'];
const repo = process.env['REPO'];
if (!repo) {
  console.error('REPO must be set.');
  process.exit(1);
}
if (shouldSkip(token, dryRun)) {
  // No package page yet (see docs/ROADMAP.md): the release itself already shipped in the
  // step above, so warn and skip instead of failing it.
  console.warn('FOUNDRY_RELEASE_TOKEN is not set; skipping the foundryvtt.com publish step.');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync('module.json', 'utf8'));
const body = releaseBody(manifest, repo, dryRun);

const problems = validateRelease(manifest, repo, body);
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
