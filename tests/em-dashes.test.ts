import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Guards the prose check that keeps this repo at zero em dashes. It runs in CI on every push, so a
 * checker that quietly stopped matching (a changed escape list, a wider skip list) would let them
 * back in while CI stayed green.
 */

const script = fileURLToPath(new URL('../scripts/check-em-dashes.ts', import.meta.url));
const BACKSLASH = String.fromCharCode(92);
const DASH = String.fromCharCode(0x2014);

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const check = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'em-dashes-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
};

describe('check-em-dashes', () => {
  it('passes prose that uses a hyphen instead', () => {
    const run = check({ 'README.md': 'Rolls - truly invisible.\n', 'src/x.ts': '// a - b\n' });

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('No em dashes.');
  });

  it('names the file and line of a real em dash', () => {
    const run = check({ 'docs/guide.md': `one\ntwo ${DASH} three\n` });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('guide.md:2');
  });

  it.each([
    ['a Unicode escape', `${BACKSLASH}u2014`, 'src/a.ts'],
    ['an HTML entity', `&${'mdash;'}`, 'README.md'],
    ['a Perl-style escape', `${BACKSLASH}N{EM DASH}`, 'notes.txt'],
  ])('fails on %s as well, because it still prints one', (_what, escape, path) => {
    const run = check({ [path]: `text with ${escape} in it\n` });

    expect(run.status).toBe(1);
    expect(run.stderr.replaceAll('\\', '/')).toContain(path);
  });

  it('leaves dependencies and build output alone', () => {
    const run = check({ 'node_modules/p/x.md': `${DASH}\n`, 'dist/y.md': `${DASH}\n`, 'src/z.ts': 'ok\n' });

    expect(run.status).toBe(0);
  });

  it('does not read binary assets', () => {
    const run = check({ 'assets/art.webp': `${DASH}\n` });

    expect(run.status).toBe(0);
  });
});
