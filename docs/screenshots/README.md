# README 图片来源与再生成

界面基线：gTabs 0.7.0，2026-10-09。中英文 README 各使用 3 张界面截图和 1 张配置流程图。

| 图片 | 来源与含义 |
| --- | --- |
| `organize-zh/en.png` | 实际 `src/popup.html` / `src/popup.ts`，注入两组虚构建议；尚未应用。 |
| `model-settings-zh/en.png` | 实际设置页的模型服务面板，保留空白密钥和占位模型 ID；没有连接成功的声明。 |
| `cleanup-zh/en.png` | 实际设置页的清理面板，三条虚构候选中手动选中一条；不执行关闭。 |
| `setup-flow-zh/en.svg` | 可编辑配置流程图；由 `draw-flow.mjs` 生成，依据 `MODEL-SETUP.md` 与 `src/options.ts`。 |

所有截图由 `fixture.ts` 提供合成数据，只使用 `example.com`、`example.org` 和 `.example` 保留域名。没有读取现有 Chrome 用户配置、标签、扩展存储、环境凭据或磁盘上的用户备份。API Key 为空，浏览器 API 为内存模拟；实际 UI 模块和文案来自当前源码。

页面 CSP 禁止网络连接，`fetch` 也被禁用。服务调用与关闭标签等操作不执行；模拟数据不是模型能力、真实连接或 Chrome 集成验证。截图额外加入“演示数据”标记，插件本身没有添加该标记。

## 再生成

在项目根目录安装项目开发依赖后，使用 Node.js 22.14+：

```sh
node docs/screenshots/prepare.mjs
python3 -m http.server 8766 --bind 127.0.0.1 --directory output/playwright/readme
```

在另一个终端使用独立、非持久化的 Playwright CLI 会话。需要本机 Chrome；不要指定个人用户目录或连接日常浏览器。

```sh
npx --package @playwright/cli playwright-cli -s=gtabs-readme open \
  'http://127.0.0.1:8766/popup.html?page=popup&lang=zh' \
  --browser chrome --device 'Desktop Chrome HiDPI'
npx --package @playwright/cli playwright-cli -s=gtabs-readme resize 1000 1300
npx --package @playwright/cli playwright-cli -s=gtabs-readme snapshot
npx --package @playwright/cli playwright-cli -s=gtabs-readme screenshot body \
  --filename=output/playwright/organize-zh.png --hires
```

按以下顺序重复，语言参数分别使用 `zh` 和 `en`：

1. `popup.html?page=popup&lang=zh`：截取 `body`，保存为 `organize-zh.png`。
2. `options.html?lang=zh`：等待设置完成，查看 snapshot，点击 `button.tab-btn[data-tab="provider"]`（设置页会记住上次所选面板），再截取 `.tab-panel.active`，保存为 `model-settings-zh.png`。
3. 在设置页点击 `button.tab-btn[data-tab="cleanup"]`，先查看最新 snapshot，再勾选 `.cleanup-check[value="1"]`，截取 `.tab-panel.active`，保存为 `cleanup-zh.png`。不要点击关闭按钮。
4. 流程图 SVG 已输出到 `docs/images/`，可在本地服务的 `setup-flow-zh.svg` 查看；中英文均检查一次。

保持 1000 × 1300 视口，避免截取面板时顶部的固定导航遮住演示标记。先将截图保存到 `output/playwright/`，确认中英文完整、文字清晰、图片元数据无身份信息后，再复制到 `docs/images/`。图片不依赖外部托管。

完成后关闭本次 Playwright 会话和本地预览服务：

```sh
npx --package @playwright/cli playwright-cli -s=gtabs-readme close
```

预览文件及浏览器日志已加入 Git 忽略规则。页面和示例数据只用于维护文档，不进入扩展构建或发布包。
