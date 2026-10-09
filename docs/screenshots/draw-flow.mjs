import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../images/', import.meta.url));
mkdirSync(output, { recursive: true });
const text = (x, y, content, size = 19, color = '#667a95', weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${content.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</text>`;
const variants = {
  zh: {
    title: '连接 OpenAI 兼容模型服务', subtitle: '填写你自己的服务配置；图中顺序适用于首次接入。',
    steps: [
      ['填写接口配置', 'Base URL 与 API Key', '密钥按服务要求填写'],
      ['授权远程主机', '远程 HTTPS：点击授权', '本机 HTTP：无需此步'],
      ['选择或填写模型', '刷新列表，或手填模型 ID', '列表可见不等于可调用'],
      ['测试连接', '仅发送一条简短测试消息', '成功后用公开页面试分组'],
    ],
    footer: '测试失败：检查地址、密钥、权限和模型，再重试。自动整理默认关闭。',
  },
  en: {
    title: 'Connect an OpenAI-compatible service', subtitle: 'Use your own provider settings. Follow these steps for initial setup.',
    steps: [
      ['Enter service details', 'Base URL and API key', 'Use your provider’s values'],
      ['Authorize the host', 'Remote HTTPS: grant access', 'Local HTTP: skip this step'],
      ['Choose a model', 'Refresh the list or enter an ID', 'Listed ≠ permitted to call'],
      ['Test the connection', 'Sends a short test message', 'Then try grouping public tabs'],
    ],
    footer: 'If the test fails, check the URL, key, permissions, and model, then retry. Auto-organize starts off.',
  },
};
for (const [locale, data] of Object.entries(variants)) {
  const nodes = data.steps.map(([title, a, b], i) => {
    const x = 32 + i * 273;
    return `<rect x="${x}" y="124" width="248" height="166" rx="16" fill="${i === 3 ? '#e5f5ef' : '#eef3fd'}"/>
      <rect x="${x + 18}" y="140" width="30" height="30" rx="9" fill="${i === 3 ? '#138978' : '#3c6dc3'}"/>
      ${text(x + 28, 162, String(i + 1), 20, 'white', 600)}
      ${text(x + 18, 207, title, locale === 'en' ? 21 : 25, '#243651', 600)}
      ${text(x + 18, 242, a, locale === 'en' ? 16 : 18)}
      ${text(x + 18, 270, b, locale === 'en' ? 16 : 18)}
      ${i < 3 ? `<path d="M${x + 248} 206 H${x + 272}" stroke="#3c6dc3" stroke-width="2.5" marker-end="url(#arrow)"/>` : ''}`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1131" height="374" viewBox="0 0 1131 374" role="img" aria-labelledby="title desc">
  <title id="title">${data.title}</title><desc id="desc">${data.subtitle} ${data.footer}</desc>
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#3c6dc3"/></marker></defs>
  <rect width="1131" height="374" rx="20" fill="#fff"/>
  <g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Arial,sans-serif">
  <rect x="32" y="28" width="5" height="34" rx="2.5" fill="#3c6dc3"/>
  ${text(52, 57, data.title, 30, '#243651', 650)}
  ${text(32, 91, data.subtitle, 19)}${nodes}
  ${text(32, 338, data.footer, locale === 'en' ? 18 : 21)}
  </g></svg>`;
  writeFileSync(`${output}/setup-flow-${locale}.svg`, svg.split('\n').map(line => line.trimEnd()).join('\n') + '\n');
}
console.log('Generated both editable setup-flow diagrams.');
