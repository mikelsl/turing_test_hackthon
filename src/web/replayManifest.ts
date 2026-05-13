import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MantleArenaRecord } from '../mantle/MantleArenaAdapter.js';
import type { StoredArtifact } from '../storage/StorageAdapter.js';
import type { GameSummary } from '../types/game.js';

export interface ReplayManifestInput {
  gameId: string;
  summary: GameSummary;
  transcriptArtifact: StoredArtifact;
  auditTranscriptArtifact?: StoredArtifact;
  summaryArtifact: StoredArtifact;
  rawTranscriptArtifact?: StoredArtifact;
  rawSummaryArtifact?: StoredArtifact;
  agentMemoryArtifact?: StoredArtifact;
  currentGameMemoryArtifact?: StoredArtifact;
  crossGameMemoryArtifact?: StoredArtifact;
  eventCount: number;
  engine?: string;
  registry?: string;
  chainRecord?: MantleArenaRecord;
}

const EXPLORER_TX = 'https://sepolia.mantlescan.xyz/tx/';

function artifactLabel(artifact: StoredArtifact): string {
  const meta = artifact.metadata as Record<string, unknown> | undefined;
  const network = typeof meta?.network === 'string' ? meta.network : 'local';
  const mode = typeof meta?.mode === 'string' ? meta.mode : 'json';
  return network === 'local' ? 'Local JSON artifacts' : `local artifact store ${mode}`;
}

function networkLabel(artifact: StoredArtifact): string {
  const meta = artifact.metadata as Record<string, unknown> | undefined;
  const network = typeof meta?.network === 'string' ? meta.network : 'local';
  return network === 'testnet' ? 'Mantle Sepolia' : network === 'mainnet' ? 'Mantle Mainnet' : 'Local Dev';
}

function isRealTxHash(txHash?: string): boolean {
  return typeof txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(txHash);
}

function txUrl(txHash?: string): string | undefined {
  return isRealTxHash(txHash) ? `${EXPLORER_TX}${txHash}` : undefined;
}

function modelProviderLabel(): string {
  const backend = (process.env.LLM_BACKEND ?? '').trim().toLowerCase();
  if (backend === 'openrouter-glm' || backend === 'openrouter-glm-speech') {
    return `OpenRouter Z.ai GLM (${process.env.LLM_MODEL || 'z-ai/glm-4.5-air:free'})`;
  }
  if (backend === 'zai' || backend === 'zai-speech') {
    return `Z.ai GLM (${process.env.ZAI_MODEL || process.env.LLM_MODEL || 'glm-4.5'})`;
  }
  if (backend === 'mock' || backend === '') return 'Mock deterministic agents';
  return process.env.LLM_MODEL ? `${backend} (${process.env.LLM_MODEL})` : backend;
}

export function buildReplayManifest(input: ReplayManifestInput): Record<string, unknown> {
  const hasMantleRecord = Boolean(input.chainRecord?.actionRegistryAddress);
  const hasRealFinalizeTx = isRealTxHash(input.chainRecord?.txHash);
  const storageMode = hasMantleRecord ? `${artifactLabel(input.transcriptArtifact)} + Mantle action audit` : artifactLabel(input.transcriptArtifact);
  return {
    networkLabel: hasMantleRecord ? 'Mantle Sepolia' : networkLabel(input.transcriptArtifact),
    storageMode,
    gameId: input.gameId,
    winner: input.summary.winner,
    eventCount: input.eventCount,
    engine: input.engine ?? 'Mock agents + WerewolfEngine MVP',
    modelProvider: modelProviderLabel(),
    registry: input.registry ?? 'Mock registry now; AgentActionRegistry.sol next',
    generatedAt: new Date().toISOString(),
    transcript: {
      uri: input.transcriptArtifact.uri,
      root: input.transcriptArtifact.root,
      txHash: input.transcriptArtifact.txHash ?? null,
      txUrl: txUrl(input.transcriptArtifact.txHash),
      localSha256: input.transcriptArtifact.localSha256 ?? null
    },
    auditTranscript: input.auditTranscriptArtifact ? {
      uri: input.auditTranscriptArtifact.uri,
      root: input.auditTranscriptArtifact.root,
      txHash: input.auditTranscriptArtifact.txHash ?? null,
      txUrl: txUrl(input.auditTranscriptArtifact.txHash),
      localSha256: input.auditTranscriptArtifact.localSha256 ?? null
    } : null,
    summary: {
      uri: input.summaryArtifact.uri,
      root: input.summaryArtifact.root,
      txHash: input.summaryArtifact.txHash ?? null,
      txUrl: txUrl(input.summaryArtifact.txHash),
      localSha256: input.summaryArtifact.localSha256 ?? null
    },
    agentMemories: input.agentMemoryArtifact ? {
      uri: input.agentMemoryArtifact.uri,
      root: input.agentMemoryArtifact.root,
      txHash: input.agentMemoryArtifact.txHash ?? null,
      txUrl: txUrl(input.agentMemoryArtifact.txHash),
      localSha256: input.agentMemoryArtifact.localSha256 ?? null,
      artifactType: 'agent-memory-manifest',
      agentCount: Object.keys(input.summary.agentMemories ?? {}).length
    } : null,
    memoryLayers: input.agentMemoryArtifact ? {
      schemaVersion: 'turing-mindgames.agent-memory.v1',
      currentGameMemory: input.currentGameMemoryArtifact ? {
        uri: input.currentGameMemoryArtifact.uri,
        root: input.currentGameMemoryArtifact.root,
        txHash: input.currentGameMemoryArtifact.txHash ?? null,
        txUrl: txUrl(input.currentGameMemoryArtifact.txHash),
        localSha256: input.currentGameMemoryArtifact.localSha256 ?? null,
        purpose: 'Grounds claims about this match only: speeches, votes, mentions, and private self-knowledge.'
      } : null,
      crossGameMemory: input.crossGameMemoryArtifact ? {
        uri: input.crossGameMemoryArtifact.uri,
        root: input.crossGameMemoryArtifact.root,
        txHash: input.crossGameMemoryArtifact.txHash ?? null,
        txUrl: txUrl(input.crossGameMemoryArtifact.txHash),
        localSha256: input.crossGameMemoryArtifact.localSha256 ?? null,
        purpose: 'Seeds future matches as long-term tendency; must not be presented as current-game evidence.'
      } : null,
      rule: 'Agent public claims about current-game tone/behavior must be grounded in currentGameMemory. Cross-game memory is only a labeled prior/tie-breaker.'
    } : null,
    agentMemoryPreview: input.summary.agentMemories ?? {},
    rawArtifacts: {
      transcript: input.rawTranscriptArtifact ? {
        uri: input.rawTranscriptArtifact.uri,
        root: input.rawTranscriptArtifact.root,
        txHash: input.rawTranscriptArtifact.txHash ?? null,
        txUrl: txUrl(input.rawTranscriptArtifact.txHash),
        localSha256: input.rawTranscriptArtifact.localSha256 ?? null
      } : null,
      summary: input.rawSummaryArtifact ? {
        uri: input.rawSummaryArtifact.uri,
        root: input.rawSummaryArtifact.root,
        txHash: input.rawSummaryArtifact.txHash ?? null,
        txUrl: txUrl(input.rawSummaryArtifact.txHash),
        localSha256: input.rawSummaryArtifact.localSha256 ?? null
      } : null
    },
    chain: input.chainRecord ? {
      agentRegistryAddress: input.chainRecord.agentRegistryAddress ?? null,
      actionRegistryAddress: input.chainRecord.actionRegistryAddress ?? null,
      settlementVaultAddress: input.chainRecord.settlementVaultAddress ?? null,
      gameKey: input.chainRecord.gameKey ?? null,
      txHash: input.chainRecord.txHash ?? null,
      txUrl: txUrl(input.chainRecord.txHash),
      createTxHash: input.chainRecord.createTxHash ?? null,
      createTxUrl: txUrl(input.chainRecord.createTxHash),
      recordedActionCount: input.chainRecord.recordedActionCount ?? null,
      recordedTranscriptRoot: input.chainRecord.transcriptRoot,
      recordedSummaryRoot: input.chainRecord.summaryRoot,
      recordedReputationRoot: input.chainRecord.reputationRoot ?? null
    } : null,
    verificationChecklist: [
      'Game summary and transcript are written as deterministic artifacts; Mantle records their hashes/events for public audit.',
      'Each artifact has a deterministic root hash for replay verification.',
      input.auditTranscriptArtifact
        ? 'Public replay transcript and private audit transcript are separated so live/group views do not leak hidden role information.'
        : 'Transcript separation is not attached yet; private-role leakage protections should be verified before public demos.',
      hasRealFinalizeTx
        ? 'Mantle Sepolia transaction hashes are available for the game creation/action/finalization record.'
        : input.transcriptArtifact.txHash
          ? 'Mantle Sepolia transaction hashes are available for artifact-related actions.'
          : 'Mantle transaction hashes will appear after the contract adapter is enabled.',
      input.chainRecord?.actionRegistryAddress
        ? 'This replay manifest includes the linked Mantle action registry record for contract-level verification.'
        : 'Next milestone: register these roots in AgentActionRegistry.sol on Mantle so replay + result verification are both on-chain addressable.',
      input.agentMemoryArtifact
        ? 'Agent memory is persisted as a Mantle-audited layered manifest: current-game evidence, cross-game memory state, and a manifest that links both roots.'
        : 'Agent memory snapshots are not attached yet.'
    ],
    replayPreview: [
      {
        title: 'Match initialized',
        description: 'Six-player Werewolf game starts with one human player and five personality-rich AI agents.'
      },
      {
        title: 'Hidden roles assigned',
        description: 'Roles are randomized and private; public replay is separated from private audit transcript for safer live/group demos.'
      },
      {
        title: 'Social reasoning loop',
        description: 'Agents speak, accuse, defend, vote, and perform night actions through ComputeAdapter-backed reasoning.'
      },
      {
        title: 'Artifacts committed',
        description: 'Full transcript and final summary are uploaded or written as verifiable AI behavior records.'
      },
      {
        title: 'Outcome ready for registry',
        description: hasMantleRecord && hasRealFinalizeTx
          ? 'Winner, roots, selected agent actions, and reputation deltas were finalized in AgentActionRegistry on Mantle Sepolia.'
          : 'Winner, roots, and reputation deltas are ready to be recorded in AgentActionRegistry.sol on Mantle Sepolia.'
      }
    ]
  };
}

export async function writeReplayManifest(filePath: string, input: ReplayManifestInput): Promise<void> {
  const manifest = buildReplayManifest(input);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}
