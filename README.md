# Invisi-Rolls

**The free, open-source module for rolls that are truly invisible to players.**

Foundry VTT v14. Works with any game system.

## The problem

Core Foundry's Blind, GM and Self rolls only hide a roll on screen. Players still get a "privately
rolled some dice" card, Dice So Nice still throws the dice across their screen, and the full result
is sitting in their browser. Any player can open the console and read it:

```js
game.messages.contents.at(-1).rolls[0].total
```

That is not a bug in those modes; it is how Foundry works. **The server sends every world document
to every connected client**, whatever its whisper list or ownership. We measured it: see
[docs/WHY.md](docs/WHY.md). Modules that remove the card from the chat log after it arrives (the old
`hide-gm-rolls`, and most forum snippets) fix the screen, but the data is still in the player's
browser.

## What Invisi-Rolls does

It adds an **Invisi-Roll** mode to the chat mode selector, next to Blind, GM and Self. A message made
in that mode **never becomes a chat document at all**:

1. The module cancels the message just before Foundry would create it.
2. It carries the message to the connected GMs over a socket with an explicit recipient list.
   Foundry's server delivers those to the named users only, so no player's browser receives a byte
   of it.
3. Each GM's browser shows the card and, with Dice So Nice, animates the dice on that GM's screen
   only.

| | Core Blind roll | Invisi-Roll |
|---|---|---|
| Card in a player's chat log | "privately rolled some dice" | nothing |
| Dice So Nice on a player's screen | dice tumble | nothing |
| Result in a player's browser (console) | yes | **no** |
| Still there after the player reloads | yes | **no** |

Rolls in the core modes are untouched.

## Player Invisi-Rolls

A player can roll in Invisi mode too, for checks the player should not know the result of. The
roll goes to the GMs only; the player gets a short "sent to the GM" notice and no card. **If no GM
is connected, the roll is refused** rather than falling back to something visible.

Honest limit: a player's roll is still evaluated in that player's browser, because that is where
Foundry rolls dice. Nothing is displayed or stored there, and no other player ever receives it, but
a determined player could intercept their own roll with a debugger. If that matters, roll it as
the GM.

## GM history

Because nothing is stored in the world, each GM's browser keeps its own record of Invisi-Rolls
(the last 200 per world).

- `/invisi` in chat shows them again in your chat log (only on your screen).
- `/invisi clear` empties the record.

History does not follow you to another browser or device. That is the price of keeping it out of
the world database, which every player's browser downloads.

## Limits

- Invisi cards are rebuilt locally, so buttons on a system's chat card (apply damage, and so on)
  may not work on them: the card has no document behind it to act on.
- Some systems create chat messages in their own way. If a system builds the message without going
  through Foundry's message modes, it cannot be intercepted. Reports welcome.

## Install

Manifest URL:

```
https://github.com/LewisIsWorking/invisi-rolls/releases/latest/download/module.json
```

## Development

```sh
npm install
npm run verify       # prose guard, typecheck, unit tests at 100% coverage, build
npm run check:live   # the real proof, against a running Foundry: see docs/LIVE-CHECK.md
```

MIT licensed. Issues and pull requests welcome.
