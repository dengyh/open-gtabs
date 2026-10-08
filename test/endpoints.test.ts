import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpointInfo, ensureEndpointAccess } from '../src/endpoints';
import { completeWithUsage, fetchOpenAIModels } from '../src/llm';
import { getSettings, saveSettings, importAll } from '../src/storage';
import { DEFAULT_SETTINGS } from '../src/types';
import { resetAllMocks } from './setup';
const config = { provider: 'openai-compatible', baseUrl: 'https://models.example.net/team/v1', model: 'custom-model', apiKey: 'fixture-key' };
beforeEach(() => resetAllMocks());

describe('generic OpenAI endpoints', () => {
  it.each(['http://127.0.0.1:15721/tencent/v1', 'http://localhost:8080/custom/v1', 'https://models.example.net/company/ai', 'https://models.example.net:8443/v1'])('supports configurable base URL %s', url => {
    expect(endpointInfo(url).baseUrl).toBe(url);
  });
  it('normalizes trailing slashes and requests only the exact HTTPS host', () => {
    expect(endpointInfo(' https://models.example.net:8443/company/v1/// ')).toMatchObject({
      baseUrl: 'https://models.example.net:8443/company/v1', permission: 'https://models.example.net/*',
    });
  });
  it.each(['http://models.example.net/v1', 'http://localhost.evil.example/v1', 'https://user:pass@models.example.net/v1',
    'https://models.example.net/v1?', 'https://models.example.net/v1#', 'https://models.example.net/v1?key=secret', 'https://models.example.net/v1#key', 'file:///tmp/v1',
    'https://*.example.net/v1', 'https://models.example.net/\nsecret', 'https://models.example.net/v1/chat/completions'])('rejects unsafe or incomplete base configuration %s', baseUrl => {
    expect(() => endpointInfo(baseUrl)).toThrow();
  });
  it('does not send credentials before the remote site is authorized', async () => {
    vi.mocked(chrome.permissions.contains).mockResolvedValue(false);
    await expect(completeWithUsage(config, [{ role: 'user', content: 'private tabs' }])).rejects.toThrow('授权');
    await expect(fetchOpenAIModels(config)).rejects.toThrow('授权');
    expect(fetch).not.toHaveBeenCalled(); expect(chrome.permissions.request).not.toHaveBeenCalled();
  });
  it('allows local endpoints using the existing host permissions', async () => {
    await ensureEndpointAccess('http://localhost:8080/custom/v1');
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });
  it('uses the configured path, bearer key and selected model with redirects blocked', async () => {
    vi.mocked(chrome.permissions.contains).mockResolvedValue(true);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })));
    expect((await completeWithUsage(config, [{ role: 'user', content: 'hello' }])).content).toBe('OK');
    expect(fetch).toHaveBeenCalledWith(config.baseUrl + '/chat/completions', expect.objectContaining({
      redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-key' },
      body: expect.stringContaining('"model":"custom-model"'),
    }));
  });
  it('discovers models without requiring an API key for unauthenticated local servers', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'my-model' }] })));
    expect(await fetchOpenAIModels({ ...config, baseUrl: 'http://localhost:8000/v1', apiKey: '' })).toEqual(['my-model']);
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/v1/models', expect.objectContaining({ headers: {}, redirect: 'error' }));
  });
});

describe('upgrade from the old provider', () => {
  it('preserves the existing local endpoint, key and model when reading old settings', async () => {
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, provider: 'tt-switch', baseUrl: 'http://127.0.0.1:15721/tencent/v1', model: 'existing-model' }, apiKeyLocal: 'existing-key' });
    expect(await getSettings()).toMatchObject({ provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:15721/tencent/v1', model: 'existing-model', apiKey: 'existing-key' });
  });
  it('does not carry a legacy key to a previously unsupported remote address', async () => {
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, provider: 'tt-switch', baseUrl: config.baseUrl }, apiKeyLocal: 'existing-key' });
    expect((await getSettings()).apiKey).toBe('');
  });
  it('preserves a key on importing the legacy name for the same endpoint, never a different endpoint', async () => {
    const settings = { ...DEFAULT_SETTINGS, ...config, baseUrl: 'http://127.0.0.1:15721/tencent/v1' };
    await saveSettings(settings);
    await importAll({ settings: { ...settings, provider: 'tt-switch', apiKey: 'untrusted-import' } } as any);
    expect((await getSettings()).apiKey).toBe('fixture-key');
    await importAll({ settings: { ...settings, baseUrl: 'https://another.example/v1' } } as any);
    expect((await getSettings()).apiKey).toBe('');
  });
});
it('does not recover a legacy local key for an unsupported remote address during sync migration', async () => {
  await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, provider: 'tt-switch', baseUrl: config.baseUrl } });
  await chrome.storage.local.set({ apiKeyLocal: 'legacy-local-key' });
  expect((await getSettings()).apiKey).toBe('');
  expect((await chrome.storage.local.get('apiKeyLocal')).apiKeyLocal).toBe('');
});
