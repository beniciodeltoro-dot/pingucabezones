/* Pingu Cup - controlador del partido: reloj de 60 s, goles, pausa, abandono y fin.
   Única fuente de verdad del marcador: match.score. El reloj avanza SOLO con pasos de simulación en juego,
   así que no se acelera ni se detiene por problemas de renderizado. */
(function (root) {
  'use strict';
  const PC = (root.PC = root.PC || {});
  const C = PC.CONST;
  const DURATION = 60, STEP = 1 / 60, MAX_SUBS = 2, BOT_SUB_CHANCE = 0.5;
  const KEYS = {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], jump: ['ArrowUp', 'KeyW'],
    kick: ['Space', 'KeyZ', 'KeyK'], down: ['ArrowDown', 'KeyS'], up: ['ArrowUp', 'KeyW']
  };
  const audio = (n, v) => { if (PC.Audio && PC.Audio.play) PC.Audio.play(n, v); };

  class Match {
    // opts: leftTeam,rightTeam (ids), leftPlayer,rightPlayer (defs), userSide 'L'|'R', difficulty, rng
    constructor(opts) {
      this.opts = opts; this.userSide = opts.userSide;
      this.world = new PC.Physics.World(opts.leftPlayer, opts.rightPlayer);
      this.teams = [PC.TEAMS[opts.leftTeam], PC.TEAMS[opts.rightTeam]];
      this.score = { L: 0, R: 0 }; this.timeLeft = DURATION; this.time = 0;
      this.state = 'intro'; this.stateT = 0; this.celebrate = null; this.ended = false; this.endReason = null; this.result = null;
      this.keys = new Set();
      const botSide = opts.userSide === 'L' ? 'R' : 'L';
      this.bot = new PC.AI.Bot(this.world, botSide, opts.difficulty, opts.rng);
      this.world.resetKickoff();
      this.introKind = 'start';
      this.stats = { goalsL: 0, goalsR: 0 };
      this.onEnd = opts.onEnd || function () {};
      // Cambios de jugador: 2 por equipo y por partido.
      this.rng = opts.rng || Math.random;
      this.subsLeft = { user: MAX_SUBS, rival: MAX_SUBS };
      this.onSub = opts.onSub || function () {};
      audio('whistle');
    }
    get userIdx() { return this.userSide === 'L' ? 0 : 1; }

    keyDown(code) { this.keys.add(code); }
    keyUp(code) { this.keys.delete(code); }
    clearKeys() { this.keys.clear(); }
    _held(name) { return KEYS[name].some(k => this.keys.has(k)); }

    pause() { if (this.state === 'play' || this.state === 'intro' || this.state === 'goal') { this.prevState = this.state; this.state = 'paused'; this.clearKeys(); PC.Audio && PC.Audio.pauseMatch(true); return true; } return false; }
    resume() { if (this.state === 'paused') { this.state = this.prevState || 'play'; this.clearKeys(); PC.Audio && PC.Audio.pauseMatch(false); return true; } return false; }

    // Jugadores del plantel del usuario que puede poner en cancha (todos menos el actual).
    userBench() {
      const cur = this.world.players[this.userIdx].def;
      return PC.teamPlayers(cur.team).filter(p => p.id !== cur.id);
    }
    canUserSub() { return !this.ended && this.subsLeft.user > 0; }
    // Cambio del usuario: se puede hacer en cualquier momento (el partido está en pausa mientras elige).
    substituteUser(playerId) {
      if (!this.canUserSub()) return false;
      const out = this.world.players[this.userIdx].def, inn = PC.getPlayer(playerId);
      if (!inn || inn.team !== out.team || inn.id === out.id) return false;
      this.world.setPlayer(this.userIdx, inn); this.subsLeft.user--;
      this.world.players[this.userIdx].input = { left: false, right: false, jump: false, kick: false, up: false, down: false };
      this.clearKeys(); this.onSub({ who: 'user', out: out, inn: inn, left: this.subsLeft.user });
      return true;
    }
    // Cambio del rival (IA): solo cuando el juego está detenido por un gol, y como máximo 2 por partido.
    // En cada gol (de cualquiera de los dos) decide al azar si cambia, por eso puede caer en cualquier gol.
    _botSubstitution() {
      if (this.subsLeft.rival <= 0 || this.rng() >= BOT_SUB_CHANCE) return false;
      const botIdx = 1 - this.userIdx, out = this.world.players[botIdx].def;
      const squad = PC.teamPlayers(out.team).filter(p => p.id !== out.id); if (!squad.length) return false;
      const inn = squad[Math.floor(this.rng() * squad.length) % squad.length];
      this.world.setPlayer(botIdx, inn); this.subsLeft.rival--;
      this.onSub({ who: 'rival', out: out, inn: inn, left: this.subsLeft.rival });
      return true;
    }

    // Abandono desde la pausa: cierra el partido como derrota del usuario (nunca victoria).
    abandon() {
      if (this.ended) return this.result;
      const u = this.userSide, r = u === 'L' ? 'R' : 'L';
      const fs = PC.League.forfeitScore(this.score[u], this.score[r]);
      this.score[u] = fs.user; this.score[r] = fs.rival;
      return this._finish('abandono');
    }

    _finish(reason) {
      if (this.ended) return this.result;
      this.ended = true; this.state = 'ended'; this.endReason = reason; this.clearKeys();
      this.celebrate = null;
      this.world.players.forEach(p => { p.vx = 0; p.vy = 0; p.input = { left: false, right: false, jump: false, kick: false, up: false, down: false }; });
      this.result = { homeGoals: this.score.L, awayGoals: this.score.R, reason: reason, forfeit: reason === 'abandono' };
      if (reason !== 'abandono') audio('final');
      PC.Audio && PC.Audio.pauseMatch(true);
      this.onEnd(this.result);
      return this.result;
    }

    // Avanza exactamente un paso fijo de 1/60 s.
    step() {
      if (this.state === 'paused' || this.state === 'ended') return;
      const w = this.world; this.time += STEP; this.stateT += STEP;
      if (this.celebrate) { this._tickCelebrate(); }
      if (this.state === 'intro') {
        // la pelota espera quieta durante la cuenta; el reloj NO corre
        const dur = this.introKind === 'start' ? 2.0 : 1.1;
        if (this.stateT >= dur) { this.state = 'play'; this.stateT = 0; audio('whistle'); }
        return;
      }
      if (this.state === 'goal') {
        w.step(STEP, true);
        w.events.forEach(e => this._sfx(e));
        if (this.stateT >= 2.4) { // reanudar sin perder tiempo restante
          this._botSubstitution(); // el juego está detenido por el gol: único momento en que el rival puede cambiar
          w.resetKickoff(); this.bot.reset(); this.celebrate = null; this.state = 'intro'; this.stateT = 0; this.introKind = 'restart';
        }
        return;
      }
      // === juego ===
      const me = w.players[this.userIdx], inp = me.input;
      inp.left = this._held('left'); inp.right = this._held('right');
      inp.jump = this._held('jump'); inp.kick = this._held('kick');
      inp.down = this._held('down'); inp.up = this._held('up');
      if (inp.left && inp.right) { inp.left = inp.right = false; }
      this.bot.update(STEP);
      const events = w.step(STEP, false);
      this.timeLeft = Math.max(0, this.timeLeft - STEP);
      let scored = false;
      for (const e of events) {
        this._sfx(e);
        if (e.type === 'goal' && !scored) { // gol registrado una sola vez (goalLock del mundo + bandera local)
          scored = true; this.score[e.scorer]++;
          audio('goal', 0.9);
          this.celebrate = { t: 0, team: this.teams[e.scorer === 'L' ? 0 : 1], confetti: this._confetti(e.scorer), text: this.teams[e.scorer === 'L' ? 0 : 1].name };
        }
      }
      // Regla de cierre: un gol cuyo cruce ocurre en el mismo paso en que se agota el reloj cuenta (una sola vez);
      // después del silbato final no se registra ningún gol.
      // (si el gol deja menos de un paso de reloj, el partido termina de inmediato en vez de reiniciar con una fracción)
      if (this.timeLeft <= 0 || (scored && this.timeLeft < STEP * 1.5)) { this.timeLeft = 0; this._finish('tiempo'); return; }
      if (scored) { this.state = 'goal'; this.stateT = 0; }
    }

    _sfx(e) {
      if (e.type === 'kick') audio('ball', 0.9);
      else if (e.type === 'touch') audio('ball', Math.min(0.9, 0.25 + e.v / 900));
      else if (e.type === 'bounce') audio('ball', Math.min(0.5, e.v / 1400));
      else if (e.type === 'post') audio('ball', 0.7);
    }
    _confetti(side) {
      const cols = side === 'L' ? [this.teams[0].colors.main, this.teams[0].colors.second, '#fff'] : [this.teams[1].colors.main, this.teams[1].colors.second, '#fff'];
      const arr = []; for (let i = 0; i < 70; i++) arr.push({ x: Math.random() * C.W, y: -Math.random() * 300, vy: 120 + Math.random() * 180, vx: (Math.random() - 0.5) * 80, c: cols[i % cols.length] }); return arr;
    }
    _tickCelebrate() { const c = this.celebrate; c.t += STEP; for (const q of c.confetti) { q.x += q.vx * STEP; q.y += q.vy * STEP; } }

    view() {
      let banner = null;
      if (this.state === 'intro') banner = this.introKind === 'start' ? (this.stateT < 1.2 ? '¡PREPARADOS!' : '¡YA!') : '¡VAMOS!';
      return { world: this.world, teams: this.teams, time: this.time, celebrate: this.celebrate, userSide: this.userIdx, banner };
    }
  }
  Match.DURATION = DURATION; Match.STEP = STEP; Match.MAX_SUBS = MAX_SUBS;
  PC.Match = Match;
  if (typeof module !== 'undefined') module.exports = PC;
})(typeof window !== 'undefined' ? window : globalThis);
