export interface StoredArtifact {
  uri: string;
  root: string;
  txHash?: string;
  localSha256?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageAdapter {
  putJson(path: string, value: unknown): Promise<StoredArtifact>;
}
