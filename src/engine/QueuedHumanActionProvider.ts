import type { GameState, Player } from '../types/game.js';
import type { HumanActionProvider } from './HumanActionProvider.js';
import type { TimeoutPolicy } from './TimeoutPolicy.js';
import { DefaultTimeoutPolicy } from './TimeoutPolicy.js';

interface PendingRequest {
  type: 'speech' | 'vote' | 'nightKill' | 'seerCheck';
  player: Player;
  state: GameState;
  allowedTargetIds?: string[];
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  createdAt: number;
  timeout: NodeJS.Timeout;
}

export class QueuedHumanActionProvider implements HumanActionProvider {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly timeoutMarkers = new Set<string>();

  constructor(private readonly timeoutPolicy: TimeoutPolicy = new DefaultTimeoutPolicy()) {}

  async getSpeech(player: Player, state: GameState): Promise<string> {
    return this.enqueue('speech', player, state);
  }

  async chooseVote(player: Player, state: GameState, allowedTargetIds?: string[]): Promise<string> {
    return this.enqueue('vote', player, state, allowedTargetIds);
  }

  async chooseNightKill(player: Player, state: GameState): Promise<string> {
    return this.enqueue('nightKill', player, state);
  }

  async chooseSeerCheck(player: Player, state: GameState): Promise<string> {
    return this.enqueue('seerCheck', player, state);
  }

  submitSpeech(playerId: string, text: string): boolean {
    return this.submit(`speech:${playerId}`, text);
  }

  submitVote(playerId: string, targetId: string): boolean {
    return this.submit(`vote:${playerId}`, targetId);
  }

  submitNightKill(playerId: string, targetId: string): boolean {
    return this.submit(`nightKill:${playerId}`, targetId);
  }

  submitSeerCheck(playerId: string, targetId: string): boolean {
    return this.submit(`seerCheck:${playerId}`, targetId);
  }

  consumeTimeoutMarker(playerId: string, type: 'speech' | 'vote' | 'nightKill' | 'seerCheck'): boolean {
    const key = `${type}:${playerId}`;
    const had = this.timeoutMarkers.has(key);
    this.timeoutMarkers.delete(key);
    return had;
  }

  abortAll(reason = 'Game aborted by operator'): void {
    for (const [key, req] of this.pending.entries()) {
      clearTimeout(req.timeout);
      req.reject(new Error(reason));
      this.pending.delete(key);
    }
  }

  getPendingForPlayer(playerId: string): PendingRequest | undefined {
    return this.pending.get(`speech:${playerId}`)
      ?? this.pending.get(`vote:${playerId}`)
      ?? this.pending.get(`nightKill:${playerId}`)
      ?? this.pending.get(`seerCheck:${playerId}`);
  }

  listPending(): Array<{ key: string; type: 'speech' | 'vote' | 'nightKill' | 'seerCheck'; playerId: string; playerName: string; createdAt: number; timeoutAt: number; allowedTargetIds?: string[] }> {
    return [...this.pending.entries()].map(([key, req]) => ({
      key,
      type: req.type,
      playerId: req.player.id,
      playerName: req.player.displayName,
      createdAt: req.createdAt,
      timeoutAt: req.createdAt + this.timeoutPolicy.timeoutMs,
      allowedTargetIds: req.allowedTargetIds
    }));
  }

  private enqueue(type: 'speech' | 'vote' | 'nightKill' | 'seerCheck', player: Player, state: GameState, allowedTargetIds?: string[]): Promise<string> {
    const key = `${type}:${player.id}`;
    if (this.pending.has(key)) throw new Error(`Pending ${type} already exists for ${player.id}`);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const req = this.pending.get(key);
        if (!req) return;
        this.pending.delete(key);
        this.timeoutMarkers.add(key);
        req.resolve(this.fallback(req));
      }, this.timeoutPolicy.timeoutMs);

      this.pending.set(key, { type, player, state, allowedTargetIds, resolve, reject, createdAt: Date.now(), timeout });
    });
  }

  private submit(key: string, value: string): boolean {
    const req = this.pending.get(key);
    if (!req) return false;
    this.pending.delete(key);
    clearTimeout(req.timeout);
    req.resolve(value);
    return true;
  }

  private fallback(req: PendingRequest): string {
    switch (req.type) {
      case 'speech':
        return this.timeoutPolicy.fallbackSpeech(req.player, req.state);
      case 'vote':
        return this.timeoutPolicy.fallbackVote(req.player, req.state);
      case 'nightKill':
        return this.timeoutPolicy.fallbackNightKill(req.player, req.state);
      case 'seerCheck':
        return this.timeoutPolicy.fallbackSeerCheck(req.player, req.state);
    }
  }
}
