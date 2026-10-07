/**
 * Invisi-Rolls: a message mode whose rolls never become ChatMessage documents.
 *
 * Core's blind, GM and self rolls are still documents, and Foundry's server sends every document to
 * every connected client, so a player's browser holds the full result even when the chat log hides
 * it (measured: docs/WHY.md). This module cancels the document before it is created and carries
 * the message to the GMs over a socket with an explicit recipient list, which the server delivers
 * to those users only.
 */
import { appendHistory, clearHistory, historyKey, readHistory } from './history.ts';
import {
  MODE,
  MODULE_ID,
  SOCKET,
  decideRoute,
  gmRecipients,
  isInvisi,
  isPayload,
  makePayload,
} from './routing.ts';
import './styles.css';

/* eslint-disable @typescript-eslint/no-explicit-any -- Foundry ships no types; this file is the boundary. */
declare const game: any;
declare const ui: any;
declare const CONFIG: any;
declare const Hooks: any;
declare const ChatMessage: any;

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const t = (key: string): string => game.i18n.localize(`INVISI.${key}`);

Hooks.once('init', () => {
  CONFIG.ChatMessage.modes[MODE] = {
    label: 'INVISI.Mode',
    icon: 'fa-solid fa-ghost',
    /**
     * Runs whenever anything applies our mode to message data. It marks the data so the
     * preCreate hook below recognises it, and makes it GM-only and blind as a SECOND line of
     * defence: if some path ever created the document anyway, it would be no worse than core's
     * blind roll rather than public.
     */
    handler(chatData: Record<string, any>) {
      chatData['flags'] ??= {};
      chatData['flags'][MODULE_ID] = { ...chatData['flags'][MODULE_ID], invisi: true };
      chatData['whisper'] = game.users.filter((u: any) => u.isGM).map((u: any) => u.id);
      chatData['blind'] = true;
    },
  };
});

Hooks.once('ready', () => {
  game.socket.on(SOCKET, (payload: unknown, senderId: string) => {
    if (!game.user.isGM || !isPayload(payload)) return;
    void receive(payload.message, senderId);
  });

  game.modules.get(MODULE_ID).api = {
    history: () => readHistory(storage(), historyKey(game.world.id)),
    showHistory,
    clearHistory: () => clearHistory(storage(), historyKey(game.world.id)),
  };
});

/** The interception. Returning false stops Foundry creating the document at all. */
Hooks.on('preCreateChatMessage', (message: any, _data: unknown, options: any, userId: string) => {
  if (userId !== game.user.id) return;
  if (!isInvisi(options, message._source)) return;

  const source = message.toObject();
  source.flags ??= {};
  source.flags[MODULE_ID] = { ...source.flags[MODULE_ID], invisi: true };
  source.timestamp ??= Date.now();
  dispatch(source);
  return false;
});

function dispatch(source: Record<string, any>): void {
  const route = decideRoute(game.user.isGM, gmRecipients(game.users, game.user.id));
  switch (route.kind) {
    case 'gm':
      void receive(source, game.user.id);
      if (route.forwardTo.length > 0) {
        game.socket.emit(SOCKET, makePayload(source), { recipients: route.forwardTo });
      }
      return;
    case 'player':
      game.socket.emit(SOCKET, makePayload(source), { recipients: route.sendTo });
      ui.notifications.info(t('Sent'));
      return;
    case 'refuse':
      ui.notifications.warn(t('NoGM'));
      return;
  }
}

/** On a GM's client: show the card and the dice on THIS screen only, and record it. */
async function receive(source: Record<string, any>, senderId: string): Promise<void> {
  appendHistory(storage(), historyKey(game.world.id), { at: Date.now(), message: source });
  const message = await show(source);

  // Dice So Nice: synchronize=false animates on this client and broadcasts nothing.
  const dice3d = game.dice3d;
  if (dice3d && message) {
    const roller = game.users.get(senderId) ?? game.user;
    for (const roll of message.rolls ?? []) void dice3d.showForRoll(roll, roller, false);
  }
}

/** Render an UNSAVED ChatMessage into this client's chat log. Nothing is sent to the server. */
async function show(source: Record<string, any>): Promise<any> {
  const data: any = structuredClone(source);
  // Ensure this GM is a recipient, or ChatMessage#visible hides it from the GM too.
  const whisper: string[] = Array.isArray(data.whisper) ? data.whisper : [];
  if (!whisper.includes(game.user.id)) whisper.push(game.user.id);
  data.whisper = whisper;
  try {
    const message = new ChatMessage.implementation(data);
    await ui.chat.postOne(message, { notify: true });
    return message;
  } catch (err) {
    console.error(`${MODULE_ID} | could not render an Invisi-Roll`, err, source);
    ui.notifications.error(t('RenderFailed'));
    return undefined;
  }
}

/** Replay this browser's recorded Invisi-Rolls into the chat log (GM only, local only). */
async function showHistory(): Promise<void> {
  if (!game.user.isGM) return;
  const entries = readHistory(storage(), historyKey(game.world.id));
  if (entries.length === 0) {
    ui.notifications.info(t('HistoryEmpty'));
    return;
  }
  for (const entry of entries) await show(entry.message);
}

/** Mark Invisi cards so the GM can tell at a glance that players cannot see them. */
Hooks.on('renderChatMessageHTML', (message: any, html: HTMLElement) => {
  if (message.getFlag?.(MODULE_ID, 'invisi') !== true) return;
  html.classList.add('invisi-roll');
  const badge = document.createElement('div');
  badge.className = 'invisi-roll-badge';
  badge.innerHTML = `<i class="fa-solid fa-ghost"></i> ${t('Badge')}`;
  html.querySelector('.message-header')?.after(badge);
});

/** `/invisi` replays the GM's history; `/invisi clear` empties it. Never reaches the server. */
Hooks.on('chatMessage', (_log: unknown, text: string) => {
  const match = /^\/invisi(?:\s+(\w+))?\s*$/i.exec(text.trim());
  if (!match) return;
  if (!game.user.isGM) {
    ui.notifications.warn(t('GMOnly'));
    return false;
  }
  if (match[1]?.toLowerCase() === 'clear') {
    clearHistory(storage(), historyKey(game.world.id));
    ui.notifications.info(t('HistoryCleared'));
  } else {
    void showHistory();
  }
  return false;
});
