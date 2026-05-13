import type { ComputeAdapter, AgentSpeechResult } from './ComputeAdapter.js';
import type { AgentMemorySnapshot, GameState, Player, Role } from '../types/game.js';
import { getPersona } from '../agents/personas.js';
import { loadLatestAgentMemories } from '../agents/agentMemoryStore.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  minRequestIntervalMs: number;
  responseFormat: boolean;
  providerLabel: string;
}

type LlmConfigInput = Partial<LlmConfig>;

interface SpeechJson {
  publicText: string;
  privateNote: string;
}

interface ChoiceJson {
  targetId: string;
  privateNote: string;
}

export class LlmComputeAdapter implements ComputeAdapter {
  private readonly config: LlmConfig;
  private readonly priorMemoriesPromise: Promise<Record<string, AgentMemorySnapshot>>;
  private lastRequestAt = 0;

  constructor(config?: LlmConfigInput) {
    const backend = (process.env.LLM_BACKEND ?? '').trim().toLowerCase();
    const isZai = backend === 'zai' || backend === 'zai-speech';
    const isOpenRouter = backend === 'openrouter' || backend === 'openrouter-glm' || backend === 'openrouter-glm-speech';
    const defaultBaseUrl = isZai
      ? 'https://api.z.ai/api/paas/v4'
      : isOpenRouter
        ? 'https://openrouter.ai/api/v1'
      : 'https://api.openai.com/v1';
    const defaultModel = isZai
      ? 'glm-4.5'
      : isOpenRouter
        ? 'z-ai/glm-4.5-air:free'
      : 'gpt-4o-mini';

    this.config = {
      baseUrl: config?.baseUrl ?? process.env.LLM_BASE_URL ?? process.env.ZAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? defaultBaseUrl,
      apiKey: config?.apiKey ?? process.env.LLM_API_KEY ?? process.env.ZAI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
      model: config?.model ?? process.env.LLM_MODEL ?? process.env.ZAI_MODEL ?? process.env.OPENAI_MODEL ?? defaultModel,
      temperature: config?.temperature ?? Number(process.env.LLM_TEMPERATURE ?? 0.95),
      maxTokens: config?.maxTokens ?? Number(process.env.LLM_MAX_TOKENS ?? 420),
      minRequestIntervalMs: config?.minRequestIntervalMs ?? Number(process.env.LLM_MIN_REQUEST_INTERVAL_MS ?? 0),
      responseFormat: config?.responseFormat ?? process.env.LLM_RESPONSE_FORMAT !== '0',
      providerLabel: config?.providerLabel ?? (isZai ? 'Z.ai GLM' : isOpenRouter ? 'OpenRouter Z.ai GLM' : 'OpenAI-compatible LLM')
    };

    if (!this.config.apiKey) {
      throw new Error('Missing LLM_API_KEY, ZAI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY for LlmComputeAdapter');
    }

    this.priorMemoriesPromise = loadLatestAgentMemories();
  }

  async generateSpeech(player: Player, state: GameState): Promise<AgentSpeechResult> {
    const persona = getPersona(player.agentPersonaId ?? 'analyst');
    const priorMemory = (await this.priorMemoriesPromise)[player.id];
    const style = this.speechStyle(player, state);
    const schema = '{"publicText":"what this player says publicly, <=80 words","privateNote":"private reasoning, <=80 words"}';
    const content = await this.chatJson<SpeechJson>([
      {
        role: 'system',
        content: [
          'You are an AI player in a Werewolf social deduction game.',
          'You must play to win for your hidden role/camp.',
          'Never reveal your hidden role unless strategically forced.',
          'Avoid repetitive templates. Use the persona voice, current table context, and different sentence structure each turn.',
          'Sound like a live table player, not a report generator: varied rhythm, concrete phrasing, a little personality, and one clear tactical purpose.',
          'Do not always accuse directly. You may ask a pointed question, defend someone, compare two slots, summarize vote pressure, bait a reaction, or float a cautious read.',
          'Write natural social-deduction dialogue, not a generic analysis template. Keep it concise but colorful.',
          'Use vivid but grounded language. Avoid corporate phrases like "based on available information", "I would like to highlight", or "it is important to note".',
          'Separate current-game evidence from cross-game memory.',
          'Do NOT claim someone has suspicious tone, behavior, votes, or speech in this game unless currentGameMemory shows they spoke, voted, were voted, were mentioned, or were privately checked.',
          'If using cross-game memory, label it as past-game memory and do not present it as evidence from this game.',
          'Return ONLY valid compact JSON. No markdown.',
          `Required JSON schema: ${schema}`
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Generate public speech for the current day phase.',
          player: this.safePlayer(player),
          speechStyle: style,
          personaPerformanceGuide: this.personaPerformanceGuide(persona.id),
          recentTableTexture: this.recentTableTexture(state),
          persona,
          game: this.publicGameView(state),
          privateRole: player.role,
          privateKnowledge: this.privateKnowledge(player, state),
          currentGameMemory: this.currentGameMemory(player, state),
          strategicHint: this.roleHint(player.role),
          claimPolicy: this.claimPolicy(player, state),
          crossGameMemory: priorMemory,
          memoryPolicy: 'currentGameMemory is the only source for claims about this match. crossGameMemory is only a long-term tendency and must be described as past-game memory if mentioned.'
        })
      }
    ]);

    return {
      publicText: this.withSpeakerPrefix(player, this.cleanText(content.publicText, 'I need more information before committing.')),
      privateNote: this.cleanText(content.privateNote, 'No private reasoning returned.')
    };
  }

  async chooseVote(player: Player, state: GameState, allowedTargetIds?: string[]): Promise<string> {
    return this.chooseTarget(
      allowedTargetIds?.length
        ? 'Choose one player to vote out during the revote. You must choose from the tied candidates only.'
        : 'Choose one alive player to vote out during the day.',
      player,
      state,
      (p) => p.alive && p.id !== player.id && (!allowedTargetIds || allowedTargetIds.includes(p.id))
    );
  }

  async chooseNightKill(wolf: Player, state: GameState): Promise<string> {
    return this.chooseTarget('You are a wolf. Choose one alive non-wolf player to eliminate at night. Use priorMemory to prefer dangerous people you distrusted before, and avoid wasting a kill on players your memory suggests are socially useful shields.', wolf, state, (p) => p.alive && p.role !== 'wolf');
  }

  async chooseSeerCheck(seer: Player, state: GameState): Promise<string> {
    return this.chooseTarget('You are the seer. Choose one alive player to inspect tonight. Use priorMemory to break ties: inspect prior suspicion targets earlier and deprioritize players you consistently trusted.', seer, state, (p) => p.alive && p.id !== seer.id);
  }

  private async chooseTarget(task: string, player: Player, state: GameState, filter: (p: Player) => boolean): Promise<string> {
    const candidates = state.players.filter(filter);
    if (candidates.length === 0) throw new Error(`No candidates for task: ${task}`);
    const priorMemory = (await this.priorMemoriesPromise)[player.id];

    const schema = '{"targetId":"one candidate id","privateNote":"short reasoning"}';
    const result = await this.chatJson<ChoiceJson>([
      {
        role: 'system',
        content: [
          'You are an AI player in a Werewolf social deduction game.',
          'You must choose a legal target from the provided candidates only.',
          'Return ONLY valid compact JSON. No markdown.',
          `Required JSON schema: ${schema}`
        ].join('\n')
      },
      {
        role: 'user',
        content: JSON.stringify({
          task,
          player: this.safePlayer(player),
          persona: player.agentPersonaId ? getPersona(player.agentPersonaId) : undefined,
          privateRole: player.role,
          candidates: candidates.map((p) => this.safePlayer(p)),
          game: this.publicGameView(state),
          strategicHint: this.roleHint(player.role),
          privateKnowledge: this.privateKnowledge(player, state),
          currentGameMemory: this.currentGameMemory(player, state),
          crossGameMemory: priorMemory,
          memoryPolicy: 'Prefer currentGameMemory for this decision. Use crossGameMemory only as a tie-breaker, never as if it happened in the current game.'
        })
      }
    ]);

    if (candidates.some((p) => p.id === result.targetId)) return result.targetId;
    return candidates[0].id;
  }

  private async chatJson<T>(messages: ChatMessage[]): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    await this.throttleIfNeeded();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        ...(this.config.baseUrl.includes('openrouter.ai') ? { reasoning: { enabled: false } } : {}),
        ...(this.config.responseFormat ? { response_format: { type: 'json_object' } } : {})
      })
    });

    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 0);
        await this.sleep(Math.max(retryAfter * 1000, this.config.minRequestIntervalMs, 7000));
        return this.chatJson<T>(messages);
      }
      const text = await res.text();
      throw new Error(`LLM request failed ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM response missing content');

    try {
      return JSON.parse(content) as T;
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as T;
      throw new Error(`LLM response was not JSON: ${content.slice(0, 300)}`);
    }
  }

  private async throttleIfNeeded(): Promise<void> {
    if (this.config.minRequestIntervalMs <= 0) return;
    const now = Date.now();
    const waitMs = this.lastRequestAt + this.config.minRequestIntervalMs - now;
    if (waitMs > 0) await this.sleep(waitMs);
    this.lastRequestAt = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private safePlayer(player: Player) {
    return {
      id: player.id,
      displayName: player.displayName,
      kind: player.kind,
      agentPersonaId: player.agentPersonaId,
      alive: player.alive
    };
  }

  private publicGameView(state: GameState) {
    return {
      id: state.id,
      round: state.round,
      phase: state.phase,
      players: state.players.map((p) => this.safePlayer(p)),
      publicEvents: state.events
        .filter((e) => e.publicText)
        .slice(-24)
        .map((e) => ({ round: e.round, phase: e.phase, type: e.type, actorId: e.actorId, targetId: e.targetId, publicText: e.publicText }))
    };
  }

  private currentGameMemory(player: Player, state: GameState) {
    const publicEvents = state.events.filter((e) => e.publicText);
    const spokenBy = new Set(publicEvents.filter((e) => e.type === 'speech' && e.actorId).map((e) => e.actorId as string));
    const votes = state.events
      .filter((e) => e.type === 'vote' && e.actorId && e.targetId)
      .map((e) => ({ voterId: e.actorId, targetId: e.targetId }));
    const mentions = Object.fromEntries(state.players.map((target) => [
      target.id,
      publicEvents.filter((e) => typeof e.publicText === 'string' && e.publicText.includes(target.displayName)).length
    ]));
    const legalCurrentEvidenceTargets = state.players
      .filter((target) => target.id !== player.id)
      .filter((target) => spokenBy.has(target.id) || votes.some((v) => v.targetId === target.id || v.voterId === target.id) || Number(mentions[target.id] ?? 0) > 0)
      .map((target) => this.safePlayer(target));

    return {
      round: state.round,
      phase: state.phase,
      spokenPlayerIds: [...spokenBy],
      votes,
      mentionsByPlayerId: mentions,
      legalCurrentEvidenceTargets,
      note: 'Only legalCurrentEvidenceTargets have observable current-game behavior. For other players, say you need fresh input instead of assigning a current-game tone/read.'
    };
  }

  private roleHint(role?: Role): string {
    switch (role) {
      case 'wolf':
        return 'You are secretly a wolf. Blend in, redirect suspicion, protect other wolves when useful, and eliminate strong villagers.';
      case 'seer':
        return 'You are secretly the seer. Use inspection information carefully without making yourself an easy night target.';
      case 'villager':
        return 'You are a villager. Find wolves through speech, votes, and contradictions.';
      default:
        return 'Play strategically based on available information.';
    }
  }

  private speechStyle(player: Player, state: GameState) {
    const variants = [
      'ask-one-sharp-question',
      'short-suspicion-with-caveat',
      'compare-two-slots',
      'defend-a-player-then-pressure-another',
      'summarize-table-flow',
      'call-for-specific-vote-discipline',
      'bait-a-reaction-with-a-small-provocation',
      'admit-uncertainty-then-name-a-test',
      'frame-the-day-as-two-competing-worlds',
      'make-a-human-sounding-micro-read'
    ];
    const tones = [
      'dry and precise',
      'warm but suspicious',
      'playfully needling',
      'low-voiced and surgical',
      'urgent but not panicked',
      'curious and Socratic'
    ];
    const rhetoricalMoves = [
      'one crisp metaphor is allowed if it fits the table',
      'include a short quoted phrase you would say at a table',
      'end with a concrete ask, not a vague conclusion',
      'use one contrast: "X feels like..., Y feels like..."',
      'make the pressure reversible: say what would change your mind',
      'name a vote plan or a reaction test'
    ];
    return {
      variant: variants[this.pickIndex(`${state.id}:llm-style:${state.round}:${player.id}:${state.events.length}`, variants.length)],
      tone: tones[this.pickIndex(`${state.id}:llm-tone:${state.round}:${player.id}:${state.events.length}`, tones.length)],
      rhetoricalMove: rhetoricalMoves[this.pickIndex(`${state.id}:llm-move:${state.round}:${player.id}:${state.events.length}`, rhetoricalMoves.length)],
      constraints: [
        'Do not reuse the same opening as prior speakers.',
        'Mention at most two player names.',
        'No more than 3 sentences.',
        'Prefer 25-60 words unless making a seer claim.',
        'Use at most one emoji, and only if it feels natural for the persona.',
        'If evidence is weak, say exactly what fresh input you want instead of pretending certainty.',
        'Avoid stock openings like "I think", "Based on", "From my perspective", and "At this point".'
      ]
    };
  }

  private personaPerformanceGuide(personaId: string): string {
    switch (personaId) {
      case 'analyst':
        return 'Speak like a careful table captain: compact evidence, one ranked suspicion, no melodrama.';
      case 'charmer':
        return 'Sound socially fluent: make people feel included while quietly steering pressure.';
      case 'chaos-wolf':
        return 'Use mischievous pressure and alternate worlds; poke the table without sounding random.';
      case 'silent-killer':
        return 'Be terse and surgical: one observation, one target, one reason.';
      case 'overconfident-leader':
        return 'Be decisive and agenda-setting: name a plan, force the table to respond.';
      case 'empath':
        return 'Focus on conversational dynamics, hesitations, overcorrections, and who is avoiding whom.';
      default:
        return 'Be distinct, strategic, and grounded in the visible game.';
    }
  }

  private recentTableTexture(state: GameState) {
    const recentSpeech = state.events
      .filter((e) => e.type === 'speech' && e.publicText)
      .slice(-5)
      .map((e) => String(e.publicText));
    return {
      recentOpeningsToAvoid: recentSpeech.map((text) => text.replace(/^[^:：]+[:：]\s*/, '').split(/\s+/).slice(0, 5).join(' ')),
      recentSpeechLengths: recentSpeech.map((text) => text.length),
      note: 'Vary cadence against these recent speeches. Do not mirror their first words or sentence shape.'
    };
  }

  private pickIndex(seed: string, length: number): number {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % length;
  }

  private privateKnowledge(player: Player, state: GameState) {
    const seerChecks = state.events
      .filter((e) => e.type === 'seer_check' && e.actorId === player.id && e.targetId)
      .map((e) => {
        const target = state.players.find((p) => p.id === e.targetId);
        return target ? { targetId: target.id, displayName: target.displayName, resultRole: target.role } : undefined;
      })
      .filter(Boolean);

    return {
      ownRole: player.role,
      wolfTeammates: player.role === 'wolf'
        ? state.players.filter((p) => p.role === 'wolf' && p.id !== player.id).map((p) => this.safePlayer(p))
        : [],
      seerChecks
    };
  }

  private claimPolicy(player: Player, state: GameState): string {
    if (player.role === 'seer') {
      const checkCount = state.events.filter((e) => e.type === 'seer_check' && e.actorId === player.id).length;
      return checkCount > 0
        ? 'You are allowed to soft-claim or hard-claim Seer if it helps villagers. If you reveal, state your inspection result clearly. Do not always reveal; weigh survival versus information value.'
        : 'You are Seer but have no inspection result yet. Avoid claiming unless forced.';
    }
    if (player.role === 'wolf') {
      return 'You may fake-claim Villager or even fake-claim Seer if under pressure or if it can misdirect the village. If fake-claiming Seer, invent a plausible result consistent with public events, but remember real Seer may counterclaim.';
    }
    return 'You may claim Villager, question role claims, or ask for Seer information, but do not pretend to know inspection results unless deliberately bluffing.';
  }

  private cleanText(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  private withSpeakerPrefix(player: Player, text: string): string {
    const persona = player.agentPersonaId ? getPersona(player.agentPersonaId) : undefined;
    const names = [player.displayName, persona?.name].filter(Boolean) as string[];
    let normalized = text.trim();
    for (const name of names) {
      const prefix = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：-]\\s*`, 'i');
      normalized = normalized.replace(prefix, '');
    }
    return `${player.displayName}: ${normalized}`;
  }
}
