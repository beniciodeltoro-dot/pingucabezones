// Prueba en Chromium real del modo ONLINE: dos navegadores jugando entre sí.
// Requiere un PeerServer local (npm i peer; node -e "require('peer').PeerServer({host:'0.0.0.0',port:9000,path:'/pc'})")
// porque el entorno de pruebas no siempre llega a PeerJS Cloud. Uso: PLAYWRIGHT_PATH=... node tests/online.e2e.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const serve = require('./serve.js');
let pass = 0, fail = 0; const ok = (n, c, i) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (i ? ' -> ' + i : '')); } };
const PEER = { host: '127.0.0.1', port: 9000, path: '/pc', secure: false, config: { iceServers: [] } };
(async () => {
  const srv = await serve(8126); const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const mk = async name => { const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push('PAGEERROR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') pg.errs.push(m.text()); }); pg.nm = name; await pg.goto('http://localhost:8126/'); await pg.waitForSelector('.menu'); await pg.evaluate(p => { PC.ONLINE_CONFIG.peer = p; }, PEER); return pg; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const H = await mk('host'), G = await mk('guest');
  ok('el menú tiene el botón ONLINE', await H.locator('[data-act=online]').count() === 1);
  // ---- hub / validaciones
  await G.click('[data-act=online]'); await G.waitForSelector('.olhub');
  await G.fill('#olCode', 'AB'); await G.click('[data-act=ol-join]'); ok('código incompleto: pide el código', (await G.locator('#olMsg').innerText()).includes('código'));
  await G.fill('#olName', 'Beto <b>x</b>'); await G.fill('#olCode', 'ZZZZZ'); await G.click('[data-act=ol-join]');
  await G.waitForFunction(() => /No existe/.test(document.getElementById('olMsg').textContent), null, { timeout: 15000 }); ok('código inexistente: avisa que no existe la sala', true);
  ok('el nombre se limpia (sin <, > ni /) y se guarda', await G.evaluate(() => PC.App.settings.name === 'Beto bxb'));
  // ---- crear / unirse
  await H.click('[data-act=online]'); await H.fill('#olName', 'Ana'); await H.click('[data-act=ol-create]'); await H.waitForSelector('.roomcode b', { timeout: 15000 });
  const code = (await H.locator('.roomcode b').innerText()).trim(); ok('se creó la sala con código de 5 caracteres', /^[A-HJ-NP-Z2-9]{5}$/.test(code), code);
  await G.fill('#olName', 'Beto'); await G.fill('#olCode', code.toLowerCase()); await G.click('[data-act=ol-join]'); await G.waitForSelector('.onlobby', { timeout: 20000 });
  await H.waitForFunction(() => /Beto/.test(document.body.innerText), null, { timeout: 10000 }); ok('el anfitrión ve entrar a Beto y el invitado entra a la sala', true);
  const gTeam = await G.evaluate(() => PC.App.online.lobby.ht), hTeamName = await H.locator('.olside.you h3').innerText();
  ok('el invitado recibe el equipo contrario al del anfitrión', await G.locator('.olside.you h3').innerText() !== hTeamName);
  // un tercero no puede entrar
  const T = await mk('tercero'); await T.click('[data-act=online]'); await T.fill('#olCode', code); await T.click('[data-act=ol-join]');
  await T.waitForFunction(() => /completa/.test(document.getElementById('olMsg').textContent), null, { timeout: 20000 }); ok('una tercera persona recibe "sala completa"', true); await T.context().close();
  // cambio de equipo del anfitrión
  await H.click('[data-act=ol-swap]'); await sleep(600); ok('el anfitrión puede cambiar de equipo y el invitado lo ve', (await G.locator('.olside.you h3').innerText()) === hTeamName && await H.locator('.olside.you h3').innerText() !== hTeamName);
  ok('LISTO está deshabilitado sin jugador elegido', await H.locator('[data-act=ol-ready]').isDisabled());
  // pick + listo
  await H.locator('.lobbygrid .subcard').nth(0).click(); await G.locator('.lobbygrid .subcard').nth(1).click(); await sleep(500);
  ok('cada uno ve el jugador elegido por el otro', (await H.locator('.olside:not(.you) .olplayer').innerText()).trim().length > 4 && (await G.locator('.olside:not(.you) .olplayer').innerText()).trim().length > 4);
  await H.click('[data-act=ol-ready]'); await sleep(400); ok('con uno solo listo no empieza', await H.locator('#stage').count() === 0);
  await G.click('[data-act=ol-ready]');
  await H.waitForSelector('#stage', { timeout: 10000 }); await G.waitForSelector('#stage', { timeout: 10000 });
  ok('empieza el partido en ambos cuando los dos están listos', true);
  ok('sin botón de pausa ni de cambios en online (hay botón de salir)', await H.locator('.pause-btn, .sub-btn').count() === 0 && await G.locator('.pause-btn, .sub-btn').count() === 0 && await H.locator('.leave-btn').count() === 1);
  ok('el marcador muestra los nombres', (await H.locator('.scoreboard').innerText()).includes('Ana') && (await G.locator('.scoreboard').innerText()).includes('Beto'));
  await H.keyboard.press('Escape'); await sleep(200); ok('ESC en online no pausa: pide confirmar salida', await H.locator('.modal-bg').count() === 1 && await H.evaluate(() => PC.App.match.state !== 'paused')); await H.click('[data-m="0"]');
  // ---- juego real
  await sleep(2600);
  const hs = () => H.evaluate(() => { const m = PC.App.match; return { st: m.state, t: m.timeLeft, p1x: m.world.players[1].x, p0x: m.world.players[0].x, sc: m.score }; });
  const gs = () => G.evaluate(() => { const m = PC.App.match, v = m.view(); return { st: m.state, t: m.timeLeft, p1x: v.world.players[1].x, p0x: v.world.players[0].x, sc: m.score, bx: v.world.ball.x }; });
  const a0 = await hs(); ok('el partido está en juego', a0.st === 'play', JSON.stringify(a0));
  await G.keyboard.down('ArrowLeft'); await sleep(700); await G.keyboard.up('ArrowLeft'); await sleep(200);
  const a1 = await hs(), g1 = await gs(); ok('las teclas del invitado mueven a SU jugador en el anfitrión', a1.p1x < a0.p1x - 60, a0.p1x + ' -> ' + a1.p1x);
  ok('el invitado ve su jugador en la misma posición (±25 px)', Math.abs(g1.p1x - a1.p1x) < 25, g1.p1x + ' vs ' + a1.p1x);
  await H.keyboard.down('ArrowLeft'); await sleep(450); await H.keyboard.up('ArrowLeft'); await sleep(200);
  const a2 = await hs(), g2 = await gs(); ok('las teclas del anfitrión mueven al suyo y el invitado lo ve moverse', a2.p0x < a1.p0x - 50 && g2.p0x < g1.p0x - 50 && Math.abs(g2.p0x - a2.p0x) < 25, `${a1.p0x}->${a2.p0x} / invitado ${g1.p0x}->${g2.p0x}`);
  ok('el reloj del invitado sigue al del anfitrión (±0,3 s)', Math.abs((await hs()).t - (await gs()).t) < 0.3);
  await G.keyboard.press('Space'); await sleep(100); // patada: no debe romper nada
  // gol forzado en el anfitrión → ambos lo ven, con festejo en el invitado
  await H.evaluate(() => { const m = PC.App.match, w = m.world; Object.assign(w.ball, { x: 300, y: 440, vx: -900, vy: 0 }); w.players[0].x = 400; w.players[1].x = 700; });
  await G.waitForFunction(() => PC.App.match.score.R === 1, null, { timeout: 5000 }); ok('el gol llega al invitado (0-1) y se ve el festejo', await G.evaluate(() => !!PC.App.match.celebrate && PC.App.match.state === 'goal'));
  ok('el marcador coincide en ambos', (await hs()).sc.R === 1 && (await gs()).sc.R === 1);
  await G.waitForFunction(() => PC.App.match.state === 'intro' || PC.App.match.state === 'play', null, { timeout: 6000 }); ok('después del festejo el juego se reanuda en ambos y sin celebrate', await G.evaluate(() => !PC.App.match.celebrate));
  // ---- fin por tiempo
  await H.evaluate(() => { PC.App.match.timeLeft = 0.5; PC.App.match.state = 'play'; });
  await H.waitForSelector('#endOv:not(.hidden)', { timeout: 8000 }); await G.waitForSelector('#endOv:not(.hidden)', { timeout: 8000 });
  const he = await H.locator('#endOv').innerText(), ge = await G.locator('#endOv').innerText();
  ok('final en ambos con el mismo resultado', /0 - 1/.test(he) && /0 - 1/.test(ge), he.replace(/\n/g, '|') + ' || ' + ge.replace(/\n/g, '|'));
  ok('veredicto desde cada perspectiva (anfitrión pierde, invitado gana)', /DERROTA/.test(he) && /VICTORIA/.test(ge));
  // ---- revancha
  await H.click('[data-act=ol-rematch]'); await sleep(400); ok('revancha: el anfitrión queda esperando', /ESPERANDO/.test(await H.locator('#olEndBtns').innerText()) && /ACEPTAR/.test(await G.locator('#olEndBtns').innerText()));
  await G.click('[data-act=ol-rematch]'); await G.waitForFunction(() => PC.App.match && !PC.App.match.ended && PC.App.match.score.L === 0 && PC.App.match.score.R === 0 && document.getElementById('endOv').classList.contains('hidden'), null, { timeout: 8000 });
  await H.waitForFunction(() => PC.App.match && !PC.App.match.ended && document.getElementById('endOv').classList.contains('hidden'), null, { timeout: 8000 }); ok('con los dos de acuerdo arranca la revancha 0-0 con los mismos jugadores', true);
  await sleep(2500);
  // ---- abandono del invitado
  await G.click('.leave-btn'); await G.click('[data-m="1"]'); await G.waitForSelector('#endOv:not(.hidden)', { timeout: 5000 });
  await H.waitForSelector('#endOv:not(.hidden)', { timeout: 8000 });
  const he2 = await H.locator('#endOv').innerText(), ge2 = await G.locator('#endOv').innerText();
  ok('si el invitado abandona, el anfitrión gana 3-0 y el invitado ve derrota por abandono', /GANASTE/.test(he2) && /3 - 0/.test(he2) && /DERROTA POR ABANDONO/.test(ge2) && /3 - 0/.test(ge2), he2.replace(/\n/g, '|') + ' || ' + ge2.replace(/\n/g, '|'));
  ok('tras el abandono no hay botón de revancha', await H.locator('[data-act=ol-rematch]').count() === 0 && await G.locator('[data-act=ol-rematch]').count() === 0);
  await G.click('[data-act=ol-exit]'); await H.click('[data-act=ol-exit]'); await sleep(500); ok('salir lleva al menú sin errores', await G.locator('.menu').count() === 1 && await H.locator('.menu').count() === 1 && await H.evaluate(() => !PC.App.online));
  await G.context().close(); await H.context().close();

  // ---- sesión 2: cierre de sala y desconexión abrupta
  const H2 = await mk('host2'), G2 = await mk('guest2');
  await H2.click('[data-act=online]'); await H2.click('[data-act=ol-create]'); await H2.waitForSelector('.roomcode b', { timeout: 15000 }); const c2 = (await H2.locator('.roomcode b').innerText()).trim();
  await G2.click('[data-act=online]'); await G2.fill('#olCode', c2); await G2.click('[data-act=ol-join]'); await G2.waitForSelector('.onlobby', { timeout: 20000 });
  ok('nombre vacío = "Jugador" por defecto', /Jugador/.test(await H2.locator('.olside.you .olname').innerText()));
  await H2.click('[data-act=ol-exit-lobby]'); await G2.waitForFunction(() => /cerró la sala/.test((document.getElementById('olMsg') || {}).textContent || ''), null, { timeout: 8000 }); ok('si el anfitrión cierra la sala, el invitado vuelve al inicio con aviso', true);
  await H2.context().close(); await G2.context().close();
  const H3 = await mk('host3'), G3 = await mk('guest3');
  await H3.click('[data-act=online]'); await H3.click('[data-act=ol-create]'); await H3.waitForSelector('.roomcode b', { timeout: 15000 }); const c3 = (await H3.locator('.roomcode b').innerText()).trim();
  await G3.click('[data-act=online]'); await G3.fill('#olCode', c3); await G3.click('[data-act=ol-join]'); await G3.waitForSelector('.onlobby', { timeout: 20000 });
  await H3.locator('.lobbygrid .subcard').nth(0).click(); await G3.locator('.lobbygrid .subcard').nth(0).click(); await sleep(300); await H3.click('[data-act=ol-ready]'); await G3.click('[data-act=ol-ready]');
  await H3.waitForSelector('#stage'); await G3.waitForSelector('#stage'); await sleep(3000);
  await G3.context().close(); // el invitado "cierra la pestaña" en pleno partido
  await H3.waitForSelector('#endOv:not(.hidden)', { timeout: 25000 }); const he3 = await H3.locator('#endOv').innerText();
  ok('si el invitado se desconecta en pleno partido, el anfitrión gana por abandono', /GANASTE/.test(he3) && /desconect/.test(he3), he3.replace(/\n/g, '|'));
  await H3.context().close();
  const errs = [].concat(H.errs, G.errs, H2.errs, G2.errs, H3.errs).filter(e => !/WebSocket|ERR_|Failed to load resource|peerjs\.com/.test(e));
  ok('sin errores de JavaScript en ninguna pantalla', errs.length === 0, errs.join(' | '));
  console.log(`\nResultado: ${pass} OK, ${fail} FALLAS`); await b.close(); srv.close && srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
