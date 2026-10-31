// Browser end-to-end pass 3 against the web build served on :8099 (see tools/e2e-web.js for setup).
// Third pass: new features (I–V tracer, quizzes, fuse lesson, new parts render without errors)
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8099';
const results = [];
const check = (c, m) => { results.push([!!c, m]); console.log(c ? '  ok  ' : '  FAIL', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 880 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e).slice(0, 400)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  page.on('dialog', async (d) => d.accept());
  const click = async (label, wait = 400) => { const el = await page.$(`[aria-label="${label}"]`); if (!el) { check(false, `control "${label}" exists`); return false; } await el.click(); await sleep(wait); return true; };
  const clickText = async (t, wait = 400) => {
    const ok = await page.evaluate((t) => { const all = [...document.querySelectorAll('div,span')].filter((e) => e.childElementCount === 0 && e.textContent && e.textContent.trim() === t && e.offsetParent); const el = all[all.length - 1]; if (!el) return false; el.click(); return true; }, t);
    if (!ok) check(false, `text "${t}" clickable`);
    await sleep(wait); return ok;
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const store = (fn) => page.evaluate(`(${fn})(globalThis.__benchStore.getState(), globalThis.__benchSim && globalThis.__benchSim.getState())`);
  const open = async (path, wait = 2500) => { await page.goto(BASE + path, { waitUntil: 'load' }); await sleep(wait); };

  console.log('I–V curve tracer');
  await open('/bench/example-led-resistor');
  await page.evaluate(() => globalThis.__benchStore.getState().select({ parts: ['d1'] }));
  await click('Instruments');
  await clickText('I–V', 500);
  await click('Trace', 1500);
  const t1 = await text();
  check(/LED I–V curve/.test(t1), 'traces the LED');
  check(/V across the part/.test(t1) && /div\)/.test(t1), 'axis scales shown');
  await page.evaluate(() => globalThis.__benchStore.getState().select({ parts: ['r1'] }));
  await sleep(300);
  await click('Trace', 1200);
  check(/Ohm’s law/.test(await text()), 'resistor trace explains Ohm’s law');

  console.log('Transistor family');
  await open('/learn/bjt-switch');
  await page.evaluate(() => globalThis.__benchStore.getState().select({ parts: ['q1'] }));
  await click('Instruments');
  await clickText('I–V', 500);
  await click('Trace', 2500);
  const t2 = await text();
  check(/output curves/.test(t2) && /I_B 50 µA/.test(t2), 'NPN family of curves with legend');

  console.log('Quiz');
  await open('/learn', 1500);
  check(/Quick quiz/.test(await text()), 'quiz entries on the curriculum');
  await click('Quiz: Voltage, current & resistance', 1200);
  check(/Question 1 of 3/i.test(await text()), 'quiz opens');
  await click('9 mA', 500);
  check(/Correct!/.test(await text()), 'right answer is marked correct');
  await click('Next question', 500);
  await click('across the resistor', 500);
  check(/Not quite/.test(await text()), 'wrong answer explained');
  await click('Next question', 500);
  await click('halves', 500);
  await click('See result', 800);
  const tq = await text();
  check(/2 \/ 3 correct/.test(tq) && /Unit quiz passed/.test(tq), 'score and pass shown');
  await open('/learn', 1500);
  check(/Passed/.test(await text()), 'quiz progress saved');

  console.log('Fuse lesson through the UI');
  await open('/learn/fuse', 2000);
  await click('Power on', 1500);
  await page.evaluate(() => globalThis.__benchStore.getState().setProp('sw1', 'pressed', true, 'live'));
  await sleep(800);
  const blown = await store((s, sim) => sim.snapshot && sim.snapshot.parts.f1 && sim.snapshot.parts.f1.failed);
  check(blown, 'shorting the line blows the fuse');
  await page.evaluate(() => { const s = globalThis.__benchStore.getState(); s.setProp('sw1', 'pressed', false, 'live'); s.select({ parts: ['f1'] }); });
  await click('Inspect', 600);
  check(/Blown/.test(await text()), 'inspector says Blown');
  await click('Replace fuse', 1500);
  await click('Lesson', 600);
  const tf = await text();
  check(/The fuse blew during the short/.test(tf), 'lesson shows its checks');
  await sleep(1500);
  const passed = await page.evaluate(() => /Well done/i.test(document.body.innerText));
  check(passed, 'lesson completes after replacing the fuse');

  console.log('New parts render');
  for (const id of ['bulbs', 'rgb-mixing', 'schmitt-oscillator', 'bcd-decoder', 'lm317', 'darlington', 'lm35', 'servo-knob']) {
    await open(`/learn/${id}`, 1500);
    await click('Power on', 1200);
    const st = await store((s, sim) => sim.status);
    check(st === 'running', `${id} runs (${st})`);
    await click('Schematic', 500);
    await click('Breadboard', 300);
  }
  await open('/bench/example-servo-sweep', 1500);
  await click('Power on', 2500);
  const ang = await store((s, sim) => sim.snapshot && sim.snapshot.parts.sv1 && sim.snapshot.parts.sv1.extra.angle);
  check(ang > 5, `servo sweep moves (${ang && ang.toFixed(0)}°)`);

  console.log('\nJS errors:', errors.length ? errors : 'none');
  const failedN = results.filter(([v]) => !v).length;
  console.log(`\n${results.length - failedN}/${results.length} checks passed`);
  await browser.close();
  process.exit(failedN ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
