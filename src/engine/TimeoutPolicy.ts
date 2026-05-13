import type { GameState, Player } from '../types/game.js';

export interface TimeoutPolicy {
  timeoutMs: number;
  fallbackSpeech(player: Player, state: GameState): string;
  fallbackVote(player: Player, state: GameState): string;
  fallbackNightKill(player: Player, state: GameState): string;
  fallbackSeerCheck(player: Player, state: GameState): string;
}

export class DefaultTimeoutPolicy implements TimeoutPolicy {
  constructor(public readonly timeoutMs = Number(process.env.HUMAN_ACTION_TIMEOUT_MS ?? 120_000)) {}

  fallbackSpeech(player: Player): string {
    return `${player.displayName}: [timeout] I pass this round and will follow the table.`;
  }

  fallbackVote(player: Player, state: GameState): string {
    const target = state.players.find((p) => p.alive && p.id !== player.id);
    if (!target) throw new Error(`No fallback vote target for ${player.id}`);
    return target.id;
  }

  fallbackNightKill(player: Player, state: GameState): string {
    const target = state.players.find((p) => p.alive && p.role !== 'wolf');
    if (!target) throw new Error(`No fallback night kill target for ${player.id}`);
    return target.id;
  }

  fallbackSeerCheck(player: Player, state: GameState): string {
    const target = state.players.find((p) => p.alive && p.id !== player.id);
    if (!target) throw new Error(`No fallback seer check target for ${player.id}`);
    return target.id;
  }
}
