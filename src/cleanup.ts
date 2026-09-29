import { getSettings, getSuggestions } from './storage';
import type { Color, Settings } from './types';

export const CLEANUP_ALARM = 'gtabs-cleanup';
export interface CleanupTab {
  id: number; windowId: number; url: string; title: string; lastAccessed: number;
  groupId: number; groupName?: string; groupColor?: Color; collapsed?: boolean; index: number;
}
export interface CleanupPreview { id: string; windowId: number; createdAt: number; tabs: CleanupTab[] }
export interface ArchiveEntry extends CleanupTab {
  entryId: string; state: 'saved' | 'closed' | 'kept' | 'failed';
}
export interface ArchiveBatch { id: string; windowId: number; createdAt: number; tabs: ArchiveEntry[] }
export interface CleanupResult { closed: number; kept: number; failed: number; archiveId?: string }
type Dismissals = Record<string, { until: number }>;
const previews = new Map<string, CleanupPreview>();
let mutationQueue: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(action, action);
  mutationQueue = result.catch(() => {});
  return result;
}

function allowedUrl(url?: string): url is string {
  try { const u = new URL(url || ''); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
}
function protectedTab(tab: chrome.tabs.Tab, groups: Map<number, chrome.tabGroups.TabGroup>, settings: Settings): boolean {
  return tab.id === undefined || tab.incognito === true || !allowedUrl(tab.url) || !!tab.active || !!tab.pinned || !!tab.audible
    || tab.status === 'loading' || !!tab.pendingUrl
    || settings.pinnedGroups.includes(groups.get(tab.groupId)?.title || '');
}
function dismissalKey(tab: { windowId: number; url?: string }): string { return `${tab.windowId}:${tab.url}`; }
async function getDismissals(): Promise<Dismissals> {
  const data = await chrome.storage.local.get({ cleanupDismissals: {} });
  return data.cleanupDismissals as Dismissals;
}
async function candidates(windowId: number): Promise<CleanupTab[]> {
  const [settings, tabs, groupList, dismissals] = await Promise.all([
    getSettings(), chrome.tabs.query({ windowId }), chrome.tabGroups.query({ windowId }), getDismissals(),
  ]);
  const groups = new Map(groupList.map(g => [g.id, g]));
  const now = Date.now();
  return tabs.filter(t => !protectedTab(t, groups, settings)
    && Number.isFinite(t.lastAccessed) && t.lastAccessed! > 0
    && now - t.lastAccessed! >= settings.staleTabThresholdHours * 3600000
    && !(dismissals[dismissalKey(t)]?.until > now))
    .map(t => {
      const group = groups.get(t.groupId);
      return { id: t.id!, windowId, url: t.url!, title: t.title || new URL(t.url!).hostname,
        lastAccessed: t.lastAccessed!, groupId: t.groupId, index: t.index,
        groupName: group?.title, groupColor: group?.color, collapsed: group?.collapsed };
    }).sort((a, b) => a.lastAccessed - b.lastAccessed);
}
export async function previewCleanup(windowId: number): Promise<CleanupPreview> {
  const now = Date.now();
  for (const [id, p] of previews) if (now - p.createdAt > 15 * 60000 || p.windowId === windowId) previews.delete(id);
  if (previews.size >= 20) previews.delete(previews.keys().next().value!);
  const preview = { id: crypto.randomUUID(), windowId, createdAt: now, tabs: await candidates(windowId) };
  previews.set(preview.id, preview);
  return preview;
}
function selectedPreview(previewId: string, windowId: number, ids: number[]): CleanupTab[] {
  const preview = previews.get(previewId);
  if (!preview || preview.windowId !== windowId || Date.now() - preview.createdAt > 15 * 60000)
    throw new Error('清理预览已过期或窗口已变化，请刷新列表后重试。');
  if (!Array.isArray(ids) || !ids.length) throw new Error('请先勾选需要处理的标签。');
  const selected = preview.tabs.filter(t => ids.includes(t.id));
  if (selected.length !== new Set(ids).size) throw new Error('标签列表已变化，请刷新后重试。');
  return selected;
}
export async function listArchives(): Promise<ArchiveBatch[]> {
  const data = await chrome.storage.local.get({ tabArchives: [] });
  return data.tabArchives as ArchiveBatch[];
}
async function persistArchives(batches: ArchiveBatch[]): Promise<void> {
  if (new TextEncoder().encode(JSON.stringify(batches)).byteLength > 8 * 1024 * 1024)
    throw new Error('归档空间接近上限，请删除不再需要的归档后重试；尚未关闭标签。');
  await chrome.storage.local.set({ tabArchives: batches });
}
export function archiveAndClose(previewId: string, windowId: number, ids: number[]): Promise<CleanupResult> {
  return serial(async () => {
    const selected = selectedPreview(previewId, windowId, ids);
    const current = new Map((await candidates(windowId)).map(t => [t.id, t]));
    const eligible = selected.filter(t => {
      const live = current.get(t.id);
      return live && live.url === t.url && live.lastAccessed === t.lastAccessed && live.groupId === t.groupId;
    });
    const result: CleanupResult = { closed: 0, kept: selected.length - eligible.length, failed: 0 };
    if (!eligible.length) return result;
    const batch: ArchiveBatch = { id: crypto.randomUUID(), windowId, createdAt: Date.now(),
      tabs: eligible.map(t => ({ ...t, entryId: crypto.randomUUID(), state: 'saved' })) };
    const batches = [batch, ...await listArchives()];
    // The full recoverable snapshot must be durably saved before the first close.
    await persistArchives(batches);
    result.archiveId = batch.id;
    for (const entry of batch.tabs) {
      try {
        const [settings, groupList] = await Promise.all([getSettings(), chrome.tabGroups.query({ windowId })]);
        const groups = new Map(groupList.map(g => [g.id, g]));
        const live = await chrome.tabs.get(entry.id);
        if (live.windowId !== windowId || live.url !== entry.url || live.groupId !== entry.groupId
          || live.lastAccessed !== entry.lastAccessed || Date.now() - live.lastAccessed! < settings.staleTabThresholdHours * 3600000
          || protectedTab(live, groups, settings)) {
          entry.state = 'kept'; result.kept++; continue;
        }
        await chrome.tabs.remove(entry.id);
        entry.state = 'closed'; result.closed++;
      } catch { entry.state = 'failed'; result.failed++; }
    }
    // If status persistence fails the earlier snapshot still allows recovery.
    try { await persistArchives(batches); } catch { /* preserve the already-saved archive */ }
    previews.delete(previewId);
    await refreshCleanupReminder().catch(() => {});
    return result;
  });
}
export function dismissCleanup(previewId: string, windowId: number, ids: number[], forever: boolean): Promise<void> {
  return serial(async () => {
    const selected = selectedPreview(previewId, windowId, ids);
    const dismissals = await getDismissals();
    for (const key of Object.keys(dismissals)) if (dismissals[key].until <= Date.now()) delete dismissals[key];
    for (const tab of selected) dismissals[dismissalKey(tab)] = { until: forever ? Number.MAX_SAFE_INTEGER : Date.now() + 7 * 86400000 };
    if (Object.keys(dismissals).length > 5000) throw new Error('保留记录已满，请先重置保留记录。');
    await chrome.storage.local.set({ cleanupDismissals: dismissals });
    previews.delete(previewId);
    await refreshCleanupReminder().catch(() => {});
  });
}
export function resetDismissals(): Promise<void> {
  return serial(() => chrome.storage.local.set({ cleanupDismissals: {} }));
}
export function deleteArchive(id: string): Promise<void> {
  return serial(async () => persistArchives((await listArchives()).filter(a => a.id !== id)));
}
export function restoreArchive(id: string, windowId: number, entryIds?: string[]): Promise<{ restored: number; existing: number; failed: number }> {
  return serial(async () => {
    const batch = (await listArchives()).find(a => a.id === id);
    if (!batch) throw new Error('归档不存在，请刷新列表。');
    const selected = batch.tabs.filter(t => !entryIds || entryIds.includes(t.entryId));
    const existingUrls = new Set((await chrome.tabs.query({ windowId })).map(t => t.url));
    const groups = new Map<number, { ids: number[]; tab: ArchiveEntry }>();
    const result = { restored: 0, existing: 0, failed: 0 };
    for (const tab of selected.sort((a, b) => a.index - b.index)) {
      if (!allowedUrl(tab.url)) { result.failed++; continue; }
      if (existingUrls.has(tab.url)) { result.existing++; continue; }
      try {
        const created = await chrome.tabs.create({ url: tab.url, windowId, active: false });
        if (created.id === undefined) throw new Error('No tab ID');
        existingUrls.add(tab.url); result.restored++;
        if (tab.groupId >= 0) {
          const group = groups.get(tab.groupId) || { ids: [], tab };
          group.ids.push(created.id); groups.set(tab.groupId, group);
        }
      } catch { result.failed++; }
    }
    for (const { ids, tab } of groups.values()) {
      try {
        const groupId = await chrome.tabs.group({ tabIds: ids as [number, ...number[]], createProperties: { windowId } });
        await chrome.tabGroups.update(groupId, { title: tab.groupName || '', color: tab.groupColor || 'grey', collapsed: tab.collapsed || false });
      } catch { throw new Error(`已重新打开 ${result.restored} 个标签，但部分分组恢复失败。归档仍保留，可查看当前窗口。`); }
    }
    return result;
  });
}
export async function cleanupSummary(windowId: number): Promise<{ count: number; checkedAt: number }> {
  const settings = await getSettings();
  return { count: settings.cleanupReminder ? (await candidates(windowId)).length : 0, checkedAt: Date.now() };
}
export async function refreshCleanupReminder(): Promise<void> {
  const settings = await getSettings();
  const windows = settings.cleanupReminder ? await chrome.windows.getAll({ windowTypes: ['normal'] }) : [];
  let count = 0;
  for (const window of windows) if (window.id !== undefined && !window.incognito) count += (await candidates(window.id)).length;
  await chrome.storage.local.set({ cleanupSummary: { count, checkedAt: Date.now() } });
  await chrome.action.setTitle?.({ title: count ? `gTabs · ${count} 个闲置标签可检查` : 'gTabs 中文版 · TT Switch' });
  if (!(await getSuggestions())?.length) {
    await chrome.action.setBadgeText({ text: count ? '清' : '' });
    if (count) await chrome.action.setBadgeBackgroundColor({ color: '#b87819' });
  }
}
export async function setupCleanupAlarm(): Promise<void> {
  await chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: 60 });
}
