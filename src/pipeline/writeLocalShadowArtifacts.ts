import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export async function writeLocalShadowArtifact(relativePath: string, value: unknown): Promise<string> {
  const fullPath = resolve('artifacts', relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`);
  return fullPath;
}
