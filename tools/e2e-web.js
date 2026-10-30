// End-to-end interaction test of the Bench web build (drives the real UI with mouse + keyboard).
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
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 880 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 400)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });

  const store = (fn) => page.evaluate(`(${fn})(globalThis.__benchStore.getState(), globalThis.__benchSim && globalThis.__benchSim.getState())`);
  const screen = async (p) => {
    const box = await (await page.$('canvas')).boundingBox();
    const cam = await page.evaluate(() => globalThis.__benchCam());
    return { x: box.x + cam.tx + p.x * cam.sc, y: box.y + cam.ty + p.y * cam.sc };
  };
  const click = async (label, wait = 400) => {
    const el = await page.$(`[aria-label="${label}"]`);
    if (!el) {
      check(false, `button "${label}" exists`);
      return false;
    }
    await el.click();
    await sleep(wait);
    return true;
  };
  const tap = async (p, wait = 500) => {
    const s = await screen(p);
    await page.mouse.click(s.x, s.y);
    await sleep(wait);
  };
  const drag = async (from, to, wait = 600) => {
    const a = await screen(from);
    const b = await screen(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) {
      await page.mouse.move(a.x + ((b.x - a.x) * k) / 12, a.y + ((b.y - a.y) * k) / 12);
      await sleep(16);
    }
    await page.mouse.up();
    await sleep(wait);
  };
  const addPart = async (name) => {
    const search = await page.$('[aria-label="Search parts"]');
    await search.click({ clickCount: 3 });
    await page.keyboard.type(name.toLowerCase());
    await sleep(300);
    await click(`Add ${name}`, 800);
    await search.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await sleep(200);
  };
  const open = async (path, wait = 2500) => {
    await page.goto(BASE + path, { waitUntil: 'load' });
    await sleep(wait);
  };

  // ------------------------------------------------------------ 1. lesson: add, drag, edit value, power, pass
  console.log('Lesson: Light an LED safely');
  await open('/learn/led-resistor');
  await addPart('Resistor');
  let r = await store((s) => s.doc.parts.find((p) => p.type === 'resistor'));
  check(r, 'resistor added from the tray');
  const sel = await store((s) => s.selection.parts);
  check(r && sel.includes(r.id), 'new part is selected');
  // drag by its body (origin + 2 units along the leads) into c16
  await drag({ x: r.x + 2, y: r.y }, { x: colX(16) + 2, y: ROWS.c });
  r = await store((s) => s.doc.parts.find((p) => p.type === 'resistor'));
  check(r.x === colX(16) && r.y === ROWS.c, `resistor dragged into c16 (got ${r.x},${r.y})`);
  const input = await page.$('[aria-label="Resistance"]');
  check(input, 'resistance field shown in the inspector');
  if (input) {
    await input.click({ clickCount: 3 });
    await page.keyboard.type('470');
    await page.keyboard.press('Enter');
    await sleep(400);
  }
  r = await store((s) => s.doc.parts.find((p) => p.type === 'resistor'));
  check(r.props.r === 470, `value typed as 470 (got ${r.props.r})`);
  await click('Power on', 300);
  await click('Lesson', 3500);
  const done = await page.evaluate(() => document.body.innerText.includes('Well done'));
  check(done, 'lesson auto-check passes after building it');
  const iLed = await store((s, sim) => sim.snapshot && sim.snapshot.parts.d1 && sim.snapshot.parts.d1.i);
  check(iLed > 0.0135 && iLed < 0.0165, `LED current ≈ 15 mA (got ${(iLed * 1000).toFixed(2)} mA)`);
  await page.screenshot({ path: 'shots/e2e-lesson.png' });

  // ------------------------------------------------------------ 2. sandbox: wires, hole taps, wire-end drag, undo
  console.log('Sandbox: wiring');
  await open('/bench/sandbox');
  const w0 = await store((s) => s.doc.wires.length);
  await click('Draw wires');
  await drag(hole('a10'), hole('a20'));
  const w1 = await store((s) => s.doc.wires.length);
  check(w1 === w0 + 1, 'dragging with the wire tool adds a wire');
  const nw = await store((s) => s.doc.wires[s.doc.wires.length - 1]);
  check(nw && nw.a.x === colX(10) && nw.b.x === colX(20), 'wire snaps to the two holes');
  // tap-tap wiring
  await tap(hole('c30'));
  await tap(hole('c35'));
  const w2 = await store((s) => s.doc.wires.length);
  check(w2 === w1 + 1, 'tap one hole then another also adds a wire');
  await click('Select and move');
  await tap(hole('e10'));
  const focus = await store((s) => s.focusNet);
  check(focus !== null, 'tapping an empty hole in a wired strip shows its net');
  // select the first new wire by tapping its middle, then drag its far end to a25
  await tap({ x: (colX(10) + colX(20)) / 2, y: ROWS.a - 0.6 });
  const selW = await store((s) => s.selection.wires);
  check(selW.length === 1, 'tapping a wire selects it');
  await drag(hole('a20'), hole('a25'));
  const moved = await store((s) => s.doc.wires.find((w) => w.id === s.selection.wires[0]));
  check(moved && moved.b.x === colX(25), 'dragging a selected wire end re-plugs it');
  await click('Undo');
  const undone = await store((s) => s.doc.wires.find((w) => w.id === s.selection.wires[0]) || s.doc.wires[s.doc.wires.length - 2]);
  check(undone && (undone.b.x === colX(20) || undone.a.x === colX(20)), 'undo restores the wire end');

  const z0 = (await page.evaluate(() => globalThis.__benchCam())).sc;
  await click('Zoom in');
  const z1 = (await page.evaluate(() => globalThis.__benchCam())).sc;
  await click('Zoom out');
  const z2 = (await page.evaluate(() => globalThis.__benchCam())).sc;
  check(z1 > z0 * 1.3 && Math.abs(z2 - z0) < 1e-6, 'zoom buttons zoom in and back out');

  // ------------------------------------------------------------ 3. rotate keeps the part in place
  console.log('Rotate');
  await addPart('Resistor');
  const before = await store((s) => s.doc.parts.find((p) => p.id === s.selection.parts[0]));
  await click('Rotate');
  await click('Rotate');
  const after = await store((s) => s.doc.parts.find((p) => p.id === s.selection.parts[0]));
  check(after.rot === 2 && after.x === before.x + 4 && after.y === before.y, 'two rotations swap the leads in place');
  await click('Delete');
  const gone = await store((s) => s.doc.parts.some((p) => p.id === '${after.id}'));
  check(!gone, 'delete removes the part');

  // ------------------------------------------------------------ 4. hold a push button while running
  console.log('Push button');
  await open('/bench/example-transistor-switch?power=1', 3000);
  const btn = await store((s) => s.doc.parts.find((p) => p.type === 'button'));
  const bs = await screen({ x: btn.x + 1, y: btn.y });
  await page.mouse.move(bs.x, bs.y);
  await page.mouse.down();
  await sleep(1500);
  const lit = await store((s, sim) => sim.snapshot && sim.snapshot.parts.d1 && sim.snapshot.parts.d1.extra.brightness);
  await page.mouse.up();
  await sleep(1200);
  const unlit = await store((s, sim) => sim.snapshot && sim.snapshot.parts.d1 && sim.snapshot.parts.d1.extra.brightness);
  check(lit > 0.3, `LED lights while the button is held (${Number(lit).toFixed(2)})`);
  check(unlit < 0.05, `LED goes out on release (${Number(unlit).toFixed(2)})`);
  const past = await store((s) => s.past.length);
  check(past === 0, 'button presses did not create undo steps');

  // ------------------------------------------------------------ 5. toggle a slide switch, change a live slider value
  console.log('Live controls');
  await open('/bench/example-and-gate?power=1', 3000);
  for (const id of ['s1', 's2']) {
    const s = await store(`(s) => s.doc.parts.find((p) => p.id === '${id}')`.replace(/^/, ''));
    await tap({ x: s.x + 1, y: s.y - 0.6 }, 700);
  }
  const both = await store((s) => s.doc.parts.filter((p) => p.type === 'toggle').map((p) => p.props.pos));
  check(both.every(Boolean), 'tapping slide switches while running flips them');
  await sleep(800);
  const andLit = await store((s, sim) => sim.snapshot.parts.d1.extra.brightness);
  check(andLit > 0.3, 'AND gate LED lights with both inputs high');

  // ------------------------------------------------------------ 6. every screen opens without errors
  console.log('Screens');
  for (const path of ['/', '/examples', '/circuits', '/learn', '/challenges', '/library', '/library/ic595', '/glossary', '/about', '/learn/shift-register', '/learn/comparator', '/bench/example-arduino-analog?power=1']) {
    const n = errors.length;
    await open(path, 2500);
    check(errors.length === n, `${path} opens without errors`);
  }

  console.log('\nJS errors:', errors.length ? errors : 'none');
  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
