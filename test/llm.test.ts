import { describe, it, expect, vi, beforeEach } from 'vitest';
import { complete, completeWithUsage, fetchOllamaModels, testConnection, isChromeAIAvailable } from '../src/llm';
import type { LLMConfig } from '../src/types';

const cfg: LLMConfig = { baseUrl: 'http://localhost:11434/v1', apiKey: 'sk-test', model: 'test-model' };

function mockOk(content: string) {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content } }],
  })));
}

beforeEach(() => { vi.mocked(fetch).mockReset(); });

describe('complete - request format', () => {
  it('uses an arbitrary local gateway path with the selected model', async () => {
    mockOk('OK');
    await complete({ provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:15721/tencent/v1', apiKey: 'ttsw-test', model: 'gemini-3.5-flash' }, [{ role: 'user', content: 'hi' }]);
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:15721/tencent/v1/chat/completions', expect.objectContaining({ redirect: 'error', body: expect.stringContaining('gemini-3.5-flash') }));
  });

  it.each(['https://example.com/tencent/v1', 'https://api.anthropic.com', 'http://remote.example/v1'])('refuses to send a key to %s', async (baseUrl) => {
    await expect(complete({ ...cfg, provider: 'openai-compatible', baseUrl }, [])).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends correct OpenAI-compatible request shape', async () => {
    mockOk('hello');
    await complete(cfg, [{ role: 'user', content: 'hi' }]);

    expect(fetch).toHaveBeenCalledWith('http://localhost:11434/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-test' },
      body: expect.stringContaining('"model":"test-model"'),
    }));
  });

  it('sends temperature in body', async () => {
    mockOk('ok');
    await complete(cfg, [{ role: 'user', content: 'test' }]);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.temperature).toBe(0.2);
  });

  it('sends all messages in order', async () => {
    mockOk('ok');
    const msgs = [
      { role: 'system' as const, content: 'sys' },
      { role: 'user' as const, content: 'usr' },
      { role: 'assistant' as const, content: 'asst' },
    ];
    await complete(cfg, msgs);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.messages).toEqual(msgs);
  });

  it('omits Authorization header when apiKey is empty', async () => {
    mockOk('ok');
    await complete({ ...cfg, apiKey: '' }, [{ role: 'user', content: 'hi' }]);
    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('omits Authorization header when apiKey is only whitespace', async () => {
    mockOk('ok');
    await complete({ ...cfg, apiKey: '   ' }, [{ role: 'user', content: 'hi' }]);
    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('constructs URL from baseUrl correctly', async () => {
    mockOk('ok');
    await complete({ ...cfg, baseUrl: 'http://127.0.0.1:11435/v1' }, [{ role: 'user', content: 'hi' }]);
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:11435/v1/chat/completions', expect.anything());
  });

  it('handles baseUrl with trailing slash', async () => {
    mockOk('ok');
    await complete({ ...cfg, baseUrl: 'http://localhost:11434/v1/' }, [{ role: 'user', content: 'hi' }]);
    expect(fetch).toHaveBeenCalledWith('http://localhost:11434/v1/chat/completions', expect.anything());
  });
});

describe('complete - response handling', () => {
  it('returns content string from valid response', async () => {
    mockOk('{"result": true}');
    const result = await complete(cfg, [{ role: 'user', content: 'test' }]);
    expect(result).toBe('{"result": true}');
  });

  it('returns empty string content', async () => {
    mockOk('');
    const result = await complete(cfg, [{ role: 'user', content: 'test' }]);
    expect(result).toBe('');
  });

  it('returns content with unicode characters', async () => {
    mockOk('Hello 世界 🌍');
    const result = await complete(cfg, [{ role: 'user', content: 'test' }]);
    expect(result).toBe('Hello 世界 🌍');
  });

  it('returns very long content', async () => {
    const long = 'x'.repeat(100_000);
    mockOk(long);
    const result = await complete(cfg, [{ role: 'user', content: 'test' }]);
    expect(result).toHaveLength(100_000);
  });

  it('takes first choice when multiple are returned', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      choices: [
        { message: { content: 'first' } },
        { message: { content: 'second' } },
      ],
    })));
    const result = await complete(cfg, [{ role: 'user', content: 'test' }]);
    expect(result).toBe('first');
  });

  it('uses API usage stats when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 15, completion_tokens: 28 }
    })));
    const { completeWithUsage } = await import('../src/llm');
    const result = await completeWithUsage(cfg, [{ role: 'user', content: 'test' }]);
    expect(result.inputTokens).toBe(15);
    expect(result.outputTokens).toBe(28);
  });
});

describe('complete - error handling', () => {
  it('throws on network error', async () => {
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('Network error'); });
    let caught: Error | null = null;
    try { await complete(cfg, [{ role: 'user', content: 'hi' }]); } catch (e) { caught = e as Error; }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('Network error');
  });

  it('throws on 401 Unauthorized', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow('401');
  });

  it('throws on 429 Rate Limited', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Rate limited', { status: 429 }));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow('429');
  });

  it('throws on 500 Server Error', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow('500');
  });

  it('throws on 503 Service Unavailable', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Service Unavailable', { status: 503 }));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow('503');
  });

  it('does not expose a provider response body in errors', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"error":"bad model"}', { status: 400 }));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow('HTTP 400');
  });

  it('throws on non-JSON response body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not json at all'));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow();
  });

  it('throws on empty choices array', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ choices: [] })));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow();
  });

  it('throws on missing choices field', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ result: 'ok' })));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow();
  });

  it('throws on null content in response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: null } }],
    })));
    await expect(complete(cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow('模型返回了空内容');
  });
});

// ---------- Anthropic API ----------

describe('local network boundary', () => {
  it.each(['https://api.anthropic.com', 'https://api.openai.com/v1', 'http://127.0.0.1.evil.example/v1', 'http://localhost:11434/v1?token=x', 'http://user:pass@localhost/v1'])('rejects %s without sending a key', async baseUrl => {
    await expect(complete({ ...cfg, baseUrl }, [])).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects removed cloud providers even if imported', async () => {
    await expect(complete({ ...cfg, provider: 'openai' }, [])).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('fetchOllamaModels', () => {
  it('fetches and maps model names correctly', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      models: [{ name: 'llama2' }, { model: 'mistral' }]
    })));
    const models = await fetchOllamaModels('http://localhost:11434/v1');
    expect(models).toEqual(['llama2', 'mistral']);
  });

  it('throws error if fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }));
    await expect(fetchOllamaModels('http://localhost:11434/v1')).rejects.toThrow('无法连接');
  });

  it('falls back to empty array if no models returned', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({})));
    const models = await fetchOllamaModels('http://localhost:11434/v1');
    expect(models).toEqual([]);
  });

  it('throws on network error', async () => {
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('connection refused'); });
    await expect(fetchOllamaModels('http://localhost:11434/v1')).rejects.toThrow('connection refused');
  });
});

describe('testConnection', () => {
  it('calls completeWithUsage and returns standard test payload', async () => {
    mockOk('OK');
    const result = await testConnection(cfg);
    expect(result).toBe('OK');
  });
});

describe('Chrome AI', () => {
  it('identifies if Chrome AI is available', () => {
    expect(isChromeAIAvailable()).toBe(false);
    (globalThis as any).LanguageModel = {};
    expect(isChromeAIAvailable()).toBe(true);
    delete (globalThis as any).LanguageModel;
  });

  it('throws error if completeChromeAI called but missing', async () => {
    const config: LLMConfig = { model: 'gemini-nano', baseUrl: '', apiKey: '' };
    await expect(completeWithUsage(config, [{role: 'user', content: 'hello'}])).rejects.toThrow('Chrome 内置 AI 当前不可用');
  });

  it('calls LanguageModel.create successfully', async () => {
    const mockSession = { prompt: vi.fn().mockResolvedValue('chrome ai response'), destroy: vi.fn() };
    const mockCreate = vi.fn().mockResolvedValue(mockSession);
    (globalThis as any).LanguageModel = { create: mockCreate };

    const config: LLMConfig = { model: 'gemini-nano', baseUrl: '', apiKey: '' };
    const res = await completeWithUsage(config, [{role: 'system', content: 'sys logic'}, {role: 'user', content: 'hello'}]);
    
    expect(mockCreate).toHaveBeenCalledWith({ systemPrompt: 'sys logic' });
    expect(mockSession.prompt).toHaveBeenCalledWith('hello');
    expect(mockSession.destroy).toHaveBeenCalled();
    expect(res.content).toBe('chrome ai response');
    expect(res.inputTokens).toBeGreaterThan(0);
    delete (globalThis as any).LanguageModel;
  });

  it('calls LanguageModel.create without system prompt', async () => {
    const mockSession = { prompt: vi.fn().mockResolvedValue('xyz'), destroy: vi.fn() };
    const mockCreate = vi.fn().mockResolvedValue(mockSession);
    (globalThis as any).LanguageModel = { create: mockCreate };

    const config: LLMConfig = { model: 'gemini-nano', baseUrl: '', apiKey: '' };
    await completeWithUsage(config, [{role: 'user', content: 'hello'}]);
    
    expect(mockCreate).toHaveBeenCalledWith({});
    delete (globalThis as any).LanguageModel;
  });
});

describe('OpenAI-compatible model discovery', () => {
  const config = { provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:15721/tencent/v1', apiKey: 'fixture-token', model: 'selected' };
  it('reads real IDs using authentication, without sending browsing information', async () => {
    const { fetchOpenAIModels } = await import('../src/llm');
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, { id: 3 }, null] })));
    expect(await fetchOpenAIModels(config)).toEqual(['a', 'b']);
    expect(fetch).toHaveBeenCalledWith(config.baseUrl + '/models', expect.objectContaining({ method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer fixture-token' } }));
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBeUndefined();
  });
  it.each(['https://evil.example/tencent/v1', 'http://remote.example/v1', 'http://user:pass@localhost/tencent/v1'])('rejects unsafe address %s before sending the credential', async baseUrl => {
    const { fetchOpenAIModels } = await import('../src/llm');
    await expect(fetchOpenAIModels({ ...config, baseUrl })).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not expose raw server errors', async () => {
    const { fetchOpenAIModels } = await import('../src/llm');
    vi.mocked(fetch).mockResolvedValue(new Response('sensitive upstream body', { status: 401 }));
    await expect(fetchOpenAIModels(config)).rejects.toThrow('HTTP 401');
  });
});
