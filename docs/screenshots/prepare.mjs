// Build a local-only screenshot site from the current UI, without touching dist/.
import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'output/playwright/readme');
mkdirSync(output, { recursive: true });
await import('./draw-flow.mjs');
for (const locale of ['zh', 'en']) cpSync(resolve(root, `docs/images/setup-flow-${locale}.svg`), resolve(output, `setup-flow-${locale}.svg`));
await build({ entryPoints: [resolve(root, 'docs/screenshots/fixture.ts')], bundle: true,
  outfile: resolve(output, 'fixture.js'), format: 'esm', target: 'chrome120' });
for (const page of ['popup', 'options']) {
  const source = readFileSync(resolve(root, `src/${page}.html`), 'utf8');
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'">';
  const html = source.replace('<head>', `<head>${policy}<link rel="icon" href="data:,">`)
    .replace(`<script src="${page}.js"></script>`, '<script type="module" src="fixture.js"></script>');
  writeFileSync(resolve(output, `${page}.html`), html);
}
console.log('Demo UI prepared in output/playwright/readme (loopback server only).');
