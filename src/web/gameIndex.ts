import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface GameIndexEntry {
  gameId: string;
  winner: string;
  eventCount: number;
  generatedAt: string;
  networkLabel: string;
  storageMode: string;
  manifestPath: string;
  registry?: string;
}

export async function updateGameIndex(indexPath: string, entry: GameIndexEntry): Promise<void> {
  let existing: GameIndexEntry[] = [];
  try {
    existing = JSON.parse(await readFile(indexPath, 'utf8')) as GameIndexEntry[];
  } catch {
    existing = [];
  }

  const next = [entry, ...existing.filter((item) => item.gameId !== entry.gameId)]
    .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));

  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`);
}
