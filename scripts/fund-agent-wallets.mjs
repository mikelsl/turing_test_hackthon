#!/usr/bin/env node
import { ethers } from 'ethers';
import 'dotenv/config';

const MANTLE_RPC = process.env.MANTLE_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
const OPERATOR_KEY = process.env.TELEGRAM_WAGER_OPERATOR_PRIVATE_KEY || process.env.HUMAN_WALLET_PRIVATE_KEY || process.env.MANTLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
const AGENT_KEYS = (process.env.AGENT_WALLET_PRIVATE_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
const FUND_AMOUNT = process.env.BULK_FUND_AMOUNT_MNT || '0.5'; // 0.5 MNT per wallet, enough for ~10 games
const MIN_BALANCE = process.env.BULK_FUND_MIN_MNT || '0.1'; // Only fund if below 0.1 MNT

if (!OPERATOR_KEY) {
  console.error('❌ Missing operator private key');
  process.exit(1);
}

if (AGENT_KEYS.length === 0) {
  console.error('❌ No AGENT_WALLET_PRIVATE_KEYS found');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(MANTLE_RPC, 5003);
const operator = new ethers.Wallet(OPERATOR_KEY, provider);
const fundAmount = ethers.parseEther(FUND_AMOUNT);
const minBalance = ethers.parseEther(MIN_BALANCE);

console.log('💰 Bulk funding agent wallets for Turing MindGames');
console.log(`Operator: ${operator.address}`);
console.log(`Fund amount: ${FUND_AMOUNT} MNT per wallet`);
console.log(`Min balance threshold: ${MIN_BALANCE} MNT`);
console.log(`Agent wallets: ${AGENT_KEYS.length}`);
console.log('');

const operatorBalance = await provider.getBalance(operator.address);
console.log(`Operator balance: ${ethers.formatEther(operatorBalance)} MNT`);
console.log('');

const funded = [];
const skipped = [];

for (let i = 0; i < AGENT_KEYS.length; i++) {
  const wallet = new ethers.Wallet(AGENT_KEYS[i], provider);
  const balance = await provider.getBalance(wallet.address);
  const balanceMnt = ethers.formatEther(balance);
  
  console.log(`Agent ${i + 1}: ${wallet.address}`);
  console.log(`  Current: ${balanceMnt} MNT`);
  
  if (balance < minBalance) {
    console.log(`  ⬆️  Funding with ${FUND_AMOUNT} MNT...`);
    const tx = await operator.sendTransaction({
      to: wallet.address,
      value: fundAmount
    });
    console.log(`  TX: ${tx.hash}`);
    await tx.wait();
    const newBalance = await provider.getBalance(wallet.address);
    console.log(`  ✅ New balance: ${ethers.formatEther(newBalance)} MNT`);
    funded.push({ address: wallet.address, tx: tx.hash });
  } else {
    console.log(`  ✅ Sufficient balance, skipping`);
    skipped.push(wallet.address);
  }
  console.log('');
}

console.log('📊 Summary:');
console.log(`  Funded: ${funded.length} wallets`);
console.log(`  Skipped: ${skipped.length} wallets`);
console.log('');

if (funded.length > 0) {
  console.log('💸 Funded transactions:');
  funded.forEach(({ address, tx }) => {
    console.log(`  ${address}: https://sepolia.mantlescan.xyz/tx/${tx}`);
  });
}
