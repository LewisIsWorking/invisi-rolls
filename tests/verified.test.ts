import { describe, expect, it } from 'vitest';
import { buildOf, latestStableBuild, shouldBump, stableBuilds } from '../src/verified.ts';

/**
 * The daily verified bump decides whether a patch release ships for a new Foundry build. If it picks
 * the wrong build (an older one, or one from a different major) the module keeps a stale verified
 * value, or worse, advertises a Foundry it was never tested on.
 */

const page = (tags: { version: string; channel: string }[]): string =>
  tags.map((t) => `<a title="Release ${t.version} Update Notes">${t.version}</a><span class="release-tag ${t.channel}">${t.channel}</span>`).join('\n');

describe('latestStableBuild', () => {
  it('takes the newest build of the module\'s major', () => {
    const builds = stableBuilds(page([
      { version: '14.369', channel: 'stable' },
      { version: '14.370', channel: 'stable' },
      { version: '13.348', channel: 'stable' },
    ]));

    expect(latestStableBuild(builds, '14')).toBe('14.370');
    expect(latestStableBuild(builds, '13')).toBe('13.348');
  });

  it('ignores builds on other majors and non-stable channels', () => {
    const builds = stableBuilds(page([
      { version: '14.371', channel: 'prototype' },
      { version: '14.370', channel: 'stable' },
    ]));

    expect(latestStableBuild(builds, '14')).toBe('14.370');
  });

  it('returns null when that major has no stable build', () => {
    const builds = stableBuilds(page([{ version: '14.370', channel: 'stable' }]));

    expect(latestStableBuild(builds, '13')).toBeNull();
  });
});

describe('shouldBump', () => {
  it('bumps when a newer build exists on the same major', () => {
    expect(shouldBump('14.370', '14.371')).toBe(true);
  });

  it('stays put when already on the latest build', () => {
    expect(shouldBump('14.370', '14.370')).toBe(false);
    expect(shouldBump('14.370', '14.369')).toBe(false);
  });

  it('bumps when the major changes, so a 13 module does not silently keep 14', () => {
    expect(shouldBump('13.348', '14.370')).toBe(true);
  });
});

describe('buildOf', () => {
  it('reads the build number, not the whole version', () => {
    expect(buildOf('14.370')).toBe(370);
    expect(buildOf('14')).toBe(0);
  });
});
