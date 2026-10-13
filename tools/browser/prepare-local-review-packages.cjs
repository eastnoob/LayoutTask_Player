// Build each locale from current source, then copy into an independent static root.
// Run after owner authorizes final acceptance; never reads stale release/en-US.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, cpSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const batch = path.resolve(process.argv[2] || 'output/playwright/task8-packages');
  assert(!existsSync(batch), 'Choose a new output directory; preserve earlier package evidence');
  mkdirSync(batch, { recursive: true });
  const { build } = await import(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')).href);
  const packages = {};
  for (const locale of ['zh', 'en']) {
    const outDir = path.join(batch, `${locale}-build`);
    await build({
      build: { outDir },
      plugins: [{
        name: 'local-review-default',
        transformIndexHtml(html, context) {
          if (!context.filename.replaceAll('\\', '/').endsWith('/experiment/index.html')) return html;
          return html.replace('lang="zh-CN"', `lang="${locale === 'zh' ? 'zh-CN' : 'en-US'}"`)
            .replace('data-default-config="experiment.json"', `data-default-config="experiment-local-review-${locale}.json"`);
        },
      }],
    });
    const copy = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/generator/copy-web-release-assets.ts', outDir], { stdio: 'inherit' });
    assert.equal(copy.status, 0, 'Shipped asset copier must succeed');
    const root = path.join(batch, `${locale}-package`);
    cpSync(outDir, root, { recursive: true, errorOnExist: true, force: false });
    assert(!existsSync(path.join(root, '.git')));
    const validate = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/generator/validate-web-release-package.ts', root], { encoding: 'utf8' });
    writeFileSync(path.join(batch, `${locale}-validate.log`), validate.stdout + validate.stderr);
    assert.equal(validate.status, 0, `Package closure/runtime/tutorial validation failed: ${validate.stdout}${validate.stderr}`);
    packages[locale] = { root, build: outDir, validateExit: validate.status };
  }
  writeFileSync(path.join(batch, 'packages.json'), JSON.stringify(packages, null, 2));
  console.log(JSON.stringify(packages, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
