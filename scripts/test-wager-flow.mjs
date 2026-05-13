import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';

const rpcUrl = process.env.MANTLE_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
const primaryKey = process.env.MANTLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
const secondaryKey = process.env.SECONDARY_MANTLE_PRIVATE_KEY;
const fundSecondary = process.env.FUND_SECONDARY_MNT || '0';
const bondAmount = process.env.WAGER_BOND_MNT || '0.001';

if (!primaryKey) throw new Error('Missing MANTLE_PRIVATE_KEY or PRIVATE_KEY');
if (!secondaryKey) throw new Error('Missing SECONDARY_MANTLE_PRIVATE_KEY');

const provider = new ethers.JsonRpcProvider(rpcUrl, 5003);
const primary = new ethers.Wallet(primaryKey, provider);
const secondary = new ethers.Wallet(secondaryKey, provider);

const deployment = JSON.parse(await readFile('deployments/mantle-sepolia.json', 'utf8'));
const vaultAddress = deployment.contracts?.GameSettlementVault?.address;
if (!vaultAddress) throw new Error('Missing GameSettlementVault deployment');
const artifact = JSON.parse(await readFile('artifacts/contracts/GameSettlementVault.json', 'utf8'));
const primaryVault = new ethers.Contract(vaultAddress, artifact.abi, primary);
const secondaryVault = primaryVault.connect(secondary);

const network = await provider.getNetwork();
if (network.chainId !== 5003n) throw new Error(`Expected Mantle Sepolia chainId 5003, got ${network.chainId}`);

async function logBalance(label, wallet) {
  const bal = await provider.getBalance(wallet.address);
  console.log(`[balance] ${label} ${wallet.address} ${ethers.formatEther(bal)} MNT`);
}

console.log(`[wager] vault=${vaultAddress}`);
await logBalance('primary', primary);
await logBalance('secondary', secondary);

const fundAmount = ethers.parseEther(fundSecondary);
if (fundAmount > 0n) {
  const before = await provider.getBalance(secondary.address);
  if (before < ethers.parseEther('0.01')) {
    const tx = await primary.sendTransaction({ to: secondary.address, value: fundAmount });
    console.log(`[fund] tx=${tx.hash} amount=${fundSecondary} MNT`);
    await tx.wait();
    await logBalance('secondary-after-fund', secondary);
  } else {
    console.log('[fund] skipped: secondary already has >=0.01 MNT');
  }
}

const gameId = ethers.id(`wager-smoke-${Date.now()}`);
const bond = ethers.parseEther(bondAmount);
const winningTeam = ethers.id('villagers');
const summaryHash = ethers.id(`wager smoke summary ${new Date().toISOString()}`);

console.log(`[wager] gameId=${gameId} bond=${bondAmount} MNT winner=${secondary.address}`);

let tx = await primaryVault.depositBond(gameId, { value: bond });
console.log(`[deposit] primary tx=${tx.hash}`);
await tx.wait();

tx = await secondaryVault.depositBond(gameId, { value: bond });
console.log(`[deposit] secondary tx=${tx.hash}`);
await tx.wait();

const primaryBond = await primaryVault.bondOf(gameId, primary.address);
const secondaryBond = await primaryVault.bondOf(gameId, secondary.address);
console.log(`[bondOf] primary=${ethers.formatEther(primaryBond)} secondary=${ethers.formatEther(secondaryBond)} MNT`);

tx = await primaryVault.settle(gameId, winningTeam, [secondary.address], summaryHash);
console.log(`[settle] tx=${tx.hash}`);
await tx.wait();

tx = await secondaryVault.claim(gameId);
console.log(`[claim] secondary tx=${tx.hash}`);
await tx.wait();

await logBalance('primary-final', primary);
await logBalance('secondary-final', secondary);
console.log(JSON.stringify({
  gameId,
  vaultAddress,
  primary: primary.address,
  secondary: secondary.address,
  bondMnt: bondAmount,
  winningTeam,
  winner: secondary.address,
}, null, 2));
