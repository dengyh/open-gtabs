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
  await saveSettings({ ...DEFAULT_SETTINGS, provider: 'tt-switch', baseUrl: 'http://127.0.0.1:15721/tencent/v1', model: 'custom-current', apiKey: 'fixture-token' });
  modelReply = { models: ['model-a', 'model-b'] };
  vi.mocked(chrome.runtime.sendMessage).mockImplementation((msg: any, callback: any) => {
    callback(msg.type === 'fetch-tt-models' ? modelReply : { status: 'done' });
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
    if (msg.type === 'fetch-tt-models') reply = callback;
    else callback({ status: 'done' });
  });
  await import('../src/options'); await flush();
  (document.querySelector('#provider-grid .provider-card:last-child') as HTMLElement).click(); await flush();
  reply?.({ models: ['stale-tt-model'] }); await flush();
  expect((document.getElementById('model-select') as HTMLSelectElement).textContent).not.toContain('stale-tt-model');
  expect((await getSettings()).provider).toBe('ollama');
});
