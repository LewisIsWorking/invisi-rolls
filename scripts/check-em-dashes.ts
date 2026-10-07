/**
 * Zero em dashes anywhere in the repo, including escapes that print one. Prose uses " - ", a comma,
 * a colon or a full stop instead.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git']);
const DASH = String.fromCharCode(0x2014);
const BACKSLASH = String.fromCharCode(92);
const ESCAPES = [`${BACKSLASH}u2014`, '&' + 'mdash;', `${BACKSLASH}N{EM DASH}`];

const hits: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|js|json|md|css|yml|yaml|html|hbs|txt)$/.test(name)) {
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes(DASH) || ESCAPES.some((e) => line.includes(e))) hits.push(`${path}:${i + 1}`);
      });
    }
  }
};
walk('.');
if (hits.length > 0) {
  console.error(`Em dashes found (use " - ", a comma or a colon):\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('No em dashes.');
