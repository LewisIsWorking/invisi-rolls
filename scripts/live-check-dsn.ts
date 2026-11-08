/**
 * Dice So Nice: the GM sees each Invisi-Roll's dice exactly once (Dice So Nice also listens for new
 * chat messages, so a careless setup animates twice), and no player sees any dice for it. A public
 * roll is the control: it must animate for the player, or "no dice" below proves nothing.
 *
 * Needs the same throwaway instance as live-check.ts with Dice So Nice installed. See
 * docs/LIVE-CHECK.md.
 */
import { chromium, type Browser, type Page } from 'playwright';

const URL = process.env['FOUNDRY_URL'] ?? 'http://localhost:30077';
const PASSWORD = process.env['FOUNDRY_PASSWORD'] ?? '';
// A real world usually has its own "Gamemaster" already; name the test GM account instead.
const GM = process.env['FOUNDRY_GM'] ?? 'Gamemaster';
// Players too, for a world that already has users called Player or Other.
const PLAYER = process.env['FOUNDRY_PLAYER'] ?? 'Player';
const SLOW = { timeout: 900_000, polling: 1000 };

/**
 * Signs in and waits for the world. The join form can redraw while it is being filled, when someone
 * else connects, and that empties the user picker: an empty pick is tried again. Any other refusal
 * fails at once with Foundry's own message, rather than after the long wait.
 */
async function signIn(page: Page, name: string): Promise<void> {
  const refused = 'must select a user|invalid password|does not exist';
  await signIn(page, name);
  await page.evaluate((pw) => ((globalThis as any).__pw = pw), PASSWORD);
  // Count every animation Dice So Nice starts, by its dice total (each roll below is dice-only, so the
  // totals 3, 5 and 7 name the roll).
  await page.evaluate(() => {
    const g = globalThis as any;
    g.canvas?.app?.ticker?.stop();
    g.__dice = [] as number[];
    g.Hooks.on('diceSoNiceRollStart', (_id: string, ctx: any) => g.__dice.push(ctx?.roll?.total));
  });
  return page;
}

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
try {
  let gm = await join(browser, GM);
  const needsReload = await gm.evaluate(async (player) => {
    const g = (globalThis as any).game;
    if (!g.users.getName(player)) await (globalThis as any).User.create({ name: player, role: 1, password: (globalThis as any).__pw });
    const config = g.settings.get('core', 'moduleConfiguration');
    if (config['invisi-rolls'] && config['dice-so-nice']) return false;
    await g.settings.set('core', 'moduleConfiguration', { ...config, 'invisi-rolls': true, 'dice-so-nice': true });
    return true;
  }, PLAYER);
  if (needsReload) {
    await gm.context().close();
    gm = await join(browser, GM);
  }
  check('Dice So Nice and Invisi-Rolls are active', await gm.evaluate(() => {
    const g = (globalThis as any).game;
    return g.modules.get('dice-so-nice')?.active === true && g.modules.get('invisi-rolls')?.active === true && !!g.dice3d;
  }));

  const player = await join(browser, PLAYER);
  const dice = (p: Page) => p.evaluate(() => (globalThis as any).__dice as number[]);
  const roll = (p: Page, formula: string, mode?: string) =>
    p.evaluate(([f, m]) => new (globalThis as any).Roll(f).toMessage({}, m ? { messageMode: m } : {}), [formula, mode] as const);
  const settle = () => gm.waitForTimeout(8000);

  await roll(gm, '3d1');
  await settle();
  check('control: a public roll animates for the player', (await dice(player)).includes(3), JSON.stringify(await dice(player)));

  await roll(gm, '5d1', 'invisi');
  await roll(player, '7d1', 'invisi');
  await settle();
  const gmDice = await dice(gm);
  const count = (n: number) => gmDice.filter((t) => t === n).length;
  check("GM sees their own Invisi-Roll's dice exactly once", count(5) === 1, JSON.stringify(gmDice));
  check("GM sees the player's Invisi-Roll's dice exactly once", count(7) === 1, JSON.stringify(gmDice));
  const playerDice = await dice(player);
  check('player sees no dice for either Invisi-Roll', !playerDice.includes(5) && !playerDice.includes(7), JSON.stringify(playerDice));
} finally {
  await browser.close();
}

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
