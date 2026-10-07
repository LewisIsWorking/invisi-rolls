import { describe, expect, it } from 'vitest';

import {
  HISTORY_LIMIT,
  clearHistory,
  historyKey,
  mergeByTime,
  readHistory,
  removeHistory,
  upsertHistory,
  type StorageLike,
} from '../src/history.ts';

const memory = (): StorageLike => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const key = historyKey('world-1');
const msg = (id: string, timestamp: number, extra: Record<string, unknown> = {}) => ({ _id: id, timestamp, ...extra });

describe('history', () => {
  it('is keyed per world, so two worlds in one browser never mix', () => {
    expect(historyKey('a')).not.toBe(historyKey('b'));
  });

  it('starts empty and reads back oldest first, whatever the insertion order', () => {
    const s = memory();
    expect(readHistory(s, key)).toEqual([]);
    upsertHistory(s, key, msg('b', 20));
    upsertHistory(s, key, msg('a', 10));
    expect(readHistory(s, key).map((m) => m._id)).toEqual(['a', 'b']);
  });

  it('REPLACES the stored copy when a card updates its message, so the change survives a reload', () => {
    const s = memory();
    upsertHistory(s, key, msg('a', 10, { flags: { applied: false } }));
    upsertHistory(s, key, msg('a', 10, { flags: { applied: true } }));
    expect(readHistory(s, key)).toEqual([msg('a', 10, { flags: { applied: true } })]);
  });

  it('removes one message by id', () => {
    const s = memory();
    upsertHistory(s, key, msg('a', 10));
    upsertHistory(s, key, msg('b', 20));
    removeHistory(s, key, 'a');
    expect(readHistory(s, key).map((m) => m._id)).toEqual(['b']);
  });

  it('drops the oldest past the limit', () => {
    const s = memory();
    for (let i = 0; i < 5; i++) upsertHistory(s, key, msg(`m${i}`, i), 3);
    expect(readHistory(s, key).map((m) => m._id)).toEqual(['m2', 'm3', 'm4']);
    expect(HISTORY_LIMIT).toBeGreaterThan(0);
  });

  it('ignores corrupt or foreign data instead of throwing', () => {
    const s = memory();
    s.setItem(key, '{not json');
    expect(readHistory(s, key)).toEqual([]);
    s.setItem(key, '{"an":"object"}');
    expect(readHistory(s, key)).toEqual([]);
    s.setItem(key, JSON.stringify([msg('ok', 1), { _id: '', timestamp: 2 }, { _id: 'x' }, null, 'str']));
    expect(readHistory(s, key)).toEqual([msg('ok', 1)]);
  });

  it('works with no storage at all (blocked or private window)', () => {
    expect(readHistory(undefined, key)).toEqual([]);
    expect(upsertHistory(undefined, key, msg('a', 1))).toHaveLength(1);
    expect(removeHistory(undefined, key, 'a')).toEqual([]);
    expect(() => clearHistory(undefined, key)).not.toThrow();
  });

  it('does not throw when storage refuses a write', () => {
    const refusing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(upsertHistory(refusing, key, msg('a', 1))).toHaveLength(1);
    expect(() => clearHistory(refusing, key)).not.toThrow();
  });

  it('clears', () => {
    const s = memory();
    upsertHistory(s, key, msg('a', 1));
    clearHistory(s, key);
    expect(readHistory(s, key)).toEqual([]);
  });
});

describe('mergeByTime', () => {
  it('interleaves local cards with world messages in timestamp order', () => {
    const world = [msg('w1', 10), msg('w2', 30)];
    const local = [msg('l1', 20), msg('l2', 40)];
    expect(mergeByTime(world, local).map((m) => m._id)).toEqual(['w1', 'l1', 'w2', 'l2']);
  });

  it('puts the world message first on a tie, and keeps each side stable', () => {
    const world = [msg('w1', 10), msg('w2', 10)];
    const local = [msg('l1', 10), msg('l2', 10)];
    expect(mergeByTime(world, local).map((m) => m._id)).toEqual(['w1', 'w2', 'l1', 'l2']);
  });
});
