# Running the live check

`npm run check:live` drives a real Foundry with a GM and two players and fails if any Invisi-Roll
marker reaches a player's browser. It needs a throwaway Foundry v14 instance; never point it at a
real game (it creates users and enables the module).

## A throwaway instance

1. Make a data directory with `Config/` and `Data/{systems,modules,worlds}/`.
2. Copy your `license.json` into `Config/`.
3. Any system will do. A stub is enough: `Data/systems/stub/system.json` containing
   `{"id":"stub","title":"Stub","version":"1.0.0","compatibility":{"minimum":"14","verified":"14"},"documentTypes":{"Actor":{"character":{}},"Item":{"thing":{}}}}`
4. A world at `Data/worlds/invisi/world.json` using that system, and `"world": "invisi"` in
   `Config/options.json` so it launches on start.
5. `npm run build`, then copy `module.json`, `lang/` and `dist/` into `Data/modules/invisi-rolls/`.
6. Start Foundry:
   `node <Foundry>/resources/app/main.js --dataPath=<dir> --port=30077 --adminPassword=<anything> --noupdate`
7. `npm run check:live` (or set `FOUNDRY_URL` for another port).

Against a server on the internet, set `FOUNDRY_PASSWORD` to the test users' password. On a copy of a
real world that already has a "Gamemaster" user, set `FOUNDRY_GM` to the test GM's name.

The first join is slow on a machine with no GPU; the script disables the canvas to keep it usable.

## Embedded in a system

`INVISI_EMBEDDED=1 npm run check:live` runs the same checks against the LIBRARY, the way a game
system ships Invisi-Rolls built in. On the throwaway instance:

1. `npm run build:lib`, then copy `dist/lib/index.js` to `Data/systems/stub/invisi/index.js`.
2. Add `"esmodules": ["embed.js"]` and `"socket": true` to the stub's `system.json`, and create
   `Data/systems/stub/embed.js`:

   ```js
   import { embedInvisiRolls } from './invisi/index.js';
   Hooks.once('init', () => {
     const api = embedInvisiRolls({ socket: `system.${game.system.id}`, flagScope: game.system.id });
     game.system.api = { invisiRolls: api };
   });
   ```
3. Restart Foundry. The script switches the module OFF.

Then run the plain `npm run check:live` against the same instance: it switches the module ON, and
"GM holds all four" proves the system's copy stood aside (both running would post every roll twice).

## PF2e card buttons

`npm run check:live:pf2e` needs the same kind of instance on the **pf2e** system (a junction to an
installed pf2e folder is enough; never run it while another Foundry has those packs open). It
stages a scene with one NPC token, then:

1. Clicks Apply Damage on an ordinary public damage card first, as a CONTROL. If that fails, the
   setup is at fault and the rest means nothing.
2. Clicks Apply Damage on an Invisi damage card and checks the token lost exactly that much.
3. Writes a flag to the card, reloads the GM, and checks the card came back with the flag and its
   button still works.
4. Checks the player received nothing.

Two traps found while writing it: NPC tokens are unlinked, so damage lands on the TOKEN's actor and
the world actor's HP never moves; and Foundry v14 needs Chromium 146 or newer (Playwright 1.62+).

## Dice So Nice

`npm run check:live:dsn` needs Dice So Nice installed in the same instance. It checks that the GM
sees each Invisi-Roll's dice exactly once and that a player sees none, with a public roll as the
control. Dice So Nice disables itself in No-Canvas mode, so this check keeps the canvas on and stops
only the scene's render loop. It found a real bug: the module called `showForRoll` on top of Dice So
Nice's own `createChatMessage` handler, so the GM saw every die twice.
