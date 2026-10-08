# 适配版更新记录

## 0.7.0

- 产品统一命名为 gTabs，仓库调整为 `dengyh/gtabs`，去掉特定语言和服务商标识。
- 支持跟随浏览器、简体中文和 English；覆盖设置、弹窗、清理、归档、报告、右键菜单和运行提示。
- 保存语言偏好，支持升级和导入回退；后台重启后恢复语言，日期和新建 AI 分组名称跟随选择，已有名称保持不变。
- 添加 Chrome 原生语言包、翻译字典、英文入门说明及多语言回归检查。

## 0.6.0

- 产品名称统一为“gTabs 中文版”，将 TT Switch 专属选项改为“OpenAI 兼容接口”，支持自定义 Base URL、API Key 和模型 ID。
- 请求使用标准 `/chat/completions`，模型下拉通过同一基础地址的 `/models` 获取；不提供列表的服务仍可手动填写模型。
- 接入本机 HTTP 或远程 HTTPS 服务；远程访问使用逐站可选权限，授权前不发送密钥或标签信息，仍拒绝重定向。
- 兼容旧版本机接口、密钥与模型配置；更换基础地址会清空旧密钥，不把旧服务的凭据带到新地址。
- 更新配置、隐私与开发说明，保留 Ollama、Chrome 内置 AI 及多窗口独立整理。

## 0.5.3

- 修复多个 Chrome 窗口同时打开标签时，自动整理只检查当前窗口的问题；按标签所属窗口排队处理，冷却互不影响。
- 冷却期间的新标签通过窗口专属定时器补查；尚未加载完成或未达到阈值时不消耗冷却时间。
- 后台轮询及每天 / 每周重整覆盖所有普通窗口；跳过无痕及非普通窗口，单个窗口关闭或失败不阻塞其他窗口。
- 本地规则新建分组时明确指定原窗口，并复核标签及目标组仍在该窗口，避免跨窗口移动。
- 待确认分组与撤销记录按窗口分别保存，兼容升级前有窗口标识的记录；撤销使用消息来源窗口，工具栏操作按实际聚焦窗口定位。
- 更新开发依赖 source-map-js 至 1.2.2，修复依赖审计发现的问题。

## 0.5.2

- 增加闲置清理中心、每小时本地提醒、保留及 7 天后提醒，提供 7 / 14 / 30 天阈值快捷设置。
- 增加先归档再关闭、批次和单页找回、归档搜索；保存失败不关闭，执行前复核标签状态，逐项报告失败。
- 为整理预览与应用结果增加原因说明和本地手动归组；按实际成功数量统计，并绑定原窗口。
- TT Switch 支持从实际 `/models` 接口读取下拉列表、手动刷新及自定义 ID，失败不改变已有模型。
- 保持原有网络权限、模型隐私过滤和 Token 本机存储方式；移除旧的无预览直接清理入口。

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
