import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guards the module manifest Foundry installs and updates from. The release job stamps the version,
 * but every other field is hand-written, and a wrong repository in `manifest` or `download` makes
 * Foundry's update check fail or install a package from somewhere else.
 */

interface Manifest {
  id: string;
  title: string;
  description: string;
  version: string;
  authors?: { name?: string }[];
  compatibility?: { minimum?: string; verified?: string; maximum?: string };
  esmodules?: string[];
  styles?: string[];
  languages?: { lang: string; name: string; path: string }[];
  socket?: boolean;
  relationships?: { recommends?: { id?: string }[]; systems?: { id?: string }[] };
  url: string;
  manifest: string;
  download: string;
  readme: string;
  bugs: string;
  license: string;
}

interface Package {
  name: string;
  version: string;
  repository: { url: string };
}

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = read('module.json') as Manifest;
const pkg = read('package.json') as Package;

/** `git+https://github.com/owner/repo.git` as Foundry wants it: `https://github.com/owner/repo`. */
const repoUrl = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');

describe('module.json', () => {
  it('is the module Foundry installs by this id', () => {
    expect(manifest.id).toBe(pkg.name);
    expect(manifest.title.trim()).not.toBe('');
    expect(manifest.description.trim().length).toBeGreaterThan(20);
    expect(manifest.authors?.every((a) => (a.name ?? '').trim() !== '')).toBe(true);
  });

  it('holds a version the release job can stamp and Foundry can order', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    // The repo keeps a placeholder: scripts/stamp-manifest.ts writes the real version at release time.
    expect(manifest.version).not.toBe('');
  });

  it('pins the compatibility window it was verified in', () => {
    expect(manifest.compatibility?.minimum).toBe('14');
    expect(manifest.compatibility?.maximum).toBe('14');
    expect(manifest.compatibility?.verified).toMatch(/^14\.\d+$/);
  });

  it('points every link at this repository', () => {
    expect(manifest.url).toBe(repoUrl);
    expect(manifest.readme).toBe(`${repoUrl}/blob/main/README.md`);
    expect(manifest.bugs).toBe(`${repoUrl}/issues`);
    expect(manifest.license).toBe(`${repoUrl}/blob/main/LICENSE`);
  });

  it('keeps the manifest on latest and the download on latest, as the release job uploads it', () => {
    expect(manifest.manifest).toBe(`${repoUrl}/releases/latest/download/module.json`);
    expect(manifest.download).toBe(`${repoUrl}/releases/latest/download/module.zip`);
  });

  it('loads the files the build writes', () => {
    expect(manifest.esmodules).toEqual(['dist/invisi-rolls.js']);
    expect(manifest.styles).toEqual(['dist/invisi-rolls.css']);
  });

  it('opens the socket the module sends over, and recommends Dice So Nice', () => {
    expect(manifest.socket).toBe(true);
    expect(manifest.relationships?.recommends?.map((r) => r.id)).toEqual(['dice-so-nice']);
  });

  it('lists a language file that is on disk and parses', () => {
    const languages = manifest.languages ?? [];
    expect(languages.map((l) => [l.lang, l.path])).toEqual([['en', 'lang/en.json']]);
    for (const language of languages) {
      expect(existsSync(new URL(`../${language.path}`, import.meta.url)), language.path).toBe(true);
      expect(typeof read(language.path)).toBe('object');
    }
    expect((read('lang/en.json') as { INVISI?: Record<string, string> }).INVISI?.['Mode']).toBeTruthy();
  });
});
