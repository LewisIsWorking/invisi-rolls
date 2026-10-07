/**
 * Do a system's card buttons work on an Invisi card? PF2e's "Apply damage" is the test: it looks the
 * card's message up with game.messages.get, reads its DamageRoll and applies it to the controlled
 * token. The button is CLICKED, not called, because the likeliest failure (the button not finding
 * its message) only shows up through the real DOM path.
 *
 * Needs a running Foundry v14 world on the pf2e system at FOUNDRY_URL, with this module installed.
 * See docs/LIVE-CHECK.md. Creates a scene, an NPC and a token: never point it at a real game.
 */
import { chromium, type Browser, type Page } from 'playwright';

const URL = process.env['FOUNDRY_URL'] ?? 'http://localhost:30077';
const PASSWORD = process.env['FOUNDRY_PASSWORD'] ?? '';
// A real world usually has its own "Gamemaster" already; name the test GM account instead.
const GM = process.env['FOUNDRY_GM'] ?? 'Gamemaster';
const SLOW = { timeout: 600_000, polling: 1000 };
const SECRET = /MARK_PF2E_INVISI/;

interface Client {
  page: Page;
  frames: string[];
}

async function join(browser: Browser, name: string, canvas: boolean): Promise<Client> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  if (!canvas) {
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('core.noCanvas', 'true');
      } catch {
        /* ignore */
      }
    });
  }
  ctx.setDefaultTimeout(600_000);
  const page = await ctx.newPage();
  const frames: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${name} ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => console.log(`[${name} page error] ${String(e).slice(0, 300)}`));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(`${URL}/join`, { waitUntil: 'domcontentloaded', timeout: 600_000 });
  await page.fill('input[name=username]', name);
  // A server reachable from the internet needs passwords; the throwaway one does not.
  if (PASSWORD) await page.fill('input[name=password]', PASSWORD);
  await page.click('button[name=join]', { noWaitAfter: true });
  await ready(page);
  return { page, frames };
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (globalThis as any).game?.ready === true, null, SLOW);
  await page.evaluate((pw) => ((globalThis as any).__pw = pw), PASSWORD);
}

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/** Stage a scene with one NPC token, controlled by the GM. Returns the actor id. */
const stage = (page: Page) =>
  page.evaluate(async () => {
    const g = globalThis as any;
    let scene = g.game.scenes.getName('Invisi Test');
    if (!scene) scene = await g.Scene.create({ name: 'Invisi Test', width: 1000, height: 1000 });
    if (!scene.active) await scene.activate();
    let actor = g.game.actors.getName('Invisi Dummy');
    if (!actor) actor = await g.Actor.create({ name: 'Invisi Dummy', type: 'npc' });
    await actor.update({ 'system.attributes.hp.max': 100, 'system.attributes.hp.value': 100 });
    if (!scene.tokens.some((t: any) => t.actorId === actor.id)) {
      const td = await actor.getTokenDocument({ x: 200, y: 200 });
      await scene.createEmbeddedDocuments('Token', [td.toObject()]);
    }
    return actor.id as string;
  });

const control = (page: Page, actorId: string) =>
  page.waitForFunction(
    (id) => {
      const g = globalThis as any;
      const token = g.canvas?.tokens?.placeables?.find((t: any) => t.actor?.id === id);
      if (!token) return false;
      token.control({ releaseOthers: true });
      if (g.canvas.tokens.controlled.length !== 1) return false;
      // Selection made: stop rendering. Software WebGL on a GPU-less host starves the whole browser.
      g.canvas.app.ticker.stop();
      return true;
    },
    actorId,
    SLOW,
  );

/**
 * HP of the TOKEN's actor. An NPC token is unlinked by default, so damage lands on the token's own
 * copy, and the world actor's HP never moves: reading that made a working button look broken.
 */
const hp = (page: Page, actorId: string) =>
  page.evaluate((id) => {
    const g = globalThis as any;
    const token = g.game.scenes.active.tokens.find((t: any) => t.actorId === id);
    return token.actor.system.attributes.hp.value as number;
  }, actorId);

/** HP once it reaches `expected`, or whatever it is after 90 s. A fixed wait failed on a busy VM. */
async function hpBecomes(page: Page, actorId: string, expected: number): Promise<number> {
  const deadline = Date.now() + 90_000;
  let value = await hp(page, actorId);
  while (value !== expected && Date.now() < deadline) {
    await page.waitForTimeout(1000);
    value = await hp(page, actorId);
  }
  return value;
}

/** Click the Apply Damage button on the newest Invisi card. */
async function clickApply(page: Page, cardSelector = '#chat li.chat-message.invisi-roll'): Promise<boolean> {
  const card = page.locator(cardSelector).last();
  const button = card.locator('button[data-action="applyDamage"][data-multiplier="1"]');
  if ((await button.count()) === 0) return false;
  // A real click event through PF2e's own listener. Playwright's pointer click refuses: the chat
  // log's scroll container reports the button as outside the viewport.
  await button.first().evaluate((b) => (b as HTMLElement).click());
  return true;
}

const browser = await chromium.launch();
try {
  const gm = await join(browser, GM, true);
  const needsReload = await gm.page.evaluate(async () => {
    const g = (globalThis as any).game;
    if (!g.users.getName('Player')) await (globalThis as any).User.create({ name: 'Player', role: 1, password: (globalThis as any).__pw });
    const config = g.settings.get('core', 'moduleConfiguration');
    if (config['invisi-rolls']) return false;
    await g.settings.set('core', 'moduleConfiguration', { ...config, 'invisi-rolls': true });
    return true;
  });
  if (needsReload) {
    await gm.page.reload({ waitUntil: 'domcontentloaded' });
    await ready(gm.page);
  }
  // Starfinder 2e shares PF2e's damage cards and Apply Damage button, so the same check covers it.
  check('system is pf2e or sf2e and module is active', await gm.page.evaluate(() => {
    const g = (globalThis as any).game;
    return ['pf2e', 'sf2e'].includes(g.system.id) && g.modules.get('invisi-rolls')?.active === true;
  }));

  const actorId = await stage(gm.page);
  await control(gm.page, actorId);
  const player = await join(browser, 'Player', false);

  // CONTROL: the same click on an ordinary public damage card. If this fails too, the fault is the
  // test setup (selection, canvas), not the module, and the Invisi results below mean nothing.
  // Full HP first: damage stays on the token between runs, and at 0 HP a working button looks broken.
  await gm.page.evaluate(async (id) => {
    const g = globalThis as any;
    const token = g.game.scenes.active.tokens.find((t: any) => t.actorId === id);
    await token.actor.update({ 'system.attributes.hp.value': token.actor.system.attributes.hp.max });
  }, actorId);
  const before = await hp(gm.page, actorId);
  await gm.page.evaluate(async () => {
    const g = globalThis as any;
    const DamageRoll = g.CONFIG.Dice.rolls.find((r: any) => r.name === 'DamageRoll');
    await new DamageRoll('3[fire]').toMessage({ flavor: 'CONTROL_PUBLIC' }, { messageMode: 'public' });
  });
  await gm.page.waitForTimeout(5000);
  console.log('controlled tokens:', await gm.page.evaluate(() => (globalThis as any).game.user.getActiveTokens().map((t: any) => t.name)));
  check('control: Apply Damage button on a public card', await clickApply(gm.page, '#chat li.chat-message:not(.invisi-roll)'));
  const controlHp = await hpBecomes(gm.page, actorId, before - 3);
  check('control: public Apply Damage took 3 HP', controlHp === before - 3, `${before} -> ${controlHp}`);

  const start = await hp(gm.page, actorId);
  await gm.page.evaluate(async () => {
    const g = globalThis as any;
    const DamageRoll = g.CONFIG.Dice.rolls.find((r: any) => r.name === 'DamageRoll');
    await new DamageRoll('7[fire]').toMessage({ flavor: 'MARK_PF2E_INVISI' }, { messageMode: 'invisi' });
  });
  await gm.page.waitForTimeout(5000);

  const local = await gm.page.evaluate(() => {
    const g = globalThis as any;
    const m = g.game.messages.contents.find((x: any) => String(x.flavor).includes('MARK_PF2E_INVISI'));
    return m ? { local: g.game.modules.get('invisi-rolls').api.isLocal(m), cls: m.constructor.name, rolls: m.rolls.length } : null;
  });
  check('the Invisi card is a GM-local PF2e message with its roll', !!local?.local && local.rolls === 1, JSON.stringify(local));

  check('Apply Damage button exists on the Invisi card', await clickApply(gm.page));
  const afterFirst = await hpBecomes(gm.page, actorId, start - 7);
  check('Apply Damage took 7 HP off the token', afterFirst === start - 7, `${start} -> ${afterFirst}`);

  // A card button writing back to its message: must stay local and survive a reload.
  await gm.page.evaluate(async () => {
    const g = globalThis as any;
    const m = g.game.messages.contents.find((x: any) => String(x.flavor).includes('MARK_PF2E_INVISI'));
    await m.setFlag('invisi-rolls', 'probe', 'kept');
  });

  await gm.page.reload({ waitUntil: 'domcontentloaded' });
  await ready(gm.page);
  await control(gm.page, actorId);
  await gm.page.waitForTimeout(3000);
  check('after a GM reload the card is back, with the flag a button wrote', await gm.page.evaluate(() => {
    const g = globalThis as any;
    const m = g.game.messages.contents.find((x: any) => String(x.flavor).includes('MARK_PF2E_INVISI'));
    return m?.getFlag('invisi-rolls', 'probe') === 'kept';
  }));
  check('Apply Damage still works after the reload', await clickApply(gm.page));
  const afterSecond = await hpBecomes(gm.page, actorId, afterFirst - 7);
  check('second Apply Damage took another 7 HP', afterSecond === afterFirst - 7, `${afterFirst} -> ${afterSecond}`);

  check('player received no frame with the Invisi card', !player.frames.some((f) => SECRET.test(f)));
  check('player holds no Invisi document', !(await player.page.evaluate(() =>
    JSON.stringify((globalThis as any).game.messages.contents.map((m: any) => m.toObject())),
  )).match(SECRET));
} finally {
  await browser.close();
}

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
