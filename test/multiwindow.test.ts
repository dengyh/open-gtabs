import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { resetAllMocks } from './setup';
import { DEFAULT_SETTINGS } from '../src/types';
import { getSuggestions, getUndoSnapshot, saveSettings, saveSuggestions, saveUndoSnapshot } from '../src/storage';
import { _resetAutoCheckCooldown, applyGroups, undoLastGrouping } from '../src/background';

const windows = [1, 2].map(id => ({ id, type: 'normal', incognito: false }));
let tabs: any[];
const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const fire = async (event: any, ...args: any[]) => { await event.callListeners(...args); await flush(); };
const modelReply = () => new Response(JSON.stringify({ choices: [{ message: { content: '[]' } }] }), { status: 200 });
const addTab = (id: number, windowId: number, extra = {}) => {
  const tab = { id, windowId, url: `https://example.com/${id}`, title: `Page ${id}`, groupId: -1, status: 'complete', ...extra };
  tabs.push(tab); return tab;
};

beforeEach(async () => {
  resetAllMocks(); _resetAutoCheckCooldown();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  tabs = []; addTab(11, 1); addTab(12, 1); addTab(21, 2); addTab(22, 2);
  vi.mocked(chrome.windows.getAll).mockResolvedValue(windows as any);
  vi.mocked(chrome.windows.get).mockImplementation(async id => {
    const win = windows.find(w => w.id === id);
    if (!win) throw new Error('No window'); return win as any;
  });
  vi.mocked(chrome.tabs.query).mockImplementation(async query => tabs.filter(t =>
    (query.windowId === undefined || t.windowId === query.windowId) && (!query.currentWindow || t.windowId === 1)));
  vi.mocked(chrome.tabs.get).mockImplementation(async id => ({ ...tabs.find(t => t.id === id) }));
  vi.mocked(fetch).mockImplementation(async () => modelReply());
  await saveSettings({ ...DEFAULT_SETTINGS, provider: 'tt-switch', apiKey: 'test-key', model: 'test-model',
    baseUrl: 'http://127.0.0.1:15721/tencent/v1', autoTrigger: true, threshold: 2, silentAutoAdd: false });
});
afterEach(() => vi.useRealTimers());

describe('multi-window automatic organization', () => {
  it('handles events from both windows even when the current window is always 1', async () => {
    await Promise.all([
      fire(chrome.tabs.onCreated, tabs[0]), fire(chrome.tabs.onCreated, tabs[2]),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = vi.mocked(fetch).mock.calls.map(call => String(call[1]?.body));
    expect(bodies[0]).toContain('Page 11'); expect(bodies[0]).not.toContain('Page 21');
    expect(bodies[1]).toContain('Page 21'); expect(bodies[1]).not.toContain('Page 11');
  });

  it('queues another window while the first model call is still running', async () => {
    let release!: (reply: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = (chrome.tabs.onCreated as any).callListeners(tabs[0]);
    await flush();
    const second = (chrome.tabs.onCreated as any).callListeners(tabs[2]);
    const repeated = (chrome.tabs.onCreated as any).callListeners(tabs[3]);
    await flush(); expect(fetch).toHaveBeenCalledTimes(1);
    release(modelReply()); await Promise.all([first, second, repeated]); await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('applies each model response to its own window without moving tabs', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const ids = String(init?.body).includes('Page 11') ? [11, 12] : [21, 22];
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([
        { name: ids[0] === 11 ? 'First' : 'Second', color: 'blue', tabIds: ids },
      ]) } }] }));
    });
    await fire(chrome.alarms.onAlarm, { name: 'gtabs-check' });
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [11, 12], createProperties: { windowId: 1 } });
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [21, 22], createProperties: { windowId: 2 } });
    expect(chrome.tabs.move).not.toHaveBeenCalled();
  });

  it('does not consume the cooldown before a new tab finishes loading', async () => {
    tabs = [tabs[2]];
    await fire(chrome.tabs.onCreated, addTab(22, 2, { url: undefined, status: 'loading' }));
    expect(fetch).not.toHaveBeenCalled();
    tabs[1].url = 'https://example.com/22'; tabs[1].status = 'complete';
    await fire(chrome.tabs.onUpdated, 22, { status: 'complete' }, tabs[1]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries only the affected window after its cooldown', async () => {
    await fire(chrome.tabs.onCreated, tabs[0]);
    await fire(chrome.tabs.onCreated, addTab(13, 1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(chrome.alarms.create).toHaveBeenCalledWith('gtabs-window-check-1', { when: Date.now() + 60_000 });
    await fire(chrome.tabs.onCreated, tabs[2]);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    await fire(chrome.alarms.onAlarm, { name: 'gtabs-window-check-1' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('checks all normal non-private windows on the periodic alarm', async () => {
    vi.mocked(chrome.windows.getAll).mockResolvedValue([...windows,
      { id: 3, type: 'popup' }, { id: 4, type: 'normal', incognito: true }] as any);
    await fire(chrome.alarms.onAlarm, { name: 'gtabs-check' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(chrome.windows.get).not.toHaveBeenCalledWith(3);
    expect(chrome.windows.get).not.toHaveBeenCalledWith(4);
  });

  it('runs scheduled reorganization in both windows even with auto trigger off', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, provider: 'tt-switch', apiKey: 'test-key', model: 'test-model',
      baseUrl: 'http://127.0.0.1:15721/tencent/v1', autoTrigger: false, reorgSchedule: 'daily' });
    await fire(chrome.alarms.onAlarm, { name: 'gtabs-reorg' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('continues to the second window if the first closes before the check', async () => {
    vi.mocked(chrome.windows.get).mockRejectedValueOnce(new Error('No window'));
    await fire(chrome.alarms.onAlarm, { name: 'gtabs-check' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][1]?.body)).toContain('Page 21');
  });

  it('ignores incognito window events', async () => {
    vi.mocked(chrome.windows.get).mockResolvedValue({ id: 2, type: 'normal', incognito: true } as any);
    await fire(chrome.tabs.onCreated, tabs[2]); expect(fetch).not.toHaveBeenCalled();
  });
});

describe('local routing stays in the source window', () => {
  beforeEach(async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, autoTrigger: false, silentAutoAdd: true });
    await chrome.storage.local.set({ affinity: { 'example.com': 'Docs' } });
  });
  it('creates the group explicitly in a background window', async () => {
    await fire(chrome.tabs.onUpdated, 21, { status: 'complete' }, tabs[2]);
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [21], createProperties: { windowId: 2 } });
  });
  it('does not pull a tab back after it moves to another window', async () => {
    const eventTab = { ...tabs[2] }; tabs[2].windowId = 1;
    await fire(chrome.tabs.onUpdated, 21, { status: 'complete' }, eventTab);
    expect(chrome.tabs.group).not.toHaveBeenCalled();
  });
  it('reuses a group only inside the source window', async () => {
    vi.mocked(chrome.tabGroups.query).mockImplementation(async query => query.windowId === 2
      ? [{ id: 202, windowId: 2, title: 'Docs' }] as any : [{ id: 101, windowId: 1, title: 'Docs' }] as any);
    await fire(chrome.tabs.onUpdated, 21, { status: 'complete' }, tabs[2]);
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [21], groupId: 202 });
  });
});

describe('window-specific suggestions and undo', () => {
  it('keeps previews from both windows, and clearing one leaves the other', async () => {
    const a = [{ name: 'A', color: 'blue' as const, tabs: [tabs[0]] }];
    const b = [{ name: 'B', color: 'red' as const, tabs: [tabs[2]] }];
    await saveSuggestions(a, 1); await saveSuggestions(b, 2);
    expect(await getSuggestions(1)).toEqual(a); expect(await getSuggestions(2)).toEqual(b);
    await saveSuggestions(null, 1); expect(await getSuggestions(2)).toEqual(b);
  });
  it('retains separate undo records after both windows auto apply', async () => {
    await applyGroups([{ name: 'A', color: 'blue', tabs: [tabs[0], tabs[1]] }], 1);
    await applyGroups([{ name: 'B', color: 'red', tabs: [tabs[2], tabs[3]] }], 2);
    expect((await getUndoSnapshot(1))?.ungrouped).toEqual([11, 12]);
    expect((await getUndoSnapshot(2))?.ungrouped).toEqual([21, 22]);
    expect(await undoLastGrouping()).toEqual({});
    expect(chrome.tabs.ungroup).toHaveBeenCalledWith([11, 12]);
    expect(await getUndoSnapshot(1)).toBeNull(); expect(await getUndoSnapshot(2)).not.toBeNull();
  });
  it('uses the sender window for undo messages even when the worker current window differs', async () => {
    await saveUndoSnapshot({ windowId: 2, timestamp: Date.now(), groups: [], ungrouped: [21, 22] }, 2);
    const response: any = await new Promise(resolve => {
      for (const listener of (chrome.runtime.onMessage as any).listeners) listener({ type: 'undo' }, { tab: { windowId: 2 } }, resolve);
    });
    expect(response.status).toBe('undone');
    expect(chrome.tabs.ungroup).toHaveBeenCalledWith([21, 22]);
  });

  it('uses the last focused window for actions without a sender tab', async () => {
    await saveUndoSnapshot({ windowId: 2, timestamp: Date.now(), groups: [], ungrouped: [21, 22] }, 2);
    vi.mocked(chrome.windows.getLastFocused).mockResolvedValue({ id: 2 } as any);
    expect(await undoLastGrouping()).toEqual({});
    expect(chrome.tabs.ungroup).toHaveBeenCalledWith([21, 22]);
  });

  it('reads legacy records only in their original window', async () => {
    await chrome.storage.local.set({ suggestions: [{ name: 'Old' }], suggestionsWindowId: 2 });
    await saveUndoSnapshot({ windowId: 2, timestamp: 1, groups: [], ungrouped: [21] });
    expect(await getSuggestions(1)).toBeNull(); expect(await getSuggestions(2)).toHaveLength(1);
    expect(await getUndoSnapshot(1)).toBeNull(); expect(await getUndoSnapshot(2)).not.toBeNull();
    await saveSuggestions(null, 2); await saveUndoSnapshot(null, 2);
    expect(await getSuggestions(2)).toBeNull(); expect(await getUndoSnapshot(2)).toBeNull();
  });
});
