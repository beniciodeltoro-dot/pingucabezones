// Prueba de extremo a extremo en Chromium real: navegación, selección, partido, pausa, abandono, 19 fechas, guardado, campeón.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const serve = require('./serve.js');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (i ? ' -> ' + i : '')); } };
(async () => {
  const srv = await serve(8124); const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const pg = await ctx.newPage();
  const errs = [], reqs = [], bad = [];
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  pg.on('request', r => { if (!r.url().startsWith('http://localhost:8124')) reqs.push(r.url()); }); pg.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  const go = async () => { await pg.goto('http://localhost:8124/'); await pg.waitForSelector('.menu'); };
  const sleep = ms => pg.waitForTimeout(ms);
  const finishMatch = () => pg.evaluate(() => { const m = PC.App.match; let n = 0; while (!m.ended && n++ < 60 * 300) m.step(); return { s: m.score, ended: m.ended }; });
  const screen = () => pg.evaluate(() => PC.App.screen);
  console.log('E2E');
  await go();
  ok('el menú abre con todos los botones', await pg.locator('.menu .btn').count() === 5 && await pg.locator('[data-act=tsound]').count() === 1);
  await pg.click('[data-act=controls]'); ok('pantalla de controles', await screen() === 'controls' && await pg.locator('.menu').count() === 0); await pg.click('[data-act=menu]');
  await pg.click('[data-act=table]'); ok('tabla sin campeonato muestra aviso y no rompe', await screen() === 'table'); await pg.click('[data-act=menu]');
  await pg.click('[data-act=tsound]'); ok('botón de sonido alterna', await pg.evaluate(() => PC.App.settings.sound === false)); await pg.click('[data-act=tsound]');
  // Campeonato con Wachines (visitante en fecha 1)
  await pg.click('[data-act=champ]'); await pg.click('[data-team=wachines]'); await pg.click('[data-d=dificil]'); await pg.click('[data-act=champ-start]'); await pg.waitForSelector('.hub');
  ok('hub: 19 filas de calendario y fecha 1 actual', await pg.locator('.fx').count() === 19 && (await pg.locator('.next h3').innerText()).includes('FECHA 1 DE 19'));
  ok('se guardó el campeonato en localStorage', await pg.evaluate(() => !!localStorage.getItem('pinguCup.v1')));
  // Fecha 1: usar el primer jugador, partido real con pausa
  const playOne = async (idx, mode) => {
    await pg.click('.next [data-act=play-round]'); await pg.waitForSelector('.select');
    const n = await pg.locator('.pcard').count(); await pg.locator('.pcard').nth(idx % n).click(); await pg.click('#confirmBtn'); await pg.waitForSelector('.prematch');
    await pg.click('[data-act=kickoff]'); await pg.waitForSelector('#stage');
  };
  await playOne(0);
  ok('fecha 1: Wachines visitante → el usuario juega con el arco derecho', await pg.evaluate(() => PC.App.match.userSide === 'R' && PC.App.match.teams[1].id === 'wachines'));
  await sleep(3500); // cuenta + juego real
  await pg.keyboard.down('ArrowLeft'); await sleep(500); await pg.keyboard.up('ArrowLeft'); await pg.keyboard.press('ArrowUp'); await sleep(300);
  const t0 = await pg.evaluate(() => PC.App.match.timeLeft); await pg.click('.pause-btn'); await sleep(250);
  const p1 = await pg.evaluate(() => ({ t: PC.App.match.timeLeft, bx: PC.App.match.world.ball.x, st: PC.App.match.state })); await sleep(1200);
  const p2 = await pg.evaluate(() => ({ t: PC.App.match.timeLeft, bx: PC.App.match.world.ball.x }));
  ok('pausa visible: congela reloj y física, muestra menú', p1.st === 'paused' && p1.t === p2.t && p1.bx === p2.bx && await pg.locator('#pauseOv:not(.hidden)').count() === 1 && p1.t < 60);
  await pg.keyboard.press('Escape'); await sleep(400); ok('Escape reanuda', await pg.evaluate(() => PC.App.match.state !== 'paused') && await pg.locator('#pauseOv.hidden').count() === 1);
  await pg.keyboard.press('Escape'); await pg.click('[data-act=abandon]'); await pg.click('[data-m="1"]'); await pg.waitForSelector('#endOv:not(.hidden)');
  const ab = await pg.evaluate(() => JSON.parse(localStorage.getItem('pinguCup.v1')).fixtures[0]);
  ok('abandono: fecha 1 guardada como derrota del usuario (Wachines visitante pierde)', ab.played && ab.forfeit && ab.homeGoals > ab.awayGoals, JSON.stringify(ab));
  await pg.click('[data-act=after-match]'); await pg.waitForSelector('.hub');
  ok('el calendario muestra la fecha 1 jugada y la 2 como actual', (await pg.locator('.fx .chip.ok').count()) === 1 && (await pg.locator('.next h3').innerText()).includes('FECHA 2'));
  const tbl1 = await pg.evaluate(() => PC.League.computeTable(PC.App.champ).map(r => r.team + ':' + r.played + ':' + r.points).join(','));
  await pg.click('[data-act=table-champ]'); await pg.click('[data-act=champ]'); await pg.waitForSelector('.hub');
  ok('volver a pantallas no duplica estadísticas', tbl1 === await pg.evaluate(() => PC.League.computeTable(PC.App.champ).map(r => r.team + ':' + r.played + ':' + r.points).join(',')));
  // Recargar: continuar
  await pg.reload(); await pg.waitForSelector('.menu'); await pg.click('[data-act=champ]'); await pg.waitForSelector('.hub');
  ok('tras recargar se conserva el progreso (fecha 2, 1 resultado)', (await pg.locator('.next h3').innerText()).includes('FECHA 2') && (await pg.locator('.fx .chip.ok').count()) === 1);
  // Fechas 2..19 jugando partidos reales con distintos jugadores, completados por la simulación real
  const seen = new Set(); let totalGoals = 0;
  for (let r = 2; r <= 19; r++) {
    await playOne(r);
    seen.add(await pg.evaluate(() => PC.App.sel));
    const res = await finishMatch(); totalGoals += res.s.L + res.s.R;
    await pg.waitForSelector('#endOv:not(.hidden)'); const stored = await pg.evaluate((r) => JSON.parse(localStorage.getItem('pinguCup.v1')).fixtures[r - 1], r);
    if (!stored.played || stored.homeGoals !== res.s.L || stored.awayGoals !== res.s.R) ok('fecha ' + r + ' registrada', false, JSON.stringify(stored) + JSON.stringify(res));
    await pg.click('[data-act=after-match]'); await pg.waitForSelector(r === 19 ? '.champion' : '.hub');
  }
  ok('19 fechas completadas y registradas fielmente', await screen() === 'champion');
  ok('se usaron varios jugadores distintos (selección en cada partido)', seen.size >= 6, [...seen].join());
  const fin = await pg.evaluate(() => { const c = PC.App.champ; return { f: c.finished, played: c.fixtures.filter(x => x.played).length, t: PC.League.computeTable(c) }; });
  ok('estado final: finalizado, 19 jugados, 19 PJ por equipo', fin.f && fin.played === 19 && fin.t.every(r => r.played === 19));
  ok('pantalla de campeón con escudo y tabla', await pg.locator('.champ-card img.big').count() === 1 && await pg.locator('table.tbl').count() === 1);
  await pg.screenshot({ path: '/tmp/e2e_champion.png' });
  await pg.reload(); await pg.waitForSelector('.menu'); await pg.click('[data-act=champ]'); await pg.waitForSelector('.champion'); ok('el campeón persiste tras recargar', true);
  // Reinicio con confirmación
  await pg.click('[data-act=champ-reset]'); await pg.click('[data-m="0"]'); ok('cancelar el reinicio conserva el progreso', await pg.evaluate(() => !!localStorage.getItem('pinguCup.v1')));
  await pg.click('[data-act=champ-reset]'); await pg.click('[data-m="1"]'); await pg.waitForSelector('.champnew');
  ok('confirmar reinicio borra el progreso', await pg.evaluate(() => !localStorage.getItem('pinguCup.v1')));
  // Datos corruptos
  await pg.evaluate(() => localStorage.setItem('pinguCup.v1', '{"version":1,"basura":true')); await go(); ok('un guardado corrupto no impide abrir el juego', await pg.locator('.menu').count() === 1);
  await pg.evaluate(() => localStorage.setItem('pinguCup.v1', JSON.stringify({ version: 1, userTeam: 'pingu', difficulty: 'normal', seed: 'x', currentRound: 1, finished: false, fixtures: [] }))); await go(); ok('un guardado inválido se descarta', await pg.evaluate(() => PC.App.champ === null));
  // Amistoso
  await pg.click('[data-act=friendly]'); await pg.click('[data-team=pingu]'); await pg.click('[data-d=facil]'); await pg.click('[data-act=friendly-next]'); await pg.locator('.pcard').nth(1).click(); await pg.click('#confirmBtn'); await pg.click('[data-act=kickoff]');
  await finishMatch(); await pg.waitForSelector('#endOv:not(.hidden)'); ok('amistoso termina y no toca el campeonato', await pg.evaluate(() => !localStorage.getItem('pinguCup.v1')) && await pg.locator('[data-act=rematch]').count() === 1);
  await pg.click('[data-act=menu]'); ok('volver al menú desde el partido', await screen() === 'menu' && await pg.evaluate(() => PC.App.match === null));
  ok('sin solicitudes de red externas', reqs.length === 0, reqs.join(','));
  ok('sin respuestas 4xx/5xx (recursos con rutas correctas)', bad.length === 0, bad.join(','));
  const relevant = errs.filter(e => !/Failed to load resource.*(mp3|ogg)/i.test(e)); ok('sin errores ni avisos de consola', relevant.length === 0, relevant.join(' | '));
  console.log(`\nResultado: ${pass} OK, ${fail} FALLAS`); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E ERROR', e); process.exit(2); });
