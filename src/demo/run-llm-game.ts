import 'dotenv/config';
import { WerewolfEngine } from '../engine/WerewolfEngine.js';
import { createComputeAdapter } from '../compute/createComputeAdapter.js';
import { createStorageAdapter } from '../storage/createStorageAdapter.js';
import { createMantleArenaAdapter } from '../mantle/createMantleArenaAdapter.js';
import { persistGameArtifacts } from '../pipeline/persistGameArtifacts.js';
import { writeLocalShadowArtifact } from '../pipeline/writeLocalShadowArtifacts.js';

const players = [
  { id: 'p1', displayName: 'Mike', kind: 'human' as const },
  { id: 'a1', displayName: 'Ada', kind: 'agent' as const, agentPersonaId: 'analyst' },
  { id: 'a2', displayName: 'Charm', kind: 'agent' as const, agentPersonaId: 'charmer' },
  { id: 'a3', displayName: 'Riot', kind: 'agent' as const, agentPersonaId: 'chaos-wolf' },
  { id: 'a4', displayName: 'Shade', kind: 'agent' as const, agentPersonaId: 'silent-killer' },
  { id: 'a5', displayName: 'Mira', kind: 'agent' as const, agentPersonaId: 'empath' }
];

const gameId = `llm-demo-${Date.now()}`;
const engine = new WerewolfEngine(createComputeAdapter());
const storage = createStorageAdapter();
const chain = createMantleArenaAdapter();

const initial = engine.createGame(gameId, players);
const { state, summary } = await engine.runToEnd(initial, Number(process.env.DEMO_MAX_ROUNDS ?? 3));

await writeLocalShadowArtifact(`${gameId}/transcript.json`, state.events);
await writeLocalShadowArtifact(`${gameId}/summary.raw.json`, summary);
if (summary.agentMemories) await writeLocalShadowArtifact('latest-agent-memories.json', summary.agentMemories);
const rawTranscriptArtifact = await storage.putJson(`${gameId}/transcript.json`, state.events);
const rawSummaryArtifact = await storage.putJson(`${gameId}/summary.raw.json`, summary);
const chainRecord = await chain.finalizeGame(state, summary, rawTranscriptArtifact.root, rawSummaryArtifact.root);
const persisted = await persistGameArtifacts(storage, state, summary, chainRecord, {
  manifestPath: `artifacts/${gameId}/replay-manifest.json`,
  latestManifestPath: (process.env.UPDATE_LATEST_REPLAY ?? 'true') !== 'false' ? 'web/data/latest-demo.json' : undefined,
  engine: 'LLM agents + WerewolfEngine MVP',
  rawTranscriptArtifact,
  rawSummaryArtifact
});

console.log(JSON.stringify({
  gameId,
  winner: summary.winner,
  transcript: persisted.publicTranscriptArtifact,
  auditTranscript: persisted.privateAuditTranscriptArtifact,
  summary: persisted.summaryArtifact,
  chainRecord,
  eventCount: state.events.length
}, null, 2));
