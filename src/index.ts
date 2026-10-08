/**
 * Invisi-Rolls as a library, for a game system that ships it built in so nobody has to install the
 * module. The system calls `embedInvisiRolls` from its own `init` hook:
 *
 *     Hooks.once('init', () => {
 *       embedInvisiRolls({ socket: `system.${game.system.id}`, flagScope: game.system.id });
 *     });
 *
 * and declares `"socket": true` in its system.json. The strings and styles come with it.
 *
 * If the standalone module is ALSO active, this does nothing and returns null: the module handles
 * every roll, and two copies intercepting the same one would post it twice.
 */
import css from './styles.css?inline';
import { standaloneActive } from './routing.ts';
import { startInvisiRolls } from './start.ts';

/* eslint-disable @typescript-eslint/no-explicit-any -- Foundry ships no types; this file is the boundary. */
declare const game: any;

// Defined HERE, not in start.ts, so dist/lib/index.d.ts imports nothing and a consumer resolves it alone.
/** The package Invisi-Rolls runs inside. */
export interface InvisiHost {
  /** The socket channel: `module.invisi-rolls` standalone, `system.<id>` when a system embeds it. */
  readonly socket: string;
  /** The flag scope: `invisi-rolls` standalone, the system's id when embedded. */
  readonly flagScope: string;
}

/** What a macro or another module can call. */
export interface InvisiApi {
  /** This GM's stored Invisi messages for the current world. */
  history(): unknown[];
  /** Remove every Invisi card from this browser. */
  clearHistory(): void;
  /** Is this ChatMessage one of ours, held only in this browser? */
  isLocal(message: unknown): boolean;
}

export function embedInvisiRolls(host: InvisiHost): InvisiApi | null {
  if (standaloneActive(game.modules)) return null;

  const style = document.createElement('style');
  style.id = 'invisi-rolls-styles';
  style.textContent = css;
  document.head.append(style);

  return startInvisiRolls(host);
}
