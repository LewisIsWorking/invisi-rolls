/**
 * Detects an upstream Foundry, PF2e or SF2e release that has not been live-checked yet, so the
 * standing watch is a daily workflow and not someone remembering to look. Pure functions: the
 * fetching lives in scripts/check-upstream.ts.
 */

/** The builds tagged stable on foundryvtt.com/releases, in page order. */
export function stableBuilds(html: string): string[] {
  const builds: string[] = [];
  let pending: string | null = null;
  for (const match of html.matchAll(/title="Release (\d+\.\d+) Update Notes"|release-tag (\w+)/g)) {
    if (match[1]) pending = match[1];
    else if (pending) {
      if (match[2] === 'stable') builds.push(pending);
      pending = null;
    }
  }
  return builds;
}

/** Version parts compared as numbers, so 14.99 is older than 14.370. */
export function compare(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The newest of the versions, or null when there are none. */
export function newest(versions: string[]): string | null {
  return versions.reduce<string | null>((best, version) => (best === null || compare(version, best) > 0 ? version : best), null);
}

/**
 * The newest release tag of one system: `pf2e-8.7.1` -> `8.7.1`. The anachronism builds
 * (`pf2e-anachronism-2.5.1`) are a separate package and are ignored.
 */
export function tagVersion(tags: string[], system: 'pf2e' | 'sf2e'): string | null {
  const prefix = `${system}-`;
  const versions = tags
    .filter((tag) => tag.startsWith(prefix) && /^\d+(\.\d+)*$/.test(tag.slice(prefix.length)))
    .map((tag) => tag.slice(prefix.length));
  return newest(versions);
}

/** What the last live check ran against. */
export interface Baseline {
  foundry?: string;
  pf2e?: string;
  sf2e?: string;
}

export interface Step {
  name: keyof Baseline;
  was: string;
  now: string;
}

/** Every baseline entry upstream has moved past. A missing entry cannot drift. */
export function drift(baseline: Baseline, current: Baseline): Step[] {
  const steps: Step[] = [];
  for (const name of ['foundry', 'pf2e', 'sf2e'] as const) {
    const was = baseline[name];
    const now = current[name];
    if (was && now && compare(now, was) > 0) steps.push({ name, was, now });
  }
  return steps;
}
