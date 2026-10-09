// Run against Vite with Playwright and pngjs available on NODE_PATH; no receiver requests are made.
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { webkit, chromium } = require('playwright');
const { PNG } = require('pngjs');

(async () => {
  const engine = process.argv[2] === 'chromium' ? chromium : webkit;
  const browser = await engine.launch(process.argv[2] === 'chromium' ? { channel: 'msedge' } : {});
  try {
    const page = await browser.newPage();
    await page.route('**/api/**', route => route.abort());
    await page.goto('http://127.0.0.1:5186/tools/browser/tutorial-regression.html');
    await page.waitForFunction(() => typeof window.checkArrow === 'function');
    await page.evaluate(() => window.ready);
    console.log('Arrow:', await page.evaluate(() => window.checkArrow()));
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
      await page.screenshot({ path: `output/playwright/tutorial-sofa-${process.argv[2] || 'webkit'}-${width}x${height}.png` });
      // Check both aspect ratios independently of the shipped artwork.
      await page.evaluate(async () => {
        const { buildTutorialReferenceBoardPage } = await import('/src/core/tutorial-reference-board.ts');
        const svg = (width, height) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}"><rect x="${width*.05}" y="${height*.05}" width="${width*.9}" height="${height*.9}" fill="#ffffbf"/></svg>`);
        document.querySelector('#board').innerHTML = buildTutorialReferenceBoardPage({ baseUrl: location.origin + '/', board: {
          items: [{ name: 'Fit regression', allSvg: svg(100, 200), variableSvg: svg(200, 100), allAnimation: svg(100, 200), variableAnimation: svg(200, 100) }],
        }});
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
      await page.screenshot({path: `output/playwright/tutorial-fit-${process.argv[2] || 'webkit'}-${width}x${height}.png`});
      console.log(`PASS: four board pages and portrait/landscape SVG pixels at ${width}x${height}`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
