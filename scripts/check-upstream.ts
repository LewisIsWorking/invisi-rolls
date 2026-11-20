/**
 * Daily watch: has Foundry, PF2e or SF2e moved past what the last live check ran against? Reads
 * docs/upstream.json as the baseline, asks foundryvtt.com and GitHub, and prints what changed plus
 * the two commands to re-run. Exit 0 means up to date, 1 means a live check is owed, 2 means the
 * watch itself could not run (the page or the API changed).
 */
import { readFileSync } from 'node:fs';
import { drift, newest, stableBuilds, tagVersion, type Baseline } from '../src/upstream.ts';

const baseline = JSON.parse(readFileSync('docs/upstream.json', 'utf8')) as Baseline;

const page = await fetch('https://foundryvtt.com/releases/');
if (!page.ok) {
  console.error(`foundryvtt.com/releases answered ${page.status}; the watch cannot tell what shipped.`);
  process.exitCode = 2;
} else {
  const foundry = newest(stableBuilds(await page.text()));
  if (!foundry) {
    console.error('No stable release found on foundryvtt.com/releases; the page may have changed.');
    process.exitCode = 2;
  } else {
    const response = await fetch('https://api.github.com/repos/foundryvtt/pf2e/releases?per_page=100', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'invisi-rolls-upstream-watch' },
    });
    if (!response.ok) {
      console.error(`GitHub releases answered ${response.status}; the watch cannot tell what shipped.`);
      process.exitCode = 2;
    } else {
      const tags = ((await response.json()) as { tag_name: string }[]).map((release) => release.tag_name);
      const pf2e = tagVersion(tags, 'pf2e');
      const sf2e = tagVersion(tags, 'sf2e');
      if (!pf2e || !sf2e) {
        console.error('No pf2e or sf2e release tag in the GitHub releases; the tag format may have changed.');
        process.exitCode = 2;
      } else {
        const steps = drift(baseline, { foundry, pf2e, sf2e });
        if (steps.length === 0) {
          console.log(`Up to date: Foundry ${foundry}, PF2e ${pf2e}, SF2e ${sf2e}.`);
        } else {
          console.log('Upstream moved past the last live check:\n');
          for (const step of steps) console.log(`  ${step.name}: ${step.was} -> ${step.now}`);
          console.log('\nRun both worlds, then update docs/upstream.json in the same PR as the log:\n');
          console.log('  W=c99 DSN=1 bash ~/.claude/scripts/foundry-c99-live/run-c99.sh');
          console.log('  W=c98 DSN=1 bash ~/.claude/scripts/foundry-c99-live/run-c99.sh');
          process.exitCode = 1;
        }
      }
    }
  }
}
