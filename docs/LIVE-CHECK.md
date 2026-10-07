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

The first join is slow on a machine with no GPU; the script disables the canvas to keep it usable.
