/** OpenAI-compatible base URLs. Host access is separate from protocol support. */
export function endpointInfo(value: string): { baseUrl: string; permission?: string } {
  const trimmed = value.trim();
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('请输入有效的接口基础地址（Base URL）'); }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (/[\x00-\x20\\]/.test(trimmed) || /[?#]/.test(trimmed) || url.hostname.includes('*') || url.username || url.password || url.search || url.hash
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    throw new Error('远程接口须使用 HTTPS；HTTP 仅支持 localhost 或 127.0.0.1。地址不能含账号密码、参数或片段。');
  }
  const baseUrl = url.href.replace(/\/+$/, '');
  if (/\/(chat\/completions|models|responses)$/.test(baseUrl)) {
    throw new Error('请填写接口基础地址，不包含 /chat/completions、/models 或 /responses');
  }
  // Chrome host permissions ignore ports and paths. Never request wildcard hosts.
  return { baseUrl, ...(url.protocol === 'https:' ? { permission: `https://${url.hostname}/*` } : {}) };
}

export async function ensureEndpointAccess(baseUrl: string): Promise<string> {
  const endpoint = endpointInfo(baseUrl);
  if (endpoint.permission && !(await chrome.permissions.contains({ origins: [endpoint.permission] }))) {
    throw new Error('尚未授权此模型服务，请在设置中点击“授权此接口”后重试。');
  }
  return endpoint.baseUrl;
}

export function sameEndpoint(a: string, b: string): boolean {
  try { return endpointInfo(a).baseUrl === endpointInfo(b).baseUrl; } catch { return a === b; }
}

/** Compatibility is confined to stored configuration; requests use the generic provider. */
export function isLegacyLocalEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
      && url.pathname.replace(/\/+$/, '') === '/tencent/v1' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
