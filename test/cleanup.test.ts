import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAllMocks } from './setup';
import { DEFAULT_SETTINGS } from '../src/types';
import { saveSettings } from '../src/storage';
import { previewCleanup, archiveAndClose, listArchives, restoreArchive, dismissCleanup, resetDismissals, refreshCleanupReminder } from '../src/cleanup';
const old = () => Date.now() - 100 * 3600000;
const tab = (id: number, extra = {}) => ({ id, windowId: 1, index: id, title: `Public ${id}`, url: `https://example.com/${id}`, lastAccessed: old(), groupId: -1, active: false, pinned: false, status: 'complete', ...extra }) as chrome.tabs.Tab;
beforeEach(async () => { resetAllMocks(); await saveSettings(DEFAULT_SETTINGS); });
describe('idle cleanup safety', () => {
  it('excludes active, pinned, audio, loading, private windows, internal URLs, unknown ages and locked groups', async () => {
    const tabs = [tab(1), tab(2, { active: true }), tab(3, { pinned: true }), tab(4, { audible: true }), tab(5, { status: 'loading' }), tab(6, { incognito: true }), tab(7, { url: 'chrome://settings' }), tab(8, { lastAccessed: undefined }), tab(9, { groupId: 7 }), tab(10, { lastAccessed: Date.now() }), tab(11, { url: 'https://user:pass@example.com' })];
    vi.mocked(chrome.tabs.query).mockResolvedValue(tabs);
    vi.mocked(chrome.tabGroups.query).mockResolvedValue([{ id: 7, title: '保留' }] as any);
    await saveSettings({ ...DEFAULT_SETTINGS, pinnedGroups: ['保留'] });
    const preview = await previewCleanup(1);
    expect(preview.tabs.map(t => t.id)).toEqual([1]);
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('archives durably before closing, with group metadata and full navigation URL', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1, { groupId: 7, url: 'https://example.com/read?id=2#page' })]);
    vi.mocked(chrome.tabGroups.query).mockResolvedValue([{ id: 7, title: '阅读', color: 'blue', collapsed: true }] as any);
    vi.mocked(chrome.tabs.remove).mockImplementation(async () => {
      const archives = await listArchives();
      expect(archives[0].tabs[0]).toMatchObject({ groupName: '阅读', groupColor: 'blue', state: 'saved', url: 'https://example.com/read?id=2#page' });
    });
    const preview = await previewCleanup(1);
    expect(await archiveAndClose(preview.id, 1, [1])).toMatchObject({ closed: 1, kept: 0, failed: 0 });
    expect((await listArchives())[0].tabs[0].state).toBe('closed');
  });
  it('never closes when archive persistence fails', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1)]);
    const preview = await previewCleanup(1);
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(archiveAndClose(preview.id, 1, [1])).rejects.toThrow('Quota');
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
  it.each([{ active: true }, { audible: true }, { pinned: true }, { windowId: 2 }, { url: 'https://example.org/changed' }, { lastAccessed: Date.now() }, { groupId: 77 }])('revalidates immediately before close: %j', async (change) => {
    const original = tab(1);
    vi.mocked(chrome.tabs.query).mockResolvedValue([original]);
    const preview = await previewCleanup(1);
    vi.mocked(chrome.tabs.get).mockResolvedValue({ ...original, ...change });
    const result = await archiveAndClose(preview.id, 1, [1]);
    expect(result.closed).toBe(0); expect(result.kept).toBe(1);
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
  it('rejects other windows, expired previews and unselected IDs', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1)]);
    const preview = await previewCleanup(1);
    await expect(archiveAndClose(preview.id, 2, [1])).rejects.toThrow('窗口');
    await expect(archiveAndClose(preview.id, 1, [99])).rejects.toThrow('变化');
    await expect(archiveAndClose('missing', 1, [1])).rejects.toThrow('过期');
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
  it('records partial close failures without losing either archived URL', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1), tab(2)]);
    vi.mocked(chrome.tabs.remove).mockRejectedValueOnce(new Error('Tab disappeared')).mockResolvedValueOnce();
    const preview = await previewCleanup(1);
    expect(await archiveAndClose(preview.id, 1, [1, 2])).toMatchObject({ closed: 1, failed: 1 });
    expect((await listArchives())[0].tabs).toHaveLength(2);
  });
  it('keeps the recovery snapshot when the final status write fails', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1)]);
    const preview = await previewCleanup(1);
    const set = chrome.storage.local.set;
    let writes = 0;
    vi.mocked(set).mockImplementation(async (data: any) => {
      if (data.tabArchives && ++writes === 2) throw new Error('disk');
      // Persist through a separate in-test durable image.
      if (data.tabArchives) durable = structuredClone(data.tabArchives);
    });
    let durable: any[] = [];
    const result = await archiveAndClose(preview.id, 1, [1]);
    expect(result.closed).toBe(1); expect(durable[0].tabs[0].state).toBe('saved');
  });
  it('supports postponing and keeping URLs without closing or calling AI', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1)]);
    let preview = await previewCleanup(1);
    await dismissCleanup(preview.id, 1, [1], false);
    expect((await previewCleanup(1)).tabs).toHaveLength(0);
    await resetDismissals(); preview = await previewCleanup(1);
    await dismissCleanup(preview.id, 1, [1], true);
    expect((await previewCleanup(1)).tabs).toHaveLength(0);
    expect(chrome.tabs.remove).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('restores selected entries, preserves grouping, skips already-open URLs and retains archives', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1, { groupId: 7 }), tab(2, { groupId: 7 })]);
    vi.mocked(chrome.tabGroups.query).mockResolvedValue([{ id: 7, title: '阅读', color: 'blue', collapsed: true }] as any);
    const preview = await previewCleanup(1);
    await archiveAndClose(preview.id, 1, [1, 2]);
    const batch = (await listArchives())[0];
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1)]);
    expect(await restoreArchive(batch.id, 1)).toEqual({ restored: 1, existing: 1, failed: 0 });
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(100, { title: '阅读', color: 'blue', collapsed: true });
    expect(await listArchives()).toHaveLength(1);
  });
  it('hourly checking only updates local counts and never closes tabs or invokes a model', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([tab(1)]);
    await refreshCleanupReminder();
    expect((await chrome.storage.local.get('cleanupSummary')).cleanupSummary.count).toBe(1);
    expect(chrome.tabs.remove).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    await saveSettings({ ...DEFAULT_SETTINGS, cleanupReminder: false }); await refreshCleanupReminder();
    expect((await chrome.storage.local.get('cleanupSummary')).cleanupSummary.count).toBe(0);
  });
});
