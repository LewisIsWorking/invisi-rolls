/**
 * Pure decisions about where an Invisi-Roll may go. No Foundry globals here, so every rule that
 * keeps a roll away from players is unit tested without a running world.
 */

/** The key of the message mode this module adds to CONFIG.ChatMessage.modes. */
export const MODE = 'invisi';

/** The module id, which is also the flag scope and the socket channel suffix. */
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
): boolean {
  if (options?.messageMode === MODE || options?.rollMode === MODE) return true;
  const flags = source?.flags?.[MODULE_ID] as { invisi?: unknown } | undefined;
  return flags?.invisi === true;
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

/** The socket payload. Versioned so an older client can ignore a shape it does not understand. */
export interface InvisiPayload {
  v: 1;
  type: 'roll';
  /** The ChatMessage source data, exactly as it would have been created. */
  message: Record<string, unknown>;
}

export function makePayload(message: Record<string, unknown>): InvisiPayload {
  return { v: 1, type: 'roll', message };
}

export function isPayload(value: unknown): value is InvisiPayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<InvisiPayload>;
  return p.v === 1 && p.type === 'roll' && typeof p.message === 'object' && p.message !== null;
}
