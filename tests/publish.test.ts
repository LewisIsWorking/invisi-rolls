import { describe, expect, it } from 'vitest';

import { isDryRun, releaseBody, releaseTag, shouldSkip, tokenRequired, validateRelease } from '../src/publish.ts';

/**
 * The publish step builds the request body and validates it before sending anything to
 * foundryvtt.com. A wrong tag, a missing compatibility field or an install URL pointing at the
 * wrong repository would break every Foundry client's update check, so these rules are pinned.
 */

const manifest = {
  id: 'invisi-rolls',
  version: '0.4.5',
  compatibility: { minimum: '14', verified: '14.370', maximum: '14' },
  manifest: 'https://github.com/LewisIsWorking/invisi-rolls/releases/latest/download/module.json',
  download: 'https://github.com/LewisIsWorking/invisi-rolls/releases/download/v0.4.5/module.zip',
};

const repo = 'LewisIsWorking/invisi-rolls';

describe('isDryRun', () => {
  it('is true only for the exact string true', () => {
    expect(isDryRun('true')).toBe(true);
    expect(isDryRun('True')).toBe(false);
    expect(isDryRun(undefined)).toBe(false);
    expect(isDryRun('')).toBe(false);
  });
});

describe('shouldSkip', () => {
  it('skips when there is no token and this is not a dry run', () => {
    expect(shouldSkip(undefined, false)).toBe(true);
    expect(shouldSkip('', false)).toBe(true);
  });

  it('does not skip when a token is present or when dry-running', () => {
    expect(shouldSkip('secret', false)).toBe(false);
    expect(shouldSkip(undefined, true)).toBe(false);
    expect(shouldSkip('secret', true)).toBe(false);
  });
});

describe('tokenRequired', () => {
  it('requires a token unless dry-running', () => {
    expect(tokenRequired(false)).toBe(true);
    expect(tokenRequired(true)).toBe(false);
  });
});

describe('releaseTag', () => {
  it('prefixes the version with v', () => {
    expect(releaseTag('0.4.5')).toBe('v0.4.5');
  });
});

describe('releaseBody', () => {
  it('pins the manifest and notes URLs to the stamped tag', () => {
    const body = releaseBody(manifest, repo, false);

    expect(body.id).toBe('invisi-rolls');
    expect(body['dry-run']).toBe(false);
    expect(body.release.version).toBe('0.4.5');
    expect(body.release.manifest).toBe('https://github.com/LewisIsWorking/invisi-rolls/releases/download/v0.4.5/module.json');
    expect(body.release.notes).toBe('https://github.com/LewisIsWorking/invisi-rolls/releases/tag/v0.4.5');
    expect(body.release.compatibility).toEqual({ minimum: '14', verified: '14.370', maximum: '14' });
  });

  it('carries the dry-run flag through', () => {
    expect(releaseBody(manifest, repo, true)['dry-run']).toBe(true);
  });
});

describe('validateRelease', () => {
  it('accepts a well-formed release', () => {
    const body = releaseBody(manifest, repo, false);
    expect(validateRelease(manifest, repo, body)).toEqual([]);
  });

  it('rejects a missing id', () => {
    const body = releaseBody({ ...manifest, id: '' }, repo, false);
    expect(validateRelease({ ...manifest, id: '' }, repo, body)).toContain('manifest id is missing');
  });

  it('rejects a non-semver version', () => {
    const bad = { ...manifest, version: '0.4' };
    const body = releaseBody(bad, repo, false);
    expect(validateRelease(bad, repo, body)).toContain('release version is not semver: 0.4');
  });

  it('rejects a missing compatibility field', () => {
    const bad = { ...manifest, compatibility: { minimum: '14', verified: '14.370' } };
    const body = releaseBody(bad, repo, false);
    expect(validateRelease(bad, repo, body)).toContain('compatibility.maximum is missing');
  });

  it('rejects release URLs pointing at another repository', () => {
    const other = 'LewisIsWorking/other';
    const body = releaseBody(manifest, other, false);
    expect(validateRelease(manifest, other, body)).not.toEqual([]);
    // the repo passed to validate must match the one used to build the body
    expect(validateRelease(manifest, repo, body)).toContain(
      `release manifest does not point at this repo's releases: https://github.com/LewisIsWorking/other/releases/download/v0.4.5/module.json`,
    );
  });

  it('rejects module.json install URLs pointing at another repository', () => {
    const badManifest = { ...manifest, manifest: 'https://github.com/LewisIsWorking/other/releases/latest/download/module.json' };
    const body = releaseBody(manifest, repo, false);
    const problems = validateRelease(badManifest, repo, body);
    expect(problems).toContain(`module.json manifest does not point at this repo's releases: https://github.com/LewisIsWorking/other/releases/latest/download/module.json`);
  });

  it('rejects a missing download URL', () => {
    const badManifest = { ...manifest, download: 42 };
    const body = releaseBody(manifest, repo, false);
    expect(validateRelease(badManifest, repo, body)).toContain('module.json download does not point at this repo\'s releases: 42');
  });
});
