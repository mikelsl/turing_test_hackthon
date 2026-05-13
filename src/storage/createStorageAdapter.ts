import type { StorageAdapter } from './StorageAdapter.js';
import { LocalStorageAdapter } from './LocalStorageAdapter.js';

export function createStorageAdapter(): StorageAdapter {
  const backend = process.env.ARTIFACT_BACKEND ?? 'local';
  if (backend === 'local') return new LocalStorageAdapter(process.env.ARTIFACTS_DIR ?? './artifacts');
  throw new Error(`Unsupported ARTIFACT_BACKEND: ${backend}`);
}
