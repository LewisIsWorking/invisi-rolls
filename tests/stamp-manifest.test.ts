import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Guards the release step that writes the manifest Foundry installs from. A wrong tag in
 * `download` or a `latest` URL that is not `latest` breaks installation and update checks for
 * every world, and nothing else in the suite reads this script.
 */

const script = fileURLToPath(new URL('../scripts/stamp-manifest.ts', import.meta.url));

const fixture = (): Record<string, unknown> => ({
  id: 'invisi-rolls',
  title: 'Invisi-Rolls',
  version: '0.0.0',
  manifest: 'https://github.com/replaced/replaced/releases/latest/download/module.json',
  download: 'https://github.com/replaced/replaced/releases/download/v0.0.0/module.zip',
  compatibility: { minimum: '14', verified: '14.370', maximum: '14' },
  socket: true,
});

const dirs: string[] = [];

/** Runs the stamp script in a throwaway directory holding `manifest` as module.json. */
const stamp = (manifest: Record<string, unknown>, env: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'stamp-manifest-'));
  dirs.push(dir);
  const file = join(dir, 'module.json');
  const before = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(file, before);
  const result = spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, VERSION: '', REPO: '', ...env },
  });
  return { ...result, file, before, json: () => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> };
};

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('stamp-manifest', () => {
  it('writes the version and the tag-pinned download URL a release uploads', () => {
    const run = stamp(fixture(), { VERSION: '1.2.3', REPO: 'LewisIsWorking/invisi-rolls' });

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const json = run.json();
    expect(json['version']).toBe('1.2.3');
    expect(json['manifest']).toBe('https://github.com/LewisIsWorking/invisi-rolls/releases/latest/download/module.json');
    expect(json['download']).toBe('https://github.com/LewisIsWorking/invisi-rolls/releases/download/v1.2.3/module.zip');
  });

  it('leaves every other field as it was, in the shape the repo formats', () => {
    const manifest = fixture();
    const run = stamp(manifest, { VERSION: '5.0.1', REPO: 'LewisIsWorking/invisi-rolls' });

    const expected = {
      ...manifest,
      version: '5.0.1',
      manifest: 'https://github.com/LewisIsWorking/invisi-rolls/releases/latest/download/module.json',
      download: 'https://github.com/LewisIsWorking/invisi-rolls/releases/download/v5.0.1/module.zip',
    };
    expect(readFileSync(run.file, 'utf8')).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  });

  it.each([
    ['no version', { REPO: 'LewisIsWorking/invisi-rolls' }, /VERSION/],
    ['no repo', { VERSION: '1.2.3' }, /REPO/],
    ['a version that is not x.y.z', { VERSION: '1.2', REPO: 'LewisIsWorking/invisi-rolls' }, /VERSION/],
  ])('refuses to ship an undefined URL: %s', (_why, env, stderr) => {
    const run = stamp(fixture(), env as Record<string, string>);

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(stderr);
    // Nothing is written, so a failed release cannot leave a half-stamped manifest behind.
    expect(readFileSync(run.file, 'utf8')).toBe(run.before);
  });
});
