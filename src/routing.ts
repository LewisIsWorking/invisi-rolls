/**
 * Pure decisions about where an Invisi-Roll may go. No Foundry globals here, so every rule that
 * keeps a roll away from players is unit tested without a running world.
 */

/** The key of the message mode this module adds to CONFIG.ChatMessage.modes. */
export const MODE = 'invisi';

/**
 * The module id. As a standalone module it is also the flag scope and the socket channel suffix; a
 * system that embeds Invisi-Rolls passes its own (src/start.ts), because Foundry only accepts a flag
 * scope or socket channel that belongs to the system or an active module.
 */
export const MODULE_ID = 'invisi-rolls';

/** Foundry only relays custom socket traffic on `module.<id>` for a module that declares `socket`. */
export const SOCKET = `module.${MODULE_ID}`;

/** The minimum a user record needs for routing. Matches Foundry's User, so real users pass as is. */
export interface UserLike {
  id: string;
  isGM: boolean;
  active: boolean;
}

/**
 * Is this message being created in Invisi mode?
 *
 * Two signals, because systems differ in how they create messages. `options.messageMode` is set by
 * Roll#toMessage and by ChatMessage.create callers that pass a mode. The flag is set by our mode
 * handler, which runs whenever anything calls ChatMessage.applyMode with our mode, including
 * systems that apply the mode to the data first and create the message later without the option.
 */
export function isInvisi(
  options: { messageMode?: unknown; rollMode?: unknown } | undefined,
  source: { flags?: Record<string, unknown> } | undefined,
  flagScope: string = MODULE_ID,
): boolean {
  if (options?.messageMode === MODE || options?.rollMode === MODE) return true;
  const flags = source?.flags?.[flagScope] as { invisi?: unknown } | undefined;
  return flags?.invisi === true;
}

/**
 * Is this a PF2e (or SF2e) secret check? Those systems mark a roll with the `secret` trait in
 * `flags.<system>.context` and send it as a core blind or GM roll, which every player's browser still
 * receives. `systemId` is the flag scope the system writes under.
 */
export function isSecretCheck(source: { flags?: Record<string, unknown> } | undefined, systemId: string): boolean {
  const context = (source?.flags?.[systemId] as { context?: { secret?: unknown; options?: unknown } } | undefined)
    ?.context;
  if (!context) return false;
  if (context.secret === true) return true;
  return Array.isArray(context.options) && context.options.includes('secret');
}

/**
 * The source data for revealing an Invisi card to everyone: the same message, as a fresh public one.
 * Drops the id (the server assigns one), the Invisi mark, the GM whisper list and the blind flag, and
 * keeps everything else, so the rolls, flavor and system flags (and the card's buttons) carry over.
 */
export function revealSource(source: Record<string, any>, flagScope: string): Record<string, any> {
  const data = toWire(source);
  delete data['_id'];
  data['whisper'] = [];
  data['blind'] = false;
  const ours = data['flags']?.[flagScope];
  if (ours) {
    delete ours.invisi;
    ours.revealed = true;
  }
  return data;
}

/** Every GM who is connected right now, except the sender. These are the only socket recipients. */
export function gmRecipients(users: Iterable<UserLike>, selfId: string): string[] {
  const ids: string[] = [];
  for (const user of users) {
    if (user.isGM && user.active && user.id !== selfId) ids.push(user.id);
  }
  return ids;
}

/**
 * What happens to an Invisi-Roll.
 *
 * - A GM's roll is shown on their own screen and forwarded to any other connected GMs.
 * - A player's roll goes to the connected GMs and nowhere else, not even back to the player.
 * - A player's roll with no GM connected is REFUSED. Falling back to a normal message would leak
 *   the exact roll the player asked to hide, so the only safe fallback is to send nothing.
 */
export type Route =
  | { kind: 'gm'; forwardTo: string[] }
  | { kind: 'player'; sendTo: string[] }
  | { kind: 'refuse' };

export function decideRoute(isGM: boolean, recipients: string[]): Route {
  if (isGM) return { kind: 'gm', forwardTo: recipients };
  if (recipients.length === 0) return { kind: 'refuse' };
  return { kind: 'player', sendTo: recipients };
}

/**
 * The socket payloads. Versioned so an older client can ignore a shape it does not understand.
 * A roll carries the ChatMessage source data, exactly as it would have been created. A reveal names a
 * card another GM revealed, so every GM drops their local copy of it: all copies share one id.
 */
export type InvisiPayload =
  | { v: 1; type: 'roll'; message: Record<string, unknown> }
  | { v: 1; type: 'reveal'; id: string };

/**
 * Message source data as the server or a socket would carry it: plain JSON. Systems can leave live
 * objects in a message's data (PF2e strikes hold a predicate function), which a socket silently drops
 * but structuredClone refuses, so the GM's own rolls broke while players' rolls worked.
 */
export function toWire<T>(source: T): T {
  return JSON.parse(JSON.stringify(source)) as T;
}

/**
 * Clean a message's HTML fields IN PLACE. Foundry's server does this to every message it stores, and
 * an Invisi message never reaches the server, so without this a tampered player client could run
 * script on the GM's screen. A field that is not a string is emptied, as the server does, because the
 * document would otherwise turn something like a one-item array into the very string it holds.
 */
export function cleanHtmlFields(data: Record<string, unknown>, clean: (html: string) => string): void {
  for (const field of ['content', 'flavor']) {
    const value = data[field];
    if (value === undefined || value === null || value === '') continue;
    data[field] = typeof value === 'string' ? clean(value) : '';
  }
}

/**
 * Remove the marked items from `items` IN PLACE and return them, in order. In place because Foundry
 * sends the very array it passed to _preCreateOperation, so a copy would leave them in the request.
 */
export function takeMarked<T>(items: T[], isMarked: (item: T) => boolean): T[] {
  const taken: T[] = [];
  for (let i = 0; i < items.length; ) {
    if (isMarked(items[i] as T)) taken.push(...items.splice(i, 1));
    else i++;
  }
  return taken;
}

export function makePayload(message: Record<string, unknown>): InvisiPayload {
  return { v: 1, type: 'roll', message };
}

export function makeRevealPayload(id: string): InvisiPayload {
  return { v: 1, type: 'reveal', id };
}

export function isPayload(value: unknown): value is InvisiPayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as { v?: unknown; type?: unknown; message?: unknown; id?: unknown };
  if (p.v !== 1) return false;
  if (p.type === 'roll') return typeof p.message === 'object' && p.message !== null;
  if (p.type === 'reveal') return typeof p.id === 'string' && p.id !== '';
  return false;
}

/**
 * Is the standalone module active in this world? A system that embeds Invisi-Rolls stands aside when
 * it is, so the two copies never both intercept the same roll and post it twice.
 */
export function standaloneActive(modules: { get(id: string): { active?: boolean } | undefined } | undefined): boolean {
  return modules?.get(MODULE_ID)?.active === true;
}

/** A plain object: not an array, not null. Message data is JSON, so nothing else needs telling apart. */
function isPlain(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turn Foundry's dotted update keys into nested objects, at every level, as foundry.utils.expandObject
 * does: `{ 'flags.a.b': 1 }` and `{ flags: { 'a.b': 1 } }` both become `{ flags: { a: { b: 1 } } }`.
 * Pure, so the update guard is tested without Foundry.
 */
function expand(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [path, raw] of Object.entries(data)) {
    const value = isPlain(raw) ? expand(raw) : raw;
    const parts = path.split('.');
    const last = parts.pop() as string;
    let target = out;
    for (const part of parts) {
      if (!isPlain(target[part])) target[part] = {};
      target = target[part];
    }
    target[last] = isPlain(value) && isPlain(target[last]) ? merge(target[last], value) : value;
  }
  return out;
}

/**
 * Merge `changes` into `target` IN PLACE the way a Foundry update does: objects merge, arrays and
 * everything else replace, `-=key` deletes a key and `==key` replaces an object outright.
 */
function merge(target: Record<string, any>, changes: Record<string, any>): Record<string, any> {
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith('-=')) delete target[key.slice(2)];
    else if (key.startsWith('==')) target[key.slice(2)] = value;
    else if (isPlain(value)) target[key] = merge(isPlain(target[key]) ? target[key] : {}, value);
    else target[key] = value;
  }
  return target;
}

/**
 * Does this ChatMessage update write the Invisi mark? PF2e's spell variant buttons rebuild a card in
 * the GM's current message mode and UPDATE the existing world message with it, so in Invisi mode the
 * mark (and the rolls or content it was meant to hide) would land in a message every player has.
 */
export function updateMarksInvisi(changes: unknown, flagScope: string = MODULE_ID): boolean {
  if (!isPlain(changes)) return false;
  const ours = expand(toWire(changes))['flags']?.[flagScope] as { invisi?: unknown } | null | undefined;
  return ours?.invisi === true;
}

/**
 * The message an update would have made: the world message's source with the update applied, minus
 * its id. That is the card a GM should get instead, as an Invisi card of its own.
 */
export function applyChanges(source: Record<string, any>, changes: Record<string, any>): Record<string, any> {
  const data = merge(toWire(source), expand(toWire(changes)));
  delete data['_id'];
  return data;
}

/**
 * What the badge on a message with our mark says. Only a card held in this browser is hidden from
 * players; a WORLD message carrying the mark reached every player, so it gets a warning, never the
 * promise that nobody can see it.
 */
export type Badge = 'hidden' | 'leaked' | 'none';

export function badgeFor(flagged: boolean, local: boolean): Badge {
  if (!flagged) return 'none';
  return local ? 'hidden' : 'leaked';
}

/**
 * How long Reveal waits on a card Dice So Nice is still rolling. Other modules finish a card when its
 * dice land (PF2e Toolbelt copies save data across then), so revealing earlier deletes the card from
 * under them. Dice that never finish must not lock a card for good, so the wait has an end.
 */
export const REVEAL_ROLLING_GRACE_MS = 30_000;

export type RevealCheck = 'ok' | 'not-allowed' | 'busy' | 'rolling';

/** May this click reveal the card now? `ageMs` is how long ago the card was made. */
export function revealCheck(state: {
  isGM: boolean;
  local: boolean;
  busy: boolean;
  rolling: boolean;
  ageMs: number;
}): RevealCheck {
  if (!state.isGM || !state.local) return 'not-allowed';
  if (state.busy) return 'busy';
  if (state.rolling && state.ageMs < REVEAL_ROLLING_GRACE_MS) return 'rolling';
  return 'ok';
}

/**
 * Did the reveal post the public message? ChatMessage.create returns nothing when a module's
 * preCreate hook cancels it, and the GM's card must survive that: it is the only copy there is.
 */
export function revealPosted(created: unknown): boolean {
  if (typeof created !== 'object' || created === null) return false;
  const id = (created as { id?: unknown }).id;
  return typeof id === 'string' && id !== '';
}
