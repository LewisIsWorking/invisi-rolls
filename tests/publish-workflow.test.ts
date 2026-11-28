import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards the release job's publish step. It must run the very script the release workflow tests
 * for, with the token and the repo that script reads, and only on the same condition the packaging
 * step uploads on, so a workflow that renamed or skipped the step could not drift from the script.
 */

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

/** One named step, so the checks below read the publish job and not the packaging job. */
const step = (name: string): string => {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start, `no step named "${name}"`).toBeGreaterThan(-1);
  const end = workflow.indexOf('\n      - name: ', start);
  return workflow.slice(start, end === -1 ? workflow.length : end);
};

const PUBLISH_CONDITION = "(steps.changesets.outputs.published == 'true' || github.event_name == 'workflow_dispatch')";

describe('release workflow publish step', () => {
  const publish = step('Publish the release to foundryvtt.com');

  it('runs the publish script for the release that was just cut', () => {
    expect(publish).toContain('node scripts/publish-foundry.ts');
  });

  it('passes the token and the repo the script reads', () => {
    expect(publish).toContain('FOUNDRY_RELEASE_TOKEN');
    expect(publish).toContain('REPO:');
  });

  it('runs only when the release was published or run by hand', () => {
    expect(publish).toContain(`if: ${PUBLISH_CONDITION}`);
  });
});
