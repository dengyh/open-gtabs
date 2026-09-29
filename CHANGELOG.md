# 适配版更新记录

## 0.5.1.3

- 撤销时保留原分组名称、颜色和折叠状态，复用仍存在的原分组。
- 撤销绑定原窗口，不影响其他窗口或整理后新打开的标签。
- 为原组已消失、跨窗口撤销和元数据恢复增加回归测试。

## 0.5.1.2

- 增加 TT Switch 本机腾讯通用 API、自定义模型 ID 与接口校验。
- 完成简体中文界面、菜单、常见提示和中文分组支持。
- 加入 URL 脱敏、AI 站点排除；历史学习数据保持本地。
- 收紧网络权限与 CSP；移除云端直连预设；拒绝重定向。
- 将设置和域名规则从 Chrome 同步迁移至本机；跨服务导入不保留 Token。
- 修复未分组标签自动触发计数、同名分组复用、右键分组和添加空规则的界面问题。
- 修复严格类型检查，升级开发依赖并新增隐私回归测试。
- 保留 MIT 许可，补充安装、隐私、安全和二次开发说明。

---

以下为原上游更新记录，部分服务商功能不适用于此适配版。

# Changelog

## [0.5.1] - 2026-05-17
### Fixed
- Rebuild context menus with a full `removeAll()` pass so stale child IDs cannot break service worker startup.
- Serialize overlapping context menu rebuilds from tab group events.
- Ignore duplicate context menu create errors during rebuild so Chrome reloads stay clean.

## [0.5.0] - 2026-04-09
### Added
- Tab Snooze — hide tabs temporarily and restore them at a chosen time.
- Workspace Management — save and restore full browser sessions with tab groups intact.
- Smart Ungrouping — tabs automatically leave a group when navigating to an unrelated domain.
- Tab Search — find and switch between tabs with real-time search across all open tabs.
- Group Stats — tab counts, domain breakdowns, and saved color preferences per group.
- Markdown Export — export tab groups as clean, shareable Markdown.
- Power Tools Panel — focus mode, duplicate cleanup, sorting, export, and stats in one place.
- Chrome AI (Gemini Nano) is now the default provider — runs fully on-device, no API key required.
- In-settings Chrome AI setup guide with copy buttons for required Chrome flag URLs.
- Spend limit (USD cap) to control API costs for cloud providers.

### Changed
- Tabbed Settings — reorganized into Provider, Behavior, Rules, and Tools tabs.
- Streamlined Popup — cleaner layout for faster organizing.
- Keyboard Navigation — arrow keys and Enter to move through suggestions.
- Chrome AI provider card now shows a step-by-step setup guide when flags are not yet enabled.

### Fixed
- Better error feedback for failed actions.
- Local-only API key storage — keys no longer sync across devices.
- Input sanitization to block prompt injection attempts.
- Improved recovery when tab state changes during batch actions.

## [0.4.8] - 2026-04-10
### Added
- New feature enhancements.

### Changed
- Improvements to existing features.

### Fixed
- Bug fixes and stability improvements.

### Security
- Addressed security vulnerabilities.

### Deprecated
- Some deprecated features that will be removed in future releases.

## [0.4.0] - 2025-12-15
### Added
- Initial version with foundational features.

### Changed
- Changes to improve performance.

### Fixed
- Initial bug fixes.

### Security
- Security updates included.

### Deprecated
- Initial deprecations noted.
