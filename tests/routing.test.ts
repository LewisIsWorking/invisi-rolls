import { describe, expect, it } from 'vitest';

import {
  MODE,
  MODULE_ID,
  SOCKET,
  decideRoute,
  gmRecipients,
  isInvisi,
  isPayload,
  makePayload,
  takeMarked,
  toWire,
} from '../src/routing.ts';

describe('isInvisi', () => {
  it('recognises the mode passed as messageMode', () => {
    expect(isInvisi({ messageMode: MODE }, {})).toBe(true);
  });

  it('recognises the legacy rollMode option', () => {
    expect(isInvisi({ rollMode: MODE }, {})).toBe(true);
  });

  it('recognises the flag our mode handler writes, with no option at all', () => {
    expect(isInvisi({}, { flags: { [MODULE_ID]: { invisi: true } } })).toBe(true);
  });

  it('leaves every core mode alone', () => {
    for (const mode of ['public', 'gm', 'blind', 'self', 'ic', 'blindroll', 'gmroll']) {
      expect(isInvisi({ messageMode: mode }, {})).toBe(false);
    }
  });

  it('is false with nothing to go on, and for a flag that is not exactly true', () => {
    expect(isInvisi(undefined, undefined)).toBe(false);
    expect(isInvisi({}, { flags: { [MODULE_ID]: { invisi: 'yes' } } })).toBe(false);
    expect(isInvisi({}, { flags: { other: { invisi: true } } })).toBe(false);
  });
});

describe('gmRecipients', () => {
  const users = [
    { id: 'gm1', isGM: true, active: true },
    { id: 'gm2', isGM: true, active: false },
    { id: 'gm3', isGM: true, active: true },
    { id: 'p1', isGM: false, active: true },
  ];

  it('is the connected GMs only: never a player, never an offline GM', () => {
    expect(gmRecipients(users, 'p1')).toEqual(['gm1', 'gm3']);
  });

  it('leaves out the sender, who already has the roll', () => {
    expect(gmRecipients(users, 'gm1')).toEqual(['gm3']);
  });
});

describe('decideRoute', () => {
  it('shows a GM roll locally and forwards it to the other GMs', () => {
    expect(decideRoute(true, ['gm3'])).toEqual({ kind: 'gm', forwardTo: ['gm3'] });
    expect(decideRoute(true, [])).toEqual({ kind: 'gm', forwardTo: [] });
  });

  it('sends a player roll to the GMs only', () => {
    expect(decideRoute(false, ['gm1'])).toEqual({ kind: 'player', sendTo: ['gm1'] });
  });

  it('REFUSES a player roll with no GM connected rather than falling back to anything visible', () => {
    expect(decideRoute(false, [])).toEqual({ kind: 'refuse' });
  });
});

describe('payload', () => {
  it('round-trips through isPayload', () => {
    expect(isPayload(makePayload({ content: 'x' }))).toBe(true);
  });

  it('rejects anything that is not a version 1 roll payload', () => {
    for (const bad of [null, 'roll', {}, { v: 2, type: 'roll', message: {} }, { v: 1, type: 'x', message: {} }, { v: 1, type: 'roll', message: null }]) {
      expect(isPayload(bad)).toBe(false);
    }
  });

  it('travels on the module socket channel Foundry relays for socket-enabled modules', () => {
    expect(SOCKET).toBe('module.invisi-rolls');
  });
});

describe('toWire', () => {
  // A PF2e strike's message data holds a predicate function; structuredClone threw DataCloneError on it.
  const strike = {
    flavor: 'Strike',
    flags: { pf2e: { context: { test: (x: number) => x > 1, options: ['a', 'b'] } } },
    rolls: ['{"formula":"1d20+9"}'],
  };

  it('turns a message holding a function into data structuredClone accepts', () => {
    expect(() => structuredClone(strike)).toThrow();
    expect(() => structuredClone(toWire(strike))).not.toThrow();
  });

  it('drops only what a socket would drop and keeps the rest', () => {
    expect(toWire(strike)).toEqual({
      flavor: 'Strike',
      flags: { pf2e: { context: { options: ['a', 'b'] } } },
      rolls: ['{"formula":"1d20+9"}'],
    });
  });
});

describe('takeMarked', () => {
  it('removes the marked items from the SAME array and returns them in order', () => {
    const batch = ['a', 'INVISI-1', 'b', 'INVISI-2', 'INVISI-3'];
    const sent = batch;
    expect(takeMarked(batch, (x) => x.startsWith('INVISI'))).toEqual(['INVISI-1', 'INVISI-2', 'INVISI-3']);
    expect(sent).toEqual(['a', 'b']);
  });

  it('can empty the batch, which tells Foundry to send nothing', () => {
    const batch = ['INVISI'];
    takeMarked(batch, () => true);
    expect(batch).toHaveLength(0);
  });

  it('leaves an unmarked batch alone', () => {
    const batch = [1, 2, 3];
    expect(takeMarked(batch, () => false)).toEqual([]);
    expect(batch).toEqual([1, 2, 3]);
  });
});
