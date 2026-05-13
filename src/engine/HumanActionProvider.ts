import type { GameState, Player } from '../types/game.js';

export interface HumanActionProvider {
  getSpeech(player: Player, state: GameState): Promise<string>;
  chooseVote(player: Player, state: GameState, allowedTargetIds?: string[]): Promise<string>;
  chooseNightKill(player: Player, state: GameState): Promise<string>;
  chooseSeerCheck(player: Player, state: GameState): Promise<string>;
  consumeTimeoutMarker?(playerId: string, type: 'speech' | 'vote' | 'nightKill' | 'seerCheck'): boolean;
  abortAll?(reason?: string): void;
}

export class PlaceholderHumanActionProvider implements HumanActionProvider {
  async getSpeech(player: Player): Promise<string> {
    return `${player.displayName}: I am watching the table carefully. I want to hear more before hard-claiming.`;
  }

  async chooseVote(player: Player, state: GameState, allowedTargetIds?: string[]): Promise<string> {
    const target = state.players.find((p) => p.alive && p.id !== player.id && (!allowedTargetIds || allowedTargetIds.includes(p.id)));
    if (!target) throw new Error(`No legal vote target for ${player.id}`);
    return target.id;
  }

  async chooseNightKill(player: Player, state: GameState): Promise<string> {
    const target = state.players.find((p) => p.alive && p.role !== 'wolf');
    if (!target) throw new Error(`No legal night kill target for ${player.id}`);
    return target.id;
  }

  async chooseSeerCheck(player: Player, state: GameState): Promise<string> {
    const target = state.players.find((p) => p.alive && p.id !== player.id);
    if (!target) throw new Error(`No legal seer check target for ${player.id}`);
    return target.id;
  }
}

