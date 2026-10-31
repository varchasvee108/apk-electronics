// Browser end-to-end pass 2 against the web build served on :8099 (see tools/e2e-web.js for setup).
// Second end-to-end pass: instruments, run controls, damage/repair, saving, navigation.
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:8099';
const results = [];
const check = (cond, msg) => {
  results.push([!!cond, msg]);
  console.log(cond ? '  ok  ' : '  FAIL', msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const colX = (c) => c + 1;
const ROWS = { a: 6, b: 7, c: 8, d: 9, e: 10, f: 13, g: 14, h: 15, i: 16, j: 17 };
const hole = (n) => ({ x: colX(Number(n.slice(1))), y: ROWS[n[0]] });

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 880 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 400)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  page.on('dialog', async (d) => d.accept());

  const store = (fn) => page.evaluate(`(${fn})(globalThis.__benchStore.getState(), globalThis.__benchSim && globalThis.__benchSim.getState())`);
  const screen = async (p) => {
    const box = await (await page.$('canvas')).boundingBox();
    const cam = await page.evaluate(() => globalThis.__benchCam());
    return { x: box.x + cam.tx + p.x * cam.sc, y: box.y + cam.ty + p.y * cam.sc };
  };
  const click = async (label, wait = 400) => {
    const el = await page.$(`[aria-label="${label}"]`);
    if (!el) {
      check(false, `control "${label}" exists`);
      return false;
    }
    await el.click();
    await sleep(wait);
    return true;
  };
  const clickText = async (text, wait = 400) => {
    const ok = await page.evaluate((t) => {
      const all = [...document.querySelectorAll('div,span')].filter((e) => e.childElementCount === 0 && e.textContent && e.textContent.trim() === t && e.offsetParent);
      const el = all[all.length - 1];
      if (!el) return false;
      el.click();
      return true;
    }, text);
    if (!ok) check(false, `text "${text}" clickable`);
    await sleep(wait);
    return ok;
  };
  const open = async (path, wait = 2500) => {
    await page.goto(BASE + path, { waitUntil: 'load' });
    await sleep(wait);
  };
  const text = () => page.evaluate(() => document.body.innerText);

  // ------------------------------------------------------------ multimeter on the LED example
  console.log('Multimeter');
  await open('/bench/example-led-resistor?power=1', 3000);
  await click('Instruments');
  await sleep(1500);
  const t1 = await text();
  const m = /DC VOLTS\s*\n?\s*([\d.]+)\s*V/.exec(t1);
  check(m && Number(m[1]) > 1.7 && Number(m[1]) < 2.1, `meter shows the LED voltage (${m && m[1]} V)`);
  await click('V ~', 1500);
  const t2 = await text();
  check(/AC VOLTS/.test(t2), 'AC volts mode available');
  await click('Ohms / beep', 800);
  check(/Turn the power off/.test(await text()), 'ohmmeter asks for power off while running');
  await click('Power off', 1200);
  const t3 = await text();
  check(/OHMS/.test(t3) && /[\d.]+\s*(k|M)?Ω|OL/.test(t3), 'ohmmeter reads with power off');

  // ------------------------------------------------------------ scope on the 555 blinker: auto-set measures ~1 Hz
  console.log('Scope');
  await open('/bench/example-555-blinker?power=1', 2000);
  await click('Instruments');
  await clickText('Scope', 9000);
  const scopeText = await text();
  const f = /([\d.]+)\s*(mHz|Hz)/.exec(scopeText.slice(scopeText.indexOf('CHANNELS')));
  const hz = f ? Number(f[1]) * (f[2] === 'mHz' ? 1e-3 : 1) : 0;
  check(hz > 0.85 && hz < 1.15, `scope auto-set measures ≈ 1 Hz (${f && f[0]})`);
  // FFT toggle and cursors do not crash
  await clickText('FFT', 800);
  await clickText('Cursors', 800);
  check(/Δt/.test(await text()), 'cursors show Δt');
  await clickText('FFT', 400);
  // pause / step one division
  await click('Pause', 600);
  const tPaused = await store((s, sim) => sim.simTime);
  await sleep(800);
  const tStill = await store((s, sim) => sim.simTime);
  check(tPaused === tStill, 'pause stops simulated time');
  await click('Step one division', 800);
  const tStepped = await store((s, sim) => sim.simTime);
  check(tStepped > tStill, 'step advances while paused');
  await click('Resume', 400);
  // slow motion
  await click('Simulation speed', 400);
  await clickText('1/10 ×', 600);
  const ts = await store((s, sim) => sim.timeScale);
  check(Math.abs(ts - 0.1) < 1e-9, 'slow motion selected');

  // ------------------------------------------------------------ logic analyzer + bode + serial
  console.log('Other instruments');
  await open('/bench/example-counter?power=1', 2000);
  await click('Instruments');
  await clickText('Logic', 600);
  check(/channels \(top to bottom\)/i.test(await text()), 'logic analyzer opens');
  await open('/bench/example-rc-lowpass', 2000);
  await click('Instruments');
  await clickText('Bode', 400);
  await click('Run AC sweep', 2000);
  const bode = await text();
  const m3 = /−3 dB at ([\d.]+)\s*(k?)Hz/.exec(bode);
  const f3 = m3 ? Number(m3[1]) * (m3[2] ? 1000 : 1) : 0;
  check(f3 > 1500 && f3 < 1700, `Bode finds the −3 dB point near 1.6 kHz (${m3 && m3[0]})`);
  await open('/bench/example-arduino-analog?power=1', 4000);
  await click('Instruments');
  await clickText('Serial', 2500);
  const serial = await text();
  check(/\n\d{2,4}\n/.test(serial) || /\d{3}/.test(serial.slice(serial.indexOf('9600'))), 'serial monitor shows ADC readings');

  // ------------------------------------------------------------ damage and repair
  console.log('Damage & repair');
  await open('/learn/led-resistor', 2000);
  // short the LED straight from + to its anode column (no resistor)
  await click('Draw wires');
  const a = await screen(hole('c16'));
  const b = await screen(hole('c20'));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) {
    await page.mouse.move(a.x + ((b.x - a.x) * k) / 10, a.y + ((b.y - a.y) * k) / 10);
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(400);
  await click('Select and move');
  await click('Power on', 2500);
  const failed = await store((s, sim) => sim.snapshot && sim.snapshot.parts.d1 && sim.snapshot.parts.d1.failed);
  check(failed, 'an LED with no resistor burns out');
  await page.evaluate(() => globalThis.__benchStore.getState().select({ parts: ['d1'] }));
  await sleep(600);
  check(/Damaged/.test(await text()), 'inspector reports the damage');
  // remove the short (undo the wire while running), then repair
  await click('Undo', 800);
  await click('Repair part', 1500);
  const ok = await store((s, sim) => sim.snapshot && sim.snapshot.parts.d1 && !sim.snapshot.parts.d1.failed);
  check(ok, 'repair restores the LED after removing the short');

  // ------------------------------------------------------------ netlist view
  console.log('Netlist view');
  await open('/bench/example-traffic-light', 2000);
  await clickText('Netlist', 800);
  const nl = await text();
  check(/Netlist/.test(nl) && /Elements/.test(nl) && /CD4017|u2/.test(nl), 'netlist view lists nodes and elements');

  // ------------------------------------------------------------ saved circuits
  console.log('Saved circuits');
  await open('/', 1500);
  await clickText('New breadboard', 2500);
  const id = await store((s) => s.doc.id);
  check(id && id.startsWith('c'), 'new breadboard opens');
  await page.goto(BASE + '/circuits', { waitUntil: 'load' });
  await sleep(1500);
  check(/New breadboard/.test(await text()), 'new circuit is listed');
  await click('Rename New breadboard', 600);
  const input = await page.$('[aria-label="New name"]');
  if (input) {
    await input.click({ clickCount: 3 });
    await page.keyboard.type('My amp');
    await clickText('Rename', 800);
  }
  check(/My amp/.test(await text()), 'rename works');
  await click('Duplicate My amp', 800);
  check(/My amp \(copy\)/.test(await text()), 'duplicate works');
  await click('Delete My amp (copy)', 800);
  check(!/My amp \(copy\)/.test(await text()), 'delete works (with confirmation)');

  // ------------------------------------------------------------ lesson next button
  console.log('Lesson navigation');
  await open('/learn', 1500);
  check(/Curriculum/.test(await text()), 'curriculum opens');

  console.log('\nJS errors:', errors.length ? errors : 'none');
  const failedN = results.filter(([v]) => !v).length;
  console.log(`\n${results.length - failedN}/${results.length} checks passed`);
  await browser.close();
  process.exit(failedN ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
