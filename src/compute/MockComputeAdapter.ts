import type { ComputeAdapter, AgentSpeechResult } from './ComputeAdapter.js';
import type { AgentMemorySnapshot, GameState, Player } from '../types/game.js';
import { getPersona } from '../agents/personas.js';
import { loadLatestAgentMemories } from '../agents/agentMemoryStore.js';

export class MockComputeAdapter implements ComputeAdapter {
  private readonly priorMemoriesPromise: Promise<Record<string, AgentMemorySnapshot>> = loadLatestAgentMemories();

  private pickIndex(seed: string, length: number): number {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % length;
  }

  async generateSpeech(player: Player, state: GameState): Promise<AgentSpeechResult> {
    const persona = getPersona(player.agentPersonaId ?? 'analyst');
    const priorMemory = (await this.priorMemoriesPromise)[player.id];
    const alive = state.players.filter((p) => p.alive && p.id !== player.id);
    const memorySuspect = state.round > 1
      ? priorMemory?.suspicionTargets.find((id) => alive.some((p) => p.id === id))
      : undefined;
    const observed = alive.filter((p) => this.hasCurrentGameSignal(p, state));
    const suspectPool = observed.length > 0 ? observed : alive;
    const suspect = alive.find((p) => p.id === memorySuspect && this.hasCurrentGameSignal(p, state))
      ?? suspectPool[this.pickIndex(`${state.id}:speech:${state.round}:${player.id}`, suspectPool.length)];
    const hasSignal = this.hasCurrentGameSignal(suspect, state);
    const lines: Record<string, string[]> = {
      analyst: hasSignal ? [
        `I want everyone to slow down and compare claims. ${suspect.displayName}'s story has the least current-game support, so I am putting pressure there.`,
        `My read is not emotional here: the cleanest inconsistency is around ${suspect.displayName}. If they are village, they need to explain their path.`,
        `I am tracking votes and wording, not vibes. Right now ${suspect.displayName} gives me the weakest alignment signal.`
      ] : [
        `I do not have enough current-game evidence yet. I want to hear more from ${suspect.displayName} before turning past impressions into an accusation.`,
        `${suspect.displayName}, give us one concrete read. Until you speak more, I am not comfortable pretending this is evidence.`,
        `Fresh table data first. I want ${suspect.displayName} to commit to a read before I sort that slot.`
      ],
      charmer: hasSignal ? [
        `I am not locking anything yet, but ${suspect.displayName} feels like the pressure point of this table. I want them to defend the route they are taking.`,
        `${suspect.displayName}, I can see a village version of you, but your current posture needs explaining. Talk me out of this read.`,
        `If we are wrong today, it will be because we let soft answers pass. ${suspect.displayName}, I need a cleaner position from you.`
      ] : [
        `It is too early for a hard read. ${suspect.displayName}, I want to hear your own reasoning before I judge you from old patterns.`,
        `${suspect.displayName}, I am giving you room here. Say who you trust and who you do not, then we can actually read you.`,
        `No charm tricks yet. I need fresh words from ${suspect.displayName} before I decide whether the old memory matters.`
      ],
      'chaos-wolf': hasSignal ? [
        `Everyone is making this too neat. If ${suspect.displayName} is supposedly obvious, that neatness is exactly what bothers me.`,
        `I do not trust how quickly the room is simplifying around ${suspect.displayName}. Wolves love a clean story.`,
        `Maybe ${suspect.displayName} is bad, maybe not. What I dislike is how little resistance this push is getting.`
      ] : [
        `There is not enough on-table evidence yet. Stop importing old reads and make ${suspect.displayName} talk first.`,
        `I refuse to vote a ghost read. ${suspect.displayName}, say something useful or become today's easy hiding spot.`,
        `Old-game memory is noise until ${suspect.displayName} gives us fresh material. Force the slot open first.`
      ],
      'silent-killer': hasSignal ? [
        `${suspect.displayName}. Too convenient. I am watching that slot.`,
        `${suspect.displayName} is where I would cut today. Short answer, bad shape.`,
        `My vote pressure is on ${suspect.displayName}. Not loud, just enough wrong.`
      ] : [
        `${suspect.displayName}. No current read yet. Speak more.`,
        `${suspect.displayName}, give a target. Silence is not readable enough.`,
        `No case yet. I want ${suspect.displayName} on record first.`
      ],
      'overconfident-leader': hasSignal ? [
        `I am calling it now: ${suspect.displayName} is the best elimination today based on what has happened this round. Stop drifting and give me a clean vote.`,
        `The table needs a spine. Push ${suspect.displayName}, demand an answer, then decide. Wandering helps wolves.`,
        `If we split pressure everywhere, we learn nothing. I want ${suspect.displayName} under the spotlight now.`
      ] : [
        `No one has earned a hard push yet. ${suspect.displayName}, give us a clear position so this table has something real to evaluate.`,
        `I am not leading a vote on stale memory. ${suspect.displayName}, step up and name a suspect.`,
        `Before anyone grandstands, I want ${suspect.displayName} to commit. Then we move.`
      ],
      empath: hasSignal ? [
        `The tone around ${suspect.displayName} in this round feels unnatural to me. I do not have hard proof yet, but the current social energy is wrong.`,
        `${suspect.displayName} is not sitting comfortably in the room for me. The reactions around that slot feel slightly staged.`,
        `I am uneasy with how ${suspect.displayName} is being handled. It feels less like solving and more like people checking where the wind goes.`
      ] : [
        `I do not have a current-game tone read on ${suspect.displayName} yet. I want fresh speech before I let cross-game memory bias me.`,
        `${suspect.displayName} is still emotionally blank to me this game. I need a real answer before I trust my instinct.`,
        `No aura read yet. ${suspect.displayName}, give us something current, not just a name floating in old memory.`
      ]
    };
    const seerClaim = this.seerClaimLine(player, state);
    const wolfFakeClaim = this.wolfFakeClaimLine(player, state, suspect);
    const memoryTail = priorMemory
      ? ` Last game: ${priorMemory.outcome}, trusted ${priorMemory.trustTargets.join(', ') || 'nobody'}, suspected ${priorMemory.suspicionTargets.join(', ') || 'nobody'}.`
      : '';
    return {
      publicText: `${player.displayName}: ${seerClaim ?? wolfFakeClaim ?? this.pickLine(lines[persona.id] ?? lines.analyst, state, player)}`,
      privateNote: `Mock reasoning for ${player.displayName}. Role=${player.role}. Persona=${persona.id}. Suspect=${suspect.id}.${memoryTail}`
    };
  }

  private pickLine(lines: string[], state: GameState, player: Player): string {
    return lines[this.pickIndex(`${state.id}:line:${state.round}:${state.events.length}:${player.id}`, lines.length)];
  }

  private seerClaimLine(player: Player, state: GameState): string | undefined {
    if (player.role !== 'seer') return undefined;
    const checks = state.events.filter((e) => e.type === 'seer_check' && e.actorId === player.id && e.targetId);
    if (!checks.length) return undefined;
    const latest = checks[checks.length - 1];
    const target = state.players.find((p) => p.id === latest.targetId);
    if (!target) return undefined;
    const shouldClaim = state.round >= 2 || target.role === 'wolf' || this.pickIndex(`${state.id}:seer-claim:${state.round}:${player.id}`, 3) === 0;
    if (!shouldClaim) return undefined;
    return `I am going to claim Seer now. My check says ${target.displayName} is ${target.role === 'wolf' ? 'a WOLF' : 'not a wolf'}. Judge me by whether this information helps the village.`;
  }

  private wolfFakeClaimLine(player: Player, state: GameState, suspect: Player): string | undefined {
    if (player.role !== 'wolf') return undefined;
    const shouldFakeClaim = state.round >= 2 && this.pickIndex(`${state.id}:wolf-fake-claim:${state.round}:${player.id}`, 4) === 0;
    if (!shouldFakeClaim) return undefined;
    return `I will put pressure on the table: I am claiming Seer. My check points to ${suspect.displayName} as suspicious. If there is a counterclaim, speak now.`;
  }

  private hasCurrentGameSignal(target: Player, state: GameState): boolean {
    return state.events.some((event) => {
      if (event.actorId === target.id && ['speech', 'vote', 'invalid_vote'].includes(event.type)) return true;
      if (event.targetId === target.id && ['vote', 'invalid_vote', 'vote_tie', 'eliminated'].includes(event.type)) return true;
      return typeof event.publicText === 'string' && event.publicText.includes(target.displayName);
    });
  }

  async chooseVote(player: Player, state: GameState, allowedTargetIds?: string[]): Promise<string> {
    const candidates = state.players.filter((p) => p.alive && p.id !== player.id && (!allowedTargetIds || allowedTargetIds.includes(p.id)));
    const personaId = player.agentPersonaId ?? 'analyst';
    const priorMemory = (await this.priorMemoriesPromise)[player.id];
    const ordered = [...candidates];

    if (personaId === 'analyst') {
      ordered.sort((a, b) => a.id.localeCompare(b.id));
    } else if (personaId === 'charmer') {
      ordered.sort((a, b) => a.displayName.length - b.displayName.length);
    } else if (personaId === 'chaos-wolf') {
      ordered.sort((a, b) => b.id.localeCompare(a.id));
    } else if (personaId === 'silent-killer') {
      ordered.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else if (personaId === 'overconfident-leader') {
      ordered.sort((a, b) => b.displayName.length - a.displayName.length);
    } else if (personaId === 'empath') {
      ordered.sort((a, b) => (a.id.length - b.id.length) || a.displayName.localeCompare(b.displayName));
    }

    if (state.round > 1 && priorMemory?.suspicionTargets?.length) {
      ordered.sort((a, b) => Number(priorMemory.suspicionTargets.includes(b.id)) - Number(priorMemory.suspicionTargets.includes(a.id)));
    }
    if (state.round > 1 && priorMemory?.trustTargets?.length) {
      ordered.sort((a, b) => Number(priorMemory.trustTargets.includes(a.id)) - Number(priorMemory.trustTargets.includes(b.id)));
    }

    return ordered[this.pickIndex(`${state.id}:vote:${state.round}:${player.id}`, ordered.length)].id;
  }

  async chooseNightKill(wolf: Player, state: GameState): Promise<string> {
    const candidates = state.players.filter((p) => p.alive && p.role !== 'wolf');
    const priorMemory = (await this.priorMemoriesPromise)[wolf.id];
    const ordered = [...candidates];

    if (priorMemory?.trustTargets?.length) {
      ordered.sort((a, b) => Number(priorMemory.trustTargets.includes(b.id)) - Number(priorMemory.trustTargets.includes(a.id)));
    }
    if (priorMemory?.suspicionTargets?.length) {
      ordered.sort((a, b) => Number(priorMemory.suspicionTargets.includes(b.id)) - Number(priorMemory.suspicionTargets.includes(a.id)));
    }

    return ordered[this.pickIndex(`${state.id}:kill:${state.round}:${wolf.id}`, ordered.length)].id;
  }

  async chooseSeerCheck(seer: Player, state: GameState): Promise<string> {
    const candidates = state.players.filter((p) => p.alive && p.id !== seer.id);
    const priorMemory = (await this.priorMemoriesPromise)[seer.id];
    const ordered = [...candidates];

    if (priorMemory?.suspicionTargets?.length) {
      ordered.sort((a, b) => Number(priorMemory.suspicionTargets.includes(b.id)) - Number(priorMemory.suspicionTargets.includes(a.id)));
    }
    if (priorMemory?.trustTargets?.length) {
      ordered.sort((a, b) => Number(priorMemory.trustTargets.includes(a.id)) - Number(priorMemory.trustTargets.includes(b.id)));
    }

    return ordered[this.pickIndex(`${state.id}:seer:${state.round}:${seer.id}`, ordered.length)].id;
  }
}
