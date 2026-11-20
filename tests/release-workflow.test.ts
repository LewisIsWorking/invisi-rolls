import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards the release job that packages module.zip. The order matters and nothing else checks it:
 * the manifest has to be stamped before it is zipped (or Foundry installs a placeholder version
 * and a wrong download URL), the zip has to carry the built module and the language file, and a
 * re-run has to overwrite the assets of a release that failed halfway.
 */

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

/** One named step, so the checks below read the packaging job and not CI. */
const step = (name: string): string => {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start, `no step named "${name}"`).toBeGreaterThan(-1);
  const end = workflow.indexOf('\n      - name: ', start);
  return workflow.slice(start, end === -1 ? workflow.length : end);
};

describe('release workflow', () => {
  const pack = step('Package and attach module.zip and module.json');

  it('stamps the manifest and builds before it zips them', () => {
    const build = pack.indexOf('npm run build');
    const stamp = pack.indexOf('node scripts/stamp-manifest.ts');
    const zip = pack.indexOf('zip -r module.zip');

    expect(build).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(-1);
    expect(zip).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(build);
    expect(zip).toBeGreaterThan(stamp);
  });

  it('packages everything Foundry loads: the manifest, the build and the language file', () => {
    const line = pack.split('\n').find((l) => l.trimStart().startsWith('zip -r module.zip'));
    expect(line).toBeDefined();
    for (const entry of ['module.json', 'dist', 'lang', 'LICENSE', 'README.md']) {
      expect(line, entry).toContain(entry);
    }
  });

  it('creates the release before uploading to it, on the tagged version', () => {
    const create = pack.indexOf('gh release create "v${VERSION}"');
    const upload = pack.indexOf('gh release upload "v${VERSION}"');

    expect(create).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(create);
  });

  it('uploads the zip, the stamped manifest and the embeddable library', () => {
    const line = pack.split('\n').find((l) => l.trimStart().startsWith('gh release upload'));
    expect(line).toBeDefined();
    for (const asset of ['module.zip', 'module.json', 'invisi-rolls.tgz']) {
      expect(line, asset).toContain(asset);
    }
    expect(line).toContain('--clobber');

    const packLib = pack.indexOf('npm pack');
    expect(packLib).toBeGreaterThan(-1);
    expect(packLib).toBeLessThan(pack.indexOf('gh release upload'));
  });

  it('can be re-run by hand after a failed attach', () => {
    // The packaging step is gated, so a manual run has to pass the same gate.
    expect(pack).toContain('workflow_dispatch');
  });
});
