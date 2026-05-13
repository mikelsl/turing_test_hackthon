import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const entries = [];
for await (const file of glob('artifacts/*/replay-manifest.json')) {
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  entries.push({
    gameId: manifest.gameId,
    winner: manifest.winner,
    eventCount: manifest.eventCount,
    generatedAt: manifest.generatedAt,
    networkLabel: manifest.networkLabel,
    storageMode: manifest.storageMode,
    manifestPath: file,
    registry: manifest.registry
  });
}
entries.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
await writeFile('web/data/game-index.json', `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Indexed ${entries.length} games.`);
