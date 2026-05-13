const mantleTxBase = 'https://sepolia.mantlescan.xyz/tx/';
const mantleAddressBase = 'https://sepolia.mantlescan.xyz/address/';

const $ = (id) => document.getElementById(id);
const setText = (id, value) => { $(id).textContent = value ?? '—'; };

let gameIndex = [];
let currentGameId = null;

async function loadGameIndex() {
  const response = await fetch('./data/game-index.json', { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

async function loadManifestByPath(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load manifest ${path}: ${response.status}`);
  return response.json();
}

async function loadLatestDemo() {
  const response = await fetch('./data/latest-demo.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load latest-demo.json: ${response.status}`);
  return response.json();
}

function renderChecklist(items = []) {
  const list = $('checklist');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
}

function renderTimeline(items = []) {
  const list = $('timeline');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `<div><strong>${item.title}</strong><span>${item.description}</span></div>`;
    list.appendChild(li);
  }
}

function renderAgentMemories(memories = {}) {
  const root = $('agentMemoryList');
  root.innerHTML = '';
  const entries = Object.values(memories);
  if (entries.length === 0) {
    root.innerHTML = '<p class="muted">No agent memory snapshot attached for this replay.</p>';
    return;
  }
  for (const memory of entries) {
    const card = document.createElement('article');
    card.className = 'memory-card';
    card.innerHTML = `
      <div class="memory-head">
        <strong>${memory.displayName}</strong>
        <span>${memory.personaId || 'unknown persona'} · ${memory.outcome} · ${memory.survived ? 'survived' : 'died'}</span>
      </div>
      <p>${(memory.keyTakeaways || []).join(' ')}</p>
      <small>Suspicion: ${(memory.suspicionTargets || []).join(', ') || '—'}<br/>Trust: ${(memory.trustTargets || []).join(', ') || '—'}</small>
    `;
    root.appendChild(card);
  }
}

function bindTx(linkId, txHash, txUrl, fallbackText = 'No tx yet') {
  const el = $(linkId);
  if (txHash && typeof txHash === 'string' && txHash.startsWith('0x')) {
    el.href = txUrl || `${mantleTxBase}${txHash}`;
    el.textContent = `View tx ${txHash.slice(0, 10)}…`;
  } else {
    el.removeAttribute('href');
    el.textContent = fallbackText;
  }
}

function addressLink(address, label = address) {
  if (!address || typeof address !== 'string' || !address.startsWith('0x')) return label || 'Not linked';
  return `<a href="${mantleAddressBase}${address}" target="_blank" rel="noreferrer">${label}</a>`;
}

function renderGameList() {
  const root = $('gameList');
  root.innerHTML = '';
  $('gameCountPill').textContent = `${gameIndex.length} games`;
  for (const item of gameIndex) {
    const button = document.createElement('button');
    button.className = `game-item${item.gameId === currentGameId ? ' active' : ''}`;
    button.dataset.gameId = item.gameId;
    button.innerHTML = `
      <strong>${item.gameId}</strong>
      <span>${item.networkLabel} · ${item.winner} · ${item.eventCount} events</span>
      <small>${item.registry ?? 'No registry'}</small>
    `;
    root.appendChild(button);
  }
}

function render(data) {
  currentGameId = data.gameId;
  renderGameList();
  setText('networkLabel', data.networkLabel);
  setText('storageMode', data.storageMode);
  setText('gameId', data.gameId);
  setText('winner', data.winner);
  setText('eventCount', String(data.eventCount ?? '—'));
  setText('engineLabel', data.engine);
  setText('modelProviderLabel', data.modelProvider || '—');
  setText('registryLabel', data.registry);

  setText('transcriptRoot', data.transcript?.root);
  setText('auditRoot', data.auditTranscript?.root);
  setText('summaryRoot', data.summary?.root);
  setText('agentMemoryRoot', data.agentMemories?.root);

  $('agentRegistryAddress').innerHTML = addressLink(data.chain?.agentRegistryAddress, data.chain?.agentRegistryAddress || 'Not linked');
  $('actionRegistryAddress').innerHTML = addressLink(data.chain?.actionRegistryAddress, data.chain?.actionRegistryAddress || 'Not linked');
  $('settlementVaultAddress').innerHTML = addressLink(data.chain?.settlementVaultAddress, data.chain?.settlementVaultAddress || 'Not linked');
  setText('gameKey', data.chain?.gameKey || '—');
  setText('recordedActionCount', data.chain?.recordedActionCount == null ? '—' : String(data.chain.recordedActionCount));
  bindTx('createTx', data.chain?.createTxHash, data.chain?.createTxUrl, 'No create tx');
  bindTx('chainTx', data.chain?.txHash, data.chain?.txUrl, 'No finalize tx');

  renderChecklist(data.verificationChecklist || []);
  renderTimeline(data.replayPreview || []);
  renderAgentMemories(data.agentMemoryPreview || {});
}

async function boot() {
  gameIndex = await loadGameIndex();
  const latest = await loadLatestDemo().catch(() => null);
  if (latest?.gameId) render(latest);
  else render({ gameId: 'No game loaded', networkLabel: 'Local Dev', storageMode: 'Local JSON artifacts', verificationChecklist: [], replayPreview: [] });

  $('gameList').addEventListener('click', async (event) => {
    const item = event.target.closest('.game-item');
    if (!item) return;
    const meta = gameIndex.find((g) => g.gameId === item.dataset.gameId);
    if (!meta?.manifestPath) return;
    render(await loadManifestByPath(meta.manifestPath));
  });
}

boot().catch((err) => {
  console.error(err);
  setText('gameId', `Dashboard error: ${err.message}`);
});
