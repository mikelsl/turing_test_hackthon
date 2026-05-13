export type Camp = 'wolves' | 'villagers';

export type Role = 'wolf' | 'villager' | 'seer';

export type Phase = 'lobby' | 'night' | 'day' | 'vote' | 'finished';

export type PlayerKind = 'human' | 'agent';

export interface Player {
  id: string;
  displayName: string;
  kind: PlayerKind;
  agentPersonaId?: string;
  role?: Role;
  alive: boolean;
}

export interface GameEvent {
  id: string;
  gameId: string;
  round: number;
  phase: Phase;
  type: string;
  actorId?: string;
  targetId?: string;
  publicText?: string;
  privateNote?: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface GameState {
  id: string;
  round: number;
  phase: Phase;
  players: Player[];
  events: GameEvent[];
  winner?: Camp;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemorySnapshot {
  playerId: string;
  displayName: string;
  personaId?: string;
  role: string;
  survived: boolean;
  outcome: 'won' | 'lost';
  keyTakeaways: string[];
  suspicionTargets: string[];
  trustTargets: string[];
}

export interface GameSummary {
  gameId: string;
  winner: Camp;
  transcriptRoot: string;
  highlights: string[];
  reputationDeltas: Record<string, ReputationDelta>;
  agentMemories?: Record<string, AgentMemorySnapshot>;
}

export interface ReputationDelta {
  deduction: number;
  deception: number;
  cooperation: number;
  leadership: number;
  trustworthiness: number;
}
