import type { Camp, GameEvent, GameState, GameSummary, Player, Role } from '../types/game.js';
import type { ComputeAdapter } from '../compute/ComputeAdapter.js';
import type { HumanActionProvider } from './HumanActionProvider.js';
import { PlaceholderHumanActionProvider } from './HumanActionProvider.js';
import { sha256Json } from '../utils/hash.js';
import { shuffle } from '../utils/random.js';
import { buildAgentMemorySnapshots } from '../agents/agentMemory.js';

const ROLES: Role[] = ['wolf', 'wolf', 'seer', 'villager', 'villager', 'villager'];

export class WerewolfEngine {
  constructor(
    private readonly compute: ComputeAdapter,
    private readonly humans: HumanActionProvider = new PlaceholderHumanActionProvider()
  ) {}

  createGame(id: string, players: Omit<Player, 'role' | 'alive'>[]): GameState {
    if (players.length !== 6) throw new Error('MVP requires exactly 6 players');
    const roles = shuffle(ROLES);
    const assigned = players.map((p, i) => ({ ...p, role: roles[i], alive: true }));
    const now = new Date().toISOString();
    return {
      id,
      round: 1,
      phase: 'lobby',
      players: assigned,
      events: [],
      createdAt: now,
      updatedAt: now
    };
  }

  async runToEnd(state: GameState, maxRounds = 4): Promise<{ state: GameState; summary: GameSummary }> {
    this.event(state, 'system', { publicText: '🎭 The game begins. Roles have been assigned privately.' });

    while (!state.winner && state.round <= maxRounds) {
      await this.runNight(state);
      if (this.checkWinner(state)) break;
      await this.runDay(state);
      await this.runVote(state);
      this.checkWinner(state);
      if (!state.winner) state.round += 1;
    }

    if (!state.winner) state.winner = this.countAliveWolves(state) > 0 ? 'wolves' : 'villagers';
    state.phase = 'finished';
    this.event(state, 'game_finished', { publicText: `Winner: ${state.winner}` });

    const transcriptRoot = sha256Json(state.events);
    return {
      state,
      summary: {
        gameId: state.id,
        winner: state.winner,
        transcriptRoot,
        highlights: [
          `Game finished in round ${state.round}`,
          `Winner camp: ${state.winner}`,
          `Transcript root: ${transcriptRoot}`
        ],
        reputationDeltas: Object.fromEntries(
          state.players.map((p) => [p.id, this.mockReputationDelta(p, state.winner as Camp)])
        ),
        agentMemories: buildAgentMemorySnapshots(state)
      }
    };
  }

  private async runNight(state: GameState): Promise<void> {
    state.phase = 'night';
    this.event(state, 'phase_started', { publicText: `🌙 Night ${state.round} falls. Everyone close your eyes.` });

    const wolves = state.players.filter((p) => p.alive && p.role === 'wolf');
    const seer = state.players.find((p) => p.alive && p.role === 'seer');

    // Night actions are collected before deaths are applied. Otherwise a human seer
    // killed on night 1 never gets the chance to inspect anyone, which is both unfair
    // and confusing in the Telegram demo flow.
    const leadWolf = wolves[0];
    const [killTarget, checkedId] = await Promise.all([
      leadWolf
        ? leadWolf.kind === 'agent'
          ? this.compute.chooseNightKill(leadWolf, state)
          : this.humans.chooseNightKill(leadWolf, state)
        : Promise.resolve(undefined),
      seer
        ? seer.kind === 'agent'
        ? await this.compute.chooseSeerCheck(seer, state)
          : await this.humans.chooseSeerCheck(seer, state)
        : Promise.resolve(undefined)
    ]);

    if (leadWolf && killTarget) {
      const killTimedOut = leadWolf.kind === 'human' && this.consumeTimeout(leadWolf.id, 'nightKill');
      const target = state.players.find((p) => p.id === killTarget && p.alive);
      if (target) {
        target.alive = false;
        this.event(state, 'night_kill', {
          actorId: leadWolf.id,
          targetId: target.id,
          publicText: `${target.displayName} was found dead at dawn.${killTimedOut ? ' [timeout fallback]' : ''}`,
          privateNote: `Wolves killed ${target.displayName}${killTimedOut ? ' (timeout fallback)' : ''}`,
          data: killTimedOut ? { timeoutFallback: true } : undefined
        });
      }
    }

    if (seer && checkedId) {
      const checkTimedOut = seer.kind === 'human' && this.consumeTimeout(seer.id, 'seerCheck');
      const checked = state.players.find((p) => p.id === checkedId);
      this.event(state, 'seer_check', {
        actorId: seer.id,
        targetId: checkedId,
        privateNote: checked ? `${checked.displayName} is ${checked.role}${checkTimedOut ? ' (timeout fallback)' : ''}` : 'Invalid check',
        data: checkTimedOut ? { timeoutFallback: true } : undefined
      });
    }
  }

  private async runDay(state: GameState): Promise<void> {
    state.phase = 'day';
    this.event(state, 'phase_started', { publicText: `🌤 Dawn breaks. The village wakes up. Day ${state.round} discussion begins.` });
    for (const player of state.players.filter((p) => p.alive)) {
      if (player.kind === 'agent') {
        const speech = await this.compute.generateSpeech(player, state);
        this.event(state, 'speech', {
          actorId: player.id,
          publicText: speech.publicText,
          privateNote: speech.privateNote
        });
      } else {
        const publicText = await this.humans.getSpeech(player, state);
        const timedOut = this.consumeTimeout(player.id, 'speech');
        this.event(state, 'speech', {
          actorId: player.id,
          publicText,
          data: timedOut ? { timeoutFallback: true } : undefined
        });
      }
    }
  }

  private async runVote(state: GameState): Promise<void> {
    state.phase = 'vote';
    this.event(state, 'phase_started', { publicText: '🗳 It is time to vote. Discussed enough — choose the player you want eliminated.' });
    const firstPass = await this.collectVotes(state);
    const tied = this.topTiedTargets(state, firstPass);

    if (tied.length > 1) {
      this.event(state, 'vote_tie', {
        publicText: `🤝 The vote is tied between ${tied.map((p) => p.displayName).join(' and ')}. Revote among tied players only.`
      });
      const revote = await this.collectVotes(state, tied.map((p) => p.id), true);
      const retied = this.topTiedTargets(state, revote);
      if (retied.length > 1) {
        this.event(state, 'vote_no_elimination', {
          publicText: `No consensus was reached after the revote. No one is eliminated this round.`
        });
        return;
      }
      const eliminated = retied[0];
      if (eliminated) {
        eliminated.alive = false;
        this.event(state, 'eliminated', { targetId: eliminated.id, publicText: `⚖️ ${eliminated.displayName} was eliminated by revote.` });
      }
      return;
    }

    const eliminated = tied[0];
    if (eliminated) {
      eliminated.alive = false;
      this.event(state, 'eliminated', { targetId: eliminated.id, publicText: `⚖️ ${eliminated.displayName} was eliminated by vote.` });
    }
  }

  private async collectVotes(state: GameState, allowedTargetIds?: string[], isRevote = false): Promise<Map<string, number>> {
    const votes = new Map<string, number>();
    for (const player of state.players.filter((p) => p.alive)) {
      const targetId = player.kind === 'agent'
        ? await this.compute.chooseVote(player, state, allowedTargetIds)
        : await this.humans.chooseVote(player, state, allowedTargetIds);
      if (!targetId) continue;
      if (allowedTargetIds?.length && !allowedTargetIds.includes(targetId)) {
        this.event(state, 'invalid_vote', {
          actorId: player.id,
          targetId,
          publicText: `${player.displayName} cast an invalid ${isRevote ? 'revote' : 'vote'} and it was ignored.`
        });
        continue;
      }
      const timedOut = player.kind === 'human' && this.consumeTimeout(player.id, 'vote');
      votes.set(targetId, (votes.get(targetId) ?? 0) + 1);
      const target = state.players.find((p) => p.id === targetId);
      this.event(state, 'vote', {
        actorId: player.id,
        targetId,
        publicText: `${player.displayName} ${isRevote ? 'revotes' : 'votes'} ${target?.displayName ?? targetId}${timedOut ? ' [timeout fallback]' : ''}`,
        data: timedOut ? { timeoutFallback: true, revote: isRevote } : isRevote ? { revote: true } : undefined
      });
    }
    return votes;
  }

  private topTiedTargets(state: GameState, votes: Map<string, number>): Player[] {
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return [];
    const top = ranked[0][1];
    const tiedIds = ranked.filter(([, count]) => count === top).map(([id]) => id);
    return tiedIds.map((id) => {
      const player = state.players.find((p) => p.id === id);
      if (!player) throw new Error(`Unknown player in vote tally: ${id}`);
      return player;
    });
  }

  private checkWinner(state: GameState): boolean {
    const wolves = this.countAliveWolves(state);
    const villagers = state.players.filter((p) => p.alive && p.role !== 'wolf').length;
    if (wolves === 0) state.winner = 'villagers';
    if (wolves >= villagers) state.winner = 'wolves';
    return Boolean(state.winner);
  }

  private countAliveWolves(state: GameState): number {
    return state.players.filter((p) => p.alive && p.role === 'wolf').length;
  }

  private event(state: GameState, type: string, event: Partial<GameEvent>): void {
    state.events.push({
      id: `${state.id}-${state.events.length + 1}`,
      gameId: state.id,
      round: state.round,
      phase: state.phase,
      type,
      createdAt: new Date().toISOString(),
      ...event
    });
    state.updatedAt = new Date().toISOString();
  }

  private consumeTimeout(playerId: string, type: 'speech' | 'vote' | 'nightKill' | 'seerCheck'): boolean {
    return this.humans.consumeTimeoutMarker?.(playerId, type) ?? false;
  }

  private mockReputationDelta(player: Player, winner: Camp) {
    const won = (player.role === 'wolf' && winner === 'wolves') || (player.role !== 'wolf' && winner === 'villagers');
    return {
      deduction: player.role === 'seer' ? 2 : 1,
      deception: player.role === 'wolf' ? 2 : 0,
      cooperation: 1,
      leadership: player.agentPersonaId === 'overconfident-leader' ? 2 : 0,
      trustworthiness: won ? 1 : -1
    };
  }
}
