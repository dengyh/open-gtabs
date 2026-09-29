// Isolated browser fixture: runs the actual UI and background code against simulated tabs.
// It never reads, closes, or sends the user's real browser tabs.
const listeners: Function[] = [];
let nextId = 20;
const tabs: any[] = [
  { id: 1, title: 'JavaScript 文档（验证用）', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', groupId: 7, index: 0 },
  { id: 2, title: 'CSS 文档（验证用）', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS', groupId: 7, index: 1 },
  { id: 3, title: '正在播放（应保护）', url: 'https://example.com/audio', groupId: -1, index: 2, audible: true },
].map(t => ({ windowId: 1, active: false, pinned: false, status: 'complete', lastAccessed: Date.now() - 10 * 86400000, ...t }));
const groups: any[] = [{ id: 7, title: '技术阅读', color: 'blue', collapsed: true, windowId: 1 }];
const store: Record<string, any> = {};
const storage = {
  async get(keys: any) {
    if (typeof keys === 'string') return structuredClone({ [keys]: store[keys] });
    if (Array.isArray(keys)) return structuredClone(Object.fromEntries(keys.map(k => [k, store[k]])));
    return structuredClone({ ...keys, ...store });
  },
  async set(data: any) { Object.assign(store, structuredClone(data)); },
  async remove(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k]; },
};
const event = () => ({ addListener() {}, removeListener() {} });
const find = (id: number) => { const t = tabs.find(t => t.id === id); if (!t) throw new Error('Tab closed'); return t; };
(globalThis as any).chrome = {
  storage: { local: storage, sync: storage, onChanged: event() },
  runtime: { onMessage: { addListener(fn: Function) { listeners.push(fn); } }, onInstalled: event(), onStartup: event(),
    sendMessage(msg: any, callback: Function) { for (const handler of listeners) handler(msg, { tab: { windowId: 1 } }, callback); }, openOptionsPage() {}, getURL: (s: string) => s },
  tabs: {
    async query(q: any) { return structuredClone(tabs.filter(t => (q.windowId === undefined || q.windowId === t.windowId) && (q.active === undefined || q.active === t.active) && (q.groupId === undefined || q.groupId === t.groupId))); },
    async get(id: number) { return structuredClone(find(id)); },
    async remove(ids: number | number[]) { for (const id of Array.isArray(ids) ? ids : [ids]) { const i = tabs.findIndex(t => t.id === id); if (i < 0) throw new Error('Missing'); tabs.splice(i, 1); } },
    async create(p: any) { const t = { id: nextId++, groupId: -1, lastAccessed: Date.now(), title: p.url, ...p }; tabs.push(t); return structuredClone(t); },
    async group(p: any) { const id = p.groupId ?? nextId++; if (!groups.some(g => g.id === id)) groups.push({ id, windowId: 1, color: 'grey', title: '', collapsed: false }); for (const tid of p.tabIds) find(tid).groupId = id; return id; },
    async ungroup(ids: number[]) { ids.forEach(id => find(id).groupId = -1); },
    async update(id: number, data: any) { Object.assign(find(id), data); return find(id); },
    onCreated: event(), onRemoved: event(), onUpdated: event(), onActivated: event(),
  },
  tabGroups: { async query() { return structuredClone(groups); }, async update(id: number, p: any) { Object.assign(groups.find(g => g.id === id), p); }, onCreated: event(), onRemoved: event(), onUpdated: event() },
  windows: { async getCurrent() { return { id: 1 }; }, async getLastFocused() { return { id: 1 }; }, async getAll() { return [{ id: 1 }]; }, onRemoved: event() },
  alarms: { async create() {}, onAlarm: event() }, commands: { onCommand: event() },
  action: { async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setTitle() {} },
  contextMenus: { removeAll(cb: Function) { cb(); }, create(_: any, cb: Function) { cb(); }, onClicked: event() },
};
void (async () => { await import('../../src/background'); await import('../../src/options'); })();
