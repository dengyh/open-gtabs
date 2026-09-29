import type { MessageType } from './types';
import type { ArchiveBatch, CleanupPreview } from './cleanup';
type Response = Partial<Extract<MessageType, { type: 'status' }>>;
function idleAge(lastAccessed: number): string { const hours = Math.floor((Date.now() - lastAccessed) / 3600000); return hours >= 24 ? `${Math.floor(hours / 24)} 天` : `${hours} 小时`; }
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
function esc(s: string): string { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
function send(msg: Record<string, unknown>): Promise<Response> {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(msg, (res: Response) => {
    if (chrome.runtime.lastError || !res) reject(new Error('未收到后台响应，请刷新重试。'));
    else if (res.error) reject(new Error(res.error));
    else resolve(res);
  }));
}
export function initCleanupUI(): void {
  let preview: CleanupPreview | undefined;
  let archives: ArchiveBatch[] = [];
  let busy = false;
  const status = $('cleanup-status');
  const archiveStatus = $('archive-status');
  async function run(action: () => Promise<void>, target = status) {
    if (busy) return;
    busy = true;
    document.querySelectorAll<HTMLButtonElement>('[data-tab="cleanup"] button, [data-tab="archives"] button').forEach(b => b.disabled = true);
    try { await action(); } catch (e) { target.textContent = e instanceof Error ? e.message : '操作失败，请重试'; }
    finally {
      busy = false;
      document.querySelectorAll<HTMLButtonElement>('[data-tab="cleanup"] button, [data-tab="archives"] button').forEach(b => b.disabled = false);
    }
  }
  function selected(): number[] {
    return Array.from(document.querySelectorAll<HTMLInputElement>('.cleanup-check:checked')).map(el => Number(el.value));
  }
  async function refresh() {
    status.textContent = '正在检查当前窗口…';
    preview = (await send({ type: 'cleanup-preview' })).preview;
    if (!preview) throw new Error('无法读取清理列表');
    $('cleanup-list').innerHTML = preview.tabs.map(tab => `<label class="cleanup-row"><input class="cleanup-check" type="checkbox" value="${tab.id}" aria-label="选择 ${esc(tab.title)}" /><span class="cleanup-info"><strong>${esc(tab.title)}</strong><small>${esc(new URL(tab.url).hostname)} · ${esc(tab.groupName || '未分组')} · ${idleAge(tab.lastAccessed)}未访问</small><small>超过设置的闲置时长</small></span></label>`).join('');
    status.textContent = preview.tabs.length ? `发现 ${preview.tabs.length} 个候选标签，请勾选后处理。` : '当前窗口没有符合条件的闲置标签。';
  }
  function renderArchives() {
    const q = $<HTMLInputElement>('archive-search').value.trim().toLowerCase();
    const visible = archives.map(a => ({ ...a, tabs: a.tabs.filter(t => !q || `${t.title} ${t.url} ${t.groupName || ''}`.toLowerCase().includes(q)) })).filter(a => a.tabs.length);
    $('archive-list').innerHTML = visible.map(batch => `<div class="archive-card"><strong>${new Date(batch.createdAt).toLocaleString('zh-CN')} · ${batch.tabs.length} 个标签${q ? '匹配' : ''}</strong><div class="cleanup-actions"><button class="btn-ghost archive-restore" data-id="${esc(batch.id)}">重新打开${q ? '匹配项' : '整批'}</button><button class="btn-ghost archive-delete" data-id="${esc(batch.id)}">删除整批归档</button></div>${batch.tabs.map(t => `<div class="cleanup-row"><span class="cleanup-info"><strong>${esc(t.title)}</strong><small>${esc(t.groupName || '未分组')} · ${esc(t.url)} · ${{ saved: '已归档（关闭结果未记录）', closed: '已关闭', kept: '状态变化，未关闭', failed: '关闭未成功' }[t.state]}</small></span><button class="btn-ghost archive-single" data-id="${esc(batch.id)}" data-entry="${esc(t.entryId)}">重新打开</button></div>`).join('')}</div>`).join('') || '<p class="slider-desc">没有匹配的归档。</p>';
    document.querySelectorAll<HTMLButtonElement>('.archive-restore, .archive-single').forEach(button => button.addEventListener('click', () => void run(async () => {
      const filtered = visible.find(a => a.id === button.dataset.id);
      const result = (await send({ type: 'archive-restore', archiveId: button.dataset.id,
        entryIds: button.dataset.entry ? [button.dataset.entry] : filtered?.tabs.map(t => t.entryId) })).restored;
      archiveStatus.textContent = `重新打开 ${result?.restored || 0} 个，已存在 ${result?.existing || 0} 个，失败 ${result?.failed || 0} 个。归档仍保留。`;
    }, archiveStatus)));
    document.querySelectorAll<HTMLButtonElement>('.archive-delete').forEach(button => button.addEventListener('click', () => {
      if (!confirm('删除整批归档记录？此操作不会关闭标签，删除后无法通过本工具找回该批记录。')) return;
      void run(async () => { await send({ type: 'archive-delete', archiveId: button.dataset.id }); await refreshArchives(); archiveStatus.textContent = '归档记录已删除。'; }, archiveStatus);
    }));
  }
  async function refreshArchives() { archives = (await send({ type: 'archive-list' })).archives || []; renderArchives(); }
  $('cleanup-refresh').addEventListener('click', () => void run(refresh));
  $('cleanup-select-all').addEventListener('click', () => {
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('.cleanup-check'));
    const check = boxes.some(b => !b.checked); boxes.forEach(b => b.checked = check);
  });
  $('cleanup-close').addEventListener('click', () => void run(async () => {
    const ids = selected();
    if (!preview || !ids.length) throw new Error('请先勾选需要处理的标签。');
    const result = (await send({ type: 'cleanup-close', previewId: preview.id, tabIds: ids })).cleanup;
    await refresh();
    status.textContent = `已归档并关闭 ${result?.closed || 0} 个，因状态变化保留 ${result?.kept || 0} 个，关闭失败 ${result?.failed || 0} 个。可在“归档”页找回。`;
  }));
  for (const [id, forever] of [['cleanup-later', false], ['cleanup-keep', true]] as const) $(id).addEventListener('click', () => void run(async () => {
    if (!preview || !selected().length) throw new Error('请先勾选标签。');
    await send({ type: 'cleanup-dismiss', previewId: preview.id, tabIds: selected(), forever }); await refresh();
    status.textContent = forever ? '这些网址在此窗口不再提醒，可使用下方按钮重置。' : '这些网址在此窗口 7 天后再提醒。';
  }));
  $('cleanup-reset').addEventListener('click', () => {
    if (confirm('重置所有窗口的保留与稍后提醒记录？不会关闭标签。')) void run(async () => { await send({ type: 'cleanup-reset' }); await refresh(); });
  });
  $('archive-refresh').addEventListener('click', () => void run(refreshArchives, archiveStatus));
  $('archive-search').addEventListener('input', renderArchives);
  document.querySelector('[data-tab="cleanup"].tab-btn')?.addEventListener('click', () => void run(refresh));
  document.querySelector('[data-tab="archives"].tab-btn')?.addEventListener('click', () => void run(refreshArchives, archiveStatus));
  if (document.querySelector('[data-tab="cleanup"].tab-panel.active')) void run(refresh);
  if (document.querySelector('[data-tab="archives"].tab-panel.active')) void run(refreshArchives, archiveStatus);
}
