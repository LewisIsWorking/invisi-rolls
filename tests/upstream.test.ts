import { describe, expect, it } from 'vitest';
import { compare, drift, newest, stableBuilds, tagVersion } from '../src/upstream.ts';

/**
 * The upstream watch decides whether a live check is owed. If it stops seeing a release, or sees
 * one that is not newer, a breaking system update reaches the live worlds unnoticed.
 */

describe('stableBuilds', () => {
  it('collects only the builds tagged stable, in page order', () => {
    const html = [
      '<a title="Release 14.372 Update Notes">14.372</a><span class="release-tag prototype">prototype</span>',
      '<a title="Release 14.371 Update Notes">14.371</a><span class="release-tag testing">testing</span>',
      '<a title="Release 14.370 Update Notes">14.370</a><span class="release-tag stable">stable</span>',
      '<a title="Release 13.348 Update Notes">13.348</a><span class="release-tag stable">stable</span>',
    ].join('\n');

    expect(stableBuilds(html)).toEqual(['14.370', '13.348']);
  });

  it('finds nothing when the page no longer carries the tag class', () => {
    expect(stableBuilds('<a title="Release 14.370 Update Notes">14.370</a>')).toEqual([]);
  });
});

describe('compare', () => {
  it('compares each part as a number, not as text', () => {
    expect(compare('14.370', '14.99')).toBeGreaterThan(0);
    expect(compare('14.370', '14.370')).toBe(0);
    expect(compare('13.348', '14.0')).toBeLessThan(0);
  });

  it('treats a missing part as zero', () => {
    expect(compare('14', '14.0.0')).toBe(0);
    expect(compare('14.1', '14')).toBeGreaterThan(0);
  });
});

describe('newest', () => {
  it('picks the highest version and copes with an empty list', () => {
    expect(newest(['13.348', '14.370', '14.99'])).toBe('14.370');
    expect(newest([])).toBeNull();
  });
});

describe('tagVersion', () => {
  const tags = [
    'pf2e-anachronism-2.5.1',
    'sf2e-anachronism-2.5.1',
    'pf2e-8.7.1',
    'sf2e-1.7.1',
    'pf2e-8.7.0',
    'pf2e-8.10.0',
  ];

  it('reads the version out of the system tag, not the anachronism builds', () => {
    expect(tagVersion(tags, 'pf2e')).toBe('8.10.0');
    expect(tagVersion(tags, 'sf2e')).toBe('1.7.1');
  });

  it('returns null when no tag of that system is present', () => {
    expect(tagVersion(['pf2e-anachronism-2.5.1'], 'sf2e')).toBeNull();
    expect(tagVersion([], 'pf2e')).toBeNull();
  });
});

describe('drift', () => {
  it('reports each entry upstream moved past, and nothing else', () => {
    const steps = drift(
      { foundry: '14.370', pf2e: '8.7.1', sf2e: '1.7.1' },
      { foundry: '14.371', pf2e: '8.7.1', sf2e: '1.8.0' },
    );

    expect(steps).toEqual([
      { name: 'foundry', was: '14.370', now: '14.371' },
      { name: 'sf2e', was: '1.7.1', now: '1.8.0' },
    ]);
  });

  it('does not drift backwards or on a missing baseline entry', () => {
    expect(drift({ foundry: '14.370' }, { foundry: '14.369', pf2e: '8.7.1' })).toEqual([]);
    expect(drift({}, { foundry: '14.370', pf2e: '8.7.1' })).toEqual([]);
  });
});
