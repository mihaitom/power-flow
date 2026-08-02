#!/usr/bin/env node
/**
 * Captures animated GIF(s) of the powerflow diagram using CDP screencast.
 *
 * Usage:
 *   npm run capture:gif                                              # regenerate every README showcase GIF (see SHOTS below)
 *   npm run capture:gif -- --test "Solar day" --node-style filled --duration 4 --fps 30 --out docs/x.gif
 *
 * Options (single-shot mode — used whenever --test is given):
 *   --test <label>        Test case button to click
 *   --node-style <style>  soft | tonal | outline | filled (default: soft)
 *   --node-shape <shape>   circle | square | hexagon (default: circle, i.e. omit the flag)
 *   --icon-style           Turn on full-size background icons (iconStyle: 'full')
 *   --dot-shape <shape>     circle | triangle | bolt | chevron | spark (default: circle, i.e. omit the flag)
 *   --track-pulse           Turn on pulsing active tracks (trackPulse: true)
 *   --curve-bend <n>        Corner radius, 0 (sharp corner) .. 2.5 (straight line); default: 1 (untouched)
 *   --duration <s>          Recording duration in seconds (default: 3)
 *   --fps <n>                Output GIF framerate (default: 30)
 *   --out <path>             Output file (default: docs/preview.gif)
 *
 * With no --test, captures every entry in SHOTS below instead (batch mode).
 * Each shot's output width follows that test case's own diagram aspect ratio
 * (see the `hasTop`/`hasBottom`/4th-column viewBox sizing in core.ts) rather
 * than a fixed square, so e.g. a 4-column test case isn't letterboxed inside
 * a narrower capture.
 *
 * Requires: python3, ffmpeg, chromium at /usr/bin/chromium
 * puppeteer-core is installed automatically on first run (not in package.json
 * so CI stays lean — only needed locally for GIF generation).
 */

const { execSync } = require('child_process');

// Auto-install puppeteer-core if not present (keeps it out of package.json)
try {
  require('puppeteer-core');
} catch {
  console.log('Installing puppeteer-core (one-time)…');
  execSync('npm install --no-save puppeteer-core', { stdio: 'inherit' });
}
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};
const has = (flag) => args.includes(flag);

// The GIFs referenced from the README — deliberately just a handful, each
// stacking as many *different* settings together as possible, rather than
// one GIF per option (a README is not a gallery). The hero shot
// (preview.gif, top of the README) is the one exception: it stays at every
// default (nodeStyle/nodeShape/dotShape all default, trackPulse off,
// curveBend untouched) so it honestly represents the out-of-the-box look.
// Each of the other three combines a distinct nodeStyle + nodeShape +
// dotShape + curveBend (covering all three nodeShapes and both curveBend
// extremes plus a middle value across the full set), and each also turns on
// exactly one of iconStyle/trackPulse — so across the set, every appearance
// knob gets exercised at least once, on top of three different test
// cases/topologies (a 4-column layout with trackPulse, the balcony-PV
// topology with a battery SoC ring, and a 3-column layout).
const SHOTS = [
  { test: 'Solar day', nodeStyle: 'soft', out: 'docs/preview.gif' },
  {
    test: 'All four consumers + battery-fed loads',
    nodeStyle: 'outline',
    nodeShape: 'hexagon',
    dotShape: 'spark',
    trackPulse: true,
    curveBend: 2.5,
    out: 'docs/preview-outline.gif',
  },
  {
    test: 'Balcony PV + battery-fed load',
    nodeStyle: 'filled',
    nodeShape: 'square',
    iconStyle: true,
    dotShape: 'bolt',
    curveBend: 0,
    out: 'docs/preview-filled.gif',
  },
  {
    test: 'Consumers + battery, midday',
    nodeStyle: 'tonal',
    dotShape: 'chevron',
    nodeShape: 'circle',
    curveBend: 0.2, // a third, distinct point between the two extremes above
    out: 'docs/preview-tonal.gif',
  },
];

const cliTest = get('--test', null);
const shots = cliTest
  ? [
      {
        test: cliTest,
        nodeStyle: get('--node-style', 'soft'),
        nodeShape: get('--node-shape', null),
        iconStyle: has('--icon-style'),
        dotShape: get('--dot-shape', null),
        trackPulse: has('--track-pulse'),
        curveBend: get('--curve-bend', null),
        out: get('--out', 'docs/preview.gif'),
      },
    ]
  : SHOTS;

const DURATION_S = Number(get('--duration', 3));
const OUT_FPS = Number(get('--fps', 30));
const REF_HEIGHT = 460; // shared output scale across shots — width follows each diagram's own aspect ratio

const ROOT = path.resolve(__dirname, '..');
const DIST_SITE = path.join(ROOT, 'dist-site');
const SERVE_DIR = path.join(ROOT, 'node_modules/.cache/pf-serve');
const PORT = 8081;
const BASE = `/power-flow/`;
const URL = `http://localhost:${PORT}${BASE}`;
const CHROMIUM = '/usr/bin/chromium';
const FRAMES = path.join(ROOT, 'node_modules/.cache/pf-frames');

// ── Step 1: build site ────────────────────────────────────────────────────────
console.log('Building site…');
execSync('npm run build:site', { cwd: ROOT, stdio: 'inherit' });

// ── Step 2: set up static server at /power-flow/ ─────────────────────
fs.rmSync(SERVE_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(SERVE_DIR, 'power-flow'), { recursive: true });
execSync(`cp -r ${DIST_SITE}/. ${path.join(SERVE_DIR, 'power-flow')}/`);

const server = spawn(
  'python3',
  ['-m', 'http.server', String(PORT), '--directory', SERVE_DIR],
  { stdio: 'ignore', detached: false },
);
// Give the server a moment to start
execSync('sleep 0.5');

// ── Step 3: capture one shot via CDP screencast ───────────────────────────────
async function captureShot(
  browser,
  { test, nodeStyle, nodeShape, iconStyle, dotShape, trackPulse, curveBend, out },
) {
  const outFile = path.resolve(ROOT, out);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
  ]);
  // Generous placeholder for the initial load; narrowed to exactly match
  // this shot's card size once that's known below, so the screencast (which
  // captures the full viewport, not just the card element) doesn't pick up
  // a ring of empty page around a smaller card.
  await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0' });

  await page.addStyleTag({
    content: `
      html, body { background: #fff !important; margin: 0; padding: 0 !important; }
      .page-header { display: none !important; }
      .layout { display: block !important; }
      .card:not(.diagram-card) { display: none !important; }
      .diagram-card {
        resize: none !important;
        border: none !important; border-radius: 0 !important;
        padding: 16px !important; margin: 0 !important;
        background: #fff !important;
      }
      .resize-hint { display: none !important; }
    `,
  });

  await new Promise((r) => setTimeout(r, 500));

  // Click the requested test case
  const clicked = await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('#testcases button')].find(
      (b) => b.textContent.trim() === label,
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, test);
  if (!clicked) {
    const available = await page.evaluate(() =>
      [...document.querySelectorAll('#testcases button')].map((b) =>
        b.textContent.trim(),
      ),
    );
    throw new Error(
      `Test case "${test}" not found. Available: ${available.join(', ')}`,
    );
  }

  // Apply the requested nodeStyle (defaults to 'soft', already the on-load state)
  if (nodeStyle) {
    const styled = await page.evaluate((style) => {
      const btn = document.querySelector(`[data-node-style="${style}"]`);
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, nodeStyle);
    if (!styled) {
      throw new Error(
        `nodeStyle "${nodeStyle}" not found (expected soft/tonal/outline/filled)`,
      );
    }
  }

  // Optionally also switch on full-size background icons, a non-circle node
  // shape, trackPulse and/or a non-default dot shape. Uses a synthetic DOM
  // click (like the test-case and nodeStyle clicks above) rather than
  // page.click() — puppeteer's real click requires the element to be
  // visible/hit-testable, but these controls live in the sidebar `.card`,
  // which the style tag above hides.
  if (iconStyle)
    await page.evaluate(() => document.getElementById('icon-style-full').click());
  if (nodeShape) {
    const shaped = await page.evaluate((shape) => {
      const btn = document.querySelector(`[data-node-shape="${shape}"]`);
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, nodeShape);
    if (!shaped) {
      throw new Error(
        `nodeShape "${nodeShape}" not found (expected circle/square/hexagon)`,
      );
    }
  }
  if (trackPulse)
    await page.evaluate(() => document.getElementById('track-pulse').click());
  if (dotShape) {
    const shaped = await page.evaluate((shape) => {
      const btn = document.querySelector(`[data-dot-shape="${shape}"]`);
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, dotShape);
    if (!shaped) {
      throw new Error(
        `dotShape "${dotShape}" not found (expected circle/triangle/bolt/chevron/spark)`,
      );
    }
  }
  if (curveBend != null) {
    // The #curve-bend <input> is a plain 0..1 slider position, not curveBend
    // itself — see curveBendToSlider()/sliderToCurveBend() in
    // playground-state.ts for the (quadratic, "logarithmic-feeling")
    // mapping this replicates. Setting .value alone doesn't run the
    // playground's own 'input' listener, so dispatch one to actually apply it.
    await page.evaluate((bend) => {
      const CURVE_BEND_MAX = 2.5;
      const CURVE_BEND_SLIDER_EXPONENT = 2;
      const pos = Math.pow(bend / CURVE_BEND_MAX, 1 / CURVE_BEND_SLIDER_EXPONENT);
      const inp = document.getElementById('curve-bend');
      inp.value = String(pos);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, Number(curveBend));
  }

  // Every control click/input above triggers the playground's own syncUrl()
  // (see playground-share.ts), which already encodes the full state
  // (test-case data + every non-default option) into `?s=...` on
  // history.replaceState — so location.href here already *is* the shareable
  // link for this exact shot. Just swap the local dev-server origin for the
  // real published playground's.
  const playgroundUrl = await page.evaluate(() =>
    location.href.replace(
      /^https?:\/\/[^/]+\/power-flow\//,
      'https://mihaitom.github.io/power-flow/',
    ),
  );

  // The diagram's own aspect ratio (400 or 545 wide, per the viewBox sizing
  // in core.ts's update()) depends on which optional nodes the test case
  // sets — read it back from the element's own inline style (set there)
  // rather than assuming a fixed square.
  const ratio = await page.evaluate(() => {
    const el = document.querySelector('power-flow');
    const [w, h] = el.style.aspectRatio.split('/').map((s) => parseFloat(s));
    return w / h;
  });
  const height = REF_HEIGHT;
  const width = Math.round(height * ratio);
  await page.evaluate(
    (w, h) => {
      const card = document.querySelector('.diagram-card');
      card.style.width = `${w}px`;
      card.style.height = `${h}px`;
    },
    width,
    height,
  );
  // Shrink the viewport to exactly match — the screencast below captures the
  // whole viewport, not just the card element, so a larger viewport would
  // leave a ring of empty white page around a smaller/narrower card.
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  // Let dots spread out before recording
  await new Promise((r) => setTimeout(r, 1500));

  // Start CDP screencast at native frame rate
  const client = await page.createCDPSession();
  const captured = [];

  client.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    captured.push({ data, ts: metadata.timestamp * 1000 });
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  await client.send('Page.startScreencast', {
    format: 'png',
    quality: 90,
    maxWidth: width,
    maxHeight: height,
    everyNthFrame: 1,
  });

  process.stdout.write(
    `Recording "${test}" (${nodeStyle || 'soft'}${nodeShape ? `, ${nodeShape}` : ''}${dotShape ? `, ${dotShape} dots` : ''}${trackPulse ? ', trackPulse' : ''}${curveBend != null ? `, curveBend=${curveBend}` : ''}, ${width}×${height}) for ${DURATION_S}s…`,
  );
  await new Promise((r) => setTimeout(r, DURATION_S * 1000));
  await client.send('Page.stopScreencast');
  console.log(
    ` ${captured.length} frames (${(captured.length / DURATION_S).toFixed(0)} fps)`,
  );

  // Save frames
  const t0 = captured[0].ts;
  captured.forEach((f) => {
    f.ts -= t0;
  });
  for (let i = 0; i < captured.length; i++) {
    fs.writeFileSync(
      path.join(FRAMES, `frame-${String(i).padStart(4, '0')}.png`),
      Buffer.from(captured[i].data, 'base64'),
    );
  }

  // ffconcat with real per-frame durations → correct playback speed
  const avgDur =
    captured.length > 1
      ? (captured[captured.length - 1].ts - captured[0].ts) /
        (captured.length - 1)
      : 1000 / 60;
  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < captured.length; i++) {
    const durMs =
      i < captured.length - 1 ? captured[i + 1].ts - captured[i].ts : avgDur;
    lines.push(`file '${FRAMES}/frame-${String(i).padStart(4, '0')}.png'`);
    lines.push(`duration ${(durMs / 1000).toFixed(4)}`);
  }
  const concatFile = path.join(FRAMES, 'concat.txt');
  fs.writeFileSync(concatFile, lines.join('\n'));

  // Build GIF, scaled to this shot's own width (height follows via -1)
  const palette = path.join(FRAMES, 'palette.png');
  execSync(
    `ffmpeg -y -f concat -safe 0 -i ${concatFile} ` +
      `-vf "scale=${width}:-1:flags=lanczos,palettegen=reserve_transparent=0:stats_mode=diff" ` +
      `${palette}`,
    { stdio: 'pipe' },
  );
  execSync(
    `ffmpeg -y -f concat -safe 0 -i ${concatFile} -i ${palette} ` +
      `-lavfi "[0:v]scale=${width}:-1:flags=lanczos,fps=${OUT_FPS}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" ` +
      `${outFile}`,
    { stdio: 'pipe' },
  );

  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(`  → ${out} (${kb} kB)`);
  console.log(`    ${playgroundUrl}`);

  await page.close();
  return playgroundUrl;
}

// A fresh browser process per shot rather than one shared across the whole
// batch — verified empirically that a shared browser's CDP screencast can
// bleed a stray frame or two from one shot's page into the next one's
// recording (e.g. the "tonal" shot's full-size icon / triangle dots briefly
// appearing in the unrelated "filled" shot before it) even though each
// shot's own page is fresh; a whole new browser per shot removes any shared
// CDP/renderer state that could cause that.
async function captureShotInOwnBrowser(shot) {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--force-color-profile=srgb',
    ],
    headless: true,
  });
  try {
    return await captureShot(browser, shot);
  } finally {
    await browser.close();
  }
}

const run = async () => {
  for (const shot of shots) {
    await captureShotInOwnBrowser(shot);
  }
};

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
  });
