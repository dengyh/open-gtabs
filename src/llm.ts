import { tr } from './i18n';
import type { LLMConfig } from './types';
import { ensureEndpointAccess } from './endpoints';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

const LLM_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 4096;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = LLM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(tr("模型请求超时（{0} 秒）", timeoutMs / 1000));
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function isChromeAIAvailable(): boolean {
  return typeof globalThis.LanguageModel !== 'undefined';
}

async function completeChromeAI(messages: Message[]): Promise<CompletionResult> {
  const LM = globalThis.LanguageModel;
  if (!LM) throw new Error(tr("Chrome 内置 AI 当前不可用，请改用 OpenAI 兼容接口或检查浏览器模型设置。"));

  const systemPrompt = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const userContent = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');

  const session = await LM.create(systemPrompt ? { systemPrompt } : {});
  try {
    const content = await session.prompt(userContent);
    return {
      content,
      inputTokens: estimateTokens(systemPrompt + userContent),
      outputTokens: estimateTokens(content),
    };
  } finally {
    session.destroy();
  }
}

async function completeOpenAI(config: LLMConfig, messages: Message[]): Promise<CompletionResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = config.apiKey.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const inputText = messages.map(m => m.content).join('');

  const res = await fetchWithTimeout(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
    method: 'POST',
    redirect: 'error',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
    }),
  });

  if (!res.ok) throw new Error(tr("模型服务返回 HTTP {0}，请检查连接、额度和模型配置。", res.status));

  const data = await res.json();
  const choice = data.choices?.[0];
  if (choice?.message?.content == null) throw new Error(tr("模型返回了空内容"));
  const content = choice.message.content;
  return {
    content,
    inputTokens: data.usage?.prompt_tokens ?? estimateTokens(inputText),
    outputTokens: data.usage?.completion_tokens ?? estimateTokens(content),
  };
}

function validateLocalEndpoint(baseUrl: string, path: string): void {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error(tr("请输入有效的本机模型接口地址")); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || normalizeBaseUrl(url.pathname) !== path || url.username || url.password || url.search || url.hash) {
    throw new Error(tr("Ollama 预设仅允许本机 /v1 地址；其他地址请使用 OpenAI 兼容接口"));
  }
}

export async function complete(config: LLMConfig, messages: Message[]): Promise<string> {
  const result = await completeWithUsage(config, messages);
  return result.content;
}

export async function completeWithUsage(config: LLMConfig, messages: Message[]): Promise<CompletionResult> {
  if (!config.baseUrl && config.model === 'gemini-nano' && (!config.provider || config.provider === 'chrome-ai')) {
    return completeChromeAI(messages);
  }
  if (config.provider === 'openai-compatible') {
    config = { ...config, baseUrl: await ensureEndpointAccess(config.baseUrl) };
    if (!config.model.trim()) throw new Error(tr("请填写或选择模型 ID"));
  } else if (!config.provider || config.provider === 'ollama') {
    validateLocalEndpoint(config.baseUrl, '/v1');
  } else {
    throw new Error(tr("请选择 OpenAI 兼容接口、Ollama 或 Chrome 内置 AI"));
  }
  return completeOpenAI(config, messages);
}

export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  validateLocalEndpoint(baseUrl, '/v1');
  const base = baseUrl.replace(/\/v1\/?$/, '');
  const res = await fetchWithTimeout(`${base}/api/tags`, { method: 'GET', redirect: 'error' }, 5000);
  if (!res.ok) throw new Error(tr("无法连接 Ollama"));
  const data = await res.json();
  return (data.models || []).map((m: any) => m.name || m.model).filter(Boolean) as string[];
}

export async function fetchOpenAIModels(config: LLMConfig): Promise<string[]> {
  if (config.provider !== 'openai-compatible') throw new Error(tr("请先选择 OpenAI 兼容接口"));
  const baseUrl = await ensureEndpointAccess(config.baseUrl);
  const headers: Record<string, string> = {};
  if (config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  const res = await fetchWithTimeout(`${baseUrl}/models`, {
    method: 'GET', redirect: 'error', headers,
  }, 8000);
  if (!res.ok) throw new Error(tr("模型列表读取失败（HTTP {0}），当前模型保持不变，可手动填写模型 ID。", res.status));
  const data = await res.json();
  if (!Array.isArray(data?.data)) throw new Error(tr("模型列表格式不受支持，可手动填写模型 ID。"));
  const models = [...new Set<string>(data.data.map((m: unknown) =>
    m && typeof m === 'object' && 'id' in m && typeof m.id === 'string' ? m.id.trim() : '',
  ).filter((id: string) => id && id.length <= 200 && !/[\x00-\x1f]/.test(id)))].sort();
  if (!models.length) throw new Error(tr("接口未返回模型，当前模型保持不变。"));
  return models;
}

export async function testConnection(config: LLMConfig): Promise<string> {
  const result = await completeWithUsage(config, [
    { role: 'user', content: 'Reply with exactly: OK' },
  ]);
  return result.content;
}
