import { readFile } from 'node:fs/promises';
import type { AgentMemorySnapshot } from '../types/game.js';

export async function loadLatestAgentMemories(path = process.env.AGENT_MEMORY_PATH ?? './artifacts/latest-agent-memories.json'): Promise<Record<string, AgentMemorySnapshot>> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, AgentMemorySnapshot>;
  } catch {
    return {};
  }
}
