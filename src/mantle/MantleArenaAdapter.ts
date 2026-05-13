import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';
import type { GameEvent, GameSummary, GameState, Player } from '../types/game.js';
import { sha256Json } from '../utils/hash.js';

export interface MantleArenaRecord {
  txHash: string;
  createTxHash?: string;
  gameId: string;
  gameKey?: string;
  agentRegistryAddress?: string;
  actionRegistryAddress?: string;
  settlementVaultAddress?: string;
  transcriptRoot: string;
  summaryRoot: string;
  reputationRoot?: string;
  recordedActionCount?: number;
}

export interface MantleArenaAdapter {
  finalizeGame(state: GameState, summary: GameSummary, transcriptRoot: string, summaryRoot: string): Promise<MantleArenaRecord>;
}

export class MockMantleArenaAdapter implements MantleArenaAdapter {
  async finalizeGame(state: GameState, _summary: GameSummary, transcriptRoot: string, summaryRoot: string): Promise<MantleArenaRecord> {
    return {
      txHash: `mock-mantle-tx-${state.id}`,
      gameId: state.id,
      transcriptRoot,
      summaryRoot,
      recordedActionCount: state.events.filter((event) => event.actorId).length
    };
  }
}

interface MantleContractAddresses {
  agentRegistryAddress?: string;
  actionRegistryAddress: string;
  settlementVaultAddress?: string;
}

interface MantleArenaAdapterOptions extends MantleContractAddresses {
  rpcUrl: string;
  privateKey: string;
  actionLimit: number;
}

interface ContractArtifact {
  abi: ethers.InterfaceAbi;
  bytecode?: string;
}

export class EthersMantleArenaAdapter implements MantleArenaAdapter {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private actionRegistry?: ethers.Contract;

  constructor(private readonly options: MantleArenaAdapterOptions) {
    this.provider = new ethers.JsonRpcProvider(options.rpcUrl, 5003);
    this.wallet = new ethers.Wallet(options.privateKey, this.provider);
  }

  async finalizeGame(state: GameState, summary: GameSummary, transcriptRoot: string, summaryRoot: string): Promise<MantleArenaRecord> {
    const registry = await this.getActionRegistry();
    const gameKey = this.gameKey(state.id);
    const metadataHash = this.bytes32Hash({ gameId: state.id, createdAt: state.createdAt, playerCount: state.players.length });
    const createTx = await registry.createGame(gameKey, metadataHash);
    await createTx.wait();

    const actionEvents = state.events.filter((event) => event.actorId && this.isAgentActor(state.players, event.actorId));
    const selectedEvents = this.options.actionLimit > 0 ? actionEvents.slice(0, this.options.actionLimit) : actionEvents;
    let lastTxHash = createTx.hash;
    for (const event of selectedEvents) {
      const tx = await registry.recordAgentAction(
        gameKey,
        this.agentKey(event.actorId),
        this.labelKey(event.phase),
        this.labelKey(event.type),
        this.bytes32Hash(this.publicActionPayload(event)),
        this.bytes32Hash({ privateNote: event.privateNote ?? null }),
        this.bytes32Hash(this.stateSnapshot(state, event)),
        this.labelKey(this.modelLabel())
      );
      await tx.wait();
      lastTxHash = tx.hash;
    }

    const reputationRoot = this.bytes32Hash(summary.reputationDeltas);
    const finalizeTx = await registry.finalizeGame(
      gameKey,
      this.labelKey(summary.winner),
      this.toBytes32(summaryRoot),
      reputationRoot
    );
    await finalizeTx.wait();

    return {
      txHash: finalizeTx.hash || lastTxHash,
      createTxHash: createTx.hash,
      gameId: state.id,
      gameKey,
      agentRegistryAddress: this.options.agentRegistryAddress,
      actionRegistryAddress: this.options.actionRegistryAddress,
      settlementVaultAddress: this.options.settlementVaultAddress,
      transcriptRoot,
      summaryRoot,
      reputationRoot,
      recordedActionCount: selectedEvents.length
    };
  }

  private async getActionRegistry(): Promise<ethers.Contract> {
    if (this.actionRegistry) return this.actionRegistry;
    const artifact = await this.loadArtifact('AgentActionRegistry');
    this.actionRegistry = new ethers.Contract(this.options.actionRegistryAddress, artifact.abi, this.wallet);
    return this.actionRegistry;
  }

  private async loadArtifact(name: string): Promise<ContractArtifact> {
    return JSON.parse(await readFile(`artifacts/contracts/${name}.json`, 'utf8')) as ContractArtifact;
  }

  private isAgentActor(players: Player[], actorId?: string): boolean {
    return players.some((player) => player.id === actorId && player.kind === 'agent');
  }

  private publicActionPayload(event: GameEvent): Record<string, unknown> {
    return {
      eventId: event.id,
      gameId: event.gameId,
      round: event.round,
      phase: event.phase,
      type: event.type,
      actorId: event.actorId,
      targetId: event.targetId,
      publicText: event.publicText ?? null,
      createdAt: event.createdAt
    };
  }

  private stateSnapshot(state: GameState, event: GameEvent): Record<string, unknown> {
    return {
      gameId: state.id,
      eventId: event.id,
      round: event.round,
      phase: event.phase,
      winner: state.winner ?? null,
      alivePlayers: state.players.filter((player) => player.alive).map((player) => player.id)
    };
  }

  private bytes32Hash(value: unknown): string {
    return sha256Json(value);
  }

  private gameKey(gameId: string): string {
    return ethers.id(`turing-mindgames:game:${gameId}`);
  }

  private agentKey(agentId?: string): string {
    return ethers.id(`turing-mindgames:agent:${agentId ?? 'unknown'}`);
  }

  private labelKey(label?: string): string {
    return ethers.id(label ?? 'unknown');
  }

  private toBytes32(value: string): string {
    if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value;
    return ethers.id(value);
  }

  private modelLabel(): string {
    return process.env.ZAI_MODEL || process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'mock';
  }
}

export function mantleConfigFromEnv(): MantleArenaAdapterOptions | undefined {
  const actionRegistryAddress = process.env.AGENT_ACTION_REGISTRY_ADDRESS;
  const privateKey = process.env.MANTLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!actionRegistryAddress || !privateKey) return undefined;
  return {
    rpcUrl: process.env.MANTLE_RPC_URL || 'https://rpc.sepolia.mantle.xyz',
    privateKey,
    actionRegistryAddress,
    agentRegistryAddress: process.env.AGENT_REGISTRY_ADDRESS,
    settlementVaultAddress: process.env.GAME_SETTLEMENT_VAULT_ADDRESS,
    actionLimit: Number(process.env.MANTLE_RECORD_ACTION_LIMIT ?? 12)
  };
}
