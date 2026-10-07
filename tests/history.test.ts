import { describe, expect, it } from 'vitest';

import {
  HISTORY_LIMIT,
  appendHistory,
  clearHistory,
  historyKey,
  readHistory,
  type StorageLike,
} from '../src/history.ts';

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const key = historyKey('world-1');

describe('history', () => {
  it('is keyed per world, so two worlds in one browser never mix', () => {
    expect(historyKey('a')).not.toBe(historyKey('b'));
  });

  it('starts empty and keeps entries in arrival order', () => {
    const s = memory();
    expect(readHistory(s, key)).toEqual([]);
    appendHistory(s, key, { at: 1, message: { a: 1 } });
    appendHistory(s, key, { at: 2, message: { a: 2 } });
    expect(readHistory(s, key).map((e) => e.at)).toEqual([1, 2]);
  });

  it('drops the oldest entries past the limit', () => {
    const s = memory();
    for (let i = 0; i < 5; i++) appendHistory(s, key, { at: i, message: {} }, 3);
    expect(readHistory(s, key).map((e) => e.at)).toEqual([2, 3, 4]);
    expect(HISTORY_LIMIT).toBeGreaterThan(0);
  });

  it('survives corrupt or foreign data by ignoring it', () => {
    const s = memory();
    s.setItem(key, '{not json');
    expect(readHistory(s, key)).toEqual([]);
    s.setItem(key, '{"an":"object"}');
    expect(readHistory(s, key)).toEqual([]);
    s.setItem(key, JSON.stringify([{ at: 1, message: {} }, { at: 'x' }, null, { at: 2, message: null }]));
    expect(readHistory(s, key)).toEqual([{ at: 1, message: {} }]);
  });

  it('works with no storage at all (blocked or private window)', () => {
    expect(readHistory(undefined, key)).toEqual([]);
    expect(appendHistory(undefined, key, { at: 1, message: {} })).toHaveLength(1);
    expect(() => clearHistory(undefined, key)).not.toThrow();
  });

  it('does not throw when storage refuses a write', () => {
    const refusing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(appendHistory(refusing, key, { at: 1, message: {} })).toHaveLength(1);
    expect(() => clearHistory(refusing, key)).not.toThrow();
  });

  it('clears', () => {
    const s = memory();
    appendHistory(s, key, { at: 1, message: {} });
    clearHistory(s, key);
    expect(readHistory(s, key)).toEqual([]);
  });
});
