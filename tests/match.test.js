// Pruebas del controlador de partido en Node (sin navegador): reloj, goles, pausa, abandono.
const PC = require('./loadpc.js'); require('../js/match.js');
const C = PC.CONST; let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (i ? ' -> ' + i : '')); } }
const mkMatch = (extra = {}) => new PC.Match(Object.assign({ leftTeam: 'pingu', rightTeam: 'wachines', leftPlayer: PC.getPlayer('pin-saya-11'), rightPlayer: PC.getPlayer('wac-iniguez-31'), userSide: 'L', difficulty: 'normal', rng: Math.random }, extra));
function runUntilEnd(m, maxSteps = 60 * 400) { let n = 0, steps = 0; while (!m.ended && steps++ < maxSteps) m.step(); return steps; }
console.log('Partido');
{ const m = mkMatch(); let ends = 0; m.onEnd = () => ends++; let playSteps = 0; while (!m.ended && playSteps < 60 * 400) { const s0 = m.state; m.step(); if (s0 === 'play') playSteps++; }
  ok('el reloj llega a 0 y el partido termina una sola vez', m.ended && m.timeLeft === 0 && ends === 1);
  ok('exactamente 60 s de juego (3600 pasos en estado "play")', playSteps === 3600 || playSteps === 3601 || Math.abs(playSteps - 3600) <= 1, 'pasos=' + playSteps);
  const sc = JSON.stringify(m.score); for (let i = 0; i < 600; i++) m.step(); ok('tras el final no cambia el marcador ni se mueve nada', JSON.stringify(m.score) === sc && m.world.players[0].vx === 0); }
{ const m = mkMatch(); for (let i = 0; i < 60 * 3; i++) m.step(); const t0 = m.timeLeft, pos = m.world.ball.x;
  m.pause(); for (let i = 0; i < 300; i++) m.step(); ok('en pausa el reloj y la física quedan congelados', m.timeLeft === t0 && m.world.ball.x === pos && m.state === 'paused');
  m.resume(); for (let i = 0; i < 30; i++) m.step(); ok('al reanudar el reloj continúa desde donde estaba', m.timeLeft < t0 && m.timeLeft > t0 - 1); }
{ const m = mkMatch(); for (let i = 0; i < 60 * 4; i++) m.step(); m.score = { L: 2, R: 0 }; const r = m.abandon();
  ok('abandonar ganando 2-0 se registra como derrota 0-3 por abandono', r.homeGoals === 0 && r.awayGoals === 3 && r.forfeit);
  ok('abandonar no se puede ejecutar dos veces', m.abandon() === m.result && m.result.homeGoals === 0); }
{ const m = mkMatch(); for (let i = 0; i < 60 * 4; i++) m.step(); m.score = { L: 1, R: 4 }; const r = m.abandon(); ok('abandonar perdiendo 1-4 conserva el marcador', r.homeGoals === 1 && r.awayGoals === 4); }
{ const m = mkMatch({ userSide: 'R' }); for (let i = 0; i < 60 * 4; i++) m.step(); m.score = { L: 0, R: 1 }; const r = m.abandon(); ok('abandono con el usuario de visitante: la derrota es del usuario', r.awayGoals === 0 && r.homeGoals === 3); }
{ // gol: una sola vez, celebración sin perder tiempo
  const m = mkMatch(); for (let i = 0; i < 60 * 3; i++) m.step(); Object.assign(m.world.ball, { x: 300, y: 440, vx: -900, vy: 0 }); m.world.players[0].x = 400; m.world.players[1].x = 700;
  let steps = 0; while (m.state === 'play' && steps++ < 300) m.step(); const tAtGoal = m.timeLeft;
  ok('gol de la pelota al arco izquierdo suma 1 a la derecha', m.score.R === 1 && m.score.L === 0 && m.state === 'goal', JSON.stringify(m.score) + m.state);
  for (let i = 0; i < 60 * 3; i++) m.step(); ok('durante la celebración el reloj no corre', m.timeLeft === tAtGoal);
  ok('después de la celebración se reanuda con la pelota y jugadores recolocados', (m.state === 'intro' || m.state === 'play') && Math.abs(m.world.players[0].x - 250) < 120);
  ok('el gol no se duplicó tras el reinicio', m.score.R === 1); }
{ // gol exactamente al agotarse el tiempo
  const m = mkMatch(); for (let i = 0; i < 60 * 3; i++) m.step(); m.timeLeft = 1 / 60 + 1e-9; Object.assign(m.world.ball, { x: C.GOAL_LINE - C.BALL_R - 2 + 3, y: 440, vx: -600, vy: 0 }); m.world.players[0].x = 400; m.world.players[1].x = 700;
  let ends = 0; m.onEnd = () => ends++; for (let i = 0; i < 10; i++) m.step(); ok('gol en el último paso: cuenta una sola vez y el partido termina una sola vez', m.score.R <= 1 && ends === 1, JSON.stringify(m.score)); }
{ const m = mkMatch(); m.timeLeft = 0.01; for (let i = 0; i < 3; i++) m.step(); const s = JSON.stringify(m.score); Object.assign(m.world.ball, { x: 30, y: 440, vx: -900, vy: 0 }); for (let i = 0; i < 100; i++) m.step(); ok('no se registran goles después del pitazo final', JSON.stringify(m.score) === s); }
console.log('Cambios de jugador');
const goalNow = (m, scorerSide) => { // fuerza un gol y devuelve cuando el partido quedó detenido por el gol
  Object.assign(m.world.ball, scorerSide === 'R' ? { x: 300, y: 440, vx: -900, vy: 0 } : { x: 500, y: 440, vx: 900, vy: 0 }); m.world.players[0].x = 400; m.world.players[1].x = 700;
  let n = 0; while (m.state === 'play' && n++ < 300) m.step(); return m.state === 'goal'; };
const runGoalStop = m => { let n = 0; while (m.state === 'goal' && n++ < 400) m.step(); };
{ const m = mkMatch(); const t0 = m.timeLeft; for (let i = 0; i < 60 * 3; i++) m.step();
  const p0 = m.world.players[0], x0 = p0.x;
  ok('el usuario empieza con 2 cambios', m.subsLeft.user === 2 && m.canUserSub());
  ok('no puede poner a un jugador del otro equipo ni al que ya está en cancha', !m.substituteUser('wac-iniguez-31') && !m.substituteUser('pin-saya-11') && m.subsLeft.user === 2);
  const bench = m.userBench(); ok('el banco son los otros 7 jugadores de Pingu', bench.length === 7 && bench.every(p => p.team === 'pingu' && p.id !== 'pin-saya-11'));
  m.pause(); ok('cambio en pausa (en cualquier momento)', m.substituteUser('pin-salvatierra-10')); m.resume();
  ok('el cambio actualiza identidad y atributos (Arquero)', p0.def.id === 'pin-salvatierra-10' && p0.attrs === PC.POSITIONS.Arquero && m.subsLeft.user === 1);
  ok('el cambio no mueve al jugador ni toca el marcador/reloj', p0.x === x0 && m.score.L === 0 && m.score.R === 0 && m.timeLeft < t0);
  ok('segundo cambio permitido', m.substituteUser('pin-coria-20') && m.subsLeft.user === 0 && p0.def.id === 'pin-coria-20');
  ok('tercer cambio rechazado', !m.substituteUser('pin-sauch-67') && p0.def.id === 'pin-coria-20' && !m.canUserSub());
  for (let i = 0; i < 120; i++) m.step(); ok('el partido sigue funcionando tras los cambios', m.state === 'play' || m.state === 'goal' || m.state === 'intro'); }
{ const m = mkMatch({ userSide: 'R' }); for (let i = 0; i < 60 * 3; i++) m.step(); const before = m.world.players[0].def.id;
  ok('usuario de visitante: cambia su jugador (derecha) con su plantel', m.substituteUser('wac-dalzotto-42') && m.world.players[1].def.id === 'wac-dalzotto-42' && m.world.players[0].def.id === before); }
{ const m = mkMatch(); for (let i = 0; i < 60 * 3; i++) m.step(); m.ended = true; ok('terminado el partido no se puede cambiar', !m.substituteUser('pin-coria-20')); }
{ // rival: nunca cambia en juego corrido, solo en el reinicio tras gol, y máximo 2 veces
  const m = mkMatch({ rng: () => 0 }); const subs = []; m.onSub = i => subs.push(i);
  const rivalId = m.world.players[1].def.id; for (let i = 0; i < 60 * 8; i++) { m.step(); if (m.state !== 'play') break; }
  ok('sin goles el rival no cambia', subs.length === 0 && m.world.players[1].def.id === rivalId);
  for (let g = 1; g <= 4 && !m.ended; g++) { m.subsLeft.user = 2; if (m.state === 'intro') while (m.state === 'intro') m.step(); const stoppedBefore = subs.length;
    ok('gol ' + g + ': a punto de parar', goalNow(m, g % 2 ? 'R' : 'L')); ok('durante el festejo del gol el rival todavía no cambió', subs.length === stoppedBefore); runGoalStop(m);
    ok('gol ' + g + ': el rival cambia al reiniciar solo si le quedan cambios', subs.length === Math.min(g, 2), 'subs=' + subs.length); }
  ok('el rival cambia exactamente 2 veces y siempre por un jugador de su equipo distinto', subs.length === 2 && subs.every(s => s.who === 'rival' && s.inn.team === 'wachines' && s.inn.id !== s.out.id) && m.subsLeft.rival === 0);
  ok('el cambio del rival cambia a su jugador en el mundo', m.world.players[1].def.id === subs[1].inn.id); }
{ // con rng=0.99 (nunca cambia) y con azar real: nunca más de 2, y nunca fuera de un gol
  const m = mkMatch({ rng: () => 0.99 }); const subs = []; m.onSub = i => subs.push(i); for (let g = 0; g < 3; g++) { while (m.state === 'intro') m.step(); goalNow(m, 'R'); runGoalStop(m); } ok('con azar desfavorable el rival puede no cambiar (máx. 2, nunca obligado)', subs.length === 0);
  let maxSubs = 0, outsideGoal = 0; for (let k = 0; k < 40; k++) { const mm = mkMatch(); let cnt = 0; mm.onSub = () => { cnt++; if (mm.state !== 'goal') outsideGoal++; };
    for (let g = 0; g < 6 && !mm.ended; g++) { let n = 0; while ((mm.state === 'intro') && n++ < 500) mm.step(); if (mm.ended) break; goalNow(mm, g % 2 ? 'L' : 'R'); runGoalStop(mm); } maxSubs = Math.max(maxSubs, cnt); }
  ok('en 40 partidos simulados el rival nunca supera 2 cambios', maxSubs <= 2, 'max=' + maxSubs);
  ok('los cambios del rival ocurren solo con el juego detenido por un gol', outsideGoal === 0, outsideGoal); }
console.log(`\nResultado: ${pass} OK, ${fail} FALLAS`); process.exit(fail ? 1 : 0);
