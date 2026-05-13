const params = new URLSearchParams(location.search);
const cfg = {
  gameId: params.get('gameId') || '',
  gameKey: params.get('gameKey') || '',
  vault: params.get('vault') || '',
  bond: params.get('bond') || '0.001',
  playerId: params.get('playerId') || 'human',
  expectedAddress: (params.get('address') || '').toLowerCase()
};

const $ = (id) => document.getElementById(id);
$('gameId').textContent = cfg.gameId;
$('playerId').textContent = cfg.playerId;
$('address').textContent = cfg.expectedAddress || 'Any connected wallet';
$('vault').textContent = cfg.vault;
$('gameKey').textContent = cfg.gameKey;
$('bond').textContent = cfg.bond;

const abi = ['function depositBond(bytes32 gameId) payable', 'function bondOf(bytes32 gameId,address participant) view returns (uint256)'];
const chain = {
  chainId: '0x138b',
  chainName: 'Mantle Sepolia Testnet',
  nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls: ['https://rpc.sepolia.mantle.xyz'],
  blockExplorerUrls: ['https://sepolia.mantlescan.xyz']
};

function setStatus(text, cls = 'warn') {
  $('status').className = cls;
  $('status').textContent = text;
}

function parseEther(value) {
  const [whole, frac = ''] = String(value).split('.');
  return '0x' + (BigInt(whole || '0') * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18))).toString(16);
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function getMobileDeepLink() {
  const currentUrl = window.location.href;
  return `https://metamask.app.link/dapp/${encodeURIComponent(currentUrl)}`;
}

async function request(method, params) {
  if (!window.ethereum) {
    throw new Error('MetaMask not found. Please install MetaMask extension (desktop/laptop browsers only). Mobile payment is not currently supported.');
  }
  return window.ethereum.request({ method, params });
}

async function connect() {
  const accounts = await request('eth_requestAccounts');
  const account = accounts[0];
  if (!account) throw new Error('No account selected');
  if (cfg.expectedAddress && account.toLowerCase() !== cfg.expectedAddress) {
    setStatus(`Connected ${account}, but Telegram expects ${cfg.expectedAddress}. Switch account or update /wallet.`, 'err');
    return account;
  }
  setStatus(`Connected ${account}`, 'ok');
  return account;
}

async function switchChain() {
  try {
    await request('wallet_switchEthereumChain', [{ chainId: chain.chainId }]);
  } catch (err) {
    if (err?.code === 4902) await request('wallet_addEthereumChain', [chain]);
    else throw err;
  }
  setStatus('Mantle Sepolia selected.', 'ok');
}

function encodeDepositBond(gameKey) {
  // depositBond(bytes32) selector = first 4 bytes of keccak256("depositBond(bytes32)").
  // Precomputed to avoid bundling ethers in the static page.
  const selector = '0xf5148c24';
  return selector + gameKey.replace(/^0x/, '').padStart(64, '0');
}

async function deposit() {
  const [account] = await request('eth_requestAccounts');
  if (cfg.expectedAddress && account.toLowerCase() !== cfg.expectedAddress) throw new Error(`Wrong wallet. Expected ${cfg.expectedAddress}`);
  await switchChain();
  const txHash = await request('eth_sendTransaction', [{
    from: account,
    to: cfg.vault,
    value: parseEther(cfg.bond),
    data: encodeDepositBond(cfg.gameKey)
  }]);
  const url = `https://sepolia.mantlescan.xyz/tx/${txHash}`;
  $('txLine').innerHTML = `Tx sent: <a href="${url}" target="_blank" rel="noreferrer">${txHash.slice(0, 10)}…${txHash.slice(-6)}</a>`;
  setStatus('Tx submitted. Return to Telegram; the bot will continue after confirmation.', 'ok');
}

$('connectBtn').onclick = () => connect().catch((e) => setStatus(e.message, 'err'));
$('switchBtn').onclick = () => switchChain().catch((e) => setStatus(e.message, 'err'));
$('depositBtn').onclick = () => deposit().catch((e) => setStatus(e.message, 'err'));

if (!/^0x[0-9a-fA-F]{64}$/.test(cfg.gameKey) || !/^0x[0-9a-fA-F]{40}$/.test(cfg.vault)) {
  setStatus('Invalid deposit link. Return to Telegram and generate a new game.', 'err');
}
