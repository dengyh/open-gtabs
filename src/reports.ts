import type { Settings } from './types';
import { isAIEligible, isPrivateHostname } from './privacy';
export type OrganizationReason = 'unsupported' | 'private' | 'excluded' | 'protected' | 'grouped' | 'insufficient' | 'unmatched' | 'suggested' | 'applied' | 'not-selected' | 'changed' | 'failed';
export interface OrganizationReport {
  windowId: number; timestamp: number; phase: 'preview' | 'applied';
  items: { id: number; title: string; reason: OrganizationReason }[];
}
export const REASON_LABELS: Record<OrganizationReason, string> = {
  unsupported: '浏览器内部页面或不支持的网址', private: '内网地址，已按隐私设置排除', excluded: '命中不发送给 AI 的域名规则',
  protected: '锁定分组，已保护', grouped: '已有分组，已保留', insufficient: '可整理的标签不足 2 个',
  unmatched: '暂未找到合适分组', suggested: '已生成建议，等待应用', applied: '已归组',
  'not-selected': '本次未选择应用', changed: '标签已关闭、跳转或移至其他窗口', failed: '执行失败，可重试',
};
export function initialReport(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[], settings: Settings, windowId: number, ungroupedOnly: boolean): OrganizationReport {
  const locked = new Set(groups.filter(g => settings.pinnedGroups.includes(g.title || '')).map(g => g.id));
  return { windowId, timestamp: Date.now(), phase: 'preview', items: tabs.filter(t => t.id !== undefined).map(t => {
    let reason: OrganizationReason = 'unmatched';
    try {
      const url = new URL(t.url || '');
      if (!['http:', 'https:'].includes(url.protocol)) reason = 'unsupported';
      else if (locked.has(t.groupId)) reason = 'protected';
      else if (ungroupedOnly && t.groupId !== undefined && t.groupId >= 0) reason = 'grouped';
      else if (settings.excludePrivateHosts && isPrivateHostname(url.hostname)) reason = 'private';
      else if (!isAIEligible(t.url!, settings)) reason = 'excluded';
    } catch { reason = 'unsupported'; }
    return { id: t.id!, title: t.title || '未命名标签', reason };
  }) };
}
export async function saveReport(report: OrganizationReport): Promise<void> {
  // Per-window keys avoid concurrent windows overwriting each other's result.
  await chrome.storage.local.set({ [`organizationReport:${report.windowId}`]: report });
}
export async function getReport(windowId: number): Promise<OrganizationReport | null> {
  const key = `organizationReport:${windowId}`;
  return (await chrome.storage.local.get(key))[key] as OrganizationReport || null;
}
