import type { MessageType } from './types';
import type { Settings, DomainRule, Color, ProviderPreset } from './types';
import { DEFAULT_SETTINGS, PROVIDERS, COLORS, COLOR_LABELS } from './types';
import { getSettings, saveSettings, getDomainRules, saveDomainRules } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- Tab switching ---
document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab!;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', (p as HTMLElement).dataset.tab === tab));
    try { localStorage.setItem('gtabs-settings-tab', tab); } catch { /* ignore */ }
  });
});
// Restore last tab
try {
  const saved = localStorage.getItem('gtabs-settings-tab');
  if (saved) (document.querySelector(`.tab-btn[data-tab="${saved}"]`) as HTMLButtonElement)?.click();
} catch { /* ignore */ }

const providerGrid = $<HTMLDivElement>('provider-grid');
const keyRow = $<HTMLDivElement>('key-row');
const inExcludePrivateHosts = $<HTMLInputElement>('excludePrivateHosts');
const inExcludedDomains = $<HTMLTextAreaElement>('excludedDomains');
const inApiKey = $<HTMLInputElement>('apiKey');
const modelSelect = $<HTMLSelectElement>('model-select');
const customEndpointRow = $<HTMLDivElement>('custom-endpoint-row');
const modelSelectRow = $<HTMLDivElement>('model-select-row');
const inBaseUrl = $<HTMLInputElement>('base-url');
const inCustomModel = $<HTMLInputElement>('custom-model');
const testBtn = $<HTMLButtonElement>('test-btn');
const signupLink = $<HTMLAnchorElement>('signup-link');
const testResult = $<HTMLSpanElement>('test-result');
const inMaxGroups = $<HTMLInputElement>('maxGroups');
const outMaxGroups = $<HTMLSpanElement>('maxGroupsVal');
const inMaxTitleLength = $<HTMLInputElement>('maxTitleLength');
const outMaxTitleLength = $<HTMLSpanElement>('maxTitleVal');
const inAutoTrigger = $<HTMLInputElement>('autoTrigger');
const inThreshold = $<HTMLInputElement>('threshold');
const outThreshold = $<HTMLSpanElement>('thresholdVal');
const inMergeMode = $<HTMLInputElement>('mergeMode');
const inSilentAutoAdd = $<HTMLInputElement>('silentAutoAdd');
const inAutoPinApps = $<HTMLInputElement>('autoPinApps');
const inSmartUngroup = $<HTMLInputElement>('smartUngroup');
const inStaleTabThresholdHours = $<HTMLInputElement>('staleTabThresholdHours');
const outStale = $<HTMLSpanElement>('staleVal');
const inSpendingCapUSD = $<HTMLInputElement>('spendingCapUSD');
const outSpendingCapUSD = $<HTMLSpanElement>('spendingCapVal');
const inEnableCorrectionTracking = $<HTMLInputElement>('enableCorrectionTracking');
const inEnableRejectionMemory = $<HTMLInputElement>('enableRejectionMemory');
const inEnableGroupDrift = $<HTMLInputElement>('enableGroupDrift');
const inEnablePatternMining = $<HTMLInputElement>('enablePatternMining');
const inGroupDriftThreshold = $<HTMLInputElement>('groupDriftThreshold');
const outDriftThreshold = $<HTMLSpanElement>('driftThresholdVal');
const inReorgSchedule = $<HTMLSelectElement>('reorgSchedule');
const inReorgTime = $<HTMLInputElement>('reorgTime');
const outReorgTime = $<HTMLSpanElement>('reorgTimeVal');
const pinnedContainer = $<HTMLDivElement>('pinned-groups');
const inNewPinnedGroup = $<HTMLInputElement>('new-pinned-group');
const btnAddPinned = $<HTMLButtonElement>('add-pinned');
const rulesContainer = $<HTMLDivElement>('domain-rules');
const btnAddRule = $<HTMLButtonElement>('add-rule');
const btnExportRulesCSV = $<HTMLButtonElement>('export-rules-csv');
const btnImportRulesCSV = $<HTMLButtonElement>('import-rules-csv');
const importRulesFile = $<HTMLInputElement>('import-rules-file');
const btnExport = $<HTMLButtonElement>('export-data');
const btnImport = $<HTMLButtonElement>('import-data');
const importFile = $<HTMLInputElement>('import-file');
const statsLine = $<HTMLDivElement>('stats-line');
const costTable = $<HTMLTableElement>('cost-table');
const costBody = $<HTMLTableSectionElement>('cost-body');

let currentProvider: ProviderPreset | null = null;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sendMsg(msg: Record<string, unknown>): Promise<(Partial<Extract<MessageType, { type: 'status' }>> & { available?: boolean }) | undefined> {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

// --- Provider Cards ---

let chromeAIAvailable = false;

async function checkChromeAI(): Promise<boolean> {
  try {
    const res = await sendMsg({ type: 'check-chrome-ai' });
    return res?.available === true;
  } catch { return false; }
}

function renderProviderCards(selectedId: string) {
  providerGrid.innerHTML = '';

  for (const p of PROVIDERS) {
    const card = document.createElement('div');
    card.className = 'provider-card' + (p.id === selectedId ? ' selected' : '');
    if (p.isBuiltIn && !chromeAIAvailable) card.className += ' disabled';

    let badge = '';
    if (p.isBuiltIn) badge = `<div class="badge local">${chromeAIAvailable ? '本机' : '不可用'}</div>`;
    else if (p.canFetchModels) badge = '<div class="badge local">本机</div>';
    card.innerHTML = `<div class="name">${esc(p.name)}</div>${badge}`;
    if (p.id === selectedId && p.helpText) {
      card.innerHTML += `<div style="font-size:10px;color:#9aa0a6;margin-top:4px">${esc(p.helpText)}</div>`;
    }

    card.addEventListener('click', () => {
      if (p.isBuiltIn && !chromeAIAvailable) { showChromeAISetup(); return; }
      hideChromeAISetup();
      selectProvider(p);
    });
    providerGrid.appendChild(card);
  }
}

function showChromeAISetup() {
  document.getElementById('chrome-ai-setup')?.classList.remove('hidden');
}

function hideChromeAISetup() {
  document.getElementById('chrome-ai-setup')?.classList.add('hidden');
}

function selectProvider(p: ProviderPreset) {
  if (currentProvider?.id !== p.id && (currentProvider?.customEndpoint || p.customEndpoint)) {
    inApiKey.value = '';
  }
  currentProvider = p;

  // Update UI
  renderProviderCards(p.id);
  customEndpointRow.classList.toggle('hidden', !p.customEndpoint);
  modelSelectRow.classList.toggle('hidden', !!p.customEndpoint);
  inBaseUrl.value = p.baseUrl;
  inCustomModel.value = p.models[0] || '';

  // Show/hide key row + signup link
  keyRow.classList.toggle('hidden', !p.needsKey);
  if (p.signupUrl) {
    signupLink.href = p.signupUrl;
    signupLink.hidden = false;
  } else {
    signupLink.hidden = true;
  }

  // Populate models
  populateModels(p.models);

  // Ollama: fetch models dynamically
  if (p.canFetchModels) {
    fetchOllamaModels();
  }

  save();
}

function populateModels(models: string[]) {
  modelSelect.innerHTML = '';
  if (!models.length) {
    modelSelect.innerHTML = '<option value="">暂无可用模型</option>';
    return;
  }
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    modelSelect.appendChild(opt);
  }
}

// No longer auto-populating select, using range slider now.

async function fetchOllamaModels() {
  const origText = modelSelect.innerHTML;
  modelSelect.innerHTML = '<option>正在加载模型…</option>';
  try {
    const res = await sendMsg({ type: 'fetch-ollama-models' });
    if (res?.models?.length) {
      populateModels(res.models);
    } else {
      modelSelect.innerHTML = '<option value="">Ollama 尚未运行</option>';
    }
  } catch {
    modelSelect.innerHTML = '<option value="">连接失败</option>';
  }
}

// --- Save ---

async function save() {
  testResult.textContent = '';
  const p = currentProvider;
  if (!p) return;

  const model = p.customEndpoint ? inCustomModel.value.trim() : modelSelect.value;
  const baseUrl = p.customEndpoint ? inBaseUrl.value.trim().replace(/\/+$/, '') : p.baseUrl;

  // Preserve pinnedGroups from current settings (managed separately)
  const current = await getSettings();

  const settings: Settings = {
    provider: p.id,
    baseUrl,
    apiKey: inApiKey.value.trim(),
    model,
    maxGroups: Number(inMaxGroups.value) || DEFAULT_SETTINGS.maxGroups,
    maxTitleLength: Number(inMaxTitleLength.value) || DEFAULT_SETTINGS.maxTitleLength,
    excludePrivateHosts: inExcludePrivateHosts.checked,
    excludedDomains: inExcludedDomains.value.split(/[\s,，;；]+/).filter(Boolean),
    autoTrigger: inAutoTrigger.checked,
    threshold: Number(inThreshold.value) || DEFAULT_SETTINGS.threshold,
    mergeMode: inMergeMode.checked,
    silentAutoAdd: inSilentAutoAdd.checked,
    autoPinApps: inAutoPinApps.checked,
    staleTabThresholdHours: Number(inStaleTabThresholdHours.value) || DEFAULT_SETTINGS.staleTabThresholdHours,
    enableCorrectionTracking: inEnableCorrectionTracking.checked,
    enableRejectionMemory: inEnableRejectionMemory.checked,
    enableGroupDrift: inEnableGroupDrift.checked,
    enablePatternMining: inEnablePatternMining.checked,
    groupDriftThreshold: Number(inGroupDriftThreshold.value) || DEFAULT_SETTINGS.groupDriftThreshold,
    reorgSchedule: inReorgSchedule.value as Settings['reorgSchedule'],
    reorgTime: Number(inReorgTime.value),
    pinnedGroups: current.pinnedGroups || [],
    smartUngroup: inSmartUngroup.checked,
    spendingCapUSD: current.spendingCapUSD ?? DEFAULT_SETTINGS.spendingCapUSD,
  };
  settings.spendingCapUSD = Number(inSpendingCapUSD.value) ?? 0;
  await saveSettings(settings);
}

let saveDebounceTimer: number | undefined;
function scheduleSave(delayMs = 180) {
  if (saveDebounceTimer !== undefined) window.clearTimeout(saveDebounceTimer);
  saveDebounceTimer = window.setTimeout(() => { void save(); }, delayMs);
}

// --- Load ---

async function load() {
  chromeAIAvailable = await checkChromeAI();
  const s = await getSettings();

  // Find provider
  const p = PROVIDERS.find(provider => provider.id === s.provider)
    || PROVIDERS.find(provider => provider.id === DEFAULT_SETTINGS.provider)
    || PROVIDERS[0];
  currentProvider = p;

  renderProviderCards(p.id);
  customEndpointRow.classList.toggle('hidden', !p.customEndpoint);
  modelSelectRow.classList.toggle('hidden', !!p.customEndpoint);
  inBaseUrl.value = s.baseUrl || p.baseUrl;
  inCustomModel.value = s.model;
  if (p.isBuiltIn && !chromeAIAvailable) showChromeAISetup();
  keyRow.classList.toggle('hidden', !p.needsKey);

  inApiKey.value = s.apiKey;

  // Models
  if (p.canFetchModels) {
    await fetchOllamaModels();
  } else {
    populateModels(p.models);
  }

  // Select current model
  modelSelect.value = s.model;

  // Behavior
  inMaxGroups.value = String(s.maxGroups);
  outMaxGroups.textContent = String(s.maxGroups);
  
  inMaxTitleLength.value = String(s.maxTitleLength);
  outMaxTitleLength.textContent = String(s.maxTitleLength);
  
  inAutoTrigger.checked = s.autoTrigger;
  inExcludePrivateHosts.checked = s.excludePrivateHosts;
  inExcludedDomains.value = s.excludedDomains.join("\n");
  
  inThreshold.value = String(s.threshold);
  outThreshold.textContent = String(s.threshold);
  
  inMergeMode.checked = s.mergeMode;
  inSilentAutoAdd.checked = s.silentAutoAdd;
  inAutoPinApps.checked = s.autoPinApps;
  inSmartUngroup.checked = s.smartUngroup;
  
  inStaleTabThresholdHours.value = String(s.staleTabThresholdHours);
  outStale.textContent = String(s.staleTabThresholdHours);
  inSpendingCapUSD.value = String(s.spendingCapUSD);
  outSpendingCapUSD.textContent = String(s.spendingCapUSD);

  // Smart learning
  inEnableCorrectionTracking.checked = s.enableCorrectionTracking;
  inEnableRejectionMemory.checked = s.enableRejectionMemory;
  inEnableGroupDrift.checked = s.enableGroupDrift;
  inEnablePatternMining.checked = s.enablePatternMining;
  inGroupDriftThreshold.value = String(s.groupDriftThreshold);
  outDriftThreshold.textContent = String(s.groupDriftThreshold);

  // Scheduled re-org
  inReorgSchedule.value = s.reorgSchedule;
  inReorgTime.value = String(s.reorgTime);
  outReorgTime.textContent = String(s.reorgTime);

  // Pinned groups
  renderPinnedGroups(s.pinnedGroups || []);

  // Domain rules
  await renderDomainRules();

  // Stats & costs
  await refreshData();
}

// --- Test Connection ---

testBtn.addEventListener('click', async () => {
  await save();
  testBtn.disabled = true;
  testResult.textContent = '正在测试…';
  testResult.className = 'test-result';

  const res = await sendMsg({ type: 'test-connection' });
  testBtn.disabled = false;

  if (res?.status === 'done') {
    testResult.textContent = '连接成功！';
    testResult.className = 'test-result ok';
  } else {
    testResult.textContent = res?.error || '失败';
    testResult.className = 'test-result fail';
  }

});

// --- Domain Rules ---

async function renderDomainRules(draftRules?: DomainRule[]) {
  const rules = draftRules ?? await getDomainRules();
  rulesContainer.innerHTML = '';

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const row = document.createElement('div');
    row.className = 'rule-row';
    row.innerHTML = `
      <input type="text" value="${esc(r.domain)}" placeholder="example.com 或 *.example.com" data-i="${i}" class="rule-domain" />
      <input type="text" value="${esc(r.groupName)}" placeholder="分组名称" data-i="${i}" class="rule-group" style="max-width:120px" />
      <select data-i="${i}" class="rule-color">
        ${COLORS.map(c => `<option value="${c}" ${c === r.color ? 'selected' : ''}>${COLOR_LABELS[c]}</option>`).join('')}
      </select>
      <button class="btn-ghost btn-sm rule-delete" data-i="${i}">&times;</button>`;
    rulesContainer.appendChild(row);
  }

  // Bind handlers
  const saveRules = async () => {
    const updated: DomainRule[] = [];
    rulesContainer.querySelectorAll('.rule-row').forEach((row, i) => {
      const domain = (row.querySelector('.rule-domain') as HTMLInputElement).value.trim().toLowerCase();
      const groupName = (row.querySelector('.rule-group') as HTMLInputElement).value.trim();
      const color = (row.querySelector('.rule-color') as HTMLSelectElement).value as Color;
      if (domain && groupName) updated.push({ domain, groupName, color });
    });
    await saveDomainRules(updated);
  };

  rulesContainer.querySelectorAll('input, select').forEach(el =>
    el.addEventListener('change', saveRules));
  rulesContainer.querySelectorAll('.rule-delete').forEach(el =>
    el.addEventListener('click', async () => {
      const rules = await getDomainRules();
      rules.splice(Number((el as HTMLElement).dataset.i), 1);
      await saveDomainRules(rules);
      renderDomainRules();
    }));
}

btnAddRule.addEventListener('click', async () => {
  const rules = await getDomainRules();
  rules.push({ domain: '', groupName: '', color: 'grey' });
  await renderDomainRules(rules);
});

btnExportRulesCSV.addEventListener('click', async () => {
  const rules = await getDomainRules();
  const lines = ['domain,groupName,color', ...rules.map(r =>
    [r.domain, r.groupName, r.color].map(v => `"${v.replace(/"/g, '""')}"`).join(',')
  )];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gtabs-domain-rules.csv';
  a.click();
});

btnImportRulesCSV.addEventListener('click', () => importRulesFile.click());

importRulesFile.addEventListener('change', async () => {
  const file = importRulesFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const imported: DomainRule[] = [];
    for (const line of lines) {
      if (line.toLowerCase().startsWith('domain,')) continue;
      // Parse simple CSV: handle quoted fields
      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      const [domain, groupName, color] = parts;
      const normalizedDomain = domain?.trim().toLowerCase();
      const normalizedGroup = groupName?.trim();
      if (normalizedDomain && normalizedGroup && COLORS.includes(color as Color)) {
        imported.push({ domain: normalizedDomain, groupName: normalizedGroup, color: color as Color });
      }
    }
    if (imported.length === 0) { alert('CSV 中没有有效规则'); return; }
    const existing = await getDomainRules();
    // Merge: overwrite existing entries for the same domain, append new ones
    const merged = new Map(existing.map(r => [r.domain, r]));
    for (const r of imported) merged.set(r.domain, r);
    await saveDomainRules([...merged.values()]);
    await renderDomainRules();
    alert(`已导入 ${imported.length} 条规则`);
  } catch { alert('无法解析 CSV 文件'); }
  importRulesFile.value = '';
});

// --- Data ---

async function refreshData() {
  const [statsRes, costsRes] = await Promise.all([
    sendMsg({ type: 'get-stats' }),
    sendMsg({ type: 'get-costs' }),
  ]);

  if (statsRes?.stats) {
    const s = statsRes.stats;
    const last = s.lastOrganizedAt ? new Date(s.lastOrganizedAt).toLocaleDateString() : '从未整理';
    statsLine.innerHTML = `<strong>${s.totalOrganizations}</strong> 次整理 &middot; <strong>${s.totalTabsGrouped}</strong> 个标签已分组 &middot; 上次：${last}`;
  }

  if (costsRes?.costs) {
    const c = costsRes.costs;
    const providers = Object.entries(c.byProvider);
    if (providers.length) {
      costTable.hidden = false;
      costBody.innerHTML = '';
      for (const [name, data] of providers) {
        costBody.innerHTML += `<tr><td>${esc(name)}</td><td>${data.inputTokens.toLocaleString()}</td><td>${data.outputTokens.toLocaleString()}</td><td>$${data.cost.toFixed(4)}</td></tr>`;
      }
      costBody.innerHTML += `<tr style="border-top:1px solid #3c4043;font-weight:600"><td>合计</td><td>${c.totalInputTokens.toLocaleString()}</td><td>${c.totalOutputTokens.toLocaleString()}</td><td>$${c.totalCost.toFixed(4)}</td></tr>`;
    }
  }
}

// Export
btnExport.addEventListener('click', async () => {
  const res = await sendMsg({ type: 'export-data' });
  if (res?.data) {
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gtabs-export.json';
    a.click();
  }
});

// Import
btnImport.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const res = await sendMsg({ type: 'import-data', data });
    if (res?.status !== 'imported') throw new Error(res?.error || '导入失败');
    await load();
  } catch (err) {
    alert(err instanceof Error ? err.message : '导入文件无效');
  }
  importFile.value = '';
});

// --- Pinned Groups ---

function renderPinnedGroups(pinnedGroups: string[]) {
  pinnedContainer.innerHTML = '';
  for (let i = 0; i < pinnedGroups.length; i++) {
    const row = document.createElement('div');
    row.className = 'rule-row';
    row.innerHTML = `
      <input type="text" value="${esc(pinnedGroups[i])}" readonly style="flex:1;opacity:0.8" />
      <button class="btn-ghost btn-sm pinned-delete" data-i="${i}">&times;</button>`;
    pinnedContainer.appendChild(row);
  }

  pinnedContainer.querySelectorAll('.pinned-delete').forEach(el =>
    el.addEventListener('click', async () => {
      const s = await getSettings();
      const groups = [...(s.pinnedGroups || [])];
      groups.splice(Number((el as HTMLElement).dataset.i), 1);
      await saveSettings({ ...s, pinnedGroups: groups });
      renderPinnedGroups(groups);
    }),
  );
}

btnAddPinned.addEventListener('click', async () => {
  const name = inNewPinnedGroup.value.trim();
  if (!name) return;
  const s = await getSettings();
  const groups = [...(s.pinnedGroups || [])];
  if (!groups.includes(name)) groups.push(name);
  await saveSettings({ ...s, pinnedGroups: groups });
  renderPinnedGroups(groups);
  inNewPinnedGroup.value = '';
});

// --- Auto-save on changes ---
const rangeBindings = [
  { input: inMaxGroups, out: outMaxGroups },
  { input: inMaxTitleLength, out: outMaxTitleLength },
  { input: inThreshold, out: outThreshold },
  { input: inStaleTabThresholdHours, out: outStale },
  { input: inSpendingCapUSD, out: outSpendingCapUSD },
  { input: inGroupDriftThreshold, out: outDriftThreshold },
  { input: inReorgTime, out: outReorgTime },
];
for (const b of rangeBindings) {
  b.input.addEventListener('input', () => { b.out.textContent = b.input.value; });
}

const autoSaveElements = [
  inExcludePrivateHosts, inExcludedDomains, inApiKey, modelSelect, inBaseUrl, inCustomModel, inMaxGroups, inMaxTitleLength, inAutoTrigger, inThreshold,
  inMergeMode, inSilentAutoAdd, inAutoPinApps, inSmartUngroup, inStaleTabThresholdHours,
  inSpendingCapUSD,
  inEnableCorrectionTracking, inEnableRejectionMemory, inEnableGroupDrift,
  inEnablePatternMining, inGroupDriftThreshold,
  inReorgSchedule, inReorgTime,
];
for (const el of autoSaveElements) {
  el.addEventListener('change', () => { void save(); });
  if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'password' || el.type === 'number' || el.type === 'range')) {
    el.addEventListener('input', () => scheduleSave());
  }
}

// --- Group Stats ---


// --- Power Tools ---

const toolStatus = $<HTMLDivElement>('tool-status');
const toolResults = $<HTMLDivElement>('tool-results');

function setToolStatus(msg: string, isError = false) {
  toolStatus.textContent = msg;
  toolStatus.style.color = isError ? '#f28b82' : '#7c6af5';
}

$<HTMLButtonElement>('tool-duplicates').addEventListener('click', async () => {
  setToolStatus('正在查找重复标签…');
  toolResults.innerHTML = '';
  const res = await sendMsg({ type: 'find-duplicates' });
  if (!res?.duplicates?.length) {
    setToolStatus('未发现重复标签');
    return;
  }
  setToolStatus(`发现 ${res.duplicates.length} 组重复标签`);
  for (const group of res.duplicates) {
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(242,139,130,0.05);border:1px solid rgba(242,139,130,0.12);border-radius:8px;padding:8px 10px;margin-bottom:6px;font-size:11px;color:#7a8099';
    const first = group[0] as { title?: string; url?: string } | undefined;
    div.innerHTML = `<strong style="color:#f28b82">${esc(first?.title || first?.url || '未知')} (${group.length}x)</strong><br>${group.map((t: { url?: string }) => esc(t.url || '')).join('<br>')}`;
    toolResults.appendChild(div);
  }
});

$<HTMLButtonElement>('tool-focus').addEventListener('click', async () => {
  setToolStatus('正在收起其他分组…');
  const res = await sendMsg({ type: 'focus-group' });
  setToolStatus(res?.error ? res.error : '已进入专注模式', Boolean(res?.error));
});

$<HTMLButtonElement>('tool-sort').addEventListener('click', async () => {
  setToolStatus('正在排序分组…');
  const res = await sendMsg({ type: 'sort-groups' });
  setToolStatus(res?.error ? res.error : `已排序 ${res?.count ?? 0} 个分组`, Boolean(res?.error));
});

$<HTMLButtonElement>('tool-clear').addEventListener('click', async () => {
  setToolStatus('正在取消全部分组…');
  const res = await sendMsg({ type: 'delete-all-groups' });
  setToolStatus(res?.error ? res.error : (res?.count ? `已取消 ${res.count} 个分组` : '没有需要取消的分组'), Boolean(res?.error));
});

$<HTMLButtonElement>('tool-export-md').addEventListener('click', async () => {
  setToolStatus('正在导出…');
  const res = await sendMsg({ type: 'export-markdown' });
  if (res?.error) { setToolStatus(res.error, true); return; }
  try {
    await navigator.clipboard.writeText(res?.markdown || '');
    setToolStatus('Markdown 已复制到剪贴板！');
  } catch {
    setToolStatus('无法访问剪贴板', true);
  }
});

$<HTMLButtonElement>('tool-snooze').addEventListener('click', async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) { setToolStatus('没有可暂存的当前标签', true); return; }
  const delayMs = Number(($<HTMLSelectElement>('tool-snooze-duration')).value) || 86400000;
  const wakeAt = Date.now() + delayMs;
  setToolStatus('正在暂存…');
  const res = await sendMsg({ type: 'snooze-tabs', tabIds: [activeTab.id], wakeAt });
  if (res?.error) { setToolStatus(res.error, true); return; }
  const sel = $<HTMLSelectElement>('tool-snooze-duration');
  setToolStatus(`Tab snoozed until ${sel.options[sel.selectedIndex]?.text || '稍后'}`);
});

// Workspace tools
const toolWsList = $<HTMLDivElement>('tool-workspace-list');

async function refreshToolWorkspaces() {
  const res = await sendMsg({ type: 'list-workspaces' });
  const names: string[] = res?.workspaceNames || [];
  toolWsList.innerHTML = '';
  if (!names.length) return;

  const wsData = await sendMsg({ type: 'export-data' });
  const workspaces = wsData?.data?.workspaces || {};

  for (const name of names) {
    const ws = workspaces[name];
    const tabCount = ws?.tabs?.length ?? '?';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;margin-bottom:3px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:11px';
    row.innerHTML = `
      <span style="flex:1;color:#c5d5ff;font-family:var(--font-display);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>
      <span style="color:#555a70;flex-shrink:0">${tabCount} 个标签</span>
      <button class="btn-ghost btn-sm ws-tool-restore" data-name="${esc(name)}" style="padding:3px 8px;font-size:10px">恢复</button>
      <button class="btn-ghost btn-sm ws-tool-delete" data-name="${esc(name)}" style="padding:3px 6px;font-size:10px;color:#f28b82">✕</button>`;
    toolWsList.appendChild(row);
  }

  toolWsList.querySelectorAll<HTMLButtonElement>('.ws-tool-restore').forEach(btn => {
    btn.addEventListener('click', async () => {
      setToolStatus(`正在恢复“${btn.dataset.name}”…`);
      const res = await sendMsg({ type: 'restore-workspace', name: btn.dataset.name });
      setToolStatus(res?.error ? res.error : `已在新窗口恢复“${btn.dataset.name}”`, Boolean(res?.error));
    });
  });

  toolWsList.querySelectorAll<HTMLButtonElement>('.ws-tool-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sendMsg({ type: 'delete-workspace', name: btn.dataset.name });
      await refreshToolWorkspaces();
    });
  });
}

$<HTMLButtonElement>('tool-workspace-save').addEventListener('click', async () => {
  const input = $<HTMLInputElement>('tool-workspace-name');
  const name = input.value.trim();
  if (!name) { setToolStatus('请输入工作区名称', true); return; }
  setToolStatus('正在保存工作区…');
  const res = await sendMsg({ type: 'save-workspace', name });
  if (res?.error) { setToolStatus(res.error, true); return; }
  input.value = '';
  setToolStatus(`已保存工作区“${name}”`);
  await refreshToolWorkspaces();
});

// --- Chrome AI setup buttons ---

document.querySelectorAll<HTMLButtonElement>('.copy-btn[data-copy]').forEach(btn => {
  btn.addEventListener('click', () => {
    void navigator.clipboard.writeText(btn.dataset.copy!);
    const orig = btn.textContent;
    btn.textContent = '已复制！';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
});

document.getElementById('chrome-ai-check-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('chrome-ai-check-btn') as HTMLButtonElement;
  btn.textContent = '正在检测…';
  btn.disabled = true;
  chromeAIAvailable = await checkChromeAI();
  if (chromeAIAvailable) {
    hideChromeAISetup();
    const p = PROVIDERS.find(pr => pr.id === 'chrome-ai')!;
    selectProvider(p);
  } else {
    btn.textContent = '未检测到，请重启 Chrome 后重试';
    setTimeout(() => { btn.textContent = '重新检测'; btn.disabled = false; }, 3000);
  }
});

document.getElementById('chrome-ai-skip-btn')?.addEventListener('click', () => {
  hideChromeAISetup();
  const groq = PROVIDERS.find(p => p.id === 'tt-switch')!;
  selectProvider(groq);
});

// --- Init ---
load();
refreshToolWorkspaces();
