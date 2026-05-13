import type { MantleArenaRecord } from '../mantle/MantleArenaAdapter.js';
import type { StorageAdapter, StoredArtifact } from '../storage/StorageAdapter.js';
import type { GameState, GameSummary } from '../types/game.js';
import { buildTranscriptViews } from '../transcript/transcriptViews.js';
import { updateGameIndex } from '../web/gameIndex.js';
import { writeReplayManifest } from '../web/replayManifest.js';
import { buildAgentMemoryManifest, buildCrossGameMemoryState, buildCurrentGameMemoryIndex } from '../agents/memoryArtifacts.js';

export interface PersistGameArtifactsResult {
  publicTranscriptArtifact: StoredArtifact;
  privateAuditTranscriptArtifact: StoredArtifact;
  summaryArtifact: StoredArtifact;
  agentMemoryArtifact?: StoredArtifact;
  currentGameMemoryArtifact?: StoredArtifact;
  crossGameMemoryArtifact?: StoredArtifact;
}

export async function persistGameArtifacts(
  storage: StorageAdapter,
  state: GameState,
  summary: GameSummary,
  chainRecord: MantleArenaRecord,
  options?: {
    manifestPath?: string;
    latestManifestPath?: string;
    engine?: string;
    rawTranscriptArtifact?: StoredArtifact;
    rawSummaryArtifact?: StoredArtifact;
  }
): Promise<PersistGameArtifactsResult> {
  const { publicTranscript, privateAuditTranscript } = buildTranscriptViews(state.events);
  const publicTranscriptArtifact = await storage.putJson(`${state.id}/public-transcript.json`, publicTranscript);
  const privateAuditTranscriptArtifact = await storage.putJson(`${state.id}/private-audit-transcript.json`, privateAuditTranscript);
  const summaryArtifact = await storage.putJson(`${state.id}/summary.json`, summary);
  let currentGameMemoryArtifact: StoredArtifact | undefined;
  let crossGameMemoryArtifact: StoredArtifact | undefined;
  let agentMemoryArtifact: StoredArtifact | undefined;

  if (summary.agentMemories) {
    const currentGameMemory = buildCurrentGameMemoryIndex(state);
    const crossGameMemory = buildCrossGameMemoryState(summary);
    currentGameMemoryArtifact = await storage.putJson(`${state.id}/memory/current-game-memory.v1.json`, currentGameMemory);
    crossGameMemoryArtifact = await storage.putJson(`${state.id}/memory/cross-game-memory.v1.json`, crossGameMemory);
    const manifest = buildAgentMemoryManifest({
      state,
      summary,
      currentGameMemoryRoot: currentGameMemoryArtifact.root,
      crossGameMemoryRoot: crossGameMemoryArtifact.root,
      agentMemoryCount: Object.keys(summary.agentMemories).length
    });
    agentMemoryArtifact = await storage.putJson(`${state.id}/memory/agent-memory-manifest.v1.json`, manifest);
  }

  const registryLabel = chainRecord.actionRegistryAddress
    ? `Mantle action registry ${chainRecord.actionRegistryAddress}`
    : 'Mock Mantle adapter';

  if (options?.manifestPath) {
    await writeReplayManifest(options.manifestPath, {
      gameId: state.id,
      summary,
      transcriptArtifact: publicTranscriptArtifact,
      auditTranscriptArtifact: privateAuditTranscriptArtifact,
      summaryArtifact,
      rawTranscriptArtifact: options?.rawTranscriptArtifact,
      rawSummaryArtifact: options?.rawSummaryArtifact,
      agentMemoryArtifact,
      currentGameMemoryArtifact,
      crossGameMemoryArtifact,
      eventCount: state.events.length,
      engine: options.engine,
      registry: registryLabel,
      chainRecord
    });
  }

  if (options?.latestManifestPath) {
    await writeReplayManifest(options.latestManifestPath, {
      gameId: state.id,
      summary,
      transcriptArtifact: publicTranscriptArtifact,
      auditTranscriptArtifact: privateAuditTranscriptArtifact,
      summaryArtifact,
      rawTranscriptArtifact: options?.rawTranscriptArtifact,
      rawSummaryArtifact: options?.rawSummaryArtifact,
      agentMemoryArtifact,
      currentGameMemoryArtifact,
      crossGameMemoryArtifact,
      eventCount: state.events.length,
      engine: options.engine,
      registry: registryLabel,
      chainRecord
    });
  }

  if (options?.manifestPath) {
    await updateGameIndex('web/data/game-index.json', {
      gameId: state.id,
      winner: summary.winner,
      eventCount: state.events.length,
      generatedAt: new Date().toISOString(),
      networkLabel: chainRecord.actionRegistryAddress ? 'Mantle Sepolia' : publicTranscriptArtifact.metadata?.network === 'testnet' ? 'Mantle Sepolia' : publicTranscriptArtifact.metadata?.network === 'mainnet' ? 'Mantle Mainnet' : 'Local Dev',
      storageMode: chainRecord.actionRegistryAddress ? 'Local JSON artifacts + Mantle action audit' : publicTranscriptArtifact.metadata?.network ? `local artifact store ${publicTranscriptArtifact.metadata?.mode ?? 'json'}` : 'Local JSON artifacts',
      manifestPath: options.manifestPath,
      registry: registryLabel
    });
  }

  return {
    publicTranscriptArtifact,
    privateAuditTranscriptArtifact,
    summaryArtifact,
    agentMemoryArtifact,
    currentGameMemoryArtifact,
    crossGameMemoryArtifact
  };
}
