// Run against Vite with Playwright and pngjs available on NODE_PATH; no receiver requests are made.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { webkit, chromium } = require('playwright');
const { PNG } = require('pngjs');
const { guardLocalContext, assertCleanNetwork, runEntryAcceptance } = require('./tutorial-entry-acceptance.cjs');

(async () => {
  const engine = process.argv[2] === 'chromium' ? chromium : webkit;
  const browser = await engine.launch(process.argv[2] === 'chromium'
    ? { channel: 'msedge', args: ['--disable-extensions'] }
    : {});
  const engineName = process.argv[2] || 'webkit';
  const baseUrl = process.env.TASK8_BASE_URL || 'http://127.0.0.1:5186';
  const outputDir = path.resolve(process.env.TASK8_OUTPUT_DIR || 'output/playwright/task8-development', engineName);
  mkdirSync(outputDir, { recursive: true });
  const entries = [];
  try {
    for (const locale of ['zh', 'en']) {
      entries.push(await runEntryAcceptance(browser, {
        baseUrl: process.env[`TASK8_PACKAGE_${locale.toUpperCase()}_URL`] || baseUrl,
        locale, outputDir: path.join(outputDir, locale),
        viewport: locale === 'zh' ? { width: 1440, height: 1000 } : { width: 900, height: 700 },
        defaultConfig: Boolean(process.env[`TASK8_PACKAGE_${locale.toUpperCase()}_URL`]),
        profileOnly: process.argv.includes('--profile-only'),
      }));
    }
    writeFileSync(path.join(outputDir, 'entries.json'), JSON.stringify(entries, null, 2));
    if (process.argv.includes('--entries-only') || process.argv.includes('--profile-only')) return;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const network = await guardLocalContext(context, baseUrl);
    const page = await context.newPage();
    await page.goto(new URL('/tools/browser/tutorial-regression.html', baseUrl).href);
    await page.waitForFunction(() => typeof window.checkArrow === 'function');
    await page.evaluate(() => window.ready);
    console.log('Arrow:', await page.evaluate(() => window.checkArrow()));
    console.log('Reference frames:', await page.evaluate(() => window.checkReferenceBoardDrag()));
    const firstFrame = page.locator('.layout-task-tutorial-board-svg').first();
    const secondFrame = page.locator('.layout-task-tutorial-board-svg').nth(1);
    const firstBox = await firstFrame.boundingBox();
    const secondBox = await secondFrame.boundingBox();
    assert(firstBox && secondBox, 'Reference frames must be visible');
    const firstCenter = { x: firstBox.x + firstBox.width / 2, y: firstBox.y + firstBox.height / 2 };
    await page.mouse.move(firstCenter.x, firstCenter.y);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await firstFrame.getAttribute('data-reference-dragged'), null, 'Click without movement must not count as dragging');
    assert.equal(await firstFrame.locator('.layout-task-tutorial-board-hand').evaluate(element => element.classList.contains('is-hidden')), false, 'Click without movement must not hide the prompt');
    await page.mouse.down();
    await page.mouse.move(firstCenter.x + 8, firstCenter.y + 5, { steps: 3 });
    assert.equal(await firstFrame.locator('.layout-task-tutorial-board-hand').evaluate(element => element.classList.contains('is-hidden')), true, 'Short central drag must hide the hand while held');
    await page.mouse.up();
    assert.equal(await firstFrame.getAttribute('data-reference-dragged'), 'true', 'Real drag must mark only the first frame');
    assert.equal(await secondFrame.getAttribute('data-reference-dragged'), null, 'Dragging one frame must not mark the other');
    assert.equal(await firstFrame.locator('.layout-task-tutorial-board-hand').evaluate(element => element.classList.contains('is-hidden')), true, 'Real drag must hide the hand prompt');
    const position = await firstFrame.evaluate(element => element.style.backgroundPosition);
    await page.evaluate(() => window.showBoard(2));
    await page.evaluate(() => window.showBoard(3));
    assert.equal(await firstFrame.getAttribute('data-reference-dragged'), 'true', 'Revisited frame must retain dragged state');
    assert.equal(await firstFrame.evaluate(element => element.style.backgroundPosition), position, 'Revisited frame must retain pan position');
    assert.equal(await secondFrame.getAttribute('data-reference-dragged'), null, 'Revisit must preserve frame independence');
    await page.mouse.move(firstCenter.x, firstCenter.y);
    assert.equal(await firstFrame.locator('.layout-task-tutorial-board-hand').evaluate(element => element.classList.contains('is-hidden')), false, 'Central hover must restore the hand prompt');
    mkdirSync('output/playwright', { recursive: true });
    const originalSvg = async () => {
      if (!process.argv.includes('--original-svg')) return;
      await page.locator('.layout-task-tutorial-board-svg').evaluateAll(async elements => {
        await Promise.all(elements.map(element => {
          const image = document.createElement('img');
          image.className = element.className;
          image.src = JSON.parse(element.style.backgroundImage.slice(4, -1));
          element.replaceWith(image);
          return image.decode();
        }));
      });
    };
    for (const [width, height] of [[1440, 1000], [1280, 720], [900, 700]]) {
      await page.evaluate(() => window.resetReferenceBoardState());
      await page.setViewportSize({ width, height });
      for (let index = 0; index < 4; index++) {
        await page.evaluate(index => window.showBoard(index), index);
        assert.equal(await page.evaluate(() => window.checkBoardFit()), true);
      }
      await originalSvg();
      const sofaBounds = await page.locator('.layout-task-tutorial-board-svg').first().boundingBox();
      const sofa = PNG.sync.read(await page.screenshot());
      const bottom = (Math.floor(sofaBounds.x + sofaBounds.width / 2) + Math.floor(sofaBounds.y + sofaBounds.height - 2) * sofa.width) * 4;
      assert(sofa.data.subarray(bottom, bottom + 3).every(channel => channel < 80), 'Sofa bottom outline must be visible, not cropped');
      await page.screenshot({ path: path.join(outputDir, `tutorial-sofa-${width}x${height}.png`) });
      // Check both aspect ratios independently of the shipped artwork.
      await page.evaluate(async () => {
        const { buildTutorialReferenceBoardPage } = await import('/src/core/tutorial-reference-board.ts');
        const svg = (width, height) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}"><rect x="${width*.05}" y="${height*.05}" width="${width*.9}" height="${height*.9}" fill="#ffffbf"/></svg>`);
        document.querySelector('#board').innerHTML = buildTutorialReferenceBoardPage({ baseUrl: location.origin + '/', board: {
          items: [{ name: 'Fit regression', allSvg: svg(100, 200), variableSvg: svg(200, 100), allAnimation: svg(100, 200), variableAnimation: svg(200, 100) }],
        }});
        document.querySelectorAll('.layout-task-tutorial-board-hand').forEach(element => element.classList.add('is-hidden'));
        await Promise.all(Array.from(document.querySelectorAll('#board img'), image => image.decode()));
      });
      for (const media of await page.locator('.layout-task-tutorial-board-svg').all()) {
        const png = PNG.sync.read(await media.screenshot());
        const pixel = (x, y) => Array.from(png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3));
        const cx = Math.floor(png.width / 2), cy = Math.floor(png.height / 2);
        assert.deepEqual(pixel(cx, cy), [255, 255, 191], 'SVG must load and paint its center');
        for (const [x, y] of [[cx, 2], [cx, png.height - 3], [2, cy], [png.width - 3, cy]]) {
          assert.deepEqual(pixel(x, y), [237, 241, 247], 'Whole SVG must fit inside the frame, with no clipped edges');
        }
      }
      await page.screenshot({path: path.join(outputDir, `tutorial-fit-${width}x${height}.png`)});
      console.log(`PASS: four board pages and portrait/landscape SVG pixels at ${width}x${height}`);
    }
    assertCleanNetwork(network);
    writeFileSync(path.join(outputDir, 'supplemental-network.json'), JSON.stringify(network, null, 2));
    await context.close();
    console.log(`PASS ${engineName}: ${entries.length} genuine entry flows; ${entries.reduce((sum, entry) => sum + entry.count, 0)} entry check groups; 12 shipped board fits; 6 aspect-ratio pixel fits`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
