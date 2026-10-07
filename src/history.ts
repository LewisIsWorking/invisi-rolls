/**
 * The GM's record of Invisi-Roll messages, kept in the GM's own browser.
 *
 * Why not the world database? The live probe in docs/WHY.md showed that Foundry sends EVERY world
 * document to EVERY client, whatever its ownership or whisper list: a journal entry with ownership
 * "None" arrived in a player's browser on load. Anything stored server-side would undo the whole
 * point of the module. The cost is that history is per browser: a GM on a second device starts
 * with an empty list.
 *
 * Entries are keyed by message id because the cards are live: a system's card button (apply
 * damage, and so on) may update its message, and that change must survive a reload.
 */

/** The subset of the Web Storage API the store needs, so tests can pass a plain Map-backed fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A ChatMessage source as stored: the fields the store relies on, plus whatever else it had. */
export interface StoredMessage {
  _id: string;
  timestamp: number;
  [key: string]: unknown;
}

/** Enough to cover a long campaign session; the oldest fall off so storage stays small. */
export const HISTORY_LIMIT = 200;

export function historyKey(worldId: string): string {
  return `invisi-rolls.history.${worldId}`;
}

/** Every stored message, oldest first. Corrupt or foreign data is ignored rather than thrown. */
export function readHistory(storage: StorageLike | undefined, key: string): StoredMessage[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? sortByTime(parsed.filter(isStored)) : [];
  } catch {
    return [];
  }
}

/** Add a message, or replace the stored copy with the same id. */
export function upsertHistory(
  storage: StorageLike | undefined,
  key: string,
  message: StoredMessage,
  limit: number = HISTORY_LIMIT,
): StoredMessage[] {
  const others = readHistory(storage, key).filter((m) => m._id !== message._id);
  return write(storage, key, sortByTime([...others, message]).slice(-limit));
}

export function removeHistory(storage: StorageLike | undefined, key: string, id: string): StoredMessage[] {
  return write(
    storage,
    key,
    readHistory(storage, key).filter((m) => m._id !== id),
  );
}

export function clearHistory(storage: StorageLike | undefined, key: string): void {
  write(storage, key, []);
}

/**
 * Merge stored messages into the world's messages in timestamp order, which is the order the chat
 * log renders. Ties keep world messages first. Pure, so the ordering rule is unit tested.
 */
export function mergeByTime<T extends { timestamp: number }>(world: T[], local: T[]): T[] {
  const tagged = [...world.map((m, i) => ({ m, i, w: 0 })), ...local.map((m, i) => ({ m, i, w: 1 }))];
  tagged.sort((a, b) => a.m.timestamp - b.m.timestamp || a.w - b.w || a.i - b.i);
  return tagged.map((t) => t.m);
}

function write(storage: StorageLike | undefined, key: string, messages: StoredMessage[]): StoredMessage[] {
  try {
    storage?.setItem(key, JSON.stringify(messages));
  } catch {
    // Storage full or blocked (private window). The card is still shown; only the record is lost.
  }
  return messages;
}

function sortByTime(messages: StoredMessage[]): StoredMessage[] {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp);
}

function isStored(value: unknown): value is StoredMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Partial<StoredMessage>;
  return typeof m._id === 'string' && m._id !== '' && typeof m.timestamp === 'number';
}
