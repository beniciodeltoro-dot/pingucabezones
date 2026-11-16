// Prueba en Chromium real del botón de cambio de jugador (usuario y rival).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const serve = require('./serve.js');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (i ? ' -> ' + i : '')); } };
(async () => {
  const srv = await serve(8125); const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const pg = await ctx.newPage();
  const errs = []; pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  const sleep = ms => pg.waitForTimeout(ms);
  await pg.goto('http://localhost:8125/'); await pg.waitForSelector('.menu');
  await pg.click('[data-act=friendly]'); await pg.click('[data-act=friendly-next]'); await pg.locator('.pcard').nth(1).click(); await pg.click('#confirmBtn'); await pg.waitForSelector('.prematch'); await pg.click('[data-act=kickoff]'); await pg.waitForSelector('#stage');
  await sleep(3000);
  const st = () => pg.evaluate(() => ({ state: PC.App.match.state, t: PC.App.match.timeLeft, left: PC.App.match.subsLeft.user, me: PC.App.match.world.players[0].def.id, rivalId: PC.App.match.world.players[1].def.id }));
  ok('botón de cambio visible con 2 disponibles', await pg.locator('#subBtn').isVisible() && (await pg.locator('#subBadge').innerText()) === '2');
  const bb = await pg.locator('#subBtn').boundingBox(), pb = await pg.locator('.pause-btn').boundingBox();
  ok('el botón queda al lado del de pausa (misma altura, a su izquierda, sin tapar)', Math.abs(bb.y - pb.y) < 2 && bb.x + bb.width <= pb.x + 1 && pb.x - (bb.x + bb.width) < 20, JSON.stringify([bb, pb]));
  await pg.screenshot({ path: '/tmp/pingu_shot_hud.png' });
  const a = await st();
  await pg.click('#subBtn'); await sleep(300);
  const b1 = await st(); ok('abrir el panel pausa el partido', b1.state === 'paused' && await pg.locator('#subOv:not(.hidden)').count() === 1);
  ok('el panel lista a los otros 7 jugadores (no al actual)', await pg.locator('.subcard').count() === 7 && await pg.locator(`.subcard[data-id="${a.me}"]`).count() === 0);
  await pg.screenshot({ path: '/tmp/pingu_shot_panel.png' });
  await sleep(800); const b2 = await st(); ok('mientras elige el reloj no corre', b1.t === b2.t);
  await pg.keyboard.press('Escape'); await sleep(300);
  const c = await st(); ok('Esc cancela el cambio y reanuda sin gastar cambios', c.state !== 'paused' && c.left === 2 && c.me === a.me && await pg.locator('#subOv.hidden').count() === 1);
  await pg.click('#subBtn'); await pg.click('[data-act=subcancel]'); await sleep(200); ok('CANCELAR reanuda sin gastar cambios', (await st()).state !== 'paused' && (await st()).left === 2);
  await pg.click('#subBtn'); await pg.locator('.subcard').first().click(); await sleep(400);
  const d = await st(); ok('elegir un jugador hace el cambio y reanuda', d.me !== a.me && d.left === 1 && d.state !== 'paused' && (await pg.locator('#subBadge').innerText()) === '1');
  ok('aparece el aviso del cambio', await pg.locator('#toast:not(.hidden)').count() === 1 && (await pg.locator('#toast').innerText()).startsWith('Cambio: sale'));
  await pg.screenshot({ path: '/tmp/pingu_shot_after.png' });
  await pg.click('#subBtn'); await pg.locator('.subcard').nth(2).click(); await sleep(300);
  const e = await st(); ok('segundo cambio hecho; quedan 0 y el botón se deshabilita', e.left === 0 && await pg.locator('#subBtn.off').count() === 1 && await pg.locator('#subBtn').isDisabled());
  await pg.screenshot({ path: '/tmp/pingu_shot_zero.png' });
  // cambio también durante el festejo de un gol
  await pg.evaluate(() => { const m = PC.App.match; m.subsLeft.user = 1; });
  await pg.evaluate(() => { const m = PC.App.match; const w = m.world; Object.assign(w.ball, { x: 300, y: 440, vx: -900, vy: 0 }); w.players[0].x = 400; w.players[1].x = 700; });
  await pg.waitForFunction(() => PC.App.match.state === 'goal', null, { timeout: 5000 });
  await pg.click('#subBtn'); await pg.locator('.subcard').first().click(); await sleep(200);
  ok('se puede cambiar durante el festejo del gol y el juego sigue', (await st()).state === 'goal' && (await st()).left === 0);
  // rival: forzar rng para que cambie y ver el aviso en el flujo real
  await pg.evaluate(() => { PC.App.match.rng = () => 0; }); const r0 = (await st()).rivalId;
  await pg.waitForFunction(() => PC.App.match.state === 'intro', null, { timeout: 6000 }); await sleep(200);
  ok('el rival cambió a su jugador al reiniciar tras el gol y se avisó', (await st()).rivalId !== r0 && (await pg.locator('#toast').innerText()).startsWith('Cambio del rival'));
  await pg.screenshot({ path: '/tmp/pingu_shot_rival.png' });
  ok('sin errores de consola', errs.length === 0, errs.join(' | '));
  console.log(`\nResultado: ${pass} OK, ${fail} FALLAS`); await b.close(); srv.close && srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
