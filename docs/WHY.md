# Why the card has to never exist

Measured 2026-10-07 on Foundry v14 build 367, with a stub system and no other modules.

A GM and a player joined the same world in two headless browsers. Every websocket frame the
**player's** browser received was recorded while the GM did each of the following, each carrying a
unique marker. The player was then reloaded and the frames recorded again, and the player's
`game.messages` / `game.journal` were searched as well.

| What the GM did | Live frame to player | In player's game data | After player reload |
|---|---|---|---|
| Public roll (control) | yes | yes | yes |
| Blind roll | **yes** | **yes** | **yes** |
| GM roll | **yes** | **yes** | **yes** |
| Self roll | **yes** | **yes** | **yes** |
| Whisper to self, no roll | **yes** | **yes** | **yes** |
| Journal entry, ownership None | **yes** | **yes** | **yes** |
| Socket emit, broadcast (control) | yes | (not stored) | (not stored) |
| Socket emit, `recipients: [GM]` | **no** | no | no |

Conclusions:

1. **Every document reaches every client.** Whisper lists, blind flags and ownership decide what the
   client *displays*, not what it *receives*. Hiding a card after it arrives cannot make a roll
   private.
2. **A socket message with `recipients` is delivered to those users only.** The server code agrees:
   `handleCustomSocket` emits to each recipient's sockets when a recipients array is given, and
   broadcasts otherwise.

So an Invisi-Roll must never be a document, and the only private road to a GM is a socket emit with
recipients. That is the whole design.

The probe script is preserved in spirit as `scripts/live-check.ts`, which runs the same measurement
against the module itself.
