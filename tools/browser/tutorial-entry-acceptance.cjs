// Real experiment entry acceptance. evaluate() only reads DOM/storage; all input is native UI.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

async function guardLocalContext(context, baseUrl) {
  const origin = new URL(baseUrl).origin;
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Acceptance requires a loopback origin');
  const network = { origin, requests: [], outsideOrigin: [], blocked: [], failed: [], redirectProbes: [], httpErrors: [], consoleErrors: [], pageErrors: [] };
  const rootRequests = new WeakSet();
  context.on('request', request => {
    const entry = { url: request.url(), method: request.method(), type: request.resourceType() };
    network.requests.push(entry);
    if (new URL(request.url()).origin !== origin) network.outsideOrigin.push(entry);
    if (request.frame().url() === `${origin}/` || request.frame().url().startsWith(`${origin}/?`)) rootRequests.add(request);
  });
  await context.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
      network.blocked.push({ url: request.url(), method: request.method() });
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  context.on('requestfailed', request => network.failed.push({ url: request.url(), error: request.failure()?.errorText, rootRedirect: rootRequests.has(request) }));
  context.on('response', response => {
    if (response.status() >= 400) network.httpErrors.push({ url: response.url(), status: response.status() });
  });
  context.on('page', page => {
    page.on('console', message => { if (message.type() === 'error') network.consoleErrors.push(message.text()); });
    page.on('pageerror', error => network.pageErrors.push(error.message));
  });
  return network;
}

async function probeRedirectCancellations(page, network) {
  for (const request of network.failed) {
    const url = new URL(request.url);
    // Vite injects modules into the redirect-only root; WebKit cancels that document.
    if (url.origin !== network.origin || !request.rootRedirect || request.error !== 'Load request cancelled'
      || !['/@vite/client', '/node_modules/vite/dist/client/env.mjs'].includes(url.pathname)) continue;
    const probe = await page.evaluate(async url => {
      const response = await fetch(url);
      return { url, status: response.status, bytes: (await response.arrayBuffer()).byteLength };
    }, request.url);
    network.redirectProbes.push(probe);
  }
}

function assertCleanNetwork(network) {
  const blockedOrFailed = new Set([...network.blocked, ...network.failed].map(request => `${request.method} ${request.url}`));
  assert(
    network.outsideOrigin.every(request => blockedOrFailed.has(`${request.method} ${request.url}`)),
    'Every outside-origin request must be explicitly blocked or failed',
  );
  assert(
    network.failed.filter(request => new URL(request.url).origin === network.origin).every(request =>
      request.rootRedirect && request.error === 'Load request cancelled'
      && ['/@vite/client', '/node_modules/vite/dist/client/env.mjs'].includes(new URL(request.url).pathname)
      && (network.redirectProbes || []).some(probe => probe.url === request.url && probe.status === 200 && probe.bytes > 0)),
    'No same-origin request may fail except a root Vite redirect cancellation with a successful exact-asset probe',
  );
  assert(
    network.blocked.filter(request => new URL(request.url).origin === network.origin && ['GET', 'HEAD'].includes(request.method)).length === 0,
    'No same-origin asset request may be blocked',
  );
  assert.deepEqual(network.httpErrors, [], 'No HTTP errors, including 404s');
  assert(
    network.consoleErrors.every(message => message.includes('ERR_BLOCKED_BY_CLIENT')),
    'No application browser console errors; only explicitly blocked browser-extension noise is permitted',
  );
  assert.deepEqual(network.pageErrors, [], 'No uncaught browser errors');
}

async function runEntryAcceptance(browser, options) {
  const { baseUrl, locale, outputDir, viewport, defaultConfig = false, profileOnly = false } = options;
  mkdirSync(outputDir, { recursive: true });
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const network = await guardLocalContext(context, baseUrl);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const chinese = locale === 'zh';
  const checks = [];
  const glowChecks = [];
  const check = async (name, action) => { await action(); checks.push(name); console.log(`PASS ${locale}: ${name}`); };
  const shot = name => page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  const bubble = page.locator('.layout-task-tutorial-bubble');
  const confirm = page.locator('[data-layout-task-anchor="confirm"]');
  // A cloned stage is also present inside the lens. Always address the original canvas.
  const stage = page.locator('.layout-task-stage-wrap > svg');
  const object = id => stage.locator(`.layout-task-object-wrapper[data-object-id="${id}"] .layout-task-object`);
  const pending = () => stage.locator('.layout-task-object-visual.is-pending');
  const anchor = value => page.waitForFunction(value => document.querySelector('.layout-task-tutorial-bubble')?.dataset.anchor === value, value);
  const activeIds = () => stage.locator('.layout-task-object.is-active').evaluateAll(elements => elements.map(e => e.parentElement.dataset.objectId));
  const transforms = () => stage.locator('.layout-task-object').evaluateAll(elements => elements.map(e => e.getAttribute('transform')));
  const moveWithinStage = async (xFraction = 0.5, yFraction = 0.5) => {
    const box = await stage.boundingBox();
    assert(box, 'Tutorial stage must be rendered for pointer movement');
    await page.mouse.move(box.x + box.width * xFraction, box.y + box.height * yFraction);
  };
  const session = () => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('layouttask:session:')).map(key => JSON.parse(sessionStorage.getItem(key))));
  const zoom = () => page.locator('.layout-task-magnifier-scene').evaluate(e => Number(e.style.getPropertyValue('--magnifier-zoom')));
  const enabled = locator => page.waitForFunction(selector => !document.querySelector(selector)?.disabled, locator);
  const glowSample = async (id, name) => {
    const image = object(id).locator('.layout-task-object-image');
    await image.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    const box = await image.boundingBox();
    assert(box, 'Furniture must be rendered for red-glow sampling');
    const clip = { x: Math.max(0, Math.floor(box.x) - 8), y: Math.max(0, Math.floor(box.y) - 8),
      width: Math.ceil(box.width) + 16, height: Math.ceil(box.height) + 16 };
    const bytes = await page.screenshot({ clip, path: path.join(outputDir, `${name}.png`) });
    const visual = object(id).locator('.layout-task-object-visual');
    const metrics = await visual.evaluate(e => {
      const matrix = e.getScreenCTM();
      const filter = getComputedStyle(e).filter;
      const nativeFilter = e.ownerSVGElement.querySelector(`[id="${e.dataset.pendingGlowFilter}"]`);
      const blur = Number(nativeFilter?.querySelector('feDropShadow')?.getAttribute('stdDeviation'));
      const screenScale = Math.hypot(matrix.a, matrix.b);
      return { filter, screenScale, screenBlur: blur * screenScale,
        rootScale: e.ownerSVGElement.getScreenCTM()?.a,
        cameraScale: e.closest('.layout-task-camera-layer').getScreenCTM()?.a };
    });
    if (name.endsWith('before')) {
      console.log(`Pending screen blur ${locale}/${name}:`, JSON.stringify(metrics));
      assert(metrics.screenBlur >= 3 && metrics.screenBlur <= 5, 'Pending glow must remain visibly 3–5 screen pixels at the current SVG scale');
    }
    return { png: PNG.sync.read(bytes), metrics };
  };
  const checkGlowPixels = (pendingSample, savedSample, name) => {
    const before = pendingSample.png, after = savedSample.png;
    assert.equal(before.width, after.width, 'Furniture crop width must stay unchanged');
    assert.equal(before.height, after.height, 'Furniture crop height must stay unchanged');
    let changedRedPixels = 0;
    for (let y = 0; y < before.height; y++) for (let x = 0; x < before.width; x++) {
      const offset = (y * before.width + x) * 4;
      // Rotated furniture leaves floor pixels inside its rectangular bounds.
      if (before.data[offset] - before.data[offset + 1] > 15
        && after.data[offset + 1] >= after.data[offset]
        && after.data[offset + 1] - before.data[offset + 1] > 8
        && after.data[offset + 2] - before.data[offset + 2] > 8) changedRedPixels++;
    }
    glowChecks.push({ name, changedRedPixels, metrics: pendingSample.metrics });
    console.log(`Red glow ${locale}/${name}:`, JSON.stringify(glowChecks.at(-1)));
    assert(changedRedPixels >= 10, `${name}: visible red halo must surround the actual furniture and disappear after Save (found ${changedRedPixels} changed pixels)`);
  };
  let result;
  try {
    const query = defaultConfig ? '?debug=1' : `?config=experiment-local-review-${locale}.json&debug=1`;
    await page.goto(new URL(`/${query}`, baseUrl).href);
    await page.waitForURL('**/experiment/**');
    await page.locator('.layout-task-consent-shell').waitFor();
    await check('root redirect and local copy configuration', async () => {
      assert.equal(new URL(page.url()).pathname, '/experiment/');
      const config = await page.evaluate(async () => {
        const filename = new URLSearchParams(location.search).get('config') || document.documentElement.dataset.defaultConfig;
        return (await fetch(filename)).json();
      });
      assert.equal(config.locale, chinese ? 'zh-CN' : 'en-US');
      assert.equal(config.reference_mode, 'persistent');
      assert.match(config.baseUrl, /layout-task-run12-core23-persistent/);
      assert.deepEqual(config.data_save, { mode: 'copy' });
      assert.equal(config.schedule_path, undefined);
      assert.equal(config.schedule_version, undefined);
    });
    await check('single informed-consent document with retained terms', async () => {
      assert.equal(await page.locator('.layout-task-consent-document article').count(), 1);
      const text = await page.locator('.layout-task-consent-document').innerText();
      assert.match(text, chinese ? /知情同意书/ : /Informed Consent Form/);
      assert.match(text, chinese ? /隐私/ : /Privacy/);
      assert.match(text, /20-45/);
      for (const amount of ['£4', '£0.04', '£12']) assert(text.includes(amount));
      assert.doesNotMatch(text, /Art\. 13 GDPR|数据保护声明/);
      assert.match(await page.locator('.layout-task-consent-developer-notice').innerText(), /9999/);
    });
    await check('scrollable document and four confirmation gate', async () => {
      const document = page.locator('.layout-task-consent-document');
      const button = page.locator('.layout-task-consent-shell button');
      const boxes = page.locator('[data-consent-index]');
      assert.equal(await boxes.count(), 4);
      assert(await button.isDisabled());
      await document.focus();
      await page.keyboard.press('End');
      await page.waitForFunction(() => {
        const e = document.querySelector('.layout-task-consent-document');
        return e.scrollTop + e.clientHeight >= e.scrollHeight - 2;
      });
      // Native entry has no additional read timer: verify its actual four-item gate.
      for (let index = 0; index < 3; index++) { await boxes.nth(index).check(); assert(await button.isDisabled()); }
      await boxes.nth(3).check(); assert(await button.isEnabled());
      await boxes.nth(0).uncheck(); assert(await button.isDisabled());
      await boxes.nth(0).check();
      await shot('consent');
      await button.click();
    });
    await check('age required, positive integer validation and eyewear', async () => {
      const shell = page.locator('.layout-task-profile-shell');
      const age = page.locator('#layout-task-participant-age');
      for (const invalid of ['', '0', '-1', '1.5']) {
        await age.fill(invalid);
        await shell.locator('button').click();
        assert(await shell.isVisible());
        assert(await shell.locator('[role="alert"]').isVisible());
      }
      assert.match(await shell.innerText(), chinese ? /视力提示/ : /Vision/);
      await age.fill('31');
      await page.locator('#layout-task-corrective-eyewear').setChecked(chinese);
      await shot('profile');
      await shell.locator('button').click();
      const identity = page.locator('.layout-task-prolific-id-shell');
      await identity.locator('button').click();
      assert(await identity.locator('[role="alert"]').isVisible());
      await page.locator('#layout-task-prolific-id').fill(`local-task8-${locale}`);
      await identity.locator('button').click();
    });
    await page.locator('.layout-task-tutorial-intro-shell').waitFor();
    await check('consent and profile persist in actual experiment session', async () => {
      const records = await session();
      assert.equal(records.length, 1);
      assert.equal(records[0].participant_id, '9999');
      assert.deepEqual(records[0].participant_profile, { participant_age: 31, requires_corrective_eyewear: chinese });
      assert.equal(records[0].consent.consent_version, 'informed-consent-2026-10-13-v2');
      assert.equal(records[0].consent.locale, chinese ? 'zh-CN' : 'en-US');
      assert.equal(records[0].consent.notice_version, undefined);
      assert.equal(records[0].consent.data_protection_statement_confirmed, undefined);
      const confirmations = Object.entries(records[0].consent).filter(([key]) => key.endsWith('_confirmed'));
      assert.equal(confirmations.length, 4);
      assert(confirmations.every(([, value]) => value === true));
    });
    await check('tutorial opening has one task and process line', async () => {
      assert.equal(await page.locator('.layout-task-tutorial-intro-shell .layout-task-tutorial-task').count(), 1);
      assert.equal(await page.locator('.layout-task-tutorial-intro-shell .layout-task-tutorial-intro-body').count(), 1);
      assert.equal(await page.locator('.layout-task-tutorial-intro-shell h1').innerText(), chinese ? '恢复家具布局' : 'Reconstruct the furniture layout');
      await shot('opening');
    });
    if (!profileOnly) {
      await page.locator('#jspsych-instructions-next').click();
      for (let index = 0; index < 4; index++) {
        await check(`reference page ${index + 1}: before direction, real read gate, independent drag and held-wheel zoom`, async () => {
          const frames = page.locator('.layout-task-reference-board-mounted .layout-task-tutorial-board-svg');
          await frames.first().waitFor();
          assert.equal(await frames.count(), 2);
          assert.equal(await stage.locator('.layout-task-tutorial-viewing-direction').evaluate(e => e.classList.contains('is-visible')), false);
          assert.equal(await page.locator('.layout-task-tutorial-board-progress').innerText(), `${index + 1} / 4`);
          const next = page.locator('#jspsych-instructions-next');
          assert(await next.isDisabled());
          const startedAt = Date.now();
          for (let frameIndex = 0; frameIndex < 2; frameIndex++) {
            const frame = frames.nth(frameIndex);
            const drawing = frame.locator('.layout-task-tutorial-board-image');
            const box = await frame.boundingBox();
            assert(box);
            const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            await page.mouse.move(center.x, center.y);
            await page.mouse.down(); await page.mouse.up();
            assert.equal(await frame.getAttribute('data-reference-dragged'), null);
            await page.mouse.down();
            await page.mouse.move(center.x + 8, center.y + 5, { steps: 3 });
            assert(await frame.locator('.layout-task-tutorial-board-hand').evaluate(e => e.classList.contains('is-hidden')), 'Short central drag must hide its hand while held');
            assert(await frame.locator('.layout-task-tutorial-board-hand-label').evaluate(e => e.classList.contains('is-hidden')));
            await page.mouse.wheel(0, -100);
            await page.waitForFunction(image => new DOMMatrix(getComputedStyle(image).transform).a === 1.25, await drawing.elementHandle());
            await page.mouse.move(center.x + 10, center.y + 6);
            const heldTransform = await drawing.evaluate(e => e.style.transform);
            await page.mouse.up();
            await page.mouse.wheel(0, -100);
            await page.screenshot();
            assert.equal(await drawing.evaluate(e => e.style.transform), heldTransform, 'Released wheel must not zoom the reference frame');
            assert.equal(await frame.getAttribute('data-reference-dragged'), 'true');
            if (frameIndex === 0) {
              assert.equal(await frames.nth(1).getAttribute('data-reference-dragged'), null);
              assert.equal(await frames.nth(1).locator('.layout-task-tutorial-board-image').evaluate(e => e.style.transform), '', 'Frame zoom must be independent');
            }
            await page.mouse.move(box.x + box.width * .92, box.y + box.height * .92);
            assert(await frame.locator('.layout-task-tutorial-board-hand').evaluate(e => e.classList.contains('is-hidden')));
            await page.mouse.move(center.x, center.y);
            assert.equal(await frame.locator('.layout-task-tutorial-board-hand').evaluate(e => e.classList.contains('is-hidden')), false);
          }
          await shot(`board-${index + 1}`);
          await enabled('#jspsych-instructions-next');
          assert(Date.now() - startedAt >= 4000, 'Reference board must use its real five-second gate');
          await next.click();
        });
      }
      await anchor('viewport-tools');
      await check('direction appears after all four furniture pages and clears after confirmation', async () => {
        assert(await stage.locator('.layout-task-tutorial-viewing-direction').evaluate(e => e.classList.contains('is-visible')));
        assert(await confirm.isDisabled());
        const editable = stage.locator('.layout-task-object[role="button"]').first();
        await editable.click();
        assert.deepEqual(await activeIds(), []);
        assert.match(await bubble.innerText(), chinese ? /观察方向/ : /viewing direction/);
        await shot('direction');
        await page.locator('.layout-task-tutorial-button').click();
        assert.equal(await stage.locator('.layout-task-tutorial-viewing-direction').evaluate(e => getComputedStyle(e).opacity), '0');
        assert.match(await bubble.innerText(), chinese ? /滚轮调节倍率/ : /change its zoom with the wheel/);
      });
      const magnifier = page.locator('.layout-task-magnifier-button');
      const lens = page.locator('.layout-task-magnifier-lens');
      const ids = await stage.locator('.layout-task-object[role="button"]').evaluateAll(elements => elements.map(e => e.parentElement.dataset.objectId));
      assert.equal(ids.length, 4, 'Shipped tutorial must have four editable furniture groups');
      await check('magnifier practice requires wheel change and ESC', async () => {
        assert(await confirm.isDisabled());
        await magnifier.click();
        assert.equal(await magnifier.getAttribute('aria-pressed'), 'true');
        await page.keyboard.press('Escape');
        assert.match(await bubble.innerText(), chinese ? /滚轮调节倍率/ : /change its zoom with the wheel/);
        await magnifier.click();
        const svgIds = await page.locator('.layout-task-stage-wrap > svg [id], .layout-task-magnifier-scene-svg [id]').evaluateAll(elements => elements.map(element => element.id));
        assert.equal(new Set(svgIds).size, svgIds.length, 'Magnifier SVG resources must not share IDs with the original scene');
        await moveWithinStage();
        assert(await lens.isVisible());
        assert.match(await page.locator('.layout-task-magnifier-hint').innerText(), /ESC/);
        const checkHint = async () => {
          const lensBox = await lens.boundingBox();
          const hint = page.locator('.layout-task-magnifier-hint');
          const hintBox = await hint.boundingBox();
          assert(lensBox && hintBox && hintBox.y >= lensBox.y + lensBox.height + 7, 'Magnifier information must be below the circular lens');
          assert(hintBox.x >= 0 && hintBox.x + hintBox.width <= viewport.width, 'Magnifier information must fit horizontally');
          assert(hintBox.y >= 0 && hintBox.y + hintBox.height <= viewport.height, 'Magnifier information must fit vertically');
          assert.equal(await hint.evaluate(e => e.scrollHeight <= e.clientHeight && e.scrollWidth <= e.clientWidth), true, 'Magnifier information must not clip its text');
          assert.equal(await lens.evaluate(e => getComputedStyle(e).overflow), 'visible', 'Lens must not clip the external information');
          assert.equal(await page.locator('.layout-task-magnifier-scene').evaluate(e => getComputedStyle(e).borderRadius), '50%', 'Magnified scene must retain its circular clip');
        };
        await checkHint();
        const before = await transforms();
        const blockedObjectBox = await object(ids[0]).boundingBox();
        assert(blockedObjectBox, 'Magnifier test object must be rendered');
        // The active lens intentionally overlays the canvas. Dispatch a real pointer
        // click at the object center and verify the overlay, rather than asking
        // Playwright to click an obscured locator.
        await page.mouse.click(
          blockedObjectBox.x + blockedObjectBox.width / 2,
          blockedObjectBox.y + blockedObjectBox.height / 2,
        );
        await page.keyboard.press('ArrowRight');
        assert.deepEqual(await transforms(), before);
        assert.deepEqual(await activeIds(), []);
        assert(await page.locator('[data-layout-task-pause]:visible').isDisabled());
        for (const [name, target] of [
          ['SVG furniture', object(ids[0])],
          ['perspective image', page.locator('.layout-task-display-image')],
          ['tutorial bubble', bubble],
          ['magnifier button', magnifier],
        ]) {
          await target.scrollIntoViewIfNeeded();
          const targetBox = await target.boundingBox();
          assert(targetBox, `${name} must be visible for wheel testing`);
          await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
          await page.mouse.up();
          const scrollBefore = await page.evaluate(() => window.scrollY);
          await page.mouse.wheel(0, -100);
          await page.waitForFunction(() => Number(document.querySelector('.layout-task-magnifier-scene').style.getPropertyValue('--magnifier-zoom')) === 2.25);
          assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, `Wheel over ${name} must zoom, not scroll the page`);
          await page.mouse.wheel(0, 100);
          await page.waitForFunction(() => Number(document.querySelector('.layout-task-magnifier-scene').style.getPropertyValue('--magnifier-zoom')) === 2);
        }
        await page.mouse.move(2, 2);
        await page.mouse.wheel(0, -100);
        await page.waitForFunction(() => Number(document.querySelector('.layout-task-magnifier-scene').style.getPropertyValue('--magnifier-zoom')) === 2.25);
        await page.mouse.wheel(0, 100);
        await page.waitForFunction(() => Number(document.querySelector('.layout-task-magnifier-scene').style.getPropertyValue('--magnifier-zoom')) === 2);
        await stage.scrollIntoViewIfNeeded();
        await moveWithinStage();
        for (let index = 0; index < 10; index++) await page.mouse.wheel(0, -100);
        await page.waitForFunction(() => Number(document.querySelector('.layout-task-magnifier-scene').style.getPropertyValue('--magnifier-zoom')) === 4);
        assert.equal(await zoom(), 4);
        await checkHint();
        await shot('magnifier-max');
        for (let index = 0; index < 12; index++) await page.mouse.wheel(0, 100);
        await page.waitForFunction(() => Number(document.querySelector('.layout-task-magnifier-scene').style.getPropertyValue('--magnifier-zoom')) === 1.5);
        assert.equal(await zoom(), 1.5);
        const box = await stage.boundingBox();
        await page.mouse.move(box.x + 2, box.y + 2);
        const edge = await lens.boundingBox();
        assert(edge.x >= box.x - 2 && edge.y >= box.y - 2, 'Lens must remain clamped at canvas edges');
        await checkHint();
        await page.evaluate(() => {
          const rect = document.querySelector('.layout-task-stage-wrap > svg').getBoundingClientRect();
          window.scrollBy(0, rect.bottom - window.innerHeight);
        });
        const bottomBox = await stage.boundingBox();
        await page.mouse.move(bottomBox.x + bottomBox.width / 2, bottomBox.y + bottomBox.height - 2);
        await checkHint();
        await shot('magnifier-bottom-edge');
        await page.mouse.move(2, 2);
        assert.equal(await magnifier.getAttribute('aria-pressed'), 'true', 'Leaving canvas does not exit magnifier');
        await shot('magnifier-min-edge');
        await page.keyboard.press('Escape');
        assert(await lens.isHidden());
        await anchor('stage');
      });
      const chooseRatings = async () => {
        const save = page.locator('.layout-task-confidence-save');
        assert(await save.isDisabled());
        await page.locator('[data-confidence-dimension="position"]').first().click();
        assert(await save.isDisabled());
        await page.locator('[data-confidence-dimension="rotation"]').first().click();
        assert(await save.isEnabled());
      };
      await check('first zero-movement edit, lens restores edit, confidence emphasis', async () => {
        assert.equal(await pending().count(), 4);
        assert.equal(await confirm.innerText(), chinese ? 'Confirm · 剩余 4/4' : 'Confirm · 4/4 left');
        const pendingSample = await glowSample(ids[0], 'tutorial-glow-before');
        await shot('pending-glow');
        await object(ids[0]).click();
        await anchor('confidence');
        assert.deepEqual(await bubble.locator('.layout-task-tutorial-task, .layout-task-tutorial-body').allTextContents(), chinese ? [
          '你的任务：根据透视图，还原所选家具的位置和方向。',
          '参考页面右侧灰色框中的操作提示，完成调整后在左下方填写位置和方向置信度。',
        ] : [
          "Your task: Match this object's position and orientation to the perspective image.",
          'Refer to the control tips in the gray box on the right, then rate your confidence in position and orientation at the bottom left.',
        ]);
        await shot('concise-edit-task');
        const before = await transforms();
        assert.deepEqual(await activeIds(), [ids[0]]);
        assert.deepEqual(await page.locator('.layout-task-confidence-dimension').allTextContents(), chinese ? ['位置', '旋转'] : ['position', 'rotation']);
        await magnifier.click();
        await moveWithinStage();
        await shot('magnifier-editing');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Escape');
        assert.deepEqual(await transforms(), before);
        assert.deepEqual(await activeIds(), [ids[0]]);
        assert(await page.locator('.layout-task-confidence').isVisible());
        await chooseRatings();
        assert.equal(await confirm.innerText(), chinese ? 'Confirm · 剩余 4/4' : 'Confirm · 4/4 left');
        await shot('confidence-before-save');
        await page.locator('.layout-task-confidence-save').click();
        await anchor('pause');
        assert.deepEqual(await transforms(), before, 'First Save must accept no movement or rotation');
        assert.equal(await pending().count(), 3);
        assert.equal(await confirm.innerText(), chinese ? 'Confirm · 剩余 3/4' : 'Confirm · 3/4 left');
        assert.equal(await object(ids[0]).locator('.is-pending').count(), 0);
        checkGlowPixels(pendingSample, await glowSample(ids[0], 'tutorial-glow-after'), 'tutorial');
        await shot('first-save-glow-removed');
      });
      await check('Pause cancel retains gate, confirm blocks input, resume advances', async () => {
        const pause = page.locator('[data-layout-task-pause]:visible');
        assert(await confirm.isDisabled());
        await pause.click();
        assert(await page.locator('[data-layout-task-pause-dialog]:visible').isVisible());
        await page.locator('[data-layout-task-pause-cancel]:visible').click();
        await anchor('pause');
        assert(await confirm.isDisabled());
        await pause.click();
        await page.locator('[data-layout-task-pause-confirm]:visible').click();
        assert(await page.locator('[data-layout-task-pause-overlay]:visible').isVisible());
        const before = await transforms();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Escape');
        assert.deepEqual(await transforms(), before);
        assert(await page.locator('[data-layout-task-pause-overlay]:visible').isVisible());
        await shot('pause-practice');
        if (chinese) {
          const startedAt = Date.now();
          await page.locator('[data-layout-task-pause-overlay]:visible').waitFor({ state: 'hidden', timeout: 12000 });
          assert(Date.now() - startedAt >= 8500, 'Automatic practice must wait ten seconds');
        } else await page.locator('[data-layout-task-pause-resume]:visible').click();
        await anchor('stage');
        assert.match(await bubble.innerText(), chinese ? /其余/ : /remaining/);
        assert.equal((await session())[0].pause_used, false, 'Tutorial practice must not consume formal Pause');
      });
      await check('remaining saves gate, reopening a saved group remains editable', async () => {
        await confirm.click();
        assert.equal(await pending().count(), 3);
        assert.match(await page.locator('.layout-task-status').innerText(), chinese ? /保存所有家具/ : /save both ratings/);
        await object(ids[0]).click();
        await chooseRatings();
        await page.locator('.layout-task-confidence-save').click();
        assert.equal(await confirm.innerText(), chinese ? 'Confirm · 剩余 3/4' : 'Confirm · 3/4 left', 'Re-saving cannot decrement twice');
        for (const id of ids.slice(1)) {
          await object(id).click();
          assert.deepEqual(await activeIds(), [id]);
          await chooseRatings();
          await page.locator('.layout-task-confidence-save').click();
          const remaining = ids.length - ids.indexOf(id) - 1;
          assert.equal(await confirm.innerText(), remaining > 0
            ? chinese ? `Confirm · 剩余 ${remaining}/4` : `Confirm · ${remaining}/4 left`
            : 'Confirm ★');
        }
        await anchor('confirm');
        assert.equal(await pending().count(), 0);
        assert.equal(await confirm.innerText(), 'Confirm ★');
        assert.deepEqual(await activeIds(), []);
        await shot('all-saved');
        await confirm.click();
        await page.locator('.layout-task-tutorial-complete-shell').waitFor();
      });
      await check('local tutorial result and effective timing', async () => {
        const files = await page.evaluate(async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('layouttask-local-backup', 1);
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
          });
          const records = await new Promise((resolve, reject) => {
            const request = db.transaction('files', 'readonly').objectStore('files').getAll();
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
          });
          db.close(); return records;
        });
        result = files.filter(r => r.file?.contentType === 'application/json').map(r => JSON.parse(r.file.data)).find(r => r.result?.task_id === 'scene_edc634ac7856')?.result;
        assert(result, 'Actual saved tutorial envelope must exist in local IndexedDB');
        assert(result.magnifier.use_count >= 3);
        assert(result.magnifier.total_duration_ms > 0);
        assert.equal(result.pause.tutorial_pause_practice, true);
        assert.equal(result.pause.pause_end_reason, chinese ? 'auto_resume_10s' : 'manual_resume');
        assert.equal(result.effective_duration_ms, Math.max(0, result.duration_ms - result.magnifier.total_duration_ms));
        assert.equal(result.page_timing.effective_player_elapsed_ms, Math.max(0, result.page_timing.active_player_elapsed_ms - result.magnifier.total_duration_ms));
        assert.equal(Object.keys(result.confidence).length, 4);
        writeFileSync(path.join(outputDir, 'local-backup.json'), JSON.stringify(files, null, 2));
        await shot('tutorial-complete');
      });
      await page.locator('#jspsych-instructions-next').click();
      await stage.waitFor();
      await check('first formal R12 scene, persistent reference, fresh formal Pause', async () => {
        await page.waitForFunction(() => document.querySelector('.layout-task-display-image')?.complete);
        assert.equal(await stage.locator('.layout-task-tutorial-viewing-direction').count(), 0);
        assert(await page.locator('.layout-task-display-image-frame.is-persistent-reference').isVisible());
        assert.match(await page.locator('.layout-task-display-image').getAttribute('src'), /be84fc97a8d1/);
        assert.equal(await page.locator('.layout-task-tutorial-bubble:not([hidden])').count(), 0);
        assert(await page.locator('[data-layout-task-pause]:visible').isEnabled());
        const records = await session();
        assert.equal(records[0].pause_used, false);
        assert.equal(records[0].pause_count, undefined);
        assert.equal(records[0].pause_snapshot, undefined, 'The tutorial practice must not write a formal pause snapshot');
        await shot('formal');
        const formalId = (await activeIds())[0] || await stage.locator('.layout-task-object[role="button"]').first().evaluate(e => e.parentElement.dataset.objectId);
        assert.equal(await pending().count(), 4, 'Formal tasks must start with all four targets pending');
        assert.equal(await confirm.innerText(), chinese ? 'Confirm · 剩余 4/4' : 'Confirm · 4/4 left');
        const formalPending = await glowSample(formalId, 'formal-glow-before');
        await object(formalId).click();
        await chooseRatings();
        await page.locator('.layout-task-confidence-save').click();
        assert.equal(await pending().count(), 3);
        assert.equal(await confirm.innerText(), chinese ? 'Confirm · 剩余 3/4' : 'Confirm · 3/4 left');
        checkGlowPixels(formalPending, await glowSample(formalId, 'formal-glow-after'), 'formal');
      });
    }
    await probeRedirectCancellations(page, network);
    await check('all asset requests successful; entire outside origin excluded', async () => assertCleanNetwork(network));
    return { status: 'passed', locale, viewport, profileOnly, checks, count: checks.length, glowChecks, network };
  } catch (error) {
    await shot('failure').catch(() => {});
    writeFileSync(path.join(outputDir, 'failure.html'), await page.content().catch(() => ''));
    throw error;
  } finally {
    writeFileSync(path.join(outputDir, 'acceptance.json'), JSON.stringify({ locale, viewport, profileOnly, checks, count: checks.length, glowChecks, network, result }, null, 2));
    await context.close();
  }
}

module.exports = { guardLocalContext, assertCleanNetwork, probeRedirectCancellations, runEntryAcceptance };
