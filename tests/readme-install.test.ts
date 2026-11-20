import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The install snippet in the README is the copy-paste URL for Foundry's setup screen, and module.json
 * is what the release job ships as the installable manifest. Both have to stay on the same release
 * channel, or one of them can point at a version nobody ever cut, and the module then fails to
 * install for exactly that reason. The README and the manifest are both hand-maintained apart from
 * the stamp, so this is the check that catches the drift.
 */

const repo = 'LewisIsWorking/invisi-rolls';
const moduleJson = JSON.parse(readFileSync(new URL('../module.json', import.meta.url), 'utf8')) as {
  url: string;
  manifest: string;
  download: string;
};
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('README install snippet', () => {
  it('keeps the install URL in step with module.json', () => {
    expect(readme).toContain(moduleJson.manifest);
  });

  it('points module.json at this repository and the latest release channel', () => {
    expect(moduleJson.url).toBe(`https://github.com/${repo}`);
    expect(moduleJson.manifest).toBe(`https://github.com/${repo}/releases/latest/download/module.json`);
    expect(moduleJson.download).toBe(`https://github.com/${repo}/releases/latest/download/module.zip`);
  });
});
