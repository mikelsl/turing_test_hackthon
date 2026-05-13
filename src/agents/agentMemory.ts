import type { GameEvent, GameState, Player } from '../types/game.js';

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

function lastSpeechBy(playerId: string, events: GameEvent[]): string | undefined {
  return [...events].reverse().find((e) => e.type === 'speech' && e.actorId === playerId)?.publicText;
}

function mentionsOf(playerId: string, events: GameEvent[]): number {
  return events.filter((e) => typeof e.publicText === 'string' && e.publicText.includes(playerId)).length;
}

export function buildAgentMemorySnapshots(state: GameState): Record<string, AgentMemorySnapshot> {
  const aliveIds = new Set(state.players.filter((p) => p.alive).map((p) => p.id));
  const voteCounts = new Map<string, number>();
  for (const e of state.events) {
    if (e.type === 'vote' && e.targetId) voteCounts.set(e.targetId, (voteCounts.get(e.targetId) ?? 0) + 1);
  }

  const sortedVoteTargets = [...voteCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  return Object.fromEntries(
    state.players
      .filter((p) => p.kind === 'agent')
      .map((player) => {
        const won = (player.role === 'wolf' && state.winner === 'wolves') || (player.role !== 'wolf' && state.winner === 'villagers');
        const lastSpeech = lastSpeechBy(player.id, state.events);
        const topSuspicion = sortedVoteTargets.filter((id) => id !== player.id).slice(0, 2);
        const trustTargets = state.players
          .filter((p) => p.id !== player.id)
          .sort((a, b) => mentionsOf(a.id, state.events) - mentionsOf(b.id, state.events))
          .slice(0, 2)
          .map((p) => p.id);

        const takeaways = [
          won ? 'Current strategy produced a winning outcome.' : 'Current strategy failed; adjust suspicion calibration next time.',
          aliveIds.has(player.id) ? 'Survived to the endgame.' : 'Died before game end; survival heuristics may need improvement.',
          lastSpeech ? `Last public stance: ${lastSpeech}` : 'No memorable final speech recorded.'
        ];

        return [player.id, {
          playerId: player.id,
          displayName: player.displayName,
          personaId: player.agentPersonaId,
          role: player.role ?? 'unknown',
          survived: aliveIds.has(player.id),
          outcome: won ? 'won' : 'lost',
          keyTakeaways: takeaways,
          suspicionTargets: topSuspicion,
          trustTargets
        } satisfies AgentMemorySnapshot];
      })
  );
}
