import { EthersMantleArenaAdapter, MockMantleArenaAdapter, mantleConfigFromEnv, type MantleArenaAdapter } from './MantleArenaAdapter.js';

export function createMantleArenaAdapter(): MantleArenaAdapter {
  const backend = (process.env.MANTLE_BACKEND ?? '').trim().toLowerCase();
  if (backend === 'mock' || backend === '') return new MockMantleArenaAdapter();
  if (backend === 'sepolia' || backend === 'mantle-sepolia' || backend === 'ethers') {
    const config = mantleConfigFromEnv();
    if (!config) throw new Error('Mantle backend requested but AGENT_ACTION_REGISTRY_ADDRESS and MANTLE_PRIVATE_KEY/PRIVATE_KEY are not configured');
    return new EthersMantleArenaAdapter(config);
  }
  throw new Error(`Unsupported MANTLE_BACKEND: ${backend}`);
}
