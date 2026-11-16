/* Pingu Cup - inteligencia artificial del rival.
   Máquina de estados con utilidades: ATAQUE, DEFENSA, PERSECUCION, INTERCEPCION, REMATE, DESPEJE, RECUPERACION.
   Usa predicción balística de la pelota (anticipación), tiempos de reacción por dificultad y estabilidad de decisión
   (tiempo mínimo en cada estado). NO hace trampa: usa los mismos controles y la misma física que el jugador. */
(function (root) {
  'use strict';
  const PC = (root.PC = root.PC || {});
  const C = PC.CONST;

  const LEVELS = {
    facil:   { every: 0.30, reaction: 0.30, noise: 40, hold: 0.55, kickMiss: 0.32, jumpMiss: 0.30, look: 1.0, shotVariants: 1, sync: 0.22, commit: 0.25, start: 0.4 },
    normal:  { every: 0.14, reaction: 0.14, noise: 14, hold: 0.30, kickMiss: 0.08, jumpMiss: 0.08, look: 1.5, shotVariants: 2, sync: 0.10, commit: 0.08, start: 0.20 },
    dificil: { every: 0.06, reaction: 0.05, noise: 4,  hold: 0.16, kickMiss: 0.0,  jumpMiss: 0.02, look: 2.0, shotVariants: 3, sync: 0.03, commit: 0.18, start: 0.10 }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const STAND_REACH_Y = C.GROUND - 100;          // altura mínima (centro de pelota) alcanzable sin saltar
  const JUMP_REACH_Y = C.GROUND - 100 - 135;     // altura máxima alcanzable con salto

  class Bot {
    constructor(world, side, level, rng) {
      this.w = world; this.side = side; this.me = world.players[side === 'L' ? 0 : 1]; this.opp = world.players[side === 'L' ? 1 : 0];
      this.lv = LEVELS[level] || LEVELS.normal; this.level = level; this.rng = rng || Math.random;
      this.dir = side === 'L' ? 1 : -1;
      this.ownLine = side === 'L' ? C.GOAL_LINE : C.W - C.GOAL_LINE;
      this.oppLine = side === 'L' ? C.W - C.GOAL_LINE : C.GOAL_LINE;
      this.time = 0; this.hist = []; this.state = 'DEFENSA'; this.stateT = 0; this.nextDecision = 0;
      this.tx = this.me.x; this.noiseX = 0; this.jumpCd = 0; this.stuckT = 0; this.lastX = this.me.x; this.escape = 0;
      this.zoneT = 0; this.shotUntil = 0; this.kickIntent = null; this.pred = []; this.stats = { states: {}, jumps: 0, kicks: 0 };
      this.thinkDelay = this.lv.start + this.lv.reaction; // espera inicial tras cada saque
    }
    reset() { this.hist.length = 0; this.state = 'DEFENSA'; this.stateT = 0; this.nextDecision = this.time; this.thinkDelay = this.time + this.lv.start + this.lv.reaction; this.stuckT = 0; this.escape = 0; this.jumpCd = 0; this.zoneT = 0; this.shotUntil = 0; }

    // Observación con retraso (tiempo de reacción)
    observe() {
      const b = this.w.ball;
      this.hist.push({ t: this.time, x: b.x, y: b.y, vx: b.vx, vy: b.vy });
      while (this.hist.length > 2 && this.hist[1].t <= this.time - this.lv.reaction) this.hist.shift();
      return this.hist[0];
    }

    // Primer muestra de la trayectoria que puedo alcanzar (parado o saltando), para mí o el rival
    firstReach(pred, who) {
      const speed = C.SPEED * who.attrs.speed * 0.93;
      const px = who === this.me ? this.me.x : this.opp.x;
      for (const s of pred) {
        if (s.t < this.lv.reaction * 0.0) continue;
        const dx = Math.abs(s.x - px) - 18;
        const moveT = Math.max(0, dx) / speed;
        if (s.y > STAND_REACH_Y && s.y < C.GROUND - C.BALL_R + 2 && moveT <= s.t + 0.04) return { t: s.t, s: s, jump: false };
        if (s.y <= STAND_REACH_Y && s.y > JUMP_REACH_Y && s.t > 0.2 && moveT <= s.t - 0.05) return { t: s.t, s: s, jump: true };
      }
      return null;
    }

    decide(obs) {
      const lv = this.lv, me = this.me, opp = this.opp, dir = this.dir;
      const lead = lv.reaction;                              // la observación tiene este retraso
      const full = PC.Physics.predictBall(obs, lv.look + lead, 1 / 30);
      // la muestra con t >= lead representa el "ahora": se descartan las anteriores y se reindexa
      this.pred = full.filter(s => s.t >= lead).map(s => ({ t: s.t - lead, x: s.x, y: s.y, vx: s.vx, vy: s.vy }));
      const pred = this.pred; if (!pred.length) return;
      const now = pred[0];
      const p = clamp(((now.x - this.ownLine) * dir) / ((this.oppLine - this.ownLine) * dir), 0, 1); // 0 = mi arco, 1 = arco rival
      const speedBall = Math.hypot(now.vx, now.vy);

      // ¿amenaza sobre mi arco? (anticipación del cruce de la línea)
      let danger = null;
      for (const s of pred) {
        const inMouth = s.y - C.BALL_R > PC.Physics.ROOF_Y - 40 && s.y < C.GROUND;
        const atLine = this.side === 'L' ? s.x < C.GOAL_LINE + 70 : s.x > C.W - C.GOAL_LINE - 70;
        if (inMouth && atLine) { danger = s; break; }
      }
      const towardMe = now.vx * -dir > 90;
      const mine = this.firstReach(pred, me), theirs = this.firstReach(pred, opp);
      const myT = mine ? mine.t : 9, oppT = theirs ? theirs.t : 9;
      const nearOwn = p < 0.34;

      this.noiseX = (this.rng() * 2 - 1) * lv.noise;
      let next = 'DEFENSA', tx = this.defendX(now, p), why = '';
      const behindBall = (now.x - me.x) * dir > 14; // la pelota está delante mía (hacia el arco rival)

      if (danger && towardMe && speedBall > 160 && (danger.t < 1.1) && !(mine && mine.t < danger.t - 0.05 && behindBall)) {
        next = 'INTERCEPCION';
        const s = danger; tx = clamp(s.x + dir * (C.HEAD_R + C.BALL_R + 2), C.MIN_X, C.MAX_X);
        if (mine && mine.t <= danger.t) tx = clamp(mine.s.x - dir * 30, C.MIN_X, C.MAX_X);
      } else if (mine && myT <= oppT + (nearOwn ? 0.30 : this.lv.commit)) {
        const hit = mine.s;
        if (behindBall || Math.abs(now.x - me.x) < 20) {
          next = nearOwn ? 'DESPEJE' : 'ATAQUE';
          tx = clamp(hit.x - dir * (nearOwn ? 38 : 34), C.MIN_X, C.MAX_X);
        } else { // la pelota quedó a mis espaldas: volver a ponerme detrás de ella
          next = 'PERSECUCION';
          tx = clamp(hit.x - dir * 60, C.MIN_X, C.MAX_X);
        }
      } else if (!mine && now.vx * dir > -60 && p > 0.30 && p < 0.8 && Math.abs(now.x - me.x) < 260 && speedBall < 150) {
        next = 'PERSECUCION'; tx = clamp(now.x - dir * 50, C.MIN_X, C.MAX_X);       // pelota lenta en el medio: ir a disputarla
      }
      if (this.escape > this.time) { next = 'RECUPERACION'; tx = C.W / 2 - dir * 40; }
      this.setState(next, tx, danger);
    }

    defendX(now, p) {
      const dir = this.dir;
      const goalSide = now.x - dir * 85;                       // entre la pelota y mi arco
      const home = this.ownLine + dir * (98 + 190 * p);
      let x = p < 0.5 ? Math.min(Math.max(goalSide * 1, 0), 9999) : home;
      if (p < 0.5) { x = dir > 0 ? Math.max(goalSide, this.ownLine + 96) : Math.min(goalSide, this.ownLine - 96); }
      return clamp(x, C.MIN_X, C.MAX_X);
    }

    setState(next, tx, danger) {
      const urgent = next === 'INTERCEPCION' || (this.state !== 'INTERCEPCION' && next === 'DESPEJE');
      if (next !== this.state && this.stateT < this.lv.hold && !urgent && this.time > this.shotUntil) {
        // mantener el estado actual, pero refrescar el objetivo si es el mismo tipo de movimiento
        return;
      }
      if (next !== this.state) { this.state = next; this.stateT = 0; }
      this.tx = tx;
    }

    // Cada fotograma
    update(dt) {
      this.time += dt; this.stateT += dt;
      const me = this.me, opp = this.opp, b = this.w.ball, inp = me.input;
      inp.left = inp.right = inp.jump = inp.kick = inp.up = inp.down = false;
      const obs = this.observe();
      if (this.time < this.thinkDelay) { this.stats.states['ESPERA'] = (this.stats.states['ESPERA'] || 0) + dt; return; }
      if (this.time >= this.nextDecision) { this.nextDecision = this.time + this.lv.every; this.decide(obs); }
      this.stats.states[this.state] = (this.stats.states[this.state] || 0) + dt;

      // atascos: si no avanzo hacia un objetivo lejano durante 1 s, me reposiciono
      if (Math.abs(me.x - this.lastX) < 2 && Math.abs(this.tx - me.x) > 60) this.stuckT += dt; else this.stuckT = 0;
      this.lastX = me.x;
      if (this.stuckT > 1.0) { this.escape = this.time + 0.9; this.stuckT = 0; this.tx = C.W / 2; if (me.onGround) inp.jump = true; }

      // movimiento hacia el objetivo (con frenado anticipado)
      const target = this.tx + (this.state === 'DEFENSA' ? 0 : this.noiseX * 0.5);
      const ahead = target - (me.x + me.vx * 0.09);
      const dead = this.state === 'DEFENSA' || this.state === 'RECUPERACION' ? 10 : 5;
      if (ahead > dead) inp.right = true; else if (ahead < -dead) inp.left = true;

      this.tryJump(dt);
      this.tryKick(dt);
    }

    tryJump(dt) {
      const me = this.me;
      if (this.jumpCd > 0) { this.jumpCd -= dt; return; }
      if (!me.onGround || this.escape > this.time || !this.pred.length) return;
      const jv = C.JUMP_V * me.attrs.jump;
      for (let t = 0.14; t <= 0.7; t += 0.04) {
        const s = this.pred[Math.min(this.pred.length - 1, Math.round(t * 30))];
        if (!s || s.y > STAND_REACH_Y + 10) continue;                     // alcanzable parado: no salto
        const px = me.x + me.vx * Math.min(t, 0.35) * 0.8;
        const headY = C.GROUND - C.HEAD_OFF - (jv * t - 0.5 * C.GRAVITY * t * t);
        if (Math.abs(s.x - px) < 30 && Math.abs(s.y - headY) < 20 && s.y > C.GROUND - 100 - 140 && s.vy > -200) {
          if (this.rng() < this.lv.jumpMiss) { this.jumpCd = 0.3; return; }
          me.input.jump = true; this.jumpCd = 0.9; this.stats.jumps++; return;
        }
      }
      // hop para pasar por encima de una pelota que quedó atrás y rueda hacia mí (evita empujarla a mi arco)
      const b = this.w.ball, dir = this.dir;
      if (this.state === 'PERSECUCION' && b.y > C.GROUND - 30 && (b.x - me.x) * dir < -8 && Math.abs(b.x - me.x) < 62 && Math.abs(b.vx) < 120 && me.vx * dir < -20) {
        me.input.jump = true; this.jumpCd = 0.6; this.stats.jumps++;
      }
    }

    tryKick(dt) {
      const me = this.me, b = this.w.ball, dir = this.dir;
      if (me.kickT > 0 || me.kickCd > 0) return;
      // ¿alcanzará el pie a la pelota durante la ventana activa de la patada? (cinemática real del swing)
      let inRange = false;
      for (const kt of [0.05, 0.09, 0.13, 0.17]) {
        const sw = Math.sin(Math.PI * kt / C.KICK_DUR);
        const bx = b.x + b.vx * kt, by = b.y + b.vy * kt + 0.5 * C.BALL_G * kt * kt;
        const fx = me.x + me.vx * kt + dir * (26 + 24 * sw) * me.attrs.reach, fy = me.y + Math.min(0, me.vy) * kt - 8 - 22 * sw;
        if (Math.hypot(bx - fx, by - fy) < C.FOOT_R + C.BALL_R - 3) { inRange = true; break; }
      }
      if (!inRange) { this.zoneT = 0; return; }
      this.zoneT += dt;
      if (this.zoneT < this.lv.sync) return;                              // sincronización según dificultad
      if (this.rng() < this.lv.kickMiss * (dt * 60 > 0 ? 0.05 : 1)) return; // fallos esporádicos (poco por fotograma)
      // ¿mirando al lado correcto?
      if (me.facing !== dir) { if (dir > 0) me.input.right = true; else me.input.left = true; return; }
      // elegir tipo de tiro simulando la trayectoria (anticipación)
      const choice = this.chooseShot(b, me);
      if (choice === 'low') me.input.down = true; else if (choice === 'lob') me.input.up = true;
      me.input.kick = true; this.stats.kicks++;
      const nearOwn = Math.abs(b.x - this.ownLine) < 260;
      this.state = nearOwn ? 'DESPEJE' : 'REMATE'; this.stateT = 0; this.shotUntil = this.time + 0.35;
    }

    chooseShot(b, me) {
      const dir = this.dir, opp = this.opp;
      const nearOwn = Math.abs(b.x - this.ownLine) < 230;
      const variants = nearOwn ? ['lob', 'neutral'] : ['neutral', 'low', 'lob'].slice(0, this.lv.shotVariants);
      let best = variants[0], bestScore = -1e9;
      for (const v of variants) {
        const ang = ((v === 'low' ? C.KICK_ANGLE_LOW : v === 'lob' ? C.KICK_ANGLE_LOB : C.KICK_ANGLE) * Math.PI) / 180;
        const pow = (v === 'low' ? C.KICK_POWER_LOW : v === 'lob' ? C.KICK_POWER_LOB : C.KICK_POWER) * me.attrs.kick;
        const sim = PC.Physics.predictBall({ x: b.x, y: b.y, vx: dir * Math.cos(ang) * pow + me.vx * 0.25, vy: -Math.sin(ang) * pow }, 1.8, 1 / 30);
        let score = 0, blocked = false;
        for (const s of sim) {
          const oppHeadX = opp.x + opp.vx * s.t * 0.5, oppHeadY = opp.y - C.HEAD_OFF;
          if (!blocked && Math.hypot(s.x - oppHeadX, s.y - oppHeadY) < 44 && s.t > 0.1) { blocked = true; score -= 2.2; }
          const crossed = dir > 0 ? s.x + C.BALL_R < C.GOAL_LINE : s.x - C.BALL_R > C.W - C.GOAL_LINE;
          const crossedOwn = dir > 0 ? s.x + C.BALL_R < this.ownLine - 0 : false;
          const atOppLine = dir > 0 ? s.x > C.W - C.GOAL_LINE - 14 : s.x < C.GOAL_LINE + 14;
          if (atOppLine && s.y - C.BALL_R > PC.Physics.ROOF_BOTTOM && s.y < C.GROUND) { score += 3; break; }
          if (atOppLine) { score += 0.3; break; }
        }
        const last = sim[sim.length - 1];
        score += ((last.x - b.x) * dir) / 400;                                // progreso hacia el arco rival
        if (nearOwn && v === 'lob') score += 0.8;                             // despeje alto y lejos
        if (score > bestScore) { bestScore = score; best = v; }
      }
      return best;
    }
  }

  PC.AI = { Bot, LEVELS };
  if (typeof module !== 'undefined') module.exports = PC;
})(typeof window !== 'undefined' ? window : globalThis);
