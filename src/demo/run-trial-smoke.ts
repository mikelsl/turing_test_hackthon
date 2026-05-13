import 'dotenv/config';
import { WerewolfEngine } from '../engine/WerewolfEngine.js';
import { QueuedHumanActionProvider } from '../engine/QueuedHumanActionProvider.js';
import { createComputeAdapter } from '../compute/createComputeAdapter.js';
import { createStorageAdapter } from '../storage/createStorageAdapter.js';
import { createMantleArenaAdapter } from '../mantle/createMantleArenaAdapter.js';
import { persistGameArtifacts } from '../pipeline/persistGameArtifacts.js';
import { writeLocalShadowArtifact } from '../pipeline/writeLocalShadowArtifacts.js';
import { shuffle } from '../utils/random.js';
import type { Player } from '../types/game.js';

const DEFAULT_AGENT_PLAYERS: Array<Omit<Player, 'role' | 'alive'>> = [
  { id: 'a1', displayName: 'Ada', kind: 'agent', agentPersonaId: 'analyst' },
  { id: 'a2', displayName: 'Charm', kind: 'agent', agentPersonaId: 'charmer' },
  { id: 'a3', displayName: 'Riot', kind: 'agent', agentPersonaId: 'chaos-wolf' },
  { id: 'a4', displayName: 'Shade', kind: 'agent', agentPersonaId: 'silent-killer' },
  { id: 'a5', displayName: 'Mira', kind: 'agent', agentPersonaId: 'empath' }
];

interface SmokeResult {
  gameId: string;
  winner: string;
  eventCount: number;
  pendingSubmissions: number;
  txHash: string;
  manifestPath: string;
}

function pickTarget(pending: ReturnType<QueuedHumanActionProvider['listPending']>[number], players: Player[]): string {
  const allowed = pending.allowedTargetIds?.length
    ? players.filter((player) => pending.allowedTargetIds?.includes(player.id))
    : players.filter((player) => player.alive && player.id !== pending.playerId);
  return (allowed[0] ?? players.find((player) => player.id !== pending.playerId) ?? players[0]).id;
}

function startAutoHuman(humans: QueuedHumanActionProvider, getPlayers: () => Player[] | undefined): NodeJS.Timeout {
  let speechNo = 0;
  return setInterval(() => {
    const players = getPlayers();
    if (!players) return;
    for (const pending of humans.listPending()) {
      if (pending.type === 'speech') {
        speechNo++;
        humans.submitSpeech(pending.playerId, `Smoke Judge: I am testing the table flow. Probe #${speechNo}: I want a concrete vote reason from the loudest slot.`);
      } else if (pending.type === 'vote') {
        humans.submitVote(pending.playerId, pickTarget(pending, players));
      } else if (pending.type === 'nightKill') {
        humans.submitNightKill(pending.playerId, pickTarget(pending, players.filter((player) => player.role !== 'wolf')));
      } else if (pending.type === 'seerCheck') {
        humans.submitSeerCheck(pending.playerId, pickTarget(pending, players));
      }
    }
  }, 100);
}

async function runOne(index: number): Promise<SmokeResult> {
  const gameId = `trial-smoke-${Date.now()}-${index}`;
  const humans = new QueuedHumanActionProvider();
  const compute = createComputeAdapter();
  const engine = new WerewolfEngine(compute, humans);
  const storage = createStorageAdapter();
  const chain = createMantleArenaAdapter();
  const players = shuffle([
    { id: 'u-smoke', displayName: 'Smoke Judge', kind: 'human' as const },
    ...DEFAULT_AGENT_PLAYERS
  ].slice(0, 6));
  const initial = engine.createGame(gameId, players);
  let latestPlayers: Player[] | undefined = initial.players;
  const timer = startAutoHuman(humans, () => latestPlayers);
  let pendingSubmissions = 0;
  const countTimer = setInterval(() => { pendingSubmissions += humans.listPending().length; }, 100);
  try {
    const { state, summary } = await engine.runToEnd(initial, Number(process.env.DEMO_MAX_ROUNDS ?? 1));
    latestPlayers = state.players;
    await writeLocalShadowArtifact(`${gameId}/transcript.json`, state.events);
    await writeLocalShadowArtifact(`${gameId}/summary.raw.json`, summary);
    if (summary.agentMemories) await writeLocalShadowArtifact('latest-agent-memories.json', summary.agentMemories);
    const rawTranscriptArtifact = await storage.putJson(`${gameId}/transcript.json`, state.events);
    const rawSummaryArtifact = await storage.putJson(`${gameId}/summary.raw.json`, summary);
    const chainRecord = await chain.finalizeGame(state, summary, rawTranscriptArtifact.root, rawSummaryArtifact.root);
    const manifestPath = `artifacts/${gameId}/replay-manifest.json`;
    await persistGameArtifacts(storage, state, summary, chainRecord, {
      manifestPath,
      latestManifestPath: index === 1 ? 'web/data/latest-demo.json' : undefined,
      engine: `Trial smoke: ${process.env.LLM_BACKEND || 'mock'} + auto human`,
      rawTranscriptArtifact,
      rawSummaryArtifact
    });
    return { gameId, winner: summary.winner, eventCount: state.events.length, pendingSubmissions, txHash: chainRecord.txHash, manifestPath };
  } finally {
    clearInterval(timer);
    clearInterval(countTimer);
  }
}

const games = Number(process.env.SMOKE_GAMES ?? 3);
const results: SmokeResult[] = [];
for (let i = 1; i <= games; i++) {
  results.push(await runOne(i));
}
console.log(JSON.stringify({ ok: true, games: results }, null, 2));
