# 二次开发指南

## 许可和基线

上游：https://github.com/vaddisrinivas/gtabs

基线版本 0.5.1，提交 `634b564fd30a6892f11b08ffa652df0863e1f708`。许可 MIT，版权仍归原作者；本仓库在独立 GitHub 仓库中保留上游历史。修改或再分发时必须保留 LICENSE，发布包也包含 LICENSE / NOTICE。

## 开发环境

使用 Node.js 22.14+（`.nvmrc` 指向 22）。

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run package
```

`npm run dev` 监听源码并重建。Chrome 仍需在扩展管理页重新加载 Service Worker；设置页 / 弹窗也需刷新。测试模拟浏览器 API 和模型请求，不会调用真实模型或修改日常浏览标签。

## 源码入口

| 路径 | 职责 |
| --- | --- |
| `manifest.json` | Chrome 权限、入口、快捷键、版本、网络安全策略 |
| `src/background.ts` | 标签事件、自动触发、分组应用、同名组复用、撤销和本地学习 |
| `src/grouper.ts` | 规则预分配、中文标题匹配、模型提示、JSON 校验、遗漏标签处理 |
| `src/privacy.ts` | AI 站点排除、内网主机判断、网址脱敏 |
| `src/endpoints.ts` | 基础地址校验、远程站点授权检查、旧配置兼容 |
| `src/llm.ts` | OpenAI 兼容协议、请求超时、拒绝重定向、Ollama / Chrome AI |
| `src/cleanup.ts` / `src/cleanup-ui.ts` | 闲置预览、保护判断、归档持久化、关闭复核、恢复及界面 |
| `src/reports.ts` | 按窗口保存整理结果及原因 |
| `src/storage.ts` | 本地存储、旧版同步迁移、导入导出和 Token 隔离 |
| `src/types.ts` | 数据结构、默认设置、模型预设、颜色文案标识 |
| `src/i18n.ts` / `src/locales/` / `_locales/` | 运行时翻译、语言选择与 Chrome 原生文案 |
| `src/options.*` | 多语言设置界面与自动保存 |
| `src/popup.*` | 多语言分组预览、应用、搜索、撤销 |
| `test/` | 模拟 Chrome 的单元与集成测试，隐私边界回归测试 |
| `build.mjs` | 打包脚本、资源与许可复制 |

调用流程：界面发消息 → 后台筛选当前窗口 → 应用隐私过滤 / 本地规则 → 脱敏后请求模型 → 校验 JSON 和标签 ID → 用户确认或自动应用 → 更新本地学习记录。

## 常见改动

- **更换模型**：直接在设置页刷新模型列表并选择，也可填写模型 ID，无需改源码。只有改变协议 / 服务路由时才改 `llm.ts`。
- **调整界面文案**：使用 `tr()` 或 HTML 的 `data-i18n` 标记，并更新语言字典。不要翻译消息类型、颜色协议值、用户数据或模型 ID。
- **调整分组策略**：修改 `grouper.ts`，保留合法标签 ID 校验、每标签只分配一次和安全过滤。模型输出不能变成可执行脚本。
- **扩展服务商**：使用通用 Base URL 即可接入实现 Chat Completions 的服务。远程访问必须经过 `endpoints.ts` 的 HTTPS 地址校验与可选主机权限检查；只在用户点击时请求单个主机授权。调整协议时同时检查 Token 归属、导入迁移及发送提示，禁止静默授权所有网站。
- **新增隐私设置**：同时更新类型、默认值、存储输入校验、界面、导入迁移和测试。站点排除必须在模型请求之前生效。
- **自动整理**：保持冷却和进行中保护；只对目标窗口操作。定时器属于 Chrome alarms，不保证休眠时准点执行。

## 多语言

- `src/i18n.ts` 使用中文源文案作为消息标识，简体中文直接使用源文案；English 翻译集中在 `src/locales/en.json`。`tr('已导入 {0} 条规则', count)` 使用位置参数，插入值不再递归翻译。
- HTML 静态文字显式标记 `data-i18n`，属性使用 `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria-label`。只修改标记过的界面文案，不扫描或翻译用户内容。动态 HTML 继续对用户输入进行转义。
- `settings.language` 支持 `auto` / `zh-CN` / `en`，导入时校验。默认跟随 `chrome.i18n.getUILanguage()`，不支持的语言回退到 English。设置页先保存完整配置，再重新加载；后台在接收消息和重建菜单时读取语言，兼容 Service Worker 重启。
- `_locales/en` 和 `_locales/zh_CN` 提供扩展描述、快捷键说明，Chrome 自行按浏览器语言选择；页面内的手动语言设置不影响这部分。构建与发布包均包含这些文件。
- 增加语言时：新增完整翻译字典，扩展 `Language` / `Locale`、`resolveLanguage`、设置下拉选项及 AI 提示的语言映射，并加入 `_locales` 目录和回归测试。已有组名必须原样复用。

## 验证

提交前运行类型检查、测试、构建和 `npm audit`。浏览器体验使用独立测试窗口与公开页面；避免拿工作内网标签作为模型联调样本。检查 Token 不在 Git diff、日志或导出中。UI 验证至少覆盖中英文设置切换、跟随浏览器与语言回退、连接成功、分组建议、应用、已有组复用与撤销。

### 隔离界面夹具

`test/fixtures/browser-ui.ts` 将真实设置界面和后台代码接到模拟 Chrome 标签。可用 esbuild 打包为页面脚本，并在仅绑定 127.0.0.1 的临时服务器中打开，用于检查清理和恢复交互；它不会操作真实浏览器标签。自动化检查仍使用 `npm test`，实际 Chrome API 和模型接口连接需独立联调。

## 上游同步

```sh
git remote add upstream https://github.com/vaddisrinivas/gtabs.git  # 尚无此 remote 时
git fetch upstream
git switch -c sync-upstream
# 按需合并或挑选提交，并审查权限、网络目的地、存储与提示词差异。
```

不要直接覆盖本版的隐私边界和网络限制。原上游服务商预设及 Anthropic 直连已移除；本版支持通用 OpenAI Chat Completions 协议，保留非法地址、未授权远程请求和密钥迁移的回归测试。

## 发布

同步更新 manifest 的数字版本、version_name、package.json 和 CHANGELOG。`npm run package` 生成 `gtabs-extension.zip`，用户解压后加载目录。该包不含源码映射、Token 或浏览器存储。

GitHub Actions 的 CI 对 main 和 PR 执行检查并上传 dist 产物；推送 `v*` 标签会执行检查并创建带 zip 的 GitHub Release。源码提交不等于发布到 Chrome Web Store，本仓库不会自动向商店提交。
