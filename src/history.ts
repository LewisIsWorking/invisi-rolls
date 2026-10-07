/**
 * The GM's record of past Invisi-Rolls, kept in the GM's own browser.
 *
 * Why not the world database? The live probe in docs/WHY.md showed that Foundry sends EVERY world
 * document to EVERY client, whatever its ownership or whisper list: a journal entry with ownership
 * "None" arrived in a player's browser on load. Anything stored server-side would undo the whole
 * point of the module. The cost is that history is per browser: a GM on a second device starts
 * with an empty list.
 */

/** The subset of the Web Storage API the store needs, so tests can pass a plain Map-backed fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HistoryEntry {
  /** Milliseconds since the epoch, when the GM's client received the roll. */
  at: number;
  /** The ChatMessage source data, used to render the card again. */
  message: Record<string, unknown>;
}

/** Enough to cover a long session; old entries fall off the front so storage stays small. */
export const HISTORY_LIMIT = 200;

export function historyKey(worldId: string): string {
  return `invisi-rolls.history.${worldId}`;
}

export function readHistory(storage: StorageLike | undefined, key: string): HistoryEntry[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function appendHistory(
  storage: StorageLike | undefined,
  key: string,
  entry: HistoryEntry,
  limit: number = HISTORY_LIMIT,
): HistoryEntry[] {
  const next = [...readHistory(storage, key), entry].slice(-limit);
  try {
    storage?.setItem(key, JSON.stringify(next));
  } catch {
    // Storage full or blocked (private window). The roll was still shown; only the record is lost.
  }
  return next;
}

export function clearHistory(storage: StorageLike | undefined, key: string): void {
  try {
    storage?.setItem(key, '[]');
  } catch {
    // Same as above: nothing useful to do when storage refuses.
  }
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<HistoryEntry>;
  return typeof e.at === 'number' && typeof e.message === 'object' && e.message !== null;
}
