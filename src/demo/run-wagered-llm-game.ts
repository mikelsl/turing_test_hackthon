import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ethers } from 'ethers';
import { WerewolfEngine } from '../engine/WerewolfEngine.js';
import { QueuedHumanActionProvider } from '../engine/QueuedHumanActionProvider.js';
import { createComputeAdapter } from '../compute/createComputeAdapter.js';
import { createStorageAdapter } from '../storage/createStorageAdapter.js';
import { createMantleArenaAdapter } from '../mantle/createMantleArenaAdapter.js';
import { persistGameArtifacts } from '../pipeline/persistGameArtifacts.js';
import { writeLocalShadowArtifact } from '../pipeline/writeLocalShadowArtifacts.js';
import { shuffle } from '../utils/random.js';
import type { Camp, Player } from '../types/game.js';

const DEFAULT_AGENT_PLAYERS: Array<Omit<Player, 'role' | 'alive'>> = [
  { id: 'a1', displayName: 'Ada', kind: 'agent', agentPersonaId: 'analyst' },
  { id: 'a2', displayName: 'Charm', kind: 'agent', agentPersonaId: 'charmer' },
  { id: 'a3', displayName: 'Riot', kind: 'agent', agentPersonaId: 'chaos-wolf' },
  { id: 'a4', displayName: 'Shade', kind: 'agent', agentPersonaId: 'silent-killer' },
  { id: 'a5', displayName: 'Mira', kind: 'agent', agentPersonaId: 'empath' }
];

interface WalletParticipant {
  playerId: string;
  label: string;
  wallet: ethers.Wallet;
}

const rpcUrl = process.env.MANTLE_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
const provider = new ethers.JsonRpcProvider(rpcUrl, 5003);
const humanPrivateKey = process.env.HUMAN_WALLET_PRIVATE_KEY || process.env.MANTLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
const agentPrivateKeys = (process.env.AGENT_WALLET_PRIVATE_KEYS || '').split(',').map((item) => item.trim()).filter(Boolean);
const settlementVaultAddress = process.env.GAME_SETTLEMENT_VAULT_ADDRESS;
const bondMnt = process.env.WAGER_BOND_MNT || '0.001';
const minAgentGasMnt = process.env.MIN_AGENT_GAS_MNT || '0.03';
const agentFundMnt = process.env.AGENT_FUND_MNT || '0.05';

if (!humanPrivateKey) throw new Error('Missing HUMAN_WALLET_PRIVATE_KEY or MANTLE_PRIVATE_KEY');
if (agentPrivateKeys.length !== 5) throw new Error(`Expected 5 AGENT_WALLET_PRIVATE_KEYS, got ${agentPrivateKeys.length}`);
if (!settlementVaultAddress) throw new Error('Missing GAME_SETTLEMENT_VAULT_ADDRESS');

const humanWallet = new ethers.Wallet(humanPrivateKey, provider);
const agentWallets = agentPrivateKeys.map((key) => new ethers.Wallet(key, provider));
const participants: WalletParticipant[] = [
  { playerId: 'u-vault', label: 'Vault Human', wallet: humanWallet },
  ...agentWallets.map((wallet, index) => ({ playerId: `a${index + 1}`, label: DEFAULT_AGENT_PLAYERS[index].displayName, wallet }))
];

const vaultArtifact = JSON.parse(await readFile('artifacts/contracts/GameSettlementVault.json', 'utf8'));
const settlementVault = new ethers.Contract(settlementVaultAddress, vaultArtifact.abi, humanWallet);

function pickTarget(pending: ReturnType<QueuedHumanActionProvider['listPending']>[number], players: Player[]): string {
  const allowed = pending.allowedTargetIds?.length
    ? players.filter((player) => pending.allowedTargetIds?.includes(player.id))
    : players.filter((player) => player.alive && player.id !== pending.playerId);
  return (allowed[0] ?? players.find((player) => player.id !== pending.playerId) ?? players[0]).id;
}

function startAutoHuman(humans: QueuedHumanActionProvider, getPlayers: () => Player[] | undefined): NodeJS.Timeout {
  let speechNo = 0;
  return setInterval(() => {
    const players = getPlayers();
    if (!players) return;
    for (const pending of humans.listPending()) {
      if (pending.type === 'speech') {
        speechNo++;
        humans.submitSpeech(pending.playerId, `Vault Judge: live wager test #${speechNo}. I am probing contradictions and asking agents to justify their votes.`);
      } else if (pending.type === 'vote') {
        humans.submitVote(pending.playerId, pickTarget(pending, players));
      } else if (pending.type === 'nightKill') {
        humans.submitNightKill(pending.playerId, pickTarget(pending, players.filter((player) => player.role !== 'wolf')));
      } else if (pending.type === 'seerCheck') {
        humans.submitSeerCheck(pending.playerId, pickTarget(pending, players));
      }
    }
  }, 100);
}

function winnersForCamp(players: Player[], winner: Camp): WalletParticipant[] {
  return participants.filter((participant) => {
    const player = players.find((item) => item.id === participant.playerId);
    if (!player) return false;
    return winner === 'wolves' ? player.role === 'wolf' : player.role !== 'wolf';
  });
}

async function balance(wallet: ethers.Wallet): Promise<string> {
  return ethers.formatEther(await provider.getBalance(wallet.address));
}

async function ensureAgentGas(): Promise<Array<{ label: string; address: string; before: string; fundTx?: string; after: string }>> {
  const min = ethers.parseEther(minAgentGasMnt);
  const amount = ethers.parseEther(agentFundMnt);
  const results = [];
  for (const participant of participants.slice(1)) {
    const beforeWei = await provider.getBalance(participant.wallet.address);
    let fundTx: string | undefined;
    if (beforeWei < min) {
      const tx = await humanWallet.sendTransaction({ to: participant.wallet.address, value: amount });
      fundTx = tx.hash;
      await tx.wait();
    }
    results.push({ label: participant.label, address: participant.wallet.address, before: ethers.formatEther(beforeWei), fundTx, after: await balance(participant.wallet) });
  }
  return results;
}

async function depositBonds(gameKey: string): Promise<Array<{ label: string; address: string; txHash: string }>> {
  const bond = ethers.parseEther(bondMnt);
  const deposits = [];
  for (const participant of participants) {
    const tx = await (settlementVault.connect(participant.wallet) as ethers.Contract).depositBond(gameKey, { value: bond });
    await tx.wait();
    deposits.push({ label: participant.label, address: participant.wallet.address, txHash: tx.hash });
  }
  return deposits;
}

async function claimRewards(gameKey: string, winners: WalletParticipant[]): Promise<Array<{ label: string; address: string; txHash: string }>> {
  const claims = [];
  for (const winner of winners) {
    const tx = await (settlementVault.connect(winner.wallet) as ethers.Contract).claim(gameKey);
    await tx.wait();
    claims.push({ label: winner.label, address: winner.wallet.address, txHash: tx.hash });
  }
  return claims;
}

const network = await provider.getNetwork();
if (network.chainId !== 5003n) throw new Error(`Expected Mantle Sepolia chainId 5003, got ${network.chainId}`);

const gameId = `wager-live-${Date.now()}`;
const gameKey = ethers.id(`turing-mindgames:game:${gameId}`);
const fundResults = await ensureAgentGas();
const depositTxs = await depositBonds(gameKey);

const humans = new QueuedHumanActionProvider();
const compute = createComputeAdapter();
const engine = new WerewolfEngine(compute, humans);
const storage = createStorageAdapter();
const chain = createMantleArenaAdapter();
const players = shuffle([
  { id: 'u-vault', displayName: 'Vault Judge', kind: 'human' as const },
  ...DEFAULT_AGENT_PLAYERS
].slice(0, 6));
const initial = engine.createGame(gameId, players);
let latestPlayers: Player[] | undefined = initial.players;
const autoHuman = startAutoHuman(humans, () => latestPlayers);

try {
  const { state, summary } = await engine.runToEnd(initial, Number(process.env.DEMO_MAX_ROUNDS ?? 2));
  latestPlayers = state.players;

  await writeLocalShadowArtifact(`${gameId}/transcript.json`, state.events);
  await writeLocalShadowArtifact(`${gameId}/summary.raw.json`, summary);
  if (summary.agentMemories) await writeLocalShadowArtifact('latest-agent-memories.json', summary.agentMemories);
  const rawTranscriptArtifact = await storage.putJson(`${gameId}/transcript.json`, state.events);
  const rawSummaryArtifact = await storage.putJson(`${gameId}/summary.raw.json`, summary);
  const chainRecord = await chain.finalizeGame(state, summary, rawTranscriptArtifact.root, rawSummaryArtifact.root);
  const persisted = await persistGameArtifacts(storage, state, summary, chainRecord, {
    manifestPath: `artifacts/${gameId}/replay-manifest.json`,
    latestManifestPath: (process.env.UPDATE_LATEST_REPLAY ?? 'true') !== 'false' ? 'web/data/latest-demo.json' : undefined,
    engine: `Wagered live game: ${process.env.LLM_BACKEND || 'mock'} + Vault auto-human`,
    rawTranscriptArtifact,
    rawSummaryArtifact
  });

  const winners = winnersForCamp(state.players, summary.winner);
  const settleTx = await settlementVault.settle(gameKey, ethers.id(summary.winner), winners.map((winner) => winner.wallet.address), rawSummaryArtifact.root);
  await settleTx.wait();
  const claimTxs = await claimRewards(gameKey, winners);
  const poolInfo = await settlementVault.poolInfo(gameKey);
  const bondChecks = [];
  for (const participant of participants) {
    bondChecks.push({
      playerId: participant.playerId,
      label: participant.label,
      address: participant.wallet.address,
      bond: ethers.formatEther(await settlementVault.bondOf(gameKey, participant.wallet.address)),
      isWinner: await settlementVault.isWinner(gameKey, participant.wallet.address),
      claimed: await settlementVault.isClaimed(gameKey, participant.wallet.address),
      finalBalance: await balance(participant.wallet)
    });
  }

  const evidence = {
    gameId,
    gameKey,
    settlementVaultAddress,
    bondMnt,
    totalBondMnt: ethers.formatEther(poolInfo[0]),
    finalized: poolInfo[1],
    winner: summary.winner,
    winningTeamHash: poolInfo[2],
    participantCount: Number(poolInfo[3]),
    players: state.players.map((player) => ({ id: player.id, name: player.displayName, kind: player.kind, role: player.role, alive: player.alive })),
    fundResults,
    depositTxs,
    chainRecord,
    settleTxHash: settleTx.hash,
    claimTxs,
    bondChecks,
    artifacts: {
      replayManifest: `artifacts/${gameId}/replay-manifest.json`,
      publicTranscriptRoot: persisted.publicTranscriptArtifact.root,
      privateAuditRoot: persisted.privateAuditTranscriptArtifact.root,
      summaryRoot: persisted.summaryArtifact.root
    },
    eventCount: state.events.length
  };
  const evidencePath = `artifacts/${gameId}/wager-evidence.json`;
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, evidencePath, ...evidence }, null, 2));
} finally {
  clearInterval(autoHuman);
}
