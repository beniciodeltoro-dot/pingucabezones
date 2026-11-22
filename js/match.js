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
      // Modo online (anfitrión): el rival es una persona, sin IA, sin cambios de jugador ni pausa libre.
      this.online = !!opts.online; this.sfxLog = this.online ? [] : null; this.seq = 0; this.remoteIn = 0; this.remoteAge = 0; this.forfeitSide = null;
      this.world = new PC.Physics.World(opts.leftPlayer, opts.rightPlayer);
      this.teams = [PC.TEAMS[opts.leftTeam], PC.TEAMS[opts.rightTeam]];
      this.score = { L: 0, R: 0 }; this.timeLeft = DURATION; this.time = 0;
      this.state = 'intro'; this.stateT = 0; this.celebrate = null; this.ended = false; this.endReason = null; this.result = null;
      this.keys = new Set();
      const botSide = opts.userSide === 'L' ? 'R' : 'L';
      this.bot = this.online ? null : new PC.AI.Bot(this.world, botSide, opts.difficulty, opts.rng);
      this.world.resetKickoff();
      this.introKind = 'start';
      this.stats = { goalsL: 0, goalsR: 0 };
      this.onEnd = opts.onEnd || function () {};
      // Cambios de jugador: 2 por equipo y por partido.
      this.rng = opts.rng || Math.random;
      this.subsLeft = { user: MAX_SUBS, rival: MAX_SUBS };
      this.onSub = opts.onSub || function () {};
      this.snd('whistle');
    }
    // Sonido local; en online también se registra para enviárselo al invitado.
    snd(n, v) { audio(n, v); if (this.sfxLog && this.sfxLog.length < 40) this.sfxLog.push([n, v == null ? 0.7 : Math.round(v * 100) / 100]); }
    get userIdx() { return this.userSide === 'L' ? 0 : 1; }

    keyDown(code) { this.keys.add(code); }
    keyUp(code) { this.keys.delete(code); }
    clearKeys() { this.keys.clear(); }
    _held(name) { return KEYS[name].some(k => this.keys.has(k)); }

    pause() { if (this.online) return false; if (this.state === 'play' || this.state === 'intro' || this.state === 'goal') { this.prevState = this.state; this.state = 'paused'; this.clearKeys(); PC.Audio && PC.Audio.pauseMatch(true); return true; } return false; }
    resume() { if (this.state === 'paused') { this.state = this.prevState || 'play'; this.clearKeys(); PC.Audio && PC.Audio.pauseMatch(false); return true; } return false; }

    // Jugadores del plantel del usuario que puede poner en cancha (todos menos el actual).
    userBench() {
      const cur = this.world.players[this.userIdx].def;
      return PC.teamPlayers(cur.team).filter(p => p.id !== cur.id);
    }
    canUserSub() { return !this.ended && !this.online && this.subsLeft.user > 0; }
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
      this.score[u] = fs.user; this.score[r] = fs.rival; this.forfeitSide = u;
      return this._finish('abandono');
    }

    // Online: pierde por abandono o desconexión el lado `side` ('L' | 'R'). Mismo criterio que el abandono offline.
    forfeitBy(side) {
      if (this.ended) return this.result;
      const o = side === 'L' ? 'R' : 'L', fs = PC.League.forfeitScore(this.score[side], this.score[o]);
      this.score[side] = fs.user; this.score[o] = fs.rival; this.forfeitSide = side;
      return this._finish('abandono');
    }
    // Online: entrada del rival humano como máscara de bits (ver Match.BITS).
    setRemoteInput(mask) { this.remoteIn = (mask | 0) & 63; this.remoteAge = 0; }
    _applyRemote() {
      const r = this.world.players[1 - this.userIdx], B = Match.BITS, k = (++this.remoteAge > 36) ? 0 : this.remoteIn; // sin datos > 0,6 s: se sueltan las teclas
      const i = r.input; i.left = !!(k & B.left); i.right = !!(k & B.right); i.jump = !!(k & B.jump); i.kick = !!(k & B.kick); i.up = !!(k & B.up); i.down = !!(k & B.down);
      if (i.left && i.right) i.left = i.right = false;
    }
    // Online: estado compacto que el anfitrión envía al invitado en cada paso.
    snapshot() {
      const w = this.world, r1 = n => Math.round(n * 10) / 10, b = w.ball;
      const pl = w.players.map(p => [r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy), p.facing, p.onGround ? 1 : 0, Math.round(p.kickT * 1000) / 1000]);
      const bn = Match.BANNERS.indexOf(this.view().banner);
      return { q: ++this.seq, s: Math.max(0, Match.STATE_NAMES.indexOf(this.state)), t: Math.round(this.timeLeft * 1000), sc: [this.score.L, this.score.R],
        b: [r1(b.x), r1(b.y), Math.round(b.rot * 100) / 100], p: pl, bn: Math.max(0, bn),
        g: this.celebrate ? (this.celebrate.team === this.teams[0] ? 0 : 1) : -1, ev: this.sfxLog ? this.sfxLog.splice(0) : [] };
    }

    _finish(reason) {
      if (this.ended) return this.result;
      this.ended = true; this.state = 'ended'; this.endReason = reason; this.clearKeys();
      this.celebrate = null;
      this.world.players.forEach(p => { p.vx = 0; p.vy = 0; p.input = { left: false, right: false, jump: false, kick: false, up: false, down: false }; });
      this.result = { homeGoals: this.score.L, awayGoals: this.score.R, reason: reason, forfeit: reason === 'abandono', forfeitBy: this.forfeitSide };
      if (reason !== 'abandono') this.snd('final');
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
        if (this.stateT >= dur) { this.state = 'play'; this.stateT = 0; this.snd('whistle'); }
        return;
      }
      if (this.state === 'goal') {
        w.step(STEP, true);
        w.events.forEach(e => this._sfx(e));
        if (this.stateT >= 2.4) { // reanudar sin perder tiempo restante
          if (this.bot) this._botSubstitution(); // el juego está detenido por el gol: único momento en que el rival puede cambiar
          w.resetKickoff(); if (this.bot) this.bot.reset(); this.celebrate = null; this.state = 'intro'; this.stateT = 0; this.introKind = 'restart';
        }
        return;
      }
      // === juego ===
      const me = w.players[this.userIdx], inp = me.input;
      inp.left = this._held('left'); inp.right = this._held('right');
      inp.jump = this._held('jump'); inp.kick = this._held('kick');
      inp.down = this._held('down'); inp.up = this._held('up');
      if (inp.left && inp.right) { inp.left = inp.right = false; }
      if (this.bot) this.bot.update(STEP); else this._applyRemote();
      const events = w.step(STEP, false);
      this.timeLeft = Math.max(0, this.timeLeft - STEP);
      let scored = false;
      for (const e of events) {
        this._sfx(e);
        if (e.type === 'goal' && !scored) { // gol registrado una sola vez (goalLock del mundo + bandera local)
          scored = true; this.score[e.scorer]++;
          this.snd('goal', 0.9);
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
      if (e.type === 'kick') this.snd('ball', 0.9);
      else if (e.type === 'touch') this.snd('ball', Math.min(0.9, 0.25 + e.v / 900));
      else if (e.type === 'bounce') this.snd('ball', Math.min(0.5, e.v / 1400));
      else if (e.type === 'post') this.snd('ball', 0.7);
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
  Match.BITS = { left: 1, right: 2, jump: 4, kick: 8, up: 16, down: 32 };
  Match.STATE_NAMES = ['intro', 'play', 'goal', 'ended'];
  Match.BANNERS = [null, '¡PREPARADOS!', '¡YA!', '¡VAMOS!'];
  PC.Match = Match;
  if (typeof module !== 'undefined') module.exports = PC;
})(typeof window !== 'undefined' ? window : globalThis);
