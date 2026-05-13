import type { GameState, Player } from '../types/game.js';

export interface AgentSpeechResult {
  publicText: string;
  privateNote: string;
}

export interface ComputeAdapter {
  generateSpeech(player: Player, state: GameState): Promise<AgentSpeechResult>;
  chooseVote(player: Player, state: GameState, allowedTargetIds?: string[]): Promise<string>;
  chooseNightKill(wolf: Player, state: GameState): Promise<string>;
  chooseSeerCheck(seer: Player, state: GameState): Promise<string>;
}
