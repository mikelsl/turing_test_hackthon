import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { StorageAdapter, StoredArtifact } from './StorageAdapter.js';
import { sha256Json } from '../utils/hash.js';

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir = './artifacts') {}

  async putJson(path: string, value: unknown): Promise<StoredArtifact> {
    const fullPath = resolve(this.baseDir, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, JSON.stringify(value, null, 2));
    return { uri: fullPath, root: sha256Json(value) };
  }
}
