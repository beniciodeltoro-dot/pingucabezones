const PC = require('./loadpc.js'); const L = PC.League; let pass = 0, fail = 0;
function ok(n, c, i) { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (i ? ' -> ' + i : '')); } }
console.log('Liga');
const ch = L.newChampionship('pingu', 'normal', 'semilla');
ok('19 fechas, un partido por fecha', ch.fixtures.length === 19 && ch.fixtures.every((f, i) => f.round === i + 1 && f.home !== f.away));
ok('localía alternada: Pingu local en impares, Wachines en pares', ch.fixtures.every(f => (f.round % 2 === 1) === (f.home === 'pingu')));
ok('Pingu tiene 10 localías y Wachines 9', ch.fixtures.filter(f => f.home === 'pingu').length === 10 && ch.fixtures.filter(f => f.home === 'wachines').length === 9);
ok('un campeonato nuevo es válido', L.validate(ch));
ok('la tabla inicial está en cero', L.computeTable(ch).every(r => r.played === 0 && r.points === 0));
ok('registrar resultado 2-1 local: 3 pts al local', (() => { L.recordResult(ch, 1, 2, 1, false); const t = L.computeTable(ch); const p = t.find(r => r.team === 'pingu'); return p.points === 3 && p.gf === 2 && p.ga === 1 && p.gd === 1 && p.won === 1; })());
ok('no se duplica una fecha ya jugada', (() => { const r = L.recordResult(ch, 1, 5, 0, false); const p = L.computeTable(ch).find(x => x.team === 'pingu'); return !r.ok && p.played === 1 && p.gf === 2; })());
ok('empate = 1 punto cada uno', (() => { L.recordResult(ch, 2, 1, 1, false); const t = L.computeTable(ch); return t.find(r => r.team === 'wachines').points === 1 && t.find(r => r.team === 'pingu').points === 4; })());
ok('victoria visitante = 3 puntos al visitante (fecha 3: Pingu local pierde 0-2)', (() => { L.recordResult(ch, 3, 0, 2, false); const w = L.computeTable(ch).find(r => r.team === 'wachines'); return w.points === 4 && w.won === 1 && w.awayWins === 1; })());
ok('orden por puntos, luego DG', (() => { const t = L.computeTable(ch); return t[0].points >= t[1].points; })());
ok('la fecha actual avanza a la siguiente pendiente', ch.currentRound === 4 && L.currentFixture(ch).round === 4 && !ch.finished);
ok('resultado inválido es rechazado', !L.recordResult(ch, 4, -1, 0, false).ok && !L.recordResult(ch, 4, 1.5, 0, false).ok);
for (let r = 4; r <= 19; r++) L.recordResult(ch, r, 1, 0, false);
ok('al terminar la fecha 19 el campeonato queda finalizado', ch.finished && L.currentFixture(ch) === null && ch.currentRound === 19);
ok('hay campeón y la tabla suma 19 partidos por equipo', (() => { const c = L.champion(ch); return c && c.table.every(r => r.played === 19); })());
ok('el campeonato terminado sigue siendo válido tras guardarlo/cargarlo', L.validate(JSON.parse(JSON.stringify(ch))));
{ const t = L.newChampionship('wachines', 'dificil', 'x'); for (let r = 1; r <= 19; r++) L.recordResult(t, r, 1, 1, false); const c = L.champion(t);
  ok('empate absoluto: desempate explícito por sorteo estable (misma semilla = mismo campeón)', c.decidedBySeed && c.team === L.champion(JSON.parse(JSON.stringify(t))).team);
  const t2 = L.newChampionship('wachines', 'dificil', 'otra'); for (let r = 1; r <= 19; r++) L.recordResult(t2, r, 0, 0, false); ok('el sorteo depende solo de la semilla guardada', typeof L.champion(t2).team === 'string'); }
ok('abandono perdiendo conserva el marcador / ganando = 0-3', (() => { const a = L.forfeitScore(1, 3), b = L.forfeitScore(2, 0), c = L.forfeitScore(1, 1); return a.user === 1 && a.rival === 3 && b.user === 0 && b.rival === 3 && c.user === 0 && c.rival === 3; })());
ok('datos corruptos o incompletos se rechazan', !L.validate(null) && !L.validate({}) && !L.validate(Object.assign(JSON.parse(JSON.stringify(L.newChampionship('pingu', 'normal', 's'))), { userTeam: 'x' })) && !(() => { const c = JSON.parse(JSON.stringify(L.newChampionship('pingu', 'normal', 's'))); c.fixtures[5].played = true; c.fixtures[5].homeGoals = 1; c.fixtures[5].awayGoals = 0; return L.validate(c); })());
ok('fechas con locales invertidos se rechazan', !(() => { const c = JSON.parse(JSON.stringify(L.newChampionship('pingu', 'normal', 's'))); [c.fixtures[0].home, c.fixtures[0].away] = [c.fixtures[0].away, c.fixtures[0].home]; return L.validate(c); })());
ok('los 17 jugadores tienen id único (dos dorsales 67 no chocan)', new Set(PC.PLAYERS.map(p => p.id)).size === 17 && PC.teamPlayers('pingu').length === 9 && PC.teamPlayers('wachines').length === 8 && PC.teamPlayers('pingu').filter(p => p.number === 67).length === 2);
console.log(`\nResultado: ${pass} OK, ${fail} FALLAS`); process.exit(fail ? 1 : 0);
