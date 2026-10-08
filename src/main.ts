/**
 * The standalone module's entry point. Everything Invisi-Rolls does is in src/start.ts, shared with
 * game systems that embed it (src/index.ts); this only supplies the module's own identity.
 */
import { MODULE_ID, SOCKET } from './routing.ts';
import { startInvisiRolls } from './start.ts';
import './styles.css';

/* eslint-disable @typescript-eslint/no-explicit-any -- Foundry ships no types; this file is the boundary. */
declare const game: any;
declare const Hooks: any;

Hooks.once('init', () => {
  const api = startInvisiRolls({ socket: SOCKET, flagScope: MODULE_ID });
  Hooks.once('ready', () => {
    game.modules.get(MODULE_ID).api = api;
  });
});
