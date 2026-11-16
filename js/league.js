/* Pingu Cup - lógica de la competición (calendario, resultados, tabla, campeón).
   La tabla se DERIVA siempre de los partidos jugados: no hay estadísticas duplicadas. */
(function (root) {
  'use strict';
  const PC = (root.PC = root.PC || {});
  const ROUNDS = 19;
  const FORFEIT_GOALS = 3; // derrota por abandono: 0-3 cuando el usuario no iba perdiendo

  function hashSeed(seed) { // función hash estable (FNV-1a)
    let h = 2166136261;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Calendario: Pingu F.C. local en fechas impares (10), CA Wachines local en pares (9).
  function createSchedule() {
    const fixtures = [];
    for (let r = 1; r <= ROUNDS; r++) {
      const pinguHome = r % 2 === 1;
      fixtures.push({
        round: r,
        home: pinguHome ? 'pingu' : 'wachines',
        away: pinguHome ? 'wachines' : 'pingu',
        played: false, homeGoals: null, awayGoals: null, forfeit: false
      });
    }
    return fixtures;
  }

  function newChampionship(userTeam, difficulty, seed) {
    return {
      version: 1,
      userTeam: userTeam,
      difficulty: difficulty || 'normal',
      seed: seed != null ? String(seed) : String(Date.now()) + ':' + Math.floor(Math.random() * 1e9),
      currentRound: 1,
      fixtures: createSchedule(),
      finished: false
    };
  }

  function emptyRow(team) {
    return { team: team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, awayWins: 0 };
  }

  function computeTable(champ) {
    const rows = {};
    PC.TEAM_IDS.forEach(t => (rows[t] = emptyRow(t)));
    champ.fixtures.forEach(f => {
      if (!f.played) return;
      const h = rows[f.home], a = rows[f.away];
      h.played++; a.played++;
      h.gf += f.homeGoals; h.ga += f.awayGoals;
      a.gf += f.awayGoals; a.ga += f.homeGoals;
      if (f.homeGoals > f.awayGoals) { h.won++; a.lost++; h.points += 3; }
      else if (f.homeGoals < f.awayGoals) { a.won++; h.lost++; a.points += 3; a.awayWins++; }
      else { h.drawn++; a.drawn++; h.points++; a.points++; }
    });
    const list = PC.TEAM_IDS.map(t => { rows[t].gd = rows[t].gf - rows[t].ga; return rows[t]; });
    // Orden: puntos, diferencia de gol, goles a favor, victorias de visitante,
    // y como último criterio un sorteo estable (hash de la semilla guardada al crear el campeonato).
    list.sort((x, y) =>
      (y.points - x.points) || (y.gd - x.gd) || (y.gf - x.gf) || (y.awayWins - x.awayWins) ||
      (hashSeed(champ.seed + ':' + x.team) - hashSeed(champ.seed + ':' + y.team)));
    list.forEach((r, i) => (r.pos = i + 1));
    return list;
  }

  function isAbsoluteTie(champ) {
    const t = computeTable(champ);
    const a = t[0], b = t[1];
    return a.points === b.points && a.gd === b.gd && a.gf === b.gf && a.awayWins === b.awayWins;
  }

  function currentFixture(champ) {
    return champ.fixtures.find(f => !f.played) || null;
  }

  // Registra un resultado. Idempotente: una fecha ya jugada NO se vuelve a registrar.
  function recordResult(champ, round, homeGoals, awayGoals, forfeit) {
    const f = champ.fixtures.find(x => x.round === round);
    if (!f) return { ok: false, reason: 'fecha-inexistente' };
    if (f.played) return { ok: false, reason: 'ya-jugada' };
    if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0)
      return { ok: false, reason: 'resultado-invalido' };
    f.played = true; f.homeGoals = homeGoals; f.awayGoals = awayGoals; f.forfeit = !!forfeit;
    const next = currentFixture(champ);
    champ.currentRound = next ? next.round : ROUNDS;
    champ.finished = !next;
    return { ok: true };
  }

  // Resultado final al abandonar: el usuario nunca gana. Si ya perdía conserva el marcador;
  // si ganaba o empataba, derrota administrativa 0-3.
  function forfeitScore(userGoals, rivalGoals) {
    if (userGoals < rivalGoals) return { user: userGoals, rival: rivalGoals };
    return { user: 0, rival: FORFEIT_GOALS };
  }

  function champion(champ) {
    if (!champ.finished) return null;
    const t = computeTable(champ);
    return { team: t[0].team, table: t, decidedBySeed: isAbsoluteTie(champ) };
  }

  // Validación estricta de datos guardados.
  function validate(c) {
    try {
      if (!c || typeof c !== 'object' || c.version !== 1) return false;
      if (PC.TEAM_IDS.indexOf(c.userTeam) < 0) return false;
      if (['facil', 'normal', 'dificil'].indexOf(c.difficulty) < 0) return false;
      if (typeof c.seed !== 'string' || !c.seed) return false;
      if (!Array.isArray(c.fixtures) || c.fixtures.length !== ROUNDS) return false;
      const ref = createSchedule();
      for (let i = 0; i < ROUNDS; i++) {
        const f = c.fixtures[i], r = ref[i];
        if (!f || f.round !== r.round || f.home !== r.home || f.away !== r.away) return false;
        if (typeof f.played !== 'boolean') return false;
        if (f.played) {
          if (!Number.isInteger(f.homeGoals) || !Number.isInteger(f.awayGoals) || f.homeGoals < 0 || f.awayGoals < 0 || f.homeGoals > 99 || f.awayGoals > 99) return false;
        } else if (f.homeGoals !== null || f.awayGoals !== null) return false;
      }
      // los partidos jugados deben ser un prefijo continuo
      let seenPending = false;
      for (const f of c.fixtures) { if (!f.played) seenPending = true; else if (seenPending) return false; }
      const pending = c.fixtures.find(f => !f.played);
      if (c.finished !== !pending) return false;
      if (c.currentRound !== (pending ? pending.round : ROUNDS)) return false;
      return true;
    } catch (e) { return false; }
  }

  PC.League = { ROUNDS, FORFEIT_GOALS, createSchedule, newChampionship, computeTable, currentFixture,
    recordResult, forfeitScore, champion, validate, isAbsoluteTie, hashSeed };

  /* ---- Persistencia local ---- */
  const KEY = 'pinguCup.v1';
  const SETTINGS_KEY = 'pinguCup.settings.v1';
  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  PC.Storage = {
    KEY, SETTINGS_KEY,
    load() {
      const s = store(); if (!s) return null;
      try {
        const raw = s.getItem(KEY); if (!raw) return null;
        const c = JSON.parse(raw);
        if (PC.League.validate(c)) return c;
        s.removeItem(KEY + '.corrupto'); s.setItem(KEY + '.corrupto', raw); s.removeItem(KEY); // se conserva copia por si hace falta
        return null;
      } catch (e) { try { s.removeItem(KEY); } catch (_) {} return null; }
    },
    save(c) { const s = store(); if (!s) return false; try { s.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; } },
    clear() { const s = store(); if (s) try { s.removeItem(KEY); } catch (e) {} },
    loadSettings() {
      const d = { sound: true, music: true, difficulty: 'normal' };
      const s = store(); if (!s) return d;
      try {
        const o = JSON.parse(s.getItem(SETTINGS_KEY) || '{}');
        return { sound: o.sound !== false, music: o.music !== false,
          difficulty: ['facil', 'normal', 'dificil'].indexOf(o.difficulty) >= 0 ? o.difficulty : 'normal' };
      } catch (e) { return d; }
    },
    saveSettings(o) { const s = store(); if (s) try { s.setItem(SETTINGS_KEY, JSON.stringify(o)); } catch (e) {} }
  };
  if (typeof module !== 'undefined') module.exports = PC;
})(typeof window !== 'undefined' ? window : globalThis);
