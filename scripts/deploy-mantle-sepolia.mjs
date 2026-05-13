import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ethers } from 'ethers';

const rpcUrl = process.env.MANTLE_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
const privateKey = process.env.MANTLE_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!privateKey) throw new Error('Missing MANTLE_PRIVATE_KEY or PRIVATE_KEY');

const provider = new ethers.JsonRpcProvider(rpcUrl, 5003);
const wallet = new ethers.Wallet(privateKey, provider);

async function loadArtifact(name) {
  return JSON.parse(await readFile(`artifacts/contracts/${name}.json`, 'utf8'));
}

const outPath = 'deployments/mantle-sepolia.json';

async function readExistingDeployment() {
  try {
    return JSON.parse(await readFile(outPath, 'utf8'));
  } catch {
    return undefined;
  }
}

async function hasCode(address) {
  if (!address) return false;
  const code = await provider.getCode(address);
  return code !== '0x';
}

async function writeDeployment(out) {
  await mkdir('deployments', { recursive: true });
  await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`);
}

function shouldForceDeploy(name) {
  const force = process.env.FORCE_DEPLOY_CONTRACTS || process.env.FORCE_REDEPLOY_CONTRACTS || '';
  return force.split(',').map((item) => item.trim()).filter(Boolean).includes(name);
}

async function deploy(name, existing, ...args) {
  const prior = existing?.contracts?.[name];
  if (!shouldForceDeploy(name) && prior?.address && await hasCode(prior.address)) {
    console.log(`[deploy] ${name} already deployed address=${prior.address}`);
    return prior;
  }
  if (shouldForceDeploy(name) && prior?.address) console.log(`[deploy] ${name} force redeploy requested; previous=${prior.address}`);

  const artifact = await loadArtifact(name);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  console.log(`[deploy] ${name} tx=${tx?.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = tx ? await tx.wait() : undefined;
  console.log(`[deploy] ${name} address=${address}`);
  return { name, address, txHash: tx?.hash, blockNumber: receipt?.blockNumber };
}

const network = await provider.getNetwork();
const balance = await provider.getBalance(wallet.address);
console.log(`[mantle] deployer=${wallet.address} chainId=${network.chainId} balance=${ethers.formatEther(balance)} MNT`);
if (network.chainId !== 5003n) throw new Error(`Expected Mantle Sepolia chainId 5003, got ${network.chainId}`);

const existing = await readExistingDeployment();
const out = existing ?? {
  network: 'mantle-sepolia',
  chainId: 5003,
  rpcUrl,
  deployer: wallet.address,
  generatedAt: new Date().toISOString(),
  contracts: {}
};
out.rpcUrl = rpcUrl;
out.deployer = wallet.address;
out.updatedAt = new Date().toISOString();
out.contracts ??= {};

for (const name of ['AgentRegistry', 'AgentActionRegistry', 'GameSettlementVault']) {
  try {
    const deployment = await deploy(name, out);
    out.contracts[name] = deployment;
    delete out.blocked?.[name];
    await writeDeployment(out);
  } catch (error) {
    out.partial = true;
    out.blocked ??= {};
    out.blocked[name] = error?.shortMessage || error?.message || String(error);
    await writeDeployment(out);
    throw error;
  }
}

out.partial = false;
delete out.blocked;
await writeDeployment(out);

console.log(`[deploy] wrote ${outPath}`);
console.log(JSON.stringify(out, null, 2));
