import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/publish-foundry.ts', import.meta.url));
const repo = 'LewisIsWorking/invisi-rolls';
const tempDirs: string[] = [];

const validManifest = {
  id: 'invisi-rolls',
  version: '1.2.3',
  compatibility: { minimum: '14', verified: '14.371', maximum: '14' },
  manifest: `https://github.com/${repo}/releases/latest/download/module.json`,
  download: `https://github.com/${repo}/releases/latest/download/module.zip`,
};

function runPublish(manifest: unknown, env: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'invisi-publish-'));
  tempDirs.push(cwd);
  writeFileSync(join(cwd, 'module.json'), JSON.stringify(manifest));
  const baseEnv = { ...process.env };
  delete baseEnv['FOUNDRY_RELEASE_TOKEN'];
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    env: { ...baseEnv, DRY_RUN: 'true', REPO: repo, ...env },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('foundry publish dry run', () => {
  it('validates and prints the release without a token or network request', () => {
    const result = runPublish(validManifest);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Release body valid (no token, nothing sent)');
    expect(result.stdout).toContain('"dry-run": true');
    expect(result.stderr).toBe('');
  });

  it('requires REPO even for a dry run', () => {
    const result = runPublish(validManifest, { REPO: '' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REPO must be set');
  });

  it('requires a token outside dry-run mode', () => {
    const result = runPublish(validManifest, { DRY_RUN: 'false' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FOUNDRY_RELEASE_TOKEN is required unless DRY_RUN=true');
  });

  it.each([
    ['version', { ...validManifest, version: 'latest' }, 'release version is not semver'],
    [
      'compatibility',
      { ...validManifest, compatibility: { minimum: '14', maximum: '14' } },
      'compatibility.verified is missing',
    ],
    [
      'manifest URL',
      { ...validManifest, manifest: 'https://example.com/module.json' },
      'module.json manifest does not point at this repo',
    ],
    [
      'download URL',
      { ...validManifest, download: 'https://example.com/module.zip' },
      'module.json download does not point at this repo',
    ],
  ])('rejects an invalid %s', (_name, manifest, message) => {
    const result = runPublish(manifest);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });
});
