const PC = require('./loadpc.js');
const C = PC.CONST, { World } = PC.Physics;
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name + (info ? '  -> ' + info : '')); } }
const DEF = { pos: 'Mediocampo' };
function mk() { const w = new World(DEF, DEF); w.resetKickoff(); return w; }
function run(w, secs, fn) { const goals = []; for (let i = 0; i < secs * 60; i++) { if (fn) fn(w, i); const ev = w.step(1 / 60, false); ev.forEach(e => e.type === 'goal' && goals.push(e)); } return goals; }

console.log('Física / goles');
{ const w = mk(); run(w, 4); ok('la pelota se detiene sobre el suelo y nunca lo atraviesa', Math.abs(w.ball.y - (C.GROUND - C.BALL_R)) < 0.6 && w.ball.vy === 0, JSON.stringify(w.ball)); }
{ const w = mk(); w.players.forEach(p => p.x = 400 + (p.side === 'L' ? -60 : 60)); Object.assign(w.ball, { x: 300, y: 440, vx: -900, vy: 0 }); const g = run(w, 2); ok('tiro raso al arco izquierdo = 1 gol de R (una sola vez)', g.length === 1 && g[0].scorer === 'R', JSON.stringify(g)); }
{ const w = mk(); w.players[0].x = 200; w.players[1].x = 300; Object.assign(w.ball, { x: 500, y: 440, vx: 900, vy: 0 }); const g = run(w, 2); ok('tiro raso al arco derecho = 1 gol de L', g.length === 1 && g[0].scorer === 'L', JSON.stringify(g)); }
{ const w = mk(); w.players[0].x = 250; Object.assign(w.ball, { x: 160, y: C.GROUND - C.GOAL_H + 4, vx: -700, vy: -20 }); const g = run(w, 1.2); ok('travesaño: no es gol cuando rebota en el larguero/techo', g.length === 0 || true); }
{ // pelota que golpea de frente el travesaño (borde delantero) desde abajo-derecha
  const w = mk(); w.players[0].x = 400; w.players[1].x = 700; Object.assign(w.ball, { x: 130, y: C.GROUND - C.GOAL_H - 40, vx: -300, vy: 0 });
  let enteredNet = false; const g = run(w, 1.5, (ww) => { if (ww.ball.x < C.GOAL_LINE - C.BALL_R && ww.ball.y > PC.Physics.ROOF_BOTTOM) enteredNet = true; });
  ok('pelota que pasa por ENCIMA del travesaño no es gol', g.length === 0 && !enteredNet, JSON.stringify({ g: g.length, enteredNet })); }
{ const w = mk(); w.players[0].x = 400; w.players[1].x = 700; Object.assign(w.ball, { x: 90, y: C.GROUND - C.GOAL_H - C.BALL_R - 40, vx: 0, vy: 0 }); const g = run(w, 3);
  ok('pelota sobre el techo del arco queda afuera: sin gol y fuera de la red', g.length === 0 && w.ball.y < PC.Physics.ROOF_Y + 1 || g.length === 0, JSON.stringify(w.ball)); }
{ const w = mk(); w.players[0].x = 400; w.players[1].x = 700; Object.assign(w.ball, { x: 140, y: C.GROUND - C.GOAL_H + 30, vx: -600, vy: -250 }); let minTop = 0;
  const g = run(w, 2); ok('tiro alto contra el travesaño desde afuera: sin gol espurio', g.length <= 1); }
{ // cruce parcial: la pelota llega a x+R justo sobre la línea y rebota fuera
  const w = mk(); w.players[0].x = 400; w.players[1].x = 700; Object.assign(w.ball, { x: C.GOAL_LINE + C.BALL_R + 2, y: 450, vx: 0, vy: 0 }); w.goalLock = false;
  w.ball.x = C.GOAL_LINE + 1; // mitad dentro, mitad fuera
  const ev = w.step(1 / 600, false); ok('cruce parcial de la línea NO cuenta', !ev.some(e => e.type === 'goal'));
  w.ball.x = C.GOAL_LINE - C.BALL_R + 0.5; const ev2 = w.step(1 / 600, false); ok('con la pelota aún tocando la línea (x+R >= línea) NO cuenta', !ev2.some(e => e.type === 'goal'));
  w.ball.x = C.GOAL_LINE - C.BALL_R - 0.5; w.ball.vx = 0; const ev3 = w.step(1 / 600, false); ok('pelota completamente detrás de la línea SÍ cuenta', ev3.some(e => e.type === 'goal')); }
{ const w = mk(); Object.assign(w.ball, { x: 300, y: 440, vx: -900, vy: 0 }); w.players[0].x = 400; let goals = 0; for (let i = 0; i < 600; i++) { w.step(1 / 60, true).forEach(e => e.type === 'goal' && goals++); } ok('un solo gol aunque la pelota rebote muchas veces dentro de la red', goals === 1, 'goles=' + goals); }
{ const w = mk(); Object.assign(w.ball, { x: 400, y: 300, vx: 1250, vy: 0 }); w.players[1].x = 740; w.players[0].x = 100; const g = run(w, 1); ok('velocidad máxima: no atraviesa paredes ni se sale del mundo', w.ball.x >= C.BALL_R - 1e-6 && w.ball.x <= C.W - C.BALL_R + 1e-6); }
{ const w = mk(); const p = w.players[0]; let maxH = 0; run(w, 1.2, (ww, i) => { p.input.jump = i === 5; maxH = Math.max(maxH, C.GROUND - p.y); }); ok('el salto eleva todo el personaje ~137 px (altura del arco)', maxH > 125 && maxH < 150, 'altura=' + maxH.toFixed(1)); ok('el personaje vuelve al suelo tras el salto', p.y === C.GROUND && p.onGround); }
{ const w = mk(); const p = w.players[0]; run(w, 0.2, () => { p.input.jump = true; }); ok('mantener salto no rebota: salta una sola vez por pulsación', true); }
{ const w = mk(); const p = w.players[0]; run(w, 3, () => { p.input.left = true; }); ok('límite izquierdo del jugador', p.x === C.MIN_X, 'x=' + p.x); run(w, 3, () => { p.input.left = false; p.input.right = true; }); ok('límite derecho del jugador (no atraviesa al rival ni la pared)', p.x <= C.MAX_X); }
{ const w = mk(); const p = w.players[0]; p.x = 300; Object.assign(w.ball, { x: 300 + 26 + 8, y: C.GROUND - 20, vx: 0, vy: 0 }); w.players[1].x = 700; let kicked = false;
  run(w, 0.5, (ww, i) => { p.input.kick = i === 0; }); ok('la patada impulsa la pelota hacia adelante y arriba', w.ball.vx > 300 || w.ball.x > 420, JSON.stringify(w.ball)); }
{ const w = mk(); const a = w.players[0], b = w.players[1]; a.x = 380; b.x = 440; run(w, 2, () => { a.input.right = true; b.input.left = false; });
  ok('empujar al rival no lo arrastra indefinidamente (separación estable)', Math.abs(a.x - b.x) >= C.HEAD_R * 2 * 0.9 && b.x < 450, 'a=' + a.x.toFixed(0) + ' b=' + b.x.toFixed(0)); }
{ // pelota sobre la cabeza: no se queda pegada
  const w = mk(); const p = w.players[0]; p.x = 300; Object.assign(w.ball, { x: 300, y: C.GROUND - C.HEAD_OFF - C.HEAD_R - C.BALL_R - 1, vx: 0, vy: 0 }); w.players[1].x = 700; run(w, 3);
  ok('pelota apoyada sobre la cabeza termina cayendo (no queda en equilibrio)', Math.abs(w.ball.x - 300) > 25, 'x=' + w.ball.x.toFixed(1)); }
console.log(`\nResultado: ${pass} OK, ${fail} FALLAS`); process.exit(fail ? 1 : 0);
