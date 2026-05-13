import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';

const contractPaths = process.argv.slice(2);
const defaults = [
  'contracts/AgentRegistry.sol',
  'contracts/AgentActionRegistry.sol',
  'contracts/GameSettlementVault.sol'
];
const files = contractPaths.length ? contractPaths : defaults;
const sources = {};
for (const contractPath of files) {
  sources[path.basename(contractPath)] = { content: await readFile(contractPath, 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors?.filter((e) => e.severity === 'error') ?? [];
if (errors.length) {
  console.error(JSON.stringify(errors, null, 2));
  process.exit(1);
}
await mkdir('artifacts/contracts', { recursive: true });
for (const [fileName, contracts] of Object.entries(output.contracts)) {
  for (const [name, artifact] of Object.entries(contracts)) {
    const out = {
      contractName: name,
      sourceName: fileName,
      abi: artifact.abi,
      bytecode: `0x${artifact.evm.bytecode.object}`
    };
    await writeFile(`artifacts/contracts/${name}.json`, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`Compiled ${name} -> artifacts/contracts/${name}.json`);
  }
}
