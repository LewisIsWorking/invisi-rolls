/**
 * The only test that can prove the module's promise: a real Foundry, a GM and two players in real
 * browsers, and EVERY websocket frame each player receives recorded. A roll is invisible only if
 * its marker appears in none of those frames, live or after a reload.
 *
 * Needs a running Foundry v14 world at FOUNDRY_URL (default http://localhost:30077) with this module
 * installed and Gamemaster/Player/Other users without passwords (the script creates the players and
 * enables the module if needed). See docs/LIVE-CHECK.md for a throwaway setup.
 */
import { chromium, type Browser, type Page } from 'playwright';

const URL = process.env['FOUNDRY_URL'] ?? 'http://localhost:30077';
const PASSWORD = process.env['FOUNDRY_PASSWORD'] ?? '';
// A real world usually has its own "Gamemaster" already; name the test GM account instead.
const GM = process.env['FOUNDRY_GM'] ?? 'Gamemaster';
const SLOW = { timeout: 300_000, polling: 1000 };

interface Client {
  page: Page;
  frames: string[];
}

async function join(browser: Browser, name: string): Promise<Client> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  // No GPU here: a drawn scene through software WebGL starves the page for minutes.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('core.noCanvas', 'true');
    } catch {
      /* ignore */
    }
  });
  ctx.setDefaultTimeout(600_000);
  const page = await ctx.newPage();
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(`${URL}/join`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.fill('input[name=username]', name);
  // A server reachable from the internet needs passwords; the throwaway one does not.
  if (PASSWORD) await page.fill('input[name=password]', PASSWORD);
  await page.click('button[name=join]', { noWaitAfter: true });
  await page.waitForFunction(() => (globalThis as any).game?.ready === true, null, SLOW);
  await page.evaluate((pw) => ((globalThis as any).__pw = pw), PASSWORD);
  return { page, frames };
}

const ready = (c: Client) => c.page.waitForFunction(() => (globalThis as any).game?.ready === true, null, SLOW);

/** Matches only the Invisi markers, never module names or descriptions that also say Invisi. */
const SECRET = /MARK_(GM|PLAYER|SELECTOR)_INVISI|MARK_LATE_HOOK/;
const leaks = (text: string) => SECRET.test(text);

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
try {
  const gm = await join(browser, GM);
  const needsReload = await gm.page.evaluate(async () => {
    const g = (globalThis as any).game;
    for (const name of ['Player', 'Other']) {
      if (!g.users.getName(name)) await (globalThis as any).User.create({ name, role: 1, password: (globalThis as any).__pw });
    }
    const config = g.settings.get('core', 'moduleConfiguration');
    if (config['invisi-rolls']) return false;
    await g.settings.set('core', 'moduleConfiguration', { ...config, 'invisi-rolls': true });
    return true;
  });
  if (needsReload) {
    await gm.page.reload({ waitUntil: 'domcontentloaded' });
    await ready(gm);
  }
  check('module is active', await gm.page.evaluate(() => (globalThis as any).game.modules.get('invisi-rolls')?.active === true));
  check('mode is registered', await gm.page.evaluate(() => 'invisi' in (globalThis as any).CONFIG.ChatMessage.modes));

  const player = await join(browser, 'Player');
  const other = await join(browser, 'Other');
  const settle = () => gm.page.waitForTimeout(3000);
  const roll = (c: Client, formula: string, flavor: string, mode?: string) =>
    c.page.evaluate(
      ([f, fl, m]) => new (globalThis as any).Roll(f).toMessage({ flavor: fl }, m ? { messageMode: m } : {}),
      [formula, flavor, mode] as const,
    );
  const gmLog = () => gm.page.evaluate(() => document.querySelector('#chat')?.textContent ?? '');
  const docs = (c: Client) =>
    c.page.evaluate(() => JSON.stringify((globalThis as any).game.messages.contents.map((m: any) => m.toObject())));

  // Control: a public roll DOES reach players, so a missing marker below means hidden, not unrecorded.
  await roll(gm, '1d1+8000', 'MARK_PUBLIC');
  await settle();
  check('control: public roll reaches the player', player.frames.some((f) => f.includes('MARK_PUBLIC')));

  // 1. GM rolls in Invisi mode.
  await roll(gm, '1d1+8100', 'MARK_GM_INVISI', 'invisi');
  // 2. A player rolls in Invisi mode.
  await roll(player, '1d1+8200', 'MARK_PLAYER_INVISI', 'invisi');
  // 3. The mode picked in the chat selector, with no option passed (how most systems roll).
  await gm.page.evaluate(() => (globalThis as any).game.settings.set('core', 'messageMode', 'invisi'));
  await roll(gm, '1d1+8300', 'MARK_SELECTOR_INVISI');
  await gm.page.evaluate(() => (globalThis as any).game.settings.set('core', 'messageMode', 'public'));
  // Wait for all three rather than a fixed time: on a busy machine the player's socket hop is slow.
  await gm.page
    .waitForFunction(
      () => ['MARK_GM_INVISI', 'MARK_PLAYER_INVISI', 'MARK_SELECTOR_INVISI'].every((m) => document.querySelector('#chat')?.textContent?.includes(m)),
      null,
      { timeout: 120_000, polling: 1000 },
    )
    .catch(() => undefined);
  await settle();

  // 4. Another module finishing the message in a LATER preCreate hook, registered just before the
  // roll, the way PF2e Toolbelt adds its target rows when Damage is clicked. Its flag must survive.
  const lateFlag = await gm.page.evaluate(async () => {
    const g = globalThis as any;
    g.Hooks.once('preCreateChatMessage', (m: any) => {
      m.updateSource({ flags: { 'late-module': { targets: ['MARK_TARGET'] } } });
    });
    await new g.Roll('1d1+8400').toMessage({ flavor: 'MARK_LATE_HOOK' }, { messageMode: 'invisi' });
    for (let i = 0; i < 30; i++) {
      const m = g.game.messages.contents.find((x: any) => x.flavor === 'MARK_LATE_HOOK');
      if (m) return { local: g.game.modules.get('invisi-rolls').api.isLocal(m), flag: m.getFlag('late-module', 'targets') };
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  });
  check("a later module's preCreate flag is kept on the Invisi card", !!lateFlag?.local && lateFlag.flag?.[0] === 'MARK_TARGET', JSON.stringify(lateFlag));

  const log = await gmLog();
  check('GM sees their own Invisi-Roll', log.includes('MARK_GM_INVISI'));
  check("GM sees the player's Invisi-Roll", log.includes('MARK_PLAYER_INVISI'));
  check('GM sees a selector-mode Invisi-Roll', log.includes('MARK_SELECTOR_INVISI'));
  // The GM holds each Invisi message as a GM-LOCAL document (so card buttons work). None may be a
  // server document: those are the ones every client receives.
  const gmHeld = await gm.page.evaluate((source) => {
    const g = globalThis as any;
    const re = new RegExp(source);
    const api = g.game.modules.get('invisi-rolls').api;
    const matching = g.game.messages.contents.filter((m: any) => re.test(JSON.stringify(m.toObject())));
    return { count: matching.length, allLocal: matching.every((m: any) => api.isLocal(m)) };
  }, SECRET.source);
  check('GM holds all four, every one GM-local, none on the server', gmHeld.count === 4 && gmHeld.allLocal, JSON.stringify(gmHeld));

  for (const [label, c] of [['Player', player], ['Other', other]] as const) {
    check(`${label} received no Invisi frame`, !c.frames.some(leaks));
    check(`${label} holds no Invisi document`, !leaks(await docs(c)));
  }

  other.frames.length = 0;
  await other.page.reload({ waitUntil: 'domcontentloaded' });
  await ready(other);
  check('Other still has nothing after a reload', !other.frames.some(leaks) && !leaks(await docs(other)));

  check('history recorded all three on the GM browser', await gm.page.evaluate(
    () => (globalThis as any).game.modules.get('invisi-rolls').api.history().length >= 3,
  ));
} finally {
  await browser.close();
}

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
