import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAIEligible, redactUrl } from '../src/privacy';
import { DEFAULT_SETTINGS } from '../src/types';
import { suggest } from '../src/grouper';
import { getSettings, saveSettings, getDomainRules, saveDomainRules, importAll } from '../src/storage';
import { resetStores } from './setup';

beforeEach(() => { resetStores(); vi.mocked(fetch).mockReset(); });

describe('AI privacy boundary', () => {
  it('strips URL credentials, every query parameter and fragment without changing the original tab', () => {
    expect(redactUrl('https://user:secret@example.com/docs/page?token=secret&signature=signed#session'))
      .toBe('https://example.com/docs/page');
    expect(redactUrl('file:///private/data')).toBe('');
    expect(redactUrl('malformed')).toBe('');
  });

  it.each(['http://localhost:123/a', 'http://build-server/a', 'http://10.1.2.3/a', 'http://127.1/a',
    'http://172.16.1.2/a', 'http://192.168.2.3/a', 'http://169.254.169.254/a', 'http://100.64.0.1/a',
    'http://[::1]/a', 'http://[::ffff:192.168.1.1]/a', 'https://wiki.internal/a', 'https://nas.local/a', 'file:///a'])
  ('excludes %s by default', url => expect(isAIEligible(url, DEFAULT_SETTINGS)).toBe(false));

  it('matches exact and child domains, never unrelated suffixes', () => {
    const settings = { ...DEFAULT_SETTINGS, excludedDomains: ['*.company.example'] };
    expect(isAIEligible('https://company.example/a', settings)).toBe(false);
    expect(isAIEligible('https://wiki.company.example./a', settings)).toBe(false);
    expect(isAIEligible('https://notcompany.example/a', settings)).toBe(true);
    expect(isAIEligible('https://company.example.evil.example/a', settings)).toBe(true);
    expect(isAIEligible('http://172.32.0.1/a', settings)).toBe(true);
  });

  it('sends neither excluded tabs nor historical learning data to the model', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '[{"name":"文档","color":"blue","tabIds":[1]}]' } }] })));
    const settings = { ...DEFAULT_SETTINGS, provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:15721/tencent/v1', apiKey: 'test-only', model: 'test-model', excludedDomains: ['company.example'] };
    const result = await suggest([
      { id: 1, title: 'Public docs', url: 'https://docs.example.com/guide?token=URL_SECRET#PRIVATE_FRAGMENT' },
      { id: 2, title: 'CONFIDENTIAL_TITLE', url: 'https://wiki.company.example/private' },
    ], settings, { 'internal.example': 'PRIVATE_AFFINITY' }, [], 'PRIVATE_HISTORY', { corrections: 'PRIVATE_CORRECTION', existingGroups: ['开发文档'] });
    const payload = String(vi.mocked(fetch).mock.calls[0][1]?.body);
    for (const secret of ['URL_SECRET', 'PRIVATE_FRAGMENT', 'CONFIDENTIAL_TITLE', 'company.example', 'PRIVATE_HISTORY', 'PRIVATE_AFFINITY', 'PRIVATE_CORRECTION']) expect(payload).not.toContain(secret);
    expect(payload).toContain('https://docs.example.com/guide');
    expect(payload).toContain('开发文档');
    expect(result.suggestions.flatMap(g => g.tabs.map(t => t.id))).toEqual([1]);
    expect(result.suggestions[0].tabs[0].url).toContain('URL_SECRET'); // browser navigation is untouched
  });

  it('makes no model request when all tabs are excluded', async () => {
    const result = await suggest([{ id: 1, title: 'Private', url: 'http://localhost/private' }], DEFAULT_SETTINGS, {});
    expect(result.suggestions).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('local-only settings migration', () => {
  it('preserves settings, local token precedence and rules, then removes synchronized copies', async () => {
    await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, maxGroups: 9, apiKey: 'old-key' }, domainRules: [{ domain: 'example.com', groupName: '文档', color: 'blue' }] });
    await chrome.storage.local.set({ apiKeyLocal: 'new-key' });
    expect(await getSettings()).toMatchObject({ maxGroups: 9, apiKey: 'new-key' });
    expect(await getDomainRules()).toHaveLength(1);
    expect(await chrome.storage.sync.get(null)).toEqual({});
    await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'local-only' });
    await saveDomainRules([]);
    expect(await chrome.storage.sync.get(null)).toEqual({});
  });

  it('does not erase the synchronized copy if migration cannot write locally', async () => {
    await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, apiKey: 'recoverable-key' } });
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('storage failed'));
    await expect(getSettings()).rejects.toThrow('storage failed');
    expect((await chrome.storage.sync.get('settings')).settings).toMatchObject({ apiKey: 'recoverable-key' });
  });

  it('clears the existing token when imported settings change the recipient', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:15721/tencent/v1', apiKey: 'private-key' });
    await importAll({ settings: { ...DEFAULT_SETTINGS, provider: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKey: 'untrusted-import-key' }, affinity: {}, domainRules: [], workspaces: {} });
    expect((await getSettings()).apiKey).toBe('');
  });
});
