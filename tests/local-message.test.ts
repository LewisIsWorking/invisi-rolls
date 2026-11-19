import { beforeEach, describe, expect, it, vi } from 'vitest';

import { historyKey, readHistory } from '../src/history.ts';
import { addLocal, dropAllLocal, isLocal, restoreLocal, storage } from '../src/local-message.ts';

/* Foundry ships no types; these stand in for its untyped globals. */
const g: any = globalThis;

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};
type MemoryStorage = ReturnType<typeof memoryStorage>;

class FakeMessage {
  [key: string]: any;
  constructor(data: Record<string, any>) {
    if (unloadable.has(data['_id'])) throw new Error(`cannot load ${data['_id']}`);
    Object.assign(this, JSON.parse(JSON.stringify(data)));
  }
  get id(): string {
    return this['_id'];
  }
  updateSource(changes: Record<string, any>): Record<string, any> {
    Object.assign(this, JSON.parse(JSON.stringify(changes)));
    return changes;
  }
  toObject(): Record<string, any> {
    return { ...this };
  }
}

/** Ids the document class refuses to build, so restoreLocal must skip them. */
const unloadable = new Set<string>();

let mem: MemoryStorage;
let game: any;
let ui: any;
let hooks: any;
let rid = 0;

beforeEach(() => {
  unloadable.clear();
  rid = 0;
  mem = memoryStorage();
  g.window = { localStorage: mem };
  const messages = new Map<string, any>();
  game = {
    world: { id: 'world-1' },
    user: { id: 'gm-1', isGM: true },
    users: [],
    system: { id: 'pf2e' },
    messages: {
      set: (id: string, m: any) => void messages.set(id, m),
      get: (id: string) => messages.get(id),
      delete: (id: string) => void messages.delete(id),
      get contents() {
        return [...messages.values()];
      },
    },
  };
  g.game = game;
  ui = { chat: { postOne: vi.fn(), updateMessage: vi.fn(), deleteMessage: vi.fn() } };
  g.ui = ui;
  hooks = { callAll: vi.fn() };
  g.Hooks = hooks;
  g.ChatMessage = { implementation: FakeMessage };
  g.foundry = {
    utils: {
      cleanHTML: (s: string) => `clean:${s}`,
      randomID: () => `rid-${++rid}`,
      expandObject: (o: any) => o,
    },
  };
});

describe('storage', () => {
  it('is the browser localStorage when there is one', () => {
    expect(storage()).toBe(mem);
  });

  it('is undefined with no window, so history calls become no-ops', () => {
    delete g.window;
    expect(storage()).toBeUndefined();
  });
});

describe('isLocal', () => {
  it('marks only the cards this client built', async () => {
    const mine = await addLocal({ content: 'hi' }, 'dnd5e');
    expect(isLocal(mine)).toBe(true);
    expect(isLocal(new FakeMessage({ _id: 'w1', timestamp: 1 }))).toBe(false);
    expect(isLocal(undefined)).toBe(false);
  });
});

describe('addLocal', () => {
  it('holds the card locally, flags it, whispers the GM, stores it and shows it', async () => {
    const m = await addLocal({ content: '<b>hi</b>' }, 'dnd5e');
    expect(m._id).toBe('rid-1');
    expect(typeof m.timestamp).toBe('number');
    expect(m.content).toBe('clean:<b>hi</b>');
    expect(m.whisper).toEqual(['gm-1']);
    expect(m.flags.dnd5e).toMatchObject({ invisi: true });
    expect(game.messages.get('rid-1')).toBe(m);
    expect(ui.chat.postOne).toHaveBeenCalledWith(m, { notify: true });
    expect(hooks.callAll).toHaveBeenCalledWith('createChatMessage', m, {}, 'gm-1');
    expect(readHistory(mem, historyKey('world-1')).map((s) => s._id)).toEqual(['rid-1']);
  });

  it('keeps an id and timestamp the source already had', async () => {
    const m = await addLocal({ _id: 'fixed', timestamp: 42, content: 'x' }, 'dnd5e');
    expect(m._id).toBe('fixed');
    expect(m.timestamp).toBe(42);
  });

  it('adds the GM alongside existing whispers, once, and replaces a non-list', async () => {
    const a = await addLocal({ whisper: ['player-9'], content: 'x' }, 'dnd5e');
    expect(a.whisper).toEqual(['player-9', 'gm-1']);
    const b = await addLocal({ whisper: ['gm-1'], content: 'x' }, 'dnd5e');
    expect(b.whisper).toEqual(['gm-1']);
    const c = await addLocal({ whisper: 'nobody', content: 'x' }, 'dnd5e');
    expect(c.whisper).toEqual(['gm-1']);
  });

  it('empties a content field that is not a string, as the server would', async () => {
    const m = await addLocal({ content: ['not', 'a', 'string'], flavor: 7 }, 'dnd5e');
    expect(m.content).toBe('');
    expect(m.flavor).toBe('');
  });

  it('merges the mark into flags the source already had', async () => {
    const m = await addLocal({ flags: { dnd5e: { foo: 1 } }, content: 'x' }, 'dnd5e');
    expect(m.flags.dnd5e).toMatchObject({ foo: 1, invisi: true });
  });
});

describe('the update patch', () => {
  it('mirrors the write into history and tells the chat log', async () => {
    const m = await addLocal({ content: 'hi' }, 'dnd5e');
    await m.update({ content: 'edited' });
    expect(m.content).toBe('edited');
    expect(ui.chat.updateMessage).toHaveBeenCalledWith(m, {});
    expect(hooks.callAll).toHaveBeenCalledWith('updateChatMessage', m, { content: 'edited' }, {}, 'gm-1');
    expect(readHistory(mem, historyKey('world-1'))[0]?.['content']).toBe('edited');
  });

  it('updates with no changes at all', async () => {
    const m = await addLocal({ content: 'hi' }, 'dnd5e');
    await expect(m.update()).resolves.toBe(m);
  });
});

describe('the delete patch', () => {
  it('drops the card from the log, the shelf and the screen', async () => {
    const m = await addLocal({ content: 'hi' }, 'dnd5e');
    await m.delete();
    expect(game.messages.get(m.id)).toBeUndefined();
    expect(readHistory(mem, historyKey('world-1'))).toEqual([]);
    expect(ui.chat.deleteMessage).toHaveBeenCalledWith(m.id);
    expect(hooks.callAll).toHaveBeenCalledWith('deleteChatMessage', m, {}, 'gm-1');
  });
});

describe('restoreLocal', () => {
  it('leaves a log with no shelf alone', () => {
    const world = { _id: 'w1', timestamp: 10, id: 'w1' };
    game.messages.set('w1', world);
    restoreLocal('dnd5e');
    expect(game.messages.contents).toEqual([world]);
    expect(ui.chat.postOne).not.toHaveBeenCalled();
  });

  it('puts the stored cards back in time order among the world messages', () => {
    mem.setItem(
      historyKey('world-1'),
      JSON.stringify([
        { _id: 'l2', timestamp: 40, content: 'b' },
        { _id: 'l1', timestamp: 20, content: 'a' },
      ]),
    );
    game.messages.set('w1', { _id: 'w1', timestamp: 10, id: 'w1' });
    game.messages.set('w2', { _id: 'w2', timestamp: 30, id: 'w2' });
    restoreLocal('dnd5e');
    expect(game.messages.contents.map((m: any) => m._id)).toEqual(['w1', 'l1', 'w2', 'l2']);
    expect(isLocal(game.messages.get('w1'))).toBe(false);
    expect(isLocal(game.messages.get('l1'))).toBe(true);
    expect(ui.chat.postOne).not.toHaveBeenCalled();
  });

  it('restores into an empty log and rebuilds flags the stored card lacks', () => {
    mem.setItem(historyKey('world-1'), JSON.stringify([{ _id: 'bare', timestamp: 5 }]));
    restoreLocal('dnd5e');
    const m = game.messages.get('bare');
    expect(m.flags.dnd5e.invisi).toBe(true);
    expect(m.whisper).toEqual(['gm-1']);
    expect(isLocal(m)).toBe(true);
  });

  it('skips a stored card that no longer loads, and keeps the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      unloadable.add('boom');
      mem.setItem(
        historyKey('world-1'),
        JSON.stringify([
          { _id: 'boom', timestamp: 5 },
          { _id: 'good', timestamp: 6 },
        ]),
      );
      restoreLocal('dnd5e');
      expect(game.messages.get('boom')).toBeUndefined();
      expect(game.messages.get('good')).toBeDefined();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('dropAllLocal', () => {
  it('removes only this client cards and leaves world messages', async () => {
    const world = { _id: 'w1', timestamp: 10, id: 'w1' };
    game.messages.set('w1', world);
    const mine = await addLocal({ content: 'hi' }, 'dnd5e');
    dropAllLocal();
    expect(game.messages.contents).toEqual([world]);
    expect(ui.chat.deleteMessage).toHaveBeenCalledTimes(1);
    expect(ui.chat.deleteMessage).toHaveBeenCalledWith(mine.id);
  });

  it('does nothing on an empty log', () => {
    dropAllLocal();
    expect(ui.chat.deleteMessage).not.toHaveBeenCalled();
  });
});
