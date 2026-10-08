import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resetAllMocks } from './setup';
import { saveSettings, getSettings } from '../src/storage';
import { DEFAULT_SETTINGS } from '../src/types';
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(r => process.nextTick(r)); };
let modelReply: any;
beforeEach(async () => {
  vi.resetModules(); resetAllMocks(); localStorage.clear();
  document.body.innerHTML = readFileSync(resolve(__dirname, '../src/options.html'), 'utf8');
  await saveSettings({ ...DEFAULT_SETTINGS, provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:15721/tencent/v1', model: 'custom-current', apiKey: 'fixture-token' });
  modelReply = { models: ['model-a', 'model-b'] };
  vi.mocked(chrome.runtime.sendMessage).mockImplementation((msg: any, callback: any) => {
    callback(msg.type === 'fetch-models' ? modelReply : { status: 'done' });
  });
});
it('loads models while retaining the configured custom model, then saves dropdown choices', async () => {
  await import('../src/options'); await flush();
  const select = document.getElementById('model-select') as HTMLSelectElement;
  expect(Array.from(select.options).map(o => o.value)).toEqual(['custom-current', 'model-a', 'model-b']);
  expect(select.value).toBe('custom-current');
  select.value = 'model-b'; select.dispatchEvent(new Event('change')); await flush();
  expect((await getSettings()).model).toBe('model-b');
  expect((await getSettings()).apiKey).toBe('fixture-token');
});
it('leaves the chosen model unchanged when model discovery fails', async () => {
  modelReply = { error: 'HTTP 401' };
  await import('../src/options'); await flush();
  expect((await getSettings()).model).toBe('custom-current');
  expect(document.getElementById('models-status')?.textContent).toContain('401');
  const custom = document.getElementById('custom-model') as HTMLInputElement;
  custom.value = 'manual-id'; custom.dispatchEvent(new Event('change')); await flush();
  expect((await getSettings()).model).toBe('manual-id');
});
it('ignores a model list that arrives after switching providers', async () => {
  let reply: Function | undefined;
  vi.mocked(chrome.runtime.sendMessage).mockImplementation((msg: any, callback: any) => {
    if (msg.type === 'fetch-models') reply = callback;
    else callback({ status: 'done' });
  });
  await import('../src/options'); await flush();
  (document.querySelector('#provider-grid .provider-card:last-child') as HTMLElement).click(); await flush();
  reply?.({ models: ['stale-tt-model'] }); await flush();
  expect((document.getElementById('model-select') as HTMLSelectElement).textContent).not.toContain('stale-tt-model');
  expect((await getSettings()).provider).toBe('ollama');
});
it('clears the old key when changing endpoints and saves the new destination without it', async () => {
  await import('../src/options'); await flush();
  const base = document.getElementById('base-url') as HTMLInputElement;
  base.value = 'https://models.example.net/custom/v1'; base.dispatchEvent(new Event('input')); base.dispatchEvent(new Event('change')); await flush();
  expect((document.getElementById('apiKey') as HTMLInputElement).value).toBe('');
  expect(await getSettings()).toMatchObject({ baseUrl: base.value, apiKey: '', model: 'custom-current' });
  expect(chrome.permissions.request).not.toHaveBeenCalled();
});
it('preserves the key when only a trailing slash changes', async () => {
  await import('../src/options'); await flush();
  const base = document.getElementById('base-url') as HTMLInputElement;
  base.value += '/'; base.dispatchEvent(new Event('input')); base.dispatchEvent(new Event('change')); await flush();
  expect((await getSettings()).apiKey).toBe('fixture-token');
});
it('requests only the configured host from an explicit authorization click', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, provider: 'openai-compatible', baseUrl: 'https://models.example.net:8443/custom/v1', model: 'current', apiKey: '' });
  await import('../src/options'); await flush();
  expect(chrome.permissions.request).not.toHaveBeenCalled();
  const button = document.getElementById('authorize-endpoint') as HTMLButtonElement;
  expect(button.hidden).toBe(false);
  vi.mocked(chrome.permissions.request).mockImplementation(async () => {
    vi.mocked(chrome.permissions.contains).mockResolvedValue(true); return true;
  });
  button.click(); await flush();
  expect(chrome.permissions.request).toHaveBeenCalledExactlyOnceWith({ origins: ['https://models.example.net/*'] });
  expect(button.hidden).toBe(true);
  expect(document.getElementById('endpoint-status')?.textContent).toContain('已授权');
});
it('handles a denied host permission without changing the configured model', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, provider: 'openai-compatible', baseUrl: 'https://models.example.net/v1', model: 'current', apiKey: '' });
  await import('../src/options'); await flush();
  (document.getElementById('authorize-endpoint') as HTMLButtonElement).click(); await flush();
  expect(document.getElementById('endpoint-status')?.textContent).toContain('未授权');
  expect((await getSettings()).model).toBe('current');
});
it('retains a custom endpoint when clicking the selected provider again', async () => {
  await import('../src/options'); await flush();
  (document.querySelector('#provider-grid .provider-card.selected') as HTMLElement).click(); await flush();
  expect((document.getElementById('base-url') as HTMLInputElement).value).toBe('http://127.0.0.1:15721/tencent/v1');
  expect((await getSettings()).apiKey).toBe('fixture-token');
});
it('keeps an immediate connection failure visible after a pending autosave', async () => {
  await import('../src/options'); await flush();
  vi.useFakeTimers();
  try {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((msg: any, callback: any) => callback(msg.type === 'test-connection' ? { error: '尚未授权此模型服务' } : { status: 'done' }));
    const base = document.getElementById('base-url') as HTMLInputElement;
    base.value = 'https://models.example.net/v1'; base.dispatchEvent(new Event('input'));
    (document.getElementById('test-btn') as HTMLButtonElement).click(); await flush();
    await vi.advanceTimersByTimeAsync(300);
    expect(document.getElementById('test-result')?.textContent).toContain('尚未授权');
  } finally { vi.useRealTimers(); }
});
it('ignores a successful connection response for a configuration edited while waiting', async () => {
  await import('../src/options'); await flush();
  let reply: Function | undefined;
  vi.mocked(chrome.runtime.sendMessage).mockImplementation((msg: any, callback: any) => {
    if (msg.type === 'test-connection') reply = callback;
    else callback({ status: 'done' });
  });
  (document.getElementById('test-btn') as HTMLButtonElement).click(); await flush();
  const base = document.getElementById('base-url') as HTMLInputElement;
  base.value = 'http://localhost:8001/another/v1'; base.dispatchEvent(new Event('input')); base.dispatchEvent(new Event('change')); await flush();
  reply?.({ status: 'done' }); await flush();
  expect(document.getElementById('test-result')?.textContent).not.toContain('连接成功');
});
it('renders English model settings and saves a language change without losing credentials', async () => {
  await saveSettings({ ...(await getSettings()), language: 'en' });
  await import('../src/options'); await flush();
  expect(document.documentElement.lang).toBe('en');
  expect(document.getElementById('test-btn')?.textContent).toBe('Test connection');
  expect(document.querySelector('.provider-card.selected .name')?.textContent).toBe('OpenAI-compatible');
  expect(document.getElementById('models-status')?.textContent).toContain('Loaded 2 models');
  const language = document.getElementById('language') as HTMLSelectElement;
  language.value = 'zh-CN'; language.dispatchEvent(new Event('change')); await flush();
  expect(await getSettings()).toMatchObject({ language: 'zh-CN', model: 'custom-current', apiKey: 'fixture-token', baseUrl: 'http://127.0.0.1:15721/tencent/v1' });
  expect(document.getElementById('test-btn')?.textContent).toBe('测试连接');
  expect(chrome.permissions.request).not.toHaveBeenCalled();
});
