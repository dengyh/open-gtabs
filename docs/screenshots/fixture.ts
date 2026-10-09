// README-only fixtures. Real UI modules, synthetic data, no extension or model access.
import { DEFAULT_SETTINGS, DEFAULT_STATS, DEFAULT_COSTS } from '../../src/types';

const params = new URLSearchParams(location.search);
const english = params.get('lang') === 'en';
const label = (zh: string, en: string) => english ? en : zh;
const demoTabs = [
  { id: 1, title: label('JavaScript 入门笔记', 'JavaScript getting started'), url: 'https://docs.example.com/javascript' },
  { id: 2, title: label('CSS 布局参考', 'CSS layout reference'), url: 'https://docs.example.com/css' },
  { id: 3, title: label('周末出行计划', 'Weekend travel ideas'), url: 'https://travel.example.org/weekend' },
  { id: 4, title: label('城市博物馆导览', 'City museum guide'), url: 'https://travel.example.org/museums' },
];
const suggestions = [
  { name: label('开发学习', 'Development'), color: 'blue', tabs: demoTabs.slice(0, 2) },
  { name: label('旅行阅读', 'Travel reading'), color: 'green', tabs: demoTabs.slice(2) },
];
const report = {
  windowId: 1, timestamp: Date.now(), phase: 'preview',
  items: [
    ...demoTabs.map(t => ({ id: t.id, title: t.title, reason: 'suggested' })),
    { id: 5, title: label('团队知识库（虚构示例）', 'Team wiki (fictional example)'), reason: 'excluded' },
  ],
};
const store: Record<string, any> = {
  settings: { ...DEFAULT_SETTINGS, language: english ? 'en' : 'zh-CN', provider: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1', model: 'your-model-id', excludedDomains: ['company.example'] },
  apiKeyLocal: '',
  'suggestions:1': suggestions,
  domainRules: [],
};
const storage = {
  async get(keys: any) {
    if (typeof keys === 'string') return structuredClone({ [keys]: store[keys] });
    if (Array.isArray(keys)) return structuredClone(Object.fromEntries(keys.map(k => [k, store[k]])));
    return structuredClone(keys == null ? store : { ...keys, ...store });
  },
  async set(data: any) { Object.assign(store, structuredClone(data)); },
  async remove(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k]; },
};
const preview = {
  id: 'readme-demo', windowId: 1, createdAt: Date.now(),
  tabs: demoTabs.slice(0, 3).map((tab, i) => ({ ...tab, windowId: 1, groupId: i < 2 ? 7 : 8,
    groupName: suggestions[i < 2 ? 0 : 1].name, lastAccessed: Date.now() - (8 + i * 3) * 86400000, index: i })),
};
const disabled = { error: label('演示环境不执行此操作。', 'This action is disabled in the demo.') };
(globalThis as any).chrome = {
  i18n: { getUILanguage: () => english ? 'en' : 'zh-CN' },
  storage: { local: storage, sync: { ...storage, async get() { return {}; }, async remove() {} } },
  windows: { async getCurrent() { return { id: 1 }; } },
  permissions: { async contains() { return false; }, async request() { return false; } },
  runtime: {
    getURL: (path: string) => path, openOptionsPage() {},
    sendMessage(msg: any, callback: Function) {
      const responses: Record<string, any> = {
        'check-chrome-ai': { available: false }, 'get-stats': { stats: DEFAULT_STATS },
        'get-costs': { costs: DEFAULT_COSTS }, 'organization-report': { report },
        'cleanup-summary': { summary: { count: 3, checkedAt: Date.now() } },
        'cleanup-preview': { preview }, 'archive-list': { archives: [] },
        'export-data': { data: { workspaces: {} } },
        'organize': { suggestions, report }, 'organize-ungrouped': { suggestions, report },
      };
      callback(structuredClone(responses[msg.type] ?? disabled));
    },
  },
};
// Defense in depth: this fixture never calls the example model address.
globalThis.fetch = async () => { throw new Error('Network access is disabled in README fixtures'); };

const badge = document.createElement('div');
badge.className = 'demo-badge';
badge.textContent = label('演示数据 · 示例地址 · API Key 留空', 'DEMO DATA · Example URLs · Empty API key');
const style = document.createElement('style');
style.textContent = '.demo-badge{font:600 11px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#b7c9ee;background:#18223a;border:1px solid #2f426b;border-radius:6px;padding:7px 10px;margin-bottom:14px}';
document.head.append(style);
if (params.get('page') === 'popup') {
  document.body.prepend(badge);
  await import('../../src/popup');
} else {
  for (const section of document.querySelectorAll('.tab-panel > .section:first-child')) section.prepend(badge.cloneNode(true));
  await import('../../src/options');
}
