import { Markup, Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ethers } from 'ethers';
import QRCode from 'qrcode';
import { WerewolfEngine } from '../engine/WerewolfEngine.js';
import { QueuedHumanActionProvider } from '../engine/QueuedHumanActionProvider.js';
import { createComputeAdapter } from '../compute/createComputeAdapter.js';
import { createStorageAdapter } from '../storage/createStorageAdapter.js';
import type { StorageAdapter } from '../storage/StorageAdapter.js';
import type { MantleArenaAdapter, MantleArenaRecord } from '../mantle/MantleArenaAdapter.js';
import { createMantleArenaAdapter } from '../mantle/createMantleArenaAdapter.js';
import { persistGameArtifacts } from '../pipeline/persistGameArtifacts.js';
import { writeLocalShadowArtifact } from '../pipeline/writeLocalShadowArtifacts.js';
import { updateGameIndex } from '../web/gameIndex.js';
import type { GameEvent, GameState, Player } from '../types/game.js';
import { shuffle } from '../utils/random.js';

type WagerMode = 'off' | 'demo' | 'self';

interface WagerParticipant {
  playerId: string;
  label: string;
  address: string;
  wallet?: ethers.Wallet;
}

interface WagerTx {
  label: string;
  address: string;
  txHash: string;
  claimUrl?: string;
}

interface WagerSession {
  enabled: boolean;
  mode: WagerMode;
  gameKey: string;
  vaultAddress: string;
  bondMnt: string;
  participants: WagerParticipant[];
  fundTxs: WagerTx[];
  depositTxs: WagerTx[];
  depositUrl?: string;
}

interface WagerSettlementResult {
  totalBondMnt: string;
  winnerLabels: string[];
  settleTxHash: string;
  claimTxs: WagerTx[];
}

interface RoomSession {
  chatId: number | string;
  gameId: string;
  players: Array<Omit<Player, 'role' | 'alive'>>;
  state?: GameState;
  humans: QueuedHumanActionProvider;
  running: boolean;
  wagerMode: WagerMode;
  selfWalletAddress?: string;
  wager?: WagerSession;
}

const DEFAULT_AGENT_PLAYERS: Array<Omit<Player, 'role' | 'alive'>> = [
  { id: 'a1', displayName: 'Ada', kind: 'agent', agentPersonaId: 'analyst' },
  { id: 'a2', displayName: 'Charm', kind: 'agent', agentPersonaId: 'charmer' },
  { id: 'a3', displayName: 'Riot', kind: 'agent', agentPersonaId: 'chaos-wolf' },
  { id: 'a4', displayName: 'Shade', kind: 'agent', agentPersonaId: 'silent-killer' },
  { id: 'a5', displayName: 'Mira', kind: 'agent', agentPersonaId: 'empath' }
];

export class TuringMindGamesBot {
  private readonly bot: Telegraf;
  private readonly rooms = new Map<string, RoomSession>();
  private readonly userChats = new Map<string, number>();

  constructor(token: string) {
    this.bot = new Telegraf(token);
    this.registerHandlers();
  }

  async launch(): Promise<void> {
    await this.bot.launch();
    console.log('Turing MindGames Telegram bot launched.');
  }

  stop(reason = 'shutdown'): void {
    this.bot.stop(reason);
  }

  private registerHandlers(): void {
    this.bot.use(async (ctx, next) => {
      const text = ctx.message && 'text' in ctx.message && typeof ctx.message.text === 'string' ? ctx.message.text : undefined;
      if (text?.startsWith('/')) {
        console.log(JSON.stringify({
          marker: 'turing-telegram-inbound',
          command: text.split(/\s+/)[0],
          chatType: ctx.chat?.type,
          chatId: ctx.chat?.id,
          fromId: ctx.from?.id,
          ts: new Date().toISOString()
        }));
      }
      if (ctx.from && ctx.chat?.type === 'private') {
        this.userChats.set(`u${ctx.from.id}`, ctx.chat.id);
      }
      return next();
    });

    this.bot.start(async (ctx) => {
      await this.replyHtml(ctx, this.helpText());
    });

    this.bot.command('help', async (ctx) => this.replyHtml(ctx, this.helpText()));

    this.bot.command('newgame', async (ctx) => {
      const chatId = this.chatKey(ctx);
      const gameId = `tg-${Date.now()}`;
      this.rooms.set(chatId, {
        chatId: ctx.chat?.id ?? chatId,
        gameId,
        players: [],
        humans: new QueuedHumanActionProvider(),
        running: false,
        wagerMode: this.defaultWagerMode()
      });
      await this.replyHtml(ctx, [
        `✅ <b>Room created</b>` ,
        `<code>${this.escapeHtml(gameId)}</code>`,
        '',
        `<b>Next steps for judges</b>`,
        `1. Send <code>/join</code> to take the human seat.`,
        `2. Send <code>/startgame</code> to post demo performance bonds, fill the table with AI agents, and start.`,
        `3. During the game, follow the bot prompts: use inline buttons, or <code>/say</code>, <code>/vote</code>, <code>/kill</code>, <code>/check</code>.`,
        `4. After the game, inspect the clickable Mantlescan links for action audit, settlement, and claim proofs.`,
        '',
        `💰 <b>Wager mode</b>: <b>${this.escapeHtml(this.defaultWagerMode())}</b>`,
        `Choose before <code>/startgame</code>: <code>/wageroff</code>, <code>/wagerdemo</code>, or <code>/wagerself</code>.`,
        `For self-wallet wager: send <code>/wallet 0xYourAddress</code>, then open the payment link in a browser with MetaMask.`,
        `Bond: <b>${this.escapeHtml(this.wagerBondMnt())} MNT</b> on Mantle Sepolia.`,
        `If wager feels too much, use <code>/wageroff</code> and the game still runs with on-chain action audit.`,
        '',
        `Tip: DM <code>/start</code> to this bot first so private role and night-action prompts can reach you.`
      ].join('\n'));
    });

    this.bot.command('join', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      if (room.running) return ctx.reply('Game already running.');
      const from = ctx.from;
      if (!from) return ctx.reply('Cannot identify user.');
      const id = `u${from.id}`;
      if (room.players.some((p) => p.id === id)) return ctx.reply('You already joined.');
      if (room.players.length >= 6) return ctx.reply('Room is full.');
      room.players.push({ id, displayName: from.first_name ?? from.username ?? id, kind: 'human' });
      await this.replyHtml(ctx, `✅ <b>Joined:</b> ${this.escapeHtml(from.first_name ?? from.username ?? id)}\nHumans: <b>${room.players.length}</b>\n\nWhen ready, send <code>/startgame</code>. The bot will add AI agents automatically.`);
    });

    this.bot.command('wageroff', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      if (room.running) return ctx.reply('Game already running. Wager mode cannot be changed now.');
      room.wagerMode = 'off';
      await this.replyHtml(ctx, '✅ <b>Wager mode: OFF</b>\nYou can still play the game and get Mantle action-audit links at the end. Send <code>/startgame</code> when ready.');
    });

    this.bot.command('wagerdemo', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      if (room.running) return ctx.reply('Game already running. Wager mode cannot be changed now.');
      room.wagerMode = 'demo';
      await this.replyHtml(ctx, `✅ <b>Wager mode: DEMO-SPONSORED</b>\nThe demo operator wallet posts all testnet performance bonds. Bond: <b>${this.escapeHtml(this.wagerBondMnt())} MNT</b> per seat. Send <code>/startgame</code> when ready.`);
    });

    this.bot.command('wagerself', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      if (room.running) return ctx.reply('Game already running. Wager mode cannot be changed now.');
      room.wagerMode = 'self';
      await this.replyHtml(ctx, [
        '✅ <b>Wager mode: SELF-WALLET</b>',
        `You post your own <b>${this.escapeHtml(this.wagerBondMnt())} MNT</b> testnet performance bond from MetaMask.`,
        'Next: send <code>/wallet 0xYourMantleSepoliaAddress</code>.',
        'Then <code>/startgame</code> will give you a browser payment link and wait until the deposit is seen on-chain.'
      ].join('\n'));
    });

    this.bot.command('wallet', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      if (room.running) return ctx.reply('Game already running. Wallet cannot be changed now.');
      const address = this.commandPayload(ctx).trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return this.replyHtml(ctx, 'Usage: <code>/wallet 0xYourMantleSepoliaAddress</code>');
      room.selfWalletAddress = ethers.getAddress(address);
      await this.replyHtml(ctx, `✅ <b>Self-wallet saved</b>\n${this.addressLink(room.selfWalletAddress)}\n\nNow send <code>/startgame</code>.`);
    });

    this.bot.command('status', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      const pending = room.humans.listPending();
      await ctx.reply(JSON.stringify({
        gameId: room.gameId,
        running: room.running,
        wagerMode: room.wagerMode,
        selfWalletAddress: room.selfWalletAddress,
        players: room.state?.players.map((p) => ({ id: p.id, name: p.displayName, alive: p.alive, kind: p.kind })) ?? room.players,
        pending
      }, null, 2));
    });

    const abortHandler = async (ctx: Context) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      room.humans.abortAll?.('Game aborted by user command');
      room.running = false;
      this.rooms.delete(this.chatKey(ctx));
      await ctx.reply(`Game ${room.gameId} aborted. Use /newgame to start fresh.`);
    };

    this.bot.command('abortgame', abortHandler);
    this.bot.command('endgame', abortHandler);

    this.bot.command('startgame', async (ctx) => {
      const chatId = this.chatKey(ctx);
      const room = this.requireRoom(ctx);
      if (!room) return;
      if (room.running) return ctx.reply('Game already running.');
      if (room.players.length < 1) return ctx.reply('At least one human should /join before starting.');

      const players = shuffle([...room.players, ...DEFAULT_AGENT_PLAYERS].slice(0, 6));
      const compute = createComputeAdapter();
      const engine = new WerewolfEngine(compute, room.humans);
      const storage = createStorageAdapter();
      const chain = createMantleArenaAdapter();
      room.running = true;
      room.state = engine.createGame(room.gameId, players);

      if (room.wagerMode !== 'off') {
        // Demo allowlist check temporarily disabled for testing
        // if (room.wagerMode === 'demo' && !this.telegramWagerAllowed(ctx)) {
        //   room.running = false;
        //   await this.replyHtml(ctx, [
        //     '🔒 <b>Live wager mode is restricted</b>',
        //     'This chat is not allowlisted for live wager setup.',
        //     'Use <code>/wageroff</code> to play without wager, or ask the operator to allowlist this chat.'
        //   ].join('\n'));
        //   return;
        // }
        await this.replyHtml(ctx, [
          '💰 <b>Preparing performance bonds</b>',
          `Mode: <b>${this.escapeHtml(room.wagerMode)}</b>`,
          `Game: <code>${this.escapeHtml(room.gameId)}</code>`,
          `Bond: <b>${this.escapeHtml(this.wagerBondMnt())} MNT</b> per seat`,
          '',
          room.wagerMode === 'self'
            ? 'You will pay your own human-seat bond from MetaMask. The bot will wait until the deposit is visible on Mantle Sepolia.'
            : 'The demo operator wallet will post bonds for all seats. This may take several Mantle Sepolia transactions.'
        ].join('\n'));
        if (room.wagerMode === 'self') {
          void this.prepareAndStartGame(ctx, room, engine, storage, chain, players, chatId).catch((error) => {
            room.running = false;
            this.rooms.delete(chatId);
            console.error(error);
            void this.replyHtml(ctx, `❌ <b>Wager setup failed</b>\n${this.escapeHtml(error instanceof Error ? error.message : String(error))}\n\nUse <code>/newgame</code> to try again, or use <code>/wageroff</code> for no-wager mode.`).catch(() => undefined);
          });
          return;
        }
        // Demo wager: also run in background to avoid Telegram timeout
        void this.prepareDemoAndStartGame(ctx, room, engine, storage, chain, players, chatId).catch((error) => {
          room.running = false;
          this.rooms.delete(chatId);
          console.error(error);
          void this.replyHtml(ctx, `❌ <b>Wager setup failed</b>\n${this.escapeHtml(error instanceof Error ? error.message : String(error))}\n\nUse <code>/newgame</code> to try again, or use <code>/wageroff</code> for no-wager mode.`).catch(() => undefined);
        });
        return;
      }

      await this.announceAndRunGame(ctx, room, engine, storage, chain, players);
    });

    this.bot.command('say', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      if (!room.running || !room.state) return ctx.reply('Game not running.');
      if (room.state.phase !== 'day') return this.replyHtml(ctx, '⚠️ <b>Not in day phase.</b>\nYou can only <code>/say</code> during the day discussion phase.');
      const from = ctx.from;
      if (!from) return;
      const text = this.commandPayload(ctx);
      if (!text) return this.replyHtml(ctx, 'Usage: <code>/say your public speech</code>');
      const ok = room.humans.submitSpeech(`u${from.id}`, `${from.first_name ?? from.username}: ${text}`);
      await this.replyHtml(ctx, ok ? '✅ <b>Speech submitted.</b>\nWaiting for the rest of the table...' : 'No pending speech request for you right now.');
    });

    this.bot.command('vote', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      const from = ctx.from;
      if (!from) return;
      const target = this.commandPayload(ctx).trim();
      if (!target) return this.replyHtml(ctx, 'Usage: <code>/vote &lt;playerId&gt;</code>');
      const ok = room.humans.submitVote(`u${from.id}`, target);
      await this.replyHtml(ctx, ok ? `✅ <b>Vote submitted</b>\nTarget: <b>${this.escapeHtml(this.playerName(room, target))}</b>` : 'No pending vote request for you.');
    });

    this.bot.command('kill', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      const from = ctx.from;
      if (!from) return;
      const target = this.commandPayload(ctx).trim();
      if (!target) return this.replyHtml(ctx, 'Usage: <code>/kill &lt;playerId&gt;</code>');
      const ok = room.humans.submitNightKill(`u${from.id}`, target);
      await this.replyHtml(ctx, ok ? `✅ <b>Night kill submitted</b>\nTarget: <b>${this.escapeHtml(this.playerName(room, target))}</b>` : 'No pending night kill request for you.');
    });

    this.bot.command('check', async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      const from = ctx.from;
      if (!from) return;
      const target = this.commandPayload(ctx).trim();
      if (!target) return this.replyHtml(ctx, 'Usage: <code>/check &lt;playerId&gt;</code>');
      const ok = room.humans.submitSeerCheck(`u${from.id}`, target);
      await this.replyHtml(ctx, ok ? `✅ <b>Seer check submitted</b>\nTarget: <b>${this.escapeHtml(this.playerName(room, target))}</b>` : 'No pending seer check request for you.');
    });

    this.bot.action(/^mg:(vote|kill|check):(.+)$/, async (ctx) => {
      const room = this.requireRoom(ctx);
      if (!room) return;
      const from = ctx.from;
      if (!from) return;
      const action = ctx.match[1];
      const targetId = ctx.match[2];
      const playerId = `u${from.id}`;
      const ok = action === 'vote'
        ? room.humans.submitVote(playerId, targetId)
        : action === 'kill'
          ? room.humans.submitNightKill(playerId, targetId)
          : room.humans.submitSeerCheck(playerId, targetId);
      await ctx.answerCbQuery(ok ? `${action} submitted: ${this.playerName(room, targetId)}` : `No pending ${action} request for you.`);
      if (ok) {
        await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
        await this.replyHtml(ctx, `✅ <b>${this.escapeHtml(action)} submitted</b>\nTarget: <b>${this.escapeHtml(this.playerName(room, targetId))}</b>`);
      }
    });
  }

  private async prepareAndStartGame(
    ctx: Context,
    room: RoomSession,
    engine: WerewolfEngine,
    storage: StorageAdapter,
    chain: MantleArenaAdapter,
    players: Array<Omit<Player, 'role' | 'alive'>>,
    _chatId: string
  ): Promise<void> {
    room.wager = await this.prepareSelfWalletWager(ctx, room);
    await this.announceAndRunGame(ctx, room, engine, storage, chain, players);
  }

  private async prepareDemoAndStartGame(
    ctx: Context,
    room: RoomSession,
    engine: WerewolfEngine,
    storage: StorageAdapter,
    chain: MantleArenaAdapter,
    players: Array<Omit<Player, 'role' | 'alive'>>,
    _chatId: string
  ): Promise<void> {
    room.wager = await this.prepareDemoWager(room);
    await this.announceAndRunGame(ctx, room, engine, storage, chain, players);
  }

  private async announceAndRunGame(
    ctx: Context,
    room: RoomSession,
    engine: WerewolfEngine,
    storage: StorageAdapter,
    chain: MantleArenaAdapter,
    players: Array<Omit<Player, 'role' | 'alive'>>
  ): Promise<void> {
    await this.replyHtml(ctx, [
      `🎮 <b>Game started</b>` ,
      `<code>${this.escapeHtml(room.gameId)}</code>`,
      '',
      `🎲 <b>Seat order this game</b>`,
      this.formatPublicPlayerList(players),
      '',
      room.wager ? this.formatWagerStart(room.wager) : '💰 <b>Wager mode</b>: off for this room.',
      '',
      `🔒 <b>Private role messages have been sent.</b>`,
      `🌙 Night phase will begin immediately.`
    ].join('\n'));
    await this.sendPrivateRoleNotices(room);
    this.runGame(ctx, room, engine, storage, chain).catch(async (err) => {
      room.running = false;
      console.error(err);
      await ctx.reply(`Game failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private async runGame(
    ctx: Context,
    room: RoomSession,
    engine: WerewolfEngine,
    storage: StorageAdapter,
    chain: MantleArenaAdapter
  ): Promise<void> {
    if (!room.state) throw new Error('Room state missing');

    let announcedEvents = 0;
    const flushPublicEvents = async () => {
      if (!room.state) return;
      const nextEvents = room.state.events.slice(announcedEvents);
      announcedEvents = room.state.events.length;
      for (const event of nextEvents) {
        if (event.publicText) {
          await this.replyHtml(ctx, this.formatPublicEvent(room, event)).catch(() => undefined);
        } else if (event.type === 'seer_check' && event.actorId && event.privateNote) {
          await this.notifyHuman(
            ctx,
            event.actorId,
            `🔮 <b>Seer result</b>\n${this.escapeHtml(event.privateNote)}`,
            undefined,
            true
          ).catch(() => undefined);
        }
      }
    };

    const reminderMs = Number(process.env.HUMAN_PENDING_REMINDER_MS ?? 60000);
    const notifier = setInterval(() => {
      const pending = room.humans.listPending();
      for (const req of pending) {
        const secondsLeft = Math.max(0, Math.ceil((req.timeoutAt - Date.now()) / 1000));
        const suffix = `\n\n⏳ Timeout fallback in ~<b>${secondsLeft}s</b>.`;
        const alivePlayers = room.state?.players.filter((p) => p.alive) ?? [];
        const alive = this.formatPublicPlayerList(alivePlayers);
        const nonWolves = this.formatPublicPlayerList(room.state?.players.filter((p) => p.alive && p.role !== 'wolf') ?? []);
        const voteTargets = req.allowedTargetIds?.length
          ? this.formatPublicPlayerList(room.state?.players.filter((p) => req.allowedTargetIds?.includes(p.id)) ?? [])
          : alive;
        const msg = req.type === 'speech'
          ? `🗣 <b>${this.escapeHtml(req.playerName)}</b>\n\nIt is your turn to speak.\nUse <code>/say &lt;message&gt;</code>.${suffix}`
          : req.type === 'vote'
            ? `🗳 <b>${this.escapeHtml(req.playerName)}</b>\n\nVote now.\nTap a button or use <code>/vote &lt;playerId&gt;</code>.\n\n<b>Legal vote targets</b>\n${voteTargets}${suffix}`
            : req.type === 'nightKill'
              ? `🐺 <b>${this.escapeHtml(req.playerName)}</b> · 🐺 <b>Wolf</b>\n\nNight action: choose a kill target.\nTap a button or use <code>/kill &lt;playerId&gt;</code>.\n\n<b>Legal targets</b>\n${nonWolves}${suffix}`
              : `🔮 <b>${this.escapeHtml(req.playerName)}</b> · 🔮 <b>Seer</b>\n\nNight action: inspect one player.\nTap a button or use <code>/check &lt;playerId&gt;</code>.\n\n<b>Alive players</b>\n${alive}${suffix}`;
        void this.notifyHuman(ctx, req.playerId, msg, this.keyboardForRequest(room, req.type, req.playerId, req.allowedTargetIds), req.type === 'nightKill' || req.type === 'seerCheck').catch(() => undefined);
      }
    }, reminderMs);

    const broadcaster = setInterval(() => {
      void flushPublicEvents();
    }, 1000);

    try {
      const { state, summary } = await engine.runToEnd(room.state, Number(process.env.DEMO_MAX_ROUNDS ?? 3));
      await flushPublicEvents();
      await writeLocalShadowArtifact(`${room.gameId}/transcript.json`, state.events);
      await writeLocalShadowArtifact(`${room.gameId}/summary.raw.json`, summary);
      if (summary.agentMemories) await writeLocalShadowArtifact('latest-agent-memories.json', summary.agentMemories);
      const rawTranscriptArtifact = await storage.putJson(`${room.gameId}/transcript.json`, state.events);
      const rawSummaryArtifact = await storage.putJson(`${room.gameId}/summary.raw.json`, summary);
      const chainRecord = await chain.finalizeGame(state, summary, rawTranscriptArtifact.root, rawSummaryArtifact.root);
      console.log(JSON.stringify({
        marker: 'turing-telegram-game-finalized',
        gameId: room.gameId,
        winner: summary.winner,
        eventCount: state.events.length,
        txHash: chainRecord.txHash,
        actionRegistryAddress: chainRecord.actionRegistryAddress,
        ts: new Date().toISOString()
      }));
      // Chain finalization uses the same wallet as Storage in Mantle demos. Recreate the
      // storage adapter after chain txs so the next Storage batch starts from the
      // fresh pending nonce instead of the pre-chain local nonce cursor.
      const postChainStorage = createStorageAdapter();
      const persisted = await persistGameArtifacts(postChainStorage, state, summary, chainRecord, {
        manifestPath: `artifacts/${room.gameId}/replay-manifest.json`,
        latestManifestPath: process.env.TELEGRAM_UPDATE_LATEST_REPLAY === '1' ? 'web/data/latest-demo.json' : undefined,
        engine: this.engineLabel(),
        rawTranscriptArtifact,
        rawSummaryArtifact
      });
      const wagerResult = room.wager ? await this.settleWager(room, summary.winner, rawSummaryArtifact.root) : undefined;
      await this.publishToWeb(room.gameId, summary.winner, state.events.length, chainRecord.actionRegistryAddress);
      await this.replyHtml(ctx, this.formatFinalResult({
        room,
        summaryWinner: summary.winner,
        eventCount: state.events.length,
        chainRecord,
        publicTranscriptRoot: persisted.publicTranscriptArtifact.root,
        privateAuditRoot: persisted.privateAuditTranscriptArtifact.root,
        summaryRoot: persisted.summaryArtifact.root,
        wagerResult
      }));
    } finally {
      clearInterval(notifier);
      clearInterval(broadcaster);
      room.running = false;
      this.rooms.delete(String(room.chatId));
    }
  }

  private async prepareDemoWager(room: RoomSession): Promise<WagerSession> {
    if (!room.state) throw new Error('Room state missing');
    const vaultAddress = process.env.GAME_SETTLEMENT_VAULT_ADDRESS;
    if (!vaultAddress) throw new Error('Missing GAME_SETTLEMENT_VAULT_ADDRESS');
    const operatorKey = process.env.TELEGRAM_WAGER_OPERATOR_PRIVATE_KEY || process.env.HUMAN_WALLET_PRIVATE_KEY || process.env.MANTLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!operatorKey) throw new Error('Missing TELEGRAM_WAGER_OPERATOR_PRIVATE_KEY or MANTLE_PRIVATE_KEY');
    const agentKeys = (process.env.AGENT_WALLET_PRIVATE_KEYS || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (agentKeys.length < DEFAULT_AGENT_PLAYERS.length) throw new Error(`Need ${DEFAULT_AGENT_PLAYERS.length} AGENT_WALLET_PRIVATE_KEYS for Telegram wager mode`);

    const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL || 'https://rpc.sepolia.mantle.xyz', 5003);
    const operator = new ethers.Wallet(operatorKey, provider);
    const artifact = await this.loadSettlementVaultArtifact();
    const vault = new ethers.Contract(vaultAddress, artifact.abi, operator);
    const gameKey = ethers.id(`turing-mindgames:game:${room.gameId}`);
    const bondMnt = this.wagerBondMnt();
    const bond = ethers.parseEther(bondMnt);
    const minAgentGas = ethers.parseEther(process.env.TELEGRAM_WAGER_MIN_AGENT_GAS_MNT || process.env.MIN_AGENT_GAS_MNT || '0.02');
    const fundAmount = ethers.parseEther(process.env.TELEGRAM_WAGER_AGENT_FUND_MNT || process.env.AGENT_FUND_MNT || '0.03');

    const agentWalletById = new Map(DEFAULT_AGENT_PLAYERS.map((player, index) => [player.id, new ethers.Wallet(agentKeys[index], provider)]));
    const participants: WagerParticipant[] = room.state.players.map((player) => {
      const wallet = player.kind === 'human' ? operator : agentWalletById.get(player.id);
      if (!wallet) throw new Error(`Missing wager wallet for ${player.id}`);
      return { playerId: player.id, label: player.displayName, address: wallet.address, wallet };
    });

    const fundTxs: WagerTx[] = [];
    // Skip funding check: agent wallets pre-funded via scripts/fund-agent-wallets.mjs

    const depositTxs: WagerTx[] = [];
    for (const participant of participants) {
      if (!participant.wallet) throw new Error(`Missing signing wallet for ${participant.label}`);
      const tx = await (vault.connect(participant.wallet) as ethers.Contract).depositBond(gameKey, { value: bond });
      await tx.wait();
      depositTxs.push({ label: participant.label, address: participant.address, txHash: tx.hash });
    }

    return { enabled: true, mode: 'demo', gameKey, vaultAddress, bondMnt, participants, fundTxs, depositTxs };
  }

  private async prepareSelfWalletWager(ctx: Context, room: RoomSession): Promise<WagerSession> {
    if (!room.state) throw new Error('Room state missing');
    if (!room.selfWalletAddress) throw new Error('Self-wallet mode needs /wallet 0xYourAddress before /startgame');
    const vaultAddress = process.env.GAME_SETTLEMENT_VAULT_ADDRESS;
    if (!vaultAddress) throw new Error('Missing GAME_SETTLEMENT_VAULT_ADDRESS');
    const operatorKey = process.env.TELEGRAM_WAGER_OPERATOR_PRIVATE_KEY || process.env.MANTLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!operatorKey) throw new Error('Missing operator MANTLE_PRIVATE_KEY');
    const agentKeys = (process.env.AGENT_WALLET_PRIVATE_KEYS || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (agentKeys.length < DEFAULT_AGENT_PLAYERS.length) throw new Error(`Need ${DEFAULT_AGENT_PLAYERS.length} AGENT_WALLET_PRIVATE_KEYS for agent seats`);

    const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL || 'https://rpc.sepolia.mantle.xyz', 5003);
    const operator = new ethers.Wallet(operatorKey, provider);
    const artifact = await this.loadSettlementVaultArtifact();
    const vault = new ethers.Contract(vaultAddress, artifact.abi, operator);
    const gameKey = ethers.id(`turing-mindgames:game:${room.gameId}`);
    const bondMnt = this.wagerBondMnt();
    const bond = ethers.parseEther(bondMnt);
    const minAgentGas = ethers.parseEther(process.env.TELEGRAM_WAGER_MIN_AGENT_GAS_MNT || process.env.MIN_AGENT_GAS_MNT || '0.02');
    const fundAmount = ethers.parseEther(process.env.TELEGRAM_WAGER_AGENT_FUND_MNT || process.env.AGENT_FUND_MNT || '0.03');
    const agentWalletById = new Map(DEFAULT_AGENT_PLAYERS.map((player, index) => [player.id, new ethers.Wallet(agentKeys[index], provider)]));

    const participants: WagerParticipant[] = room.state.players.map((player) => {
      if (player.kind === 'human') return { playerId: player.id, label: player.displayName, address: room.selfWalletAddress! };
      const wallet = agentWalletById.get(player.id);
      if (!wallet) throw new Error(`Missing agent wallet for ${player.id}`);
      return { playerId: player.id, label: player.displayName, address: wallet.address, wallet };
    });

    const fundTxs: WagerTx[] = [];
    const depositTxs: WagerTx[] = [];
    const depositUrl = this.selfDepositUrl({ gameId: room.gameId, gameKey, vaultAddress, bondMnt, playerId: participants.find((p) => !p.wallet)?.playerId ?? 'human', address: room.selfWalletAddress });
    await this.replyHtml(ctx, [
      '🦊 <b>Your turn: pay self-wallet wager</b>',
      `Wallet: ${this.addressLink(room.selfWalletAddress)}`,
      `Bond: <b>${this.escapeHtml(bondMnt)} MNT</b>`,
      `Payment page: <a href="${this.escapeHtml(depositUrl)}">Open MetaMask deposit page</a>`,
      '',
      'Prefer mobile MetaMask? Scan the QR code below with your phone.',
      'If Telegram in-app browser has trouble with MetaMask, copy the link and open it in your normal browser with MetaMask installed.',
      'The bot is watching Mantle Sepolia and will start the game automatically after your deposit is confirmed.'
    ].join('\n'));
    await this.sendQrCode(ctx, depositUrl, 'Scan to open the self-wallet wager deposit page in mobile MetaMask / browser.');

    for (const participant of participants.filter((item) => item.wallet)) {
      const wallet = participant.wallet!;
      if (wallet.address !== operator.address) {
        const balance = await provider.getBalance(wallet.address);
        if (balance < minAgentGas) {
          const tx = await operator.sendTransaction({ to: wallet.address, value: fundAmount });
          await tx.wait();
          fundTxs.push({ label: participant.label, address: participant.address, txHash: tx.hash });
        }
      }
      const tx = await (vault.connect(wallet) as ethers.Contract).depositBond(gameKey, { value: bond });
      await tx.wait();
      depositTxs.push({ label: participant.label, address: participant.address, txHash: tx.hash });
    }

    await this.waitForBond(vault, gameKey, room.selfWalletAddress, bond, Number(process.env.TELEGRAM_SELF_WAGER_TIMEOUT_MS || 600000));
    depositTxs.push({ label: 'Self-wallet human', address: room.selfWalletAddress, txHash: 'paid-directly-by-user' });
    await this.replyHtml(ctx, '✅ <b>All bonds detected on Mantle Sepolia.</b> Starting the match now.');

    return { enabled: true, mode: 'self', gameKey, vaultAddress, bondMnt, participants, fundTxs, depositTxs, depositUrl };
  }

  private async waitForBond(vault: ethers.Contract, gameKey: string, address: string, bond: bigint, timeoutMs: number): Promise<void> {
    const started = Date.now();
    let lastValue = 0n;
    let checks = 0;
    console.log(`[waitForBond] start: gameKey=${gameKey.slice(0, 16)}... address=${address} bond=${bond} timeout=${timeoutMs}ms`);
    while (Date.now() - started < timeoutMs) {
      try {
        const value = await vault.bondOf(gameKey, address);
        checks++;
        if (value !== lastValue) {
          console.log(`[waitForBond] check ${checks}: bondOf=${value} (need ${bond})`);
          lastValue = value;
        }
        if (value >= bond) {
          console.log(`[waitForBond] success after ${checks} checks, ${Date.now() - started}ms`);
          return;
        }
      } catch (error) {
        console.error(`[waitForBond] bondOf query failed:`, error);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    console.error(`[waitForBond] timeout after ${checks} checks, ${Date.now() - started}ms, last bondOf=${lastValue}`);
    throw new Error(`Timed out waiting for self-wallet deposit. Last bondOf: ${lastValue}, needed: ${bond}. Please check if you completed the MetaMask transaction and used the correct wallet address.`);
  }

  private selfDepositUrl(input: { gameId: string; gameKey: string; vaultAddress: string; bondMnt: string; playerId: string; address: string }): string {
    const url = this.publicPageUrl('deposit.html', process.env.PUBLIC_DEPOSIT_BASE_URL);
    url.searchParams.set('gameId', input.gameId);
    url.searchParams.set('gameKey', input.gameKey);
    url.searchParams.set('vault', input.vaultAddress);
    url.searchParams.set('bond', input.bondMnt);
    url.searchParams.set('playerId', input.playerId);
    url.searchParams.set('address', input.address);
    return url.toString();
  }

  private selfClaimUrl(input: { gameId: string; gameKey: string; vaultAddress: string; address: string }): string {
    const url = this.publicPageUrl('claim.html', process.env.PUBLIC_CLAIM_BASE_URL);
    url.searchParams.set('gameId', input.gameId);
    url.searchParams.set('gameKey', input.gameKey);
    url.searchParams.set('vault', input.vaultAddress);
    url.searchParams.set('address', input.address);
    return url.toString();
  }

  private publicPageUrl(page: string, override?: string): URL {
    const base = (override || process.env.PUBLIC_WEB_BASE_URL || `http://localhost:4173/${page}`).replace(/\/$/, '');
    return new URL(base.endsWith(page) ? base : `${base}/${page}`);
  }

  private async settleWager(room: RoomSession, winner: string, summaryRoot: string): Promise<WagerSettlementResult | undefined> {
    if (!room.state || !room.wager) return undefined;
    const operatorKey = process.env.TELEGRAM_WAGER_OPERATOR_PRIVATE_KEY || process.env.MANTLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!operatorKey) throw new Error('Missing operator key for settlement');
    const provider = new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL || 'https://rpc.sepolia.mantle.xyz', 5003);
    const operator = new ethers.Wallet(operatorKey, provider);
    const artifact = await this.loadSettlementVaultArtifact();
    const vault = new ethers.Contract(room.wager.vaultAddress, artifact.abi, operator);
    const winningParticipants = room.wager.participants.filter((participant) => {
      const player = room.state?.players.find((item) => item.id === participant.playerId);
      if (!player) return false;
      return winner === 'wolves' ? player.role === 'wolf' : player.role !== 'wolf';
    });
    if (!winningParticipants.length) throw new Error(`No wager winners for camp ${winner}`);

    const settleTx = await vault.settle(room.wager.gameKey, ethers.id(winner), winningParticipants.map((item) => item.address), summaryRoot);
    await settleTx.wait();

    const claimTxs: WagerTx[] = [];
    for (const participant of winningParticipants) {
      if (!participant.wallet) {
        claimTxs.push({
          label: `${participant.label} (claim with MetaMask)`,
          address: participant.address,
          txHash: 'manual-claim-required',
          claimUrl: this.selfClaimUrl({ gameId: room.gameId, gameKey: room.wager.gameKey, vaultAddress: room.wager.vaultAddress, address: participant.address })
        });
        continue;
      }
      const tx = await (vault.connect(participant.wallet) as ethers.Contract).claim(room.wager.gameKey);
      await tx.wait();
      claimTxs.push({ label: participant.label, address: participant.address, txHash: tx.hash });
    }

    const info = await vault.poolInfo(room.wager.gameKey);
    return {
      totalBondMnt: ethers.formatEther(info[0]),
      winnerLabels: winningParticipants.map((item) => item.label),
      settleTxHash: settleTx.hash,
      claimTxs
    };
  }

  private async loadSettlementVaultArtifact(): Promise<{ abi: ethers.InterfaceAbi }> {
    return JSON.parse(await readFile('artifacts/contracts/GameSettlementVault.json', 'utf8')) as { abi: ethers.InterfaceAbi };
  }

  private async sendQrCode(ctx: Context, url: string, caption: string): Promise<void> {
    const png = await QRCode.toBuffer(url, { type: 'png', margin: 2, width: 420, errorCorrectionLevel: 'M' });
    await ctx.replyWithPhoto({ source: png }, { caption, parse_mode: 'HTML' });
  }

  private async publishToWeb(gameId: string, winner: string, eventCount: number, actionRegistryAddress?: string): Promise<void> {
    const webRoot = process.env.PUBLIC_WEB_ROOT?.trim();
    if (!webRoot) return;

    const sourceManifest = `artifacts/${gameId}/replay-manifest.json`;
    const targetManifest = join(webRoot, 'artifacts', gameId, 'replay-manifest.json');
    await mkdir(dirname(targetManifest), { recursive: true });
    await copyFile(sourceManifest, targetManifest);
    await updateGameIndex(join(webRoot, 'data', 'game-index.json'), {
      gameId,
      winner,
      eventCount,
      generatedAt: new Date().toISOString(),
      networkLabel: actionRegistryAddress ? 'Mantle Sepolia' : 'Local Dev',
      storageMode: 'Local JSON artifacts',
      manifestPath: `artifacts/${gameId}/replay-manifest.json`,
      registry: actionRegistryAddress || 'Mock Mantle adapter'
    });
    await copyFile(sourceManifest, join(webRoot, 'data', 'latest-demo.json'));
  }

  private formatWagerStart(wager: WagerSession): string {
    return [
      '💰 <b>Wager mode: ON</b>',
      `Bond: <b>${this.escapeHtml(wager.bondMnt)} MNT</b> per seat`,
      `Settlement vault: ${this.addressLink(wager.vaultAddress)}`,
      `Game key: <code>${this.escapeHtml(wager.gameKey)}</code>`,
      '',
      '<b>Deposit proof</b>',
      ...wager.depositTxs.map((tx) => `• ${this.escapeHtml(tx.label)}: ${this.txLink(tx.txHash)}`),
      ...(wager.fundTxs.length ? ['', '<b>Gas funding</b>', ...wager.fundTxs.map((tx) => `• ${this.escapeHtml(tx.label)}: ${this.txLink(tx.txHash)}`)] : []),
      '',
      'At the end, the winning camp will be settled on Mantle Sepolia and winners will claim the pool.'
    ].join('\n');
  }

  private formatFinalResult(input: {
    room: RoomSession;
    summaryWinner: string;
    eventCount: number;
    chainRecord: MantleArenaRecord;
    publicTranscriptRoot: string;
    privateAuditRoot: string;
    summaryRoot: string;
    wagerResult?: WagerSettlementResult;
  }): string {
    const chain = input.chainRecord;
    const lines = [
      `🏁 <b>Game finished</b>: <code>${this.escapeHtml(input.room.gameId)}</code>`,
      `Winner: <b>${this.escapeHtml(input.summaryWinner)}</b>`,
      `Events: <b>${input.eventCount}</b>`,
      '',
      '<b>Mantle action audit</b>',
      `Create game: ${this.txLink(chain.createTxHash)}`,
      `Finalize game: ${this.txLink(chain.txHash)}`,
      `Action registry: ${chain.actionRegistryAddress ? this.addressLink(chain.actionRegistryAddress) : 'Mock / not linked'}`,
      `Game key: <code>${this.escapeHtml(chain.gameKey ?? 'n/a')}</code>`,
      `Recorded actions: <b>${chain.recordedActionCount ?? 0}</b>`,
      '',
      '<b>Artifact roots</b>',
      `Public transcript: <code>${this.escapeHtml(input.publicTranscriptRoot)}</code>`,
      `Private audit: <code>${this.escapeHtml(input.privateAuditRoot)}</code>`,
      `Summary: <code>${this.escapeHtml(input.summaryRoot)}</code>`
    ];

    if (input.wagerResult && input.room.wager) {
      lines.push(
        '',
        '<b>Wager settlement</b>',
        `Settlement vault: ${this.addressLink(input.room.wager.vaultAddress)}`,
        `Total pool: <b>${this.escapeHtml(input.wagerResult.totalBondMnt)} MNT</b>`,
        `Winning claimant(s): <b>${this.escapeHtml(input.wagerResult.winnerLabels.join(', '))}</b>`,
        `Settle tx: ${this.txLink(input.wagerResult.settleTxHash)}`,
        ...input.wagerResult.claimTxs.map((tx) => `Claim · ${this.escapeHtml(tx.label)}: ${tx.claimUrl ? `<a href="${this.escapeHtml(tx.claimUrl)}">Open claim page</a>` : this.txLink(tx.txHash)}`)
      );
    } else {
      lines.push('', '<b>Wager settlement</b>', 'Wager mode was off for this room.');
    }

    lines.push('', 'Tap any linked tx/address above to inspect it on Mantlescan.');
    return lines.join('\n');
  }

  private txLink(txHash?: string): string {
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return `<code>${this.escapeHtml(txHash ?? 'n/a')}</code>`;
    return `<a href="https://sepolia.mantlescan.xyz/tx/${txHash}">${this.escapeHtml(this.shortHash(txHash))}</a>`;
  }

  private addressLink(address?: string): string {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return `<code>${this.escapeHtml(address ?? 'n/a')}</code>`;
    return `<a href="https://sepolia.mantlescan.xyz/address/${address}">${this.escapeHtml(this.shortHash(address))}</a>`;
  }

  private shortHash(value: string): string {
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  }

  private defaultWagerMode(): WagerMode {
    const mode = (process.env.TELEGRAM_WAGER_DEFAULT_MODE || (this.telegramWagerEnabled() ? 'demo' : 'off')).trim().toLowerCase();
    if (mode === 'demo' || mode === 'self' || mode === 'off') return mode;
    return 'off';
  }

  private telegramWagerEnabled(): boolean {
    return ['1', 'true', 'yes', 'on'].includes((process.env.TELEGRAM_WAGER_ENABLED ?? '').trim().toLowerCase());
  }

  private telegramWagerAllowed(ctx: Context): boolean {
    const raw = (process.env.TELEGRAM_WAGER_ALLOWED_CHAT_IDS ?? '').trim();
    if (!raw) return true;
    const allowed = new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
    return allowed.has(String(ctx.chat?.id ?? '')) || allowed.has(String(ctx.from?.id ?? ''));
  }

  private wagerBondMnt(): string {
    return process.env.TELEGRAM_WAGER_BOND_MNT || process.env.WAGER_BOND_MNT || '0.001';
  }

  private async sendPrivateRoleNotices(room: RoomSession): Promise<void> {
    if (!room.state) return;
    const playersLine = this.formatPublicPlayerList(room.state.players);
    const wolves = room.state.players.filter((p) => p.role === 'wolf');

    for (const player of room.state.players.filter((p) => p.kind === 'human')) {
      const role = player.role ?? 'unknown';
      let text = [
        `🎮 <b>Game</b> <code>${this.escapeHtml(room.gameId)}</code>`,
        '',
        `🔒 <b>Your private role</b>` ,
        `${this.roleEmoji(role)} <b>${this.escapeHtml(this.roleLabel(role))}</b>`,
        '',
        `🎲 <b>Seat order</b>`,
        playersLine
      ].join('\n');

      if (role === 'wolf') {
        const teammates = wolves.filter((p) => p.id !== player.id);
        text += teammates.length > 0
          ? `\n\n🐺 <b>Your wolf teammate(s)</b>\n${this.formatPublicPlayerList(teammates)}\n\nAt night, use <code>/kill &lt;playerId&gt;</code> when prompted.`
          : `\n\n🐺 You are the <b>only wolf</b> alive.\nAt night, use <code>/kill &lt;playerId&gt;</code> when prompted.`;
      } else if (role === 'seer') {
        text += `\n\n🔮 You are the <b>seer</b>.\nAt night, use <code>/check &lt;playerId&gt;</code> when prompted.`;
      } else if (role === 'villager') {
        text += `\n\n🧑‍🌾 You are a <b>villager</b>.\nSurvive, track contradictions, and vote carefully during the day.`;
      }

      text += `\n\n⚠️ Do not reveal this message unless strategically useful.`;
      const chatId = this.userChats.get(player.id);
      if (chatId) {
        await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => undefined);
      }
    }
  }

  private async notifyHuman(
    ctx: Context,
    playerId: string,
    message: string,
    keyboard?: ReturnType<typeof Markup.inlineKeyboard>,
    privateOnly = false
  ): Promise<void> {
    const chatId = this.userChats.get(playerId);
    const extra = { parse_mode: 'HTML' as const, ...(keyboard ?? {}) };
    if (chatId) {
      await this.bot.telegram.sendMessage(chatId, message, extra);
      return;
    }
    if (privateOnly) {
      await this.replyHtml(ctx, '🔒 A private night action is waiting for a player. Please DM <code>/start</code> to the bot to receive secret role prompts.');
      return;
    }
    await this.replyHtml(ctx, `${message}
Tip: DM <code>/start</code> to this bot to receive private role/action prompts.`, keyboard);
  }

  private keyboardForRequest(
    room: RoomSession,
    type: 'speech' | 'vote' | 'nightKill' | 'seerCheck',
    playerId: string,
    allowedTargetIds?: string[]
  ): ReturnType<typeof Markup.inlineKeyboard> | undefined {
    if (!room.state || type === 'speech') return undefined;
    const action = type === 'nightKill' ? 'kill' : type === 'seerCheck' ? 'check' : 'vote';
    const candidates = room.state.players.filter((p) => {
      if (!p.alive) return false;
      if (type === 'nightKill') return p.role !== 'wolf';
      if (type === 'vote' && allowedTargetIds?.length) return allowedTargetIds.includes(p.id);
      return p.id !== playerId;
    });
    const buttons = candidates.map((p) => Markup.button.callback(`${p.displayName} (${p.id})`, `mg:${action}:${p.id}`));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    return Markup.inlineKeyboard(rows);
  }

  private async replyHtml(ctx: Context, html: string, keyboard?: ReturnType<typeof Markup.inlineKeyboard>): Promise<void> {
    await ctx.reply(html, { parse_mode: 'HTML', ...(keyboard ?? {}) });
  }

  private formatPublicEvent(room: RoomSession, event: GameEvent): string {
    const actor = event.actorId ? room.state?.players.find((p) => p.id === event.actorId) : undefined;
    const target = event.targetId ? room.state?.players.find((p) => p.id === event.targetId) : undefined;
    const text = this.formatText(event.publicText ?? '');

    if (event.type === 'phase_started') return `<b>${text}</b>`;
    if (event.type === 'speech' && actor) {
      const body = this.formatText(this.stripSpeakerPrefix(event.publicText ?? '', actor.displayName));
      return `🗣 <b>${this.escapeHtml(actor.displayName)}</b> ${this.kindEmoji(actor)} <b>${this.kindLabel(actor)}</b>\n\n${body}`;
    }
    if (event.type === 'vote' && actor) {
      return `🗳 <b>Vote</b>\n${this.playerChip(actor)}\n→ ${target ? this.playerChip(target) : `<b>${this.escapeHtml(event.targetId ?? 'unknown')}</b>`}`;
    }
    if (event.type === 'night_kill' && target) return `☠️ <b>Dawn death</b>\n${this.playerChip(target)} was found dead.`;
    if (event.type === 'eliminated') return `⚖️ <b>Eliminated</b>\n${target ? this.playerChip(target) : '<b>A player</b>'} was eliminated.`;
    if (event.type === 'game_finished') return `🏁 <b>${text}</b>`;
    if (event.type === 'vote_tie' || event.type === 'vote_no_elimination') return `<b>${text}</b>`;
    return text;
  }

  private stripSpeakerPrefix(text: string, displayName: string): string {
    return text.replace(new RegExp(`^${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：-]\\s*`, 'i'), '').trim();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatText(value: string): string {
    return this.escapeHtml(this.wrapByPunctuation(value));
  }

  private wrapByPunctuation(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 80) return normalized;
    return normalized
      .replace(/([。！？!?；;])\s*/g, '$1\n')
      .replace(/([，,])\s*/g, '$1 ')
      .split('\n')
      .flatMap((line) => this.softWrapLine(line, 72))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private softWrapLine(line: string, maxLen: number): string[] {
    if (line.length <= maxLen) return [line];
    const parts: string[] = [];
    let rest = line.trim();
    while (rest.length > maxLen) {
      const punctuationCut = Math.max(rest.lastIndexOf(',', maxLen), rest.lastIndexOf('，', maxLen));
      const spaceCut = rest.lastIndexOf(' ', maxLen);
      const cut = punctuationCut > maxLen * 0.45 ? punctuationCut + 1 : spaceCut > maxLen * 0.45 ? spaceCut : maxLen;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  }

  private formatPublicPlayerList(players: Array<Pick<Player, 'id' | 'displayName' | 'kind'>>): string {
    return players.map((p, i) => `${i + 1}. ${this.playerChip(p)}`).join('\n');
  }

  private playerChip(player: Pick<Player, 'id' | 'displayName' | 'kind'>): string {
    return `${this.kindEmoji(player)} <b>${this.escapeHtml(player.displayName)}</b> <code>${this.escapeHtml(player.id)}</code> · <b>${this.kindLabel(player)}</b>`;
  }

  private playerName(room: RoomSession, playerId: string): string {
    return room.state?.players.find((p) => p.id === playerId)?.displayName ?? playerId;
  }

  private kindEmoji(player: Pick<Player, 'kind'>): string {
    return player.kind === 'human' ? '👤' : '🤖';
  }

  private kindLabel(player: Pick<Player, 'kind'>): string {
    return player.kind === 'human' ? 'Human' : 'AI Agent';
  }

  private roleEmoji(role?: string): string {
    if (role === 'wolf') return '🐺';
    if (role === 'seer') return '🔮';
    if (role === 'villager') return '🧑‍🌾';
    return '🎭';
  }

  private roleLabel(role?: string): string {
    if (role === 'wolf') return 'Wolf';
    if (role === 'seer') return 'Seer';
    if (role === 'villager') return 'Villager';
    return role ?? 'Unknown';
  }

  private requireRoom(ctx: Context): RoomSession | undefined {
    const chatId = this.chatKey(ctx);
    const room = this.rooms.get(chatId);
    if (!room) {
      void ctx.reply('No active room. Use /newgame first.');
      return undefined;
    }
    return room;
  }

  private chatKey(ctx: Context): string {
    return String(ctx.chat?.id ?? 'unknown');
  }

  private commandPayload(ctx: Context): string {
    const message = ctx.message;
    const text = message && 'text' in message && typeof message.text === 'string' ? message.text : '';
    return text.replace(/^\/\w+(@\w+)?\s*/, '');
  }

  private helpText(): string {
    return [
      '🎮 <b>Turing MindGames Arena — Judge Quick Start</b>',
      '',
      'This Telegram bot runs a playable Werewolf-style social reasoning match: one human judge/player plus AI agents. The game creates replay, audit, summary, memory, and optional performance-bond settlement artifacts that can be verified on Mantle Sepolia.',
      '',
      '<b>Start a match</b>',
      '1. <code>/newgame</code> — create a room and read the wager/demo instructions.',
      '2. Choose: <code>/wageroff</code>, <code>/wagerdemo</code>, or <code>/wagerself</code>.',
      '3. If self-wallet: send <code>/wallet 0xYourAddress</code>.',
      '4. <code>/join</code> — join as the human player.',
      '5. <code>/startgame</code> — the bot prepares the selected wager mode, fills the table with AI agents, then starts the match.',
      '',
      '<b>During the game</b>',
      '• Speak when prompted: <code>/say your message</code>',
      '• Vote when prompted: tap a button or use <code>/vote &lt;playerId&gt;</code>',
      '• If you are Wolf: tap a button or use <code>/kill &lt;playerId&gt;</code>',
      '• If you are Seer: tap a button or use <code>/check &lt;playerId&gt;</code>',
      '',
      '<b>Wager / chain verification</b>',
      '• Wager off: easiest path; no settlement tx, action audit still works.',
      '• Demo wager: operator-managed testnet wallets post bonds for the demo.',
      '• Self-wallet wager: you open a browser/MetaMask payment link and post your own human-seat bond.',
      '• In wager mode, each seat posts a small Mantle Sepolia performance bond before play starts.',
      '• After the game, the bot settles the winning camp and posts clickable Mantlescan links for deposits, action audit, settlement, and claim txs.',
      '• These are testnet micro-bonds for verification, not gambling economics.',
      '',
      '<b>Useful commands</b>',
      '<code>/status</code> — show room state',
      '<code>/help</code> — show this guide again',
      '<code>/abortgame</code> — reset the current game',
      '',
      '🔒 Tip: DM <code>/start</code> to this bot before playing so private role and night-action prompts can reach you.',
      '⚡ Fast path: <code>/newgame</code> → <code>/join</code> → <code>/startgame</code>'
    ].join('\n');
  }

  private engineLabel(): string {
    const backend = (process.env.LLM_BACKEND ?? '').trim().toLowerCase();
    if (backend === 'openrouter-glm-speech') return 'Telegram + OpenRouter Z.ai GLM speech + mock decisions';
    if (backend === 'openrouter-glm') return 'Telegram + OpenRouter Z.ai GLM agents';
    if (backend === 'zai-speech') return 'Telegram + Z.ai GLM speech + mock decisions';
    if (backend === 'llm-speech') return 'Telegram + LLM speech + mock decisions';
    if (backend === 'zai') return 'Telegram + Z.ai GLM agents';
    if (backend === 'llm' || process.env.USE_LLM === '1') return 'Telegram + LLM agents';
    return 'Telegram + mock agents';
  }
}
