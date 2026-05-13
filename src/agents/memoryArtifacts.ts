import type { AgentMemorySnapshot, GameEvent, GameState, GameSummary, Player } from '../types/game.js';

export const AGENT_MEMORY_SCHEMA_VERSION = 'turing-mindgames.agent-memory.v1';

interface PlayerRef {
  id: string;
  displayName: string;
  kind: Player['kind'];
  agentPersonaId?: string;
}

function playerRef(player: Player): PlayerRef {
  return {
    id: player.id,
    displayName: player.displayName,
    kind: player.kind,
    agentPersonaId: player.agentPersonaId
  };
}

function mentionsFor(player: Player, events: GameEvent[]): Array<Pick<GameEvent, 'id' | 'round' | 'phase' | 'type' | 'actorId' | 'targetId' | 'publicText'>> {
  return events
    .filter((event) => typeof event.publicText === 'string' && event.publicText.includes(player.displayName))
    .map((event) => ({
      id: event.id,
      round: event.round,
      phase: event.phase,
      type: event.type,
      actorId: event.actorId,
      targetId: event.targetId,
      publicText: event.publicText
    }));
}

export function buildCurrentGameMemoryIndex(state: GameState) {
  const publicEvents = state.events.filter((event) => event.publicText);
  return {
    schemaVersion: AGENT_MEMORY_SCHEMA_VERSION,
    layer: 'current-game-memory',
    gameId: state.id,
    createdAt: new Date().toISOString(),
    description: 'Observable per-game memory index. Claims about current-game tone, behavior, votes, and speech must be grounded here, not in cross-game memory.',
    players: state.players.map((player) => {
      const speeches = publicEvents
        .filter((event) => event.type === 'speech' && event.actorId === player.id)
        .map((event) => ({ id: event.id, round: event.round, publicText: event.publicText }));
      const votesCast = state.events
        .filter((event) => event.type === 'vote' && event.actorId === player.id)
        .map((event) => ({ id: event.id, round: event.round, targetId: event.targetId }));
      const votesReceived = state.events
        .filter((event) => event.type === 'vote' && event.targetId === player.id)
        .map((event) => ({ id: event.id, round: event.round, actorId: event.actorId }));
      const seerChecksMade = state.events
        .filter((event) => event.type === 'seer_check' && event.actorId === player.id)
        .map((event) => ({ id: event.id, round: event.round, targetId: event.targetId, privateNote: event.privateNote }));

      return {
        player: playerRef(player),
        observableSignals: {
          spoke: speeches.length > 0,
          wasMentioned: mentionsFor(player, publicEvents).length > 0,
          voted: votesCast.length > 0,
          receivedVotes: votesReceived.length > 0,
          madePrivateSeerChecks: seerChecksMade.length > 0
        },
        speeches,
        votesCast,
        votesReceived,
        mentions: mentionsFor(player, publicEvents),
        privateKnowledgeForSelf: {
          role: player.role,
          seerChecksMade
        }
      };
    })
  };
}

export function buildCrossGameMemoryState(summary: GameSummary) {
  return {
    schemaVersion: AGENT_MEMORY_SCHEMA_VERSION,
    layer: 'cross-game-memory-state',
    gameId: summary.gameId,
    createdAt: new Date().toISOString(),
    description: 'Post-game agent memory snapshot to seed future games. It may be used as long-term tendency or tie-breaker, but must not be presented as current-game evidence.',
    agentMemories: summary.agentMemories ?? {}
  };
}

export function buildAgentMemoryManifest(input: {
  state: GameState;
  summary: GameSummary;
  currentGameMemoryRoot?: string;
  crossGameMemoryRoot?: string;
  agentMemoryCount: number;
}) {
  return {
    schemaVersion: AGENT_MEMORY_SCHEMA_VERSION,
    artifactType: 'agent-memory-manifest',
    protocol: 'Turing MindGames Arena',
    gameId: input.state.id,
    createdAt: new Date().toISOString(),
    storageStandard: {
      backend: 'local JSON artifact store for MVP; Mantle records hashes/events',
      contentAddressing: 'deterministic SHA-256 JSON root',
      uriPattern: 'file:// or HTTPS dashboard artifact path',
      recommendedMode: 'local artifacts for fast demo, Mantle event hashes for public audit'
    },
    memoryModel: {
      currentGameMemory: {
        purpose: 'Ground claims about this match only.',
        root: input.currentGameMemoryRoot,
        rule: 'Agents may cite current tone/behavior/votes/speech only if supported by this layer.'
      },
      crossGameMemory: {
        purpose: 'Long-term adaptation across matches.',
        root: input.crossGameMemoryRoot,
        rule: 'Use only as tendency/tie-breaker; label as past-game memory if mentioned publicly.'
      }
    },
    privacy: {
      currentMvp: 'Stored after game completion for replay/judge verification.',
      nextStep: 'Encrypt private role and private reasoning layers before upload for production games.'
    },
    counts: {
      players: input.state.players.length,
      events: input.state.events.length,
      agentMemorySnapshots: input.agentMemoryCount
    },
    agentIds: Object.keys(input.summary.agentMemories ?? {})
  };
}

export type CrossGameMemoryState = ReturnType<typeof buildCrossGameMemoryState>;
export type CurrentGameMemoryIndex = ReturnType<typeof buildCurrentGameMemoryIndex>;
export type AgentMemoryManifest = ReturnType<typeof buildAgentMemoryManifest>;
