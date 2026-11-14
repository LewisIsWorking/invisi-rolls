/**
 * Invisi-Rolls: a message mode whose rolls never become server documents.
 *
 * Core's blind, GM and self rolls are still documents, and Foundry's server sends every document to
 * every connected client, so a player's browser holds the full result even when the chat log hides
 * it (measured: docs/WHY.md). This cancels the document before it is created and carries the message
 * to the GMs over a socket with an explicit recipient list, which the server delivers to those users
 * only. Each GM's browser then holds it as a GM-local ChatMessage, so the card's buttons keep working
 * (src/local-message.ts).
 *
 * One code path for both ways of running: the standalone module (src/main.ts) and a game system that
 * embeds Invisi-Rolls (src/index.ts). Only the HOST differs, because Foundry ties a socket channel
 * and a flag scope to the package that owns them.
 */
import en from '../lang/en.json';
import { clearHistory, historyKey, readHistory } from './history.ts';
import { addLocal, dropAllLocal, isLocal, restoreLocal, storage } from './local-message.ts';
import {
  MODE,
  MODULE_ID,
  applyChanges,
  badgeFor,
  decideRoute,
  gmRecipients,
  isInvisi,
  isPayload,
  isSecretCheck,
  makePayload,
  makeRevealPayload,
  revealSource,
  takeMarked,
  toWire,
  updateMarksInvisi,
} from './routing.ts';
// Type-only, so no cycle at runtime: the types live in index.ts so its declaration file stands alone.
import type { InvisiApi, InvisiHost } from './index.ts';

/* eslint-disable @typescript-eslint/no-explicit-any -- Foundry ships no types; this file is the boundary. */
declare const game: any;
declare const ui: any;
declare const CONFIG: any;
declare const Hooks: any;
declare const foundry: any;


/** Namespaced by the host's flag scope, so the key must not clash with a system's own settings. */
const SECRET_SETTING = 'invisiSecretChecks';

const t = (key: string): string => game.i18n.localize(`INVISI.${key}`);

/**
 * Start Invisi-Rolls. Call it from an `init` hook: the message mode is registered immediately, and
 * the rest waits for the later hooks.
 */
export function startInvisiRolls(host: InvisiHost): InvisiApi {
  const { socket, flagScope } = host;

  CONFIG.ChatMessage.modes[MODE] = {
    label: 'INVISI.Mode',
    icon: 'fa-solid fa-ghost',
    /**
     * Runs whenever anything applies our mode to message data. It marks the data so the preCreate
     * hook below recognises it, and makes it GM-only and blind as a SECOND line of defence: if some
     * path ever created the document anyway, it would be no worse than core's blind roll.
     */
    handler(chatData: Record<string, any>) {
      chatData['flags'] ??= {};
      chatData['flags'][flagScope] = { ...chatData['flags'][flagScope], invisi: true };
      chatData['whisper'] = game.users.filter((u: any) => u.isGM).map((u: any) => u.id);
      chatData['blind'] = true;
    },
  };

  /**
   * PF2e and SF2e secret checks (Recall Knowledge, Seek, Sense Motive...) are core blind or GM rolls,
   * which every player's browser receives. With this on, they go through Invisi instead.
   */
  game.settings.register(flagScope, SECRET_SETTING, {
    name: 'INVISI.SecretChecks',
    hint: 'INVISI.SecretChecksHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
  const secretChecksInvisi = (source: unknown): boolean =>
    game.settings.get(flagScope, SECRET_SETTING) === true && isSecretCheck(source as any, game.system.id);

  /** The English strings, for a host whose manifest does not list lang/en.json. Never overwrites. */
  Hooks.once('i18nInit', () => {
    foundry.utils.mergeObject(game.i18n.translations, en, { overwrite: false });
  });

  /** Before the chat log first renders: put this GM's stored Invisi cards back in place. */
  Hooks.once('setup', () => {
    if (game.user.isGM) restoreLocal(flagScope);
  });

  Hooks.once('ready', () => {
    game.socket.on(socket, (payload: unknown) => {
      if (!game.user.isGM || !isPayload(payload)) return;
      if (payload.type === 'reveal') void dropRevealed(payload.id);
      else void receive(payload.message);
    });
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
      for (const message of takeMarked(documents, (d) => marked.has(d))) dispatch(sourceOf(message.toObject()));
      return allowed;
    };
    operationWrapped = true;

    /**
     * Clear Chat Log deletes every id in the collection, and the server refuses an id it never stored,
     * so a single Invisi card would stop the whole log clearing. Take the cards out first. Other GMs
     * hear of it here too: when the log holds no world messages, no delete ever reaches them.
     */
    const originalDelete = cls.deleteDocuments;
    cls.deleteDocuments = async function (ids: string[] = [], operation: any = {}) {
      if (operation.deleteAll && game.user.isGM) {
        const others = gmRecipients(game.users, game.user.id);
        for (const message of game.messages.contents.filter(isLocal)) {
          if (others.length > 0) game.socket.emit(socket, makeRevealPayload(message.id), { recipients: others });
        }
        clear();
      }
      return originalDelete.call(this, ids, operation);
    };
  });

  /** The interception: mark the message now, take it once every other module has finished it. */
  Hooks.on('preCreateChatMessage', (message: any, _data: unknown, options: any, userId: string) => {
    if (userId !== game.user.id) return;
    // A card the GM revealed is public on purpose, even when it began as a secret check.
    if (message._source.flags?.[flagScope]?.revealed === true) return;
    if (!isInvisi(options, message._source, flagScope) && !secretChecksInvisi(message._source)) return;
    message.updateSource({ flags: { [flagScope]: { invisi: true } } });
    if (operationWrapped) {
      marked.add(message);
      return;
    }
    // Without the wrapper (it failed to install), cancel here: later hooks miss out, but the message
    // still never reaches the server.
    dispatch(sourceOf(message.toObject()));
    return false;
  });

  /**
   * The other way a card reached players: an UPDATE that writes our mark into a world message. PF2e's
   * spell variant buttons (choosing a save on a cast card, for one) rebuild the card in the current
   * message mode and update the existing message with it, so in Invisi mode the GM's rebuilt card,
   * mark and all, went to every player who already had the message. Stop the update and send the card
   * it would have made to the GMs instead; the world message stays as it was.
   */
  Hooks.on('preUpdateChatMessage', (message: any, changes: unknown, _options: unknown, userId: string) => {
    if (userId !== game.user.id || isLocal(message)) return;
    if (!updateMarksInvisi(changes, flagScope)) return;
    dispatch(sourceOf(applyChanges(message.toObject(), changes as Record<string, any>)));
    return false;
  });

  function sourceOf(data: Record<string, any>): Record<string, any> {
    const source: any = toWire(data);
    source._id = foundry.utils.randomID();
    source.timestamp = Date.now();
    source.flags ??= {};
    source.flags[flagScope] = { ...source.flags[flagScope], invisi: true };
    return source;
  }

  function dispatch(source: Record<string, any>): void {
    const route = decideRoute(game.user.isGM, gmRecipients(game.users, game.user.id));
    switch (route.kind) {
      case 'gm':
        void receive(source);
        if (route.forwardTo.length > 0) {
          game.socket.emit(socket, makePayload(source), { recipients: route.forwardTo });
        }
        return;
      case 'player':
        game.socket.emit(socket, makePayload(source), { recipients: route.sendTo });
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
      await addLocal(source, flagScope);
    } catch (err) {
      console.error(`${MODULE_ID} | could not show an Invisi-Roll`, err, source);
      ui.notifications.error(t('RenderFailed'));
    }
    // No Dice So Nice call here: addLocal fires createChatMessage on this client only, and Dice So
    // Nice animates from that hook. Calling showForRoll as well rolled every die twice.
  }

  /**
   * Post an Invisi card to everyone as an ordinary public message, then drop this GM's local copy and
   * tell the other GMs to drop theirs, so nobody is left holding the card twice.
   */
  async function reveal(message: any): Promise<void> {
    if (!game.user.isGM || !isLocal(message)) return;
    await CONFIG.ChatMessage.documentClass.create(revealSource(message.toObject(), flagScope), { messageMode: 'public' });
    const others = gmRecipients(game.users, game.user.id);
    if (others.length > 0) game.socket.emit(socket, makeRevealPayload(message.id), { recipients: others });
    await message.delete();
  }

  /** Another GM revealed a card: drop this GM's local copy of it, if there is one. */
  async function dropRevealed(id: string): Promise<void> {
    const message = game.messages.get(id);
    if (message && isLocal(message)) await message.delete();
  }

  function clear(): void {
    clearHistory(storage(), historyKey(game.world.id));
    dropAllLocal();
  }

  /**
   * Mark Invisi cards so the GM can tell at a glance that players cannot see them. A WORLD message with
   * our mark is the opposite: every player has it (another module or an old version put it there), so
   * it gets a warning instead of the promise.
   */
  Hooks.on('renderChatMessageHTML', (message: any, html: HTMLElement) => {
    const badgeKind = badgeFor(message.getFlag?.(flagScope, 'invisi') === true, isLocal(message));
    if (badgeKind === 'none') return;
    const badge = document.createElement('div');
    if (badgeKind === 'leaked') {
      if (!game.user.isGM) return;
      badge.className = 'invisi-roll-badge invisi-roll-leaked';
      badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${t('Leaked')}`;
      html.querySelector('.message-header')?.after(badge);
      return;
    }
    html.classList.add('invisi-roll');
    badge.className = 'invisi-roll-badge';
    badge.innerHTML = `<i class="fa-solid fa-ghost"></i> ${t('Badge')}`;
    if (game.user.isGM) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'invisi-roll-reveal';
      button.dataset['tooltip'] = t('RevealHint');
      button.innerHTML = `<i class="fa-solid fa-eye"></i> ${t('Reveal')}`;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void reveal(message);
      });
      badge.append(button);
    }
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

  return {
    history: () => readHistory(storage(), historyKey(game.world.id)),
    clearHistory: clear,
    isLocal,
    reveal,
  };
}
