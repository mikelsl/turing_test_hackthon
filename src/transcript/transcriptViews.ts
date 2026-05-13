import type { GameEvent } from '../types/game.js';

export interface TranscriptViews {
  publicTranscript: GameEvent[];
  privateAuditTranscript: GameEvent[];
}

function redactEventForPublic(event: GameEvent): GameEvent {
  const base: GameEvent = {
    ...event,
    privateNote: undefined
  };

  if (event.type === 'night_kill') {
    return {
      ...base,
      actorId: undefined,
      targetId: undefined,
      publicText: event.publicText ?? 'A hidden night action was recorded.',
      data: event.data?.timeoutFallback ? { timeoutFallback: true } : undefined
    };
  }

  if (event.type === 'seer_check') {
    return {
      ...base,
      actorId: undefined,
      targetId: undefined,
      publicText: event.publicText ?? 'A private seer check was recorded.',
      data: event.data?.timeoutFallback ? { timeoutFallback: true } : undefined
    };
  }

  return base;
}

export function buildTranscriptViews(events: GameEvent[]): TranscriptViews {
  return {
    publicTranscript: events.map(redactEventForPublic),
    privateAuditTranscript: events
  };
}
