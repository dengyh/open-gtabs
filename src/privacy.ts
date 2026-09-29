import type { Settings } from './types';

/** This is a hostname check, not DNS resolution. Corporate public domains need an exclusion. */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return true;
  if (['localhost', 'local', 'internal', 'lan', 'home', 'test', 'invalid'].some(suffix => host === suffix || host.endsWith(`.${suffix}`))) return true;
  if (host.includes(':')) {
    // Conservatively exclude all IPv6 literals, including mapped IPv4 addresses.
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

export function isAIEligible(url: string, settings: Pick<Settings, 'excludePrivateHosts' | 'excludedDomains'>): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (settings.excludePrivateHosts && isPrivateHostname(host)) return false;
    return !settings.excludedDomains.some(pattern => {
      const domain = pattern.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
      return domain === '*' || host === domain || host.endsWith(`.${domain}`);
    });
  } catch { return false; }
}

/** Keep page topic context; remove URL credentials, query parameters and fragments. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `${parsed.origin}${parsed.pathname}`;
  } catch { return ''; }
}
