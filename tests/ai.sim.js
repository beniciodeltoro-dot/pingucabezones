// Simulaciones sin interfaz: IA vs IA y IA vs "humano" sintético para medir comportamiento.
const PC = require('./loadpc.js');
const C = PC.CONST, { World } = PC.Physics, { Bot } = PC.AI;
function rngFrom(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const DEFS = { Delantero: { pos: 'Delantero' }, Mediocampo: { pos: 'Mediocampo' }, Defensor: { pos: 'Defensor' }, Arquero: { pos: 'Arquero' } };

function playMatch(levelL, levelR, seed, humanSide, posL = 'Mediocampo', posR = 'Mediocampo', logIdle) {
  const w = new World(DEFS[posL], DEFS[posR]); w.resetKickoff();
  const rnd = rngFrom(seed);
  const botL = humanSide === 'L' ? null : new Bot(w, 'L', levelL, rnd), botR = humanSide === 'R' ? null : new Bot(w, 'R', levelR, rnd);
  const sc = { L: 0, R: 0 }; let frozen = 0, t = 0; const dt = 1 / 60; let timeLeft = 60;
  const idle = { L: 0, R: 0 }, wall = { L: 0, R: 0 }, airT = { L: 0, R: 0 }, fouls = 0, ballStill = 0;
  let stuckBall = 0, maxStill = 0, still = 0; const jst = { L: { air: false, touch: false }, R: { air: false, touch: false } }; let jumpsTotal = 0, jumpsUseful = 0;
  // "humano" sintético: persigue la pelota y patea cuando está cerca, saltando de vez en cuando
  const human = (p, side) => { const b = w.ball, dir = side === 'L' ? 1 : -1, i = p.input; i.left = i.right = i.jump = i.kick = i.up = i.down = false;
    const tx = b.x - dir * 34; if (tx > p.x + 8) i.right = true; else if (tx < p.x - 8) i.left = true;
    if (Math.abs(b.x - p.x) < 60 && b.y < C.GROUND - 90 && p.onGround) i.jump = true;
    if (Math.abs(b.x - (p.x + dir * 48)) < 28 && b.y > C.GROUND - 70) { if (p.facing === dir) i.kick = true; else { if (dir > 0) i.right = true; else i.left = true; } } };
  let ticks = 0;
  while (timeLeft > 0 && ticks < 60 * 200) {
    ticks++;
    if (frozen > 0) { frozen -= dt; if (frozen <= 0) { w.resetKickoff(); botL && botL.reset(); botR && botR.reset(); } else { w.step(dt, true); continue; } }
    if (botL) botL.update(dt); else human(w.players[0], 'L');
    if (botR) botR.update(dt); else human(w.players[1], 'R');
    const ev = w.step(dt, false);
    timeLeft -= dt;
    for (const e of ev) if (e.type === 'goal') { sc[e.scorer]++; frozen = 2.0; }
    for (const e of ev) if ((e.type === 'touch' || e.type === 'kick') && e.side) { const j = jst[e.side]; if (j.air) j.touch = true; }
    for (const [i, sd] of [[0, 'L'], [1, 'R']]) { const p = w.players[i], j = jst[sd]; if (!p.onGround && !j.air) { j.air = true; j.touch = false; jumpsTotal++; } else if (p.onGround && j.air) { j.air = false; if (j.touch) jumpsUseful++; } }
    for (const [i, s] of [[0, 'L'], [1, 'R']]) { const p = w.players[i]; if (Math.abs(p.vx) < 5 && p.onGround && !p.input.kick) idle[s] += dt; if (p.x <= C.MIN_X + 1 || p.x >= C.MAX_X - 1) wall[s] += dt; if (!p.onGround) airT[s] += dt; }
    if (Math.hypot(w.ball.vx, w.ball.vy) < 15 && w.ball.y > C.GROUND - 14) { still += dt; maxStill = Math.max(maxStill, still); } else still = 0;
  }
  return { sc, idle, wall, airT, maxStill, botL, botR, ticks, jumpsTotal, jumpsUseful };
}
const cmd = process.argv[2] || 'all';
const lv = ['facil', 'normal', 'dificil'];
const fmt = n => n.toFixed(1);
console.log('=== IA vs IA (10 partidos por cruce, 60 s de juego cada uno) ===');
for (const a of lv) for (const b of lv) {
  let gl = 0, gr = 0, wl = 0, wr = 0, dr = 0, idle = 0, wallT = 0, air = 0, jumps = 0, kicks = 0, maxS = 0, jt = 0, ju = 0; const N = 10;
  for (let s = 1; s <= N; s++) { const r = playMatch(a, b, 1000 + s * 17, null); gl += r.sc.L; gr += r.sc.R; if (r.sc.L > r.sc.R) wl++; else if (r.sc.R > r.sc.L) wr++; else dr++;
    idle += r.idle.L + r.idle.R; wallT += r.wall.L + r.wall.R; air += r.airT.L + r.airT.R; jumps += r.botL.stats.jumps + r.botR.stats.jumps; kicks += r.botL.stats.kicks + r.botR.stats.kicks; maxS = Math.max(maxS, r.maxStill); jt += r.jumpsTotal; ju += r.jumpsUseful; }
  console.log(`${a.padEnd(8)} (izq) vs ${b.padEnd(8)} (der): goles ${fmt(gl / N)}-${fmt(gr / N)} | G/E/P izq ${wl}/${dr}/${wr} | quieto ${fmt(idle / N / 2)}s/jug | pared ${fmt(wallT / N / 2)}s | en aire ${fmt(air / N / 2)}s | saltos ${fmt(jumps / N / 2)} (útiles ${ju}/${jt}) | patadas ${fmt(kicks / N / 2)} | pelota parada máx ${fmt(maxS)}s`);
}
console.log('\n=== IA (der) vs "humano" sintético que persigue la pelota (izq) ===');
for (const b of lv) { let gl = 0, gr = 0, N = 10, wins = 0; for (let s = 1; s <= N; s++) { const r = playMatch(null, b, 500 + s * 31, 'L'); gl += r.sc.L; gr += r.sc.R; if (r.sc.R > r.sc.L) wins++; } console.log(`IA ${b.padEnd(8)}: goles humano ${fmt(gl / N)} - IA ${fmt(gr / N)} | IA gana ${wins}/${N}`); }
