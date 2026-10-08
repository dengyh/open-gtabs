import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import english from '../src/locales/en.json';
import { getLocale, localizeDocument, normalizeLanguage, resolveLanguage, setLanguage, tr } from '../src/i18n';
import { resetAllMocks } from './setup';
import { getSettings, saveSettings, importAll } from '../src/storage';
import { DEFAULT_SETTINGS, COLOR_LABELS, PROVIDERS } from '../src/types';
import { REASON_LABELS } from '../src/reports';
import { buildPrompt, suggest } from '../src/grouper';
import '../src/background';
const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(r => process.nextTick(r)); };
beforeEach(() => { resetAllMocks(); setLanguage('auto'); });
afterEach(() => setLanguage('auto'));

it('follows the browser and falls back to English for unsupported locales', () => {
  for (const locale of ['zh', 'zh-CN', 'zh-TW', 'zh_HK']) expect(resolveLanguage('auto', locale)).toBe('zh-CN');
  for (const locale of ['en-US', 'fr-FR', 'ja', '']) expect(resolveLanguage('auto', locale)).toBe('en');
  expect(resolveLanguage('en', 'zh-CN')).toBe('en');
  expect(resolveLanguage('zh-CN', 'en-US')).toBe('zh-CN');
  expect(normalizeLanguage('fr')).toBe('auto');
  vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('de'); setLanguage('auto');
  expect(getLocale()).toBe('en');
});

it('interpolates user data once, retaining braces, dollar signs and Chinese names', () => {
  setLanguage('en');
  expect(tr('找不到工作区“{0}”', '工作 {1} $& <x>')).toBe('Workspace “工作 {1} $& <x>” was not found');
  expect(tr('a missing future message')).toBe('a missing future message');
});

it('localizes marked labels and attributes without translating inputs or user content', () => {
  document.body.innerHTML = '<button data-i18n="设置">设置</button><input value="设置" placeholder="分组名称" data-i18n-placeholder="分组名称"><p>设置</p>';
  setLanguage('en'); localizeDocument();
  expect(document.documentElement.lang).toBe('en');
  expect(document.querySelector('button')?.textContent).toBe('Settings');
  expect(document.querySelector('input')?.placeholder).toBe('Group name');
  expect(document.querySelector('input')?.value).toBe('设置');
  expect(document.querySelector('p')?.textContent).toBe('设置');
  setLanguage('zh-CN'); localizeDocument();
  expect(document.querySelector('button')?.textContent).toBe('设置');
});

it('keeps existing configuration while defaulting and persisting language preferences', async () => {
  const { language, ...legacy } = { ...DEFAULT_SETTINGS, provider: 'openai-compatible', baseUrl: 'http://localhost:8000/v1', model: 'custom' };
  await chrome.storage.local.set({ settings: legacy, apiKeyLocal: 'fixture-only' });
  expect(await getSettings()).toMatchObject({ language: 'auto', model: 'custom', apiKey: 'fixture-only' });
  await saveSettings({ ...(await getSettings()), language: 'en' });
  expect(await getSettings()).toMatchObject({ language: 'en', model: 'custom', apiKey: 'fixture-only' });
  await importAll({ settings: { ...legacy, language: 'invalid' }, affinity: {}, domainRules: [], workspaces: {} } as any);
  expect(await getSettings()).toMatchObject({ language: 'auto', model: 'custom', apiKey: 'fixture-only' });
});

it('selects the AI naming language without translating existing names', async () => {
  const tabs = [{ id: 1, title: '设置', url: 'https://example.com/a' }, { id: 2, title: 'Reading', url: 'https://example.net/b' }];
  const prompt = buildPrompt(tabs, 6, {}, 80, '', { existingGroups: ['技术阅读', 'Work'] }, 'en');
  expect(prompt).toContain('concise English group names');
  expect(prompt).toContain('["技术阅读","Work"]');
  expect(prompt).toContain('Preserve existing group names exactly');
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '[{"tabIds":[1]}]' } }] })));
  const result = await suggest(tabs, { ...DEFAULT_SETTINGS, language: 'en', provider: 'openai-compatible', baseUrl: 'http://localhost:8000/v1', model: 'fixture' }, {});
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
  expect(body.messages[1].content).toContain('concise English group names');
  expect(result.suggestions.map(g => g.name)).toEqual(['Unnamed', 'Other']);
});

it('restores language for background messages after a worker starts', async () => {
  setLanguage('zh-CN');
  await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, language: 'en' } });
  const reply = vi.fn();
  await (chrome.runtime.onMessage as any).callListeners({ type: 'purge-stale' }, {}, reply);
  await flush();
  expect(reply).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Preview and select tabs') }));
});

it('rebuilds translated context menus and preserves user group names', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, language: 'en' });
  vi.mocked(chrome.tabGroups.query).mockResolvedValue([{ id: 7, title: '查找重复标签', windowId: 1, color: 'blue', collapsed: false }] as any);
  await (chrome.tabGroups.onCreated as any).callListeners({ id: 7 });
  expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'gtabs-organize', title: 'Organize tabs in this window' }), expect.any(Function));
  expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'gtabs-add-to-group-7', title: '查找重复标签' }), expect.any(Function));
  await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, language: 'zh-CN' } });
  await (chrome.storage.onChanged as any).callListeners({ settings: { oldValue: { language: 'en' }, newValue: { language: 'zh-CN' } } }, 'local');
  await flush();
  expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'gtabs-organize', title: '整理当前窗口标签' }), expect.any(Function));
});

it('has English translations for source messages, static pages, providers, reasons and colors', () => {
  const messages = new Set<string>([...Object.values(COLOR_LABELS), ...Object.values(REASON_LABELS), ...PROVIDERS.flatMap(p => [p.name, p.helpText!])]);
  for (const file of readdirSync(resolve(__dirname, '../src')).filter(f => f.endsWith('.ts'))) {
    const source = ts.createSourceFile(file, readFileSync(resolve(__dirname, '../src', file), 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'tr' && ts.isStringLiteral(node.arguments[0])) messages.add(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const file of ['options.html', 'popup.html']) {
    document.body.innerHTML = readFileSync(resolve(__dirname, '../src', file), 'utf8');
    for (const el of document.querySelectorAll('*')) for (const attr of el.attributes) if (attr.name.startsWith('data-i18n')) messages.add(attr.value);
    setLanguage('en'); localizeDocument();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (['STYLE', 'SCRIPT'].includes(node.parentElement?.tagName || '')) continue;
      const value = node.textContent?.trim();
      if (value === '简体中文' || value === 'Language / 界面语言') continue;
      expect(value, `${file}: untranslated text`).not.toMatch(/\p{Script=Han}/u);
    }
  }
  for (const message of messages) expect(english, message).toHaveProperty(message);
});

it('keeps translation placeholders intact and packages both native locales', () => {
  const parameters = (s: string) => s.match(/\{\d+\}/g)?.sort() ?? [];
  for (const [source, translation] of Object.entries(english)) expect(parameters(translation), source).toEqual(parameters(source));
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../manifest.json'), 'utf8'));
  expect(manifest.name).toBe('gTabs'); expect(manifest.default_locale).toBe('en');
  for (const locale of ['en', 'zh_CN']) {
    const messages = JSON.parse(readFileSync(resolve(__dirname, '../_locales', locale, 'messages.json'), 'utf8'));
    for (const reference of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) expect(messages[reference[1]]?.message).toBeTruthy();
  }
});
