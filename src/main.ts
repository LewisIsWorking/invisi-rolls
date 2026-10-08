/**
 * Invisi-Rolls: a message mode whose rolls never become server documents.
 *
 * Core's blind, GM and self rolls are still documents, and Foundry's server sends every document to
 * every connected client, so a player's browser holds the full result even when the chat log hides
 * it (measured: docs/WHY.md). This module cancels the document before it is created and carries
 * the message to the GMs over a socket with an explicit recipient list, which the server delivers
 * to those users only. Each GM's browser then holds it as a GM-local ChatMessage, so the card's
 * buttons keep working (src/local-message.ts).
 */
import { clearHistory, historyKey, readHistory } from './history.ts';
import { addLocal, dropAllLocal, isLocal, restoreLocal, storage } from './local-message.ts';
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
} from './routing.ts';
import './styles.css';

/* eslint-disable @typescript-eslint/no-explicit-any -- Foundry ships no types; this file is the boundary. */
declare const game: any;
declare const ui: any;
declare const CONFIG: any;
declare const Hooks: any;
declare const foundry: any;

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

/** Before the chat log first renders: put this GM's stored Invisi cards back in place. */
Hooks.once('setup', () => {
  if (game.user.isGM) restoreLocal();
});

Hooks.once('ready', () => {
  game.socket.on(SOCKET, (payload: unknown) => {
    if (!game.user.isGM || !isPayload(payload)) return;
    void receive(payload.message);
  });

  game.modules.get(MODULE_ID).api = {
    history: () => readHistory(storage(), historyKey(game.world.id)),
    clearHistory: clear,
    isLocal,
  };
});

/**
 * Messages this client marked as Invisi in preCreateChatMessage, waiting for _preCreateOperation.
 * Taking them there, not in the hook, matters: other modules finish the message in their own
 * preCreate hooks (PF2e Toolbelt adds its target rows that way, often from a hook registered when a
 * button is clicked), and a hook that cancels the message stops every hook after it.
 */
const marked = new WeakSet<object>();
let operationWrapped = false;

/** After every preCreate hook: take the marked messages out of the batch the server would get. */
Hooks.once('setup', () => {
  const cls = CONFIG.ChatMessage.documentClass;
  const original = cls._preCreateOperation;
  cls._preCreateOperation = async function (documents: any[], operation: any, user: any) {
    const allowed = await original.call(this, documents, operation, user);
    if (allowed === false) return false;
    for (const message of takeMarked(documents, (d) => marked.has(d))) dispatch(sourceOf(message));
    return allowed;
  };
  operationWrapped = true;
});

/** The interception: mark the message now, take it once every other module has finished it. */
Hooks.on('preCreateChatMessage', (message: any, _data: unknown, options: any, userId: string) => {
  if (userId !== game.user.id) return;
  if (!isInvisi(options, message._source)) return;
  message.updateSource({ flags: { [MODULE_ID]: { invisi: true } } });
  if (operationWrapped) {
    marked.add(message);
    return;
  }
  // Without the wrapper (it failed to install), cancel here: later hooks miss out, but the message
  // still never reaches the server.
  dispatch(sourceOf(message));
  return false;
});

function sourceOf(message: any): Record<string, any> {
  const source = toWire(message.toObject());
  source._id = foundry.utils.randomID();
  source.timestamp = Date.now();
  source.flags ??= {};
  source.flags[MODULE_ID] = { ...source.flags[MODULE_ID], invisi: true };
  return source;
}

function dispatch(source: Record<string, any>): void {
  const route = decideRoute(game.user.isGM, gmRecipients(game.users, game.user.id));
  switch (route.kind) {
    case 'gm':
      void receive(source);
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

/** On a GM's client: hold the message locally, show it, and roll the dice on THIS screen only. */
async function receive(source: Record<string, any>): Promise<void> {
  try {
    await addLocal(source);
  } catch (err) {
    console.error(`${MODULE_ID} | could not show an Invisi-Roll`, err, source);
    ui.notifications.error(t('RenderFailed'));
  }
  // No Dice So Nice call here: addLocal fires createChatMessage on this client only, and Dice So
  // Nice animates from that hook. Calling showForRoll as well rolled every die twice.
}

function clear(): void {
  clearHistory(storage(), historyKey(game.world.id));
  dropAllLocal();
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

/** Clear Chat Log clears Invisi cards too: that is what the GM asked for. */
Hooks.on('deleteChatMessage', (message: any, options: any) => {
  if (options?.deleteAll && !isLocal(message) && game.user.isGM) clear();
});

/** `/invisi clear` removes this browser's Invisi cards. Never reaches the server. */
Hooks.on('chatMessage', (_log: unknown, text: string) => {
  const match = /^\/invisi(?:\s+(\w+))?\s*$/i.exec(text.trim());
  if (!match) return;
  if (!game.user.isGM) {
    ui.notifications.warn(t('GMOnly'));
  } else if (match[1]?.toLowerCase() === 'clear') {
    clear();
    ui.notifications.info(t('HistoryCleared'));
  } else {
    ui.notifications.info(t('Help'));
  }
  return false;
});
