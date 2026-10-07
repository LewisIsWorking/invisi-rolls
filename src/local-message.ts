/**
 * GM-local ChatMessages: real ChatMessage instances that live in ONE GM's `game.messages` and
 * nowhere else.
 *
 * Why real documents? A system's chat card buttons (PF2e's apply damage, shield block, roll damage
 * and so on) find their message with `game.messages.get(id)`, read its rolls and flags, and often
 * write back to it with `update` or `setFlag`. A card with no document behind it breaks all of that.
 *
 * Why not on the server? Because the server sends every document to every client (docs/WHY.md).
 *
 * So the document is constructed locally, inserted into the GM's collection, and its instance
 * methods that would talk to the server are replaced with local equivalents. Every write is mirrored
 * into the GM's browser storage so the card, including what its buttons did to it, survives a reload.
 */
import { historyKey, mergeByTime, readHistory, removeHistory, upsertHistory, type StoredMessage } from './history.ts';
import { MODULE_ID } from './routing.ts';

/* eslint-disable @typescript-eslint/no-explicit-any -- Foundry ships no types; this file is the boundary. */
declare const game: any;
declare const ui: any;
declare const Hooks: any;
declare const ChatMessage: any;
declare const foundry: any;

/** Marks an instance as local, so nothing ever mistakes it for a server document. */
const LOCAL = Symbol('invisi-rolls.local');

export const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const key = (): string => historyKey(game.world.id);

export function isLocal(message: any): boolean {
  return message?.[LOCAL] === true;
}

/** Build a local message from source data, without adding it anywhere. */
function build(source: Record<string, any>): any {
  const data: any = structuredClone(source);
  data._id ||= foundry.utils.randomID();
  data.timestamp ||= Date.now();
  // The GM must be a recipient, or ChatMessage#visible hides the card from the GM as well.
  const whisper: string[] = Array.isArray(data.whisper) ? data.whisper : [];
  if (!whisper.includes(game.user.id)) whisper.push(game.user.id);
  data.whisper = whisper;
  data.flags ??= {};
  data.flags[MODULE_ID] = { ...data.flags[MODULE_ID], invisi: true };

  const message = new ChatMessage.implementation(data);
  message[LOCAL] = true;
  patch(message);
  return message;
}

/**
 * Replace the instance methods that reach the server. `setFlag`/`unsetFlag` and most system code go
 * through `update`, so patching `update` and `delete` covers them.
 */
function patch(message: any): void {
  message.update = async (changes: Record<string, unknown> = {}, options: Record<string, unknown> = {}) => {
    const diff = message.updateSource(foundry.utils.expandObject(changes));
    upsertHistory(storage(), key(), message.toObject() as StoredMessage);
    await ui.chat.updateMessage(message, options);
    Hooks.callAll('updateChatMessage', message, diff, options, game.user.id);
    return message;
  };

  message.delete = async (options: Record<string, unknown> = {}) => {
    game.messages.delete(message.id);
    removeHistory(storage(), key(), message.id);
    ui.chat.deleteMessage(message.id);
    Hooks.callAll('deleteChatMessage', message, options, game.user.id);
    return message;
  };
}

/** A new Invisi message arrives: add it, record it, show it. Returns the document. */
export async function addLocal(source: Record<string, any>): Promise<any> {
  const message = build(source);
  game.messages.set(message.id, message);
  upsertHistory(storage(), key(), message.toObject() as StoredMessage);
  Hooks.callAll('createChatMessage', message, {}, game.user.id);
  await ui.chat.postOne(message, { notify: true });
  return message;
}

/**
 * Called in the `setup` hook, after the world's messages are loaded and before the chat log first
 * renders: put this browser's stored Invisi messages back, in timestamp order, so the log renders
 * them in place as if they had always been there.
 */
export function restoreLocal(): void {
  const stored = readHistory(storage(), key());
  if (stored.length === 0) return;

  const world: any[] = [...game.messages.contents];
  const local: any[] = [];
  for (const source of stored) {
    try {
      local.push(build(source));
    } catch (err) {
      console.warn(`${MODULE_ID} | skipped a stored Invisi message that no longer loads`, err);
    }
  }
  const ordered = mergeByTime<any>(world, local);
  for (const message of world) game.messages.delete(message.id);
  for (const message of ordered) game.messages.set(message.id, message);
}

/** Remove every local message from this client (used by `/invisi clear` and by Clear Chat Log). */
export function dropAllLocal(): void {
  for (const message of [...game.messages.contents]) {
    if (!isLocal(message)) continue;
    game.messages.delete(message.id);
    ui.chat.deleteMessage(message.id);
  }
}
