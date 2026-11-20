/**
 * Pure parts of the foundryvtt.com publish step: building the release body and checking that it,
 * and the install URLs baked into module.json, point at this repository's releases. The fetching and
 * the token handling live in scripts/publish-foundry.ts.
 */

/** Whether DRY_RUN is set, so the step validates locally instead of sending anything. */
export function isDryRun(value: string | undefined): boolean {
  return value === 'true';
}

/** Whether the step should warn and skip: no package page yet, so the release itself already shipped. */
export function shouldSkip(token: string | undefined, dryRun: boolean): boolean {
  return !token && !dryRun;
}

/** Whether a token is required for this run. */
export function tokenRequired(dryRun: boolean): boolean {
  return !dryRun;
}

/** The tag the release is pinned to, from the stamped version. */
export function releaseTag(version: string): string {
  return `v${version}`;
}

/** Build the request body Foundry's Package Release API expects. */
export function releaseBody(
  manifest: { id: string; version: string; compatibility: unknown },
  repo: string,
  dryRun: boolean,
): {
  id: string;
  'dry-run': boolean;
  release: { version: string; manifest: string; notes: string; compatibility: unknown };
} {
  const tag = releaseTag(manifest.version);
  return {
    id: manifest.id,
    'dry-run': dryRun,
    release: {
      version: manifest.version,
      manifest: `https://github.com/${repo}/releases/download/${tag}/module.json`,
      notes: `https://github.com/${repo}/releases/tag/${tag}`,
      compatibility: manifest.compatibility,
    },
  };
}

/**
 * Validate the release body and the install URLs baked into module.json. Returns the list of
 * problems; an empty list means the body is valid.
 */
export function validateRelease(
  manifest: { id?: unknown; version?: unknown; manifest?: unknown; download?: unknown; compatibility?: unknown },
  repo: string,
  body: ReturnType<typeof releaseBody>,
): string[] {
  const problems: string[] = [];
  if (typeof body.id !== 'string' || !body.id) problems.push('manifest id is missing');
  if (!/^\d+\.\d+\.\d+$/.test(String(body.release.version))) {
    problems.push(`release version is not semver: ${body.release.version}`);
  }
  const compatibility = body.release.compatibility as Record<string, unknown> | undefined;
  for (const key of ['minimum', 'verified', 'maximum']) {
    if (typeof compatibility?.[key] !== 'string') problems.push(`compatibility.${key} is missing`);
  }
  for (const key of ['manifest', 'notes'] as const) {
    if (!String(body.release[key]).startsWith(`https://github.com/${repo}/releases/`)) {
      problems.push(`release ${key} does not point at this repo's releases: ${body.release[key]}`);
    }
  }
  for (const key of ['manifest', 'download'] as const) {
    const value = manifest[key];
    if (typeof value !== 'string' || !value.startsWith(`https://github.com/${repo}/releases/`)) {
      problems.push(`module.json ${key} does not point at this repo's releases: ${value}`);
    }
  }
  return problems;
}
