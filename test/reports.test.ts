import { beforeEach, expect, it, vi } from 'vitest';
import { resetAllMocks } from './setup';
import { DEFAULT_SETTINGS } from '../src/types';
import { initialReport } from '../src/reports';
import { organize, applyGroups } from '../src/background';
import { saveSettings, getStats } from '../src/storage';
beforeEach(() => resetAllMocks());
it('accounts for every tab including domain exclusions, private hosts, grouped and protected tabs', () => {
  const tabs = [
    { id: 1, url: 'chrome://settings' }, { id: 2, url: 'http://10.0.0.1' }, { id: 3, url: 'https://sub.company.example' },
    { id: 4, url: 'https://example.com', groupId: 4 }, { id: 5, url: 'https://example.org', groupId: 5 }, { id: 6, url: 'https://example.net', groupId: -1 },
  ];
  const report = initialReport(tabs as any, [{ id: 5, title: '锁定' }] as any, { ...DEFAULT_SETTINGS, excludedDomains: ['company.example'], pinnedGroups: ['锁定'] }, 1, true);
  expect(report.items.map(t => t.reason)).toEqual(['unsupported', 'private', 'excluded', 'grouped', 'protected', 'unmatched']);
});
it('returns explanations even when no AI call can be made', async () => {
  vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1, url: 'https://example.com' }, { id: 2, url: 'chrome://newtab' }] as any);
  const result = await organize();
  expect(result.error).toBeTruthy(); expect(result.report?.items.map(t => t.reason)).toEqual(['insufficient', 'unsupported']);
  expect(fetch).not.toHaveBeenCalled();
});
it('reports failed or moved tabs and counts only confirmed applied tabs', async () => {
  const tabs = [1, 2, 3].map(id => ({ id, url: `https://example.com/${id}`, groupId: -1, windowId: 1 }));
  vi.mocked(chrome.tabs.query).mockResolvedValue(tabs as any);
  let grouped = false;
  vi.mocked(chrome.tabs.get).mockImplementation(async id => ({ ...tabs[id - 1], windowId: id === 3 ? 2 : 1, groupId: grouped && id === 1 ? 100 : -1 }) as any);
  vi.mocked(chrome.tabs.group).mockImplementation(async () => { grouped = true; return 100; });
  const report = await applyGroups([{ name: '测试', color: 'blue', tabs: tabs.map(t => ({ ...t, title: '' })) }]);
  expect(report.items.map(t => t.reason)).toEqual(['applied', 'failed', 'changed']);
  expect((await getStats()).totalTabsGrouped).toBe(1);
});
it('preserves the originating window throughout model completion', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'test' });
  vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1, url: 'https://example.com' }, { id: 2, url: 'https://example.org' }] as any);
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '[{"name":"测试","color":"blue","tabIds":[1,2]}]' } }] })));
  expect((await organize(false, 42)).report?.windowId).toBe(42);
  expect(chrome.tabs.query).toHaveBeenCalledWith({ windowId: 42 });
});
