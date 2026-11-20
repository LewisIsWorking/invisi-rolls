/**
 * Pure parts of the daily bump-verified step: which stable Foundry build to take and whether the
 * module's compatibility.verified needs to move. The fetching, writing and changeset live in
 * scripts/bump-verified.ts. The stable-build parser mirrors src/upstream.ts (duplicated so this
 * branch does not depend on it).
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

/** The build number of a `14.370` style version. */
export function buildOf(version: string): number {
  return Number(version.split('.')[1] ?? 0);
}

/** The newest stable build of the module's major Foundry version, or null when none exist. */
export function latestStableBuild(builds: string[], major: string): string | null {
  const sameMajor = builds.filter((version) => version.split('.')[0] === major);
  return sameMajor.sort((a, b) => buildOf(b) - buildOf(a))[0] ?? null;
}

/**
 * Whether compatibility.verified has to move. A module supporting a different major, or already on
 * a build at least as new, is left alone.
 */
export function shouldBump(current: string, latest: string): boolean {
  const currentMajor = current.split('.')[0];
  const latestMajor = latest.split('.')[0];
  return !(currentMajor === latestMajor && buildOf(current) >= buildOf(latest));
}
