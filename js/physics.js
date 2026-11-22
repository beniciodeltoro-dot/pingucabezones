/* Pingu Cup - motor físico del partido (sin dependencias de DOM; se prueba en Node).
   Mundo lógico 800x550 px, paso fijo 1/60 s dividido en subpasos para evitar atravesamientos. */
(function (root) {
  'use strict';
  const PC = (root.PC = root.PC || {});

  const C = PC.CONST = {
    W: 800, H: 550, GROUND: 490,
    BALL_R: 11, BALL_G: 1000, BALL_E_GROUND: 0.72, BALL_E_WALL: 0.78, BALL_E_BAR: 0.62, BALL_E_HEAD: 0.86,
    BALL_MAX_V: 1250, BALL_AIR_DRAG: 0.06, BALL_ROLL_DRAG: 0.55, CEILING: -420,
    GOAL_ROOF_X: 62, GOAL_LINE: 56, GOAL_H: 137, BAR_T: 8,
    HEAD_R: 30, HEAD_OFF: 46, LEGS_R: 14, LEGS_OFF: 13,
    SPEED: 300, ACCEL_GROUND: 3600, ACCEL_AIR: 1500, JUMP_V: 760, GRAVITY: 2100,
    MIN_X: 38, MAX_X: 762,
    KICK_DUR: 0.28, KICK_ACTIVE_FROM: 0.04, KICK_ACTIVE_TO: 0.20, KICK_COOLDOWN: 0.42, FOOT_R: 15, FOOT_REST_R: 11,
    KICK_POWER: 720, KICK_POWER_LOW: 800, KICK_POWER_LOB: 640,
    KICK_ANGLE: 32, KICK_ANGLE_LOW: 9, KICK_ANGLE_LOB: 58,
    SUBSTEPS: 8, BUMP_V: 140
  };
  const ROOF_Y = C.GROUND - C.GOAL_H;           // borde superior del travesaño
  const ROOF_BOTTOM = ROOF_Y + C.BAR_T;

  function makePlayer(side, def) {
    const pos = PC.POSITIONS[def.pos] || PC.POSITIONS.Mediocampo;
    return {
      side: side,                    // 'L' defiende el arco izquierdo y ataca a la derecha
      def: def, attrs: pos,
      x: side === 'L' ? 250 : 550, y: C.GROUND, vx: 0, vy: 0, bumpVx: 0,
      facing: side === 'L' ? 1 : -1, onGround: true,
      kickT: 0, kickCd: 0, kickHit: false,
      input: { left: false, right: false, jump: false, kick: false, up: false, down: false },
      contactT: 0, jumpHeld: false
    };
  }

  function footCenter(p) {
    const s = p.kickT > 0 ? Math.sin(Math.PI * Math.min(1, p.kickT / C.KICK_DUR)) : 0;
    const reach = p.attrs.reach;
    return {
      x: p.x + p.facing * (26 + 24 * s) * reach,
      y: p.y - 8 - 22 * s,
      r: p.kickT > 0 ? C.FOOT_R : C.FOOT_REST_R
    };
  }
  function kickActive(p) { return p.kickT >= C.KICK_ACTIVE_FROM && p.kickT <= C.KICK_ACTIVE_TO; }

  class World {
    constructor(leftDef, rightDef) {
      this.players = [makePlayer('L', leftDef), makePlayer('R', rightDef)];
      this.ball = { x: C.W / 2, y: 220, vx: 0, vy: 0, rot: 0 };
      this.events = [];
      this.goalLock = false;       // true cuando ya se registró un gol en esta jugada
      this.lastTouch = null;
    }
    // Cambio de jugador: reemplaza la identidad (foto, dorsal) y los atributos de posición.
    // Conserva posición, velocidad y estado físico; la hitbox es igual para todos.
    setPlayer(idx, def) {
      const p = this.players[idx]; if (!p || !def) return false;
      p.def = def; p.attrs = PC.POSITIONS[def.pos] || PC.POSITIONS.Mediocampo; return true;
    }
    resetKickoff() {
      const [l, r] = this.players;
      [l, r].forEach(p => {
        p.y = C.GROUND; p.vx = 0; p.vy = 0; p.bumpVx = 0; p.onGround = true;
        p.kickT = 0; p.kickCd = 0; p.kickHit = false; p.contactT = 0; p.jumpHeld = false;
        p.input = { left: false, right: false, jump: false, kick: false, up: false, down: false };
      });
      l.x = 250; l.facing = 1; r.x = 550; r.facing = -1;
      Object.assign(this.ball, { x: C.W / 2, y: 220, vx: 0, vy: 0, rot: 0 });
      this.goalLock = false; this.lastTouch = null;
    }

    // Avanza dt segundos. `frozen` = los jugadores no responden (celebración); la pelota sigue rodando.
    step(dt, frozen) {
      this.events.length = 0;
      const n = C.SUBSTEPS, h = dt / n;
      for (const p of this.players) this._prepPlayer(p, dt, frozen);
      for (let i = 0; i < n; i++) {
        for (const p of this.players) this._movePlayer(p, h);
        this._playerVsPlayer();
        this._moveBall(h);
        this._ballVsStatics();
        for (const p of this.players) this._ballVsPlayer(p);
        this._ballVsStatics();
        this._resolveSqueeze();
        this._checkGoal();
      }
      this.ball.rot += (this.ball.vx * dt) / C.BALL_R;
      // pelota "muerta": si queda inmóvil en el suelo más de 3 s sin que nadie pueda moverla, se eleva suavemente
      const bb = this.ball;
      if (!frozen && Math.hypot(bb.vx, bb.vy) < 12 && bb.y > C.GROUND - C.BALL_R - 3) {
        this.deadT = (this.deadT || 0) + dt;
        if (this.deadT > 3) { this.deadT = 0; bb.vy = -430; bb.vx = (bb.x < C.W / 2 ? 1 : -1) * 90; this.events.push({ type: 'nudge' }); }
      } else this.deadT = 0;
      for (const p of this.players) this._postPlayer(p, dt);
      return this.events;
    }

    _prepPlayer(p, dt, frozen) {
      const inp = frozen ? { left: false, right: false, jump: false, kick: false, up: false, down: false } : p.input;
      p._in = inp;
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir !== 0) p.facing = dir;
      const target = dir * C.SPEED * p.attrs.speed;
      const acc = (p.onGround ? C.ACCEL_GROUND : C.ACCEL_AIR) * dt;
      if (p.vx < target) p.vx = Math.min(target, p.vx + acc);
      else if (p.vx > target) p.vx = Math.max(target, p.vx - acc);
      if (dir === 0 && p.onGround && Math.abs(p.vx) < 1) p.vx = 0;
      // salto: solo desde el suelo y al pulsar (no se repite manteniendo la tecla)
      if (inp.jump && p.onGround && !p.jumpHeld) { p.vy = -C.JUMP_V * p.attrs.jump; p.onGround = false; this.events.push({ type: 'jump', side: p.side }); }
      p.jumpHeld = !!inp.jump;
      // patada
      if (p.kickCd > 0) p.kickCd = Math.max(0, p.kickCd - dt);
      if (p.kickT > 0) { p.kickT += dt; if (p.kickT >= C.KICK_DUR) { p.kickT = 0; p.kickHit = false; } }
      if (inp.kick && p.kickT === 0 && p.kickCd === 0) { p.kickT = 1e-6; p.kickCd = C.KICK_COOLDOWN; p.kickHit = false; }
    }

    _movePlayer(p, h) {
      if (!p.onGround) p.vy += C.GRAVITY * h;
      p.x += (p.vx + p.bumpVx) * h;
      p.y += p.vy * h;
      if (p.y >= C.GROUND) { p.y = C.GROUND; p.vy = 0; p.onGround = true; } else p.onGround = false;
      this._headVsRoof(p, 0, C.GOAL_ROOF_X); this._headVsRoof(p, C.W - C.GOAL_ROOF_X, C.W);
      if (p.x < C.MIN_X) { p.x = C.MIN_X; if (p.vx < 0) p.vx = 0; if (p.bumpVx < 0) p.bumpVx = 0; }
      if (p.x > C.MAX_X) { p.x = C.MAX_X; if (p.vx > 0) p.vx = 0; if (p.bumpVx > 0) p.bumpVx = 0; }
    }
    // La cabeza del jugador también choca con el techo del arco (travesaño): no lo atraviesa al saltar.
    _headVsRoof(p, x0, x1) {
      const hy = p.y - C.HEAD_OFF;
      const cx = Math.max(x0, Math.min(p.x, x1)), cy = Math.max(ROOF_Y, Math.min(hy, ROOF_BOTTOM));
      let dx = p.x - cx, dy = hy - cy, d = Math.hypot(dx, dy);
      if (d >= C.HEAD_R) return;
      if (d < 1e-6) { dx = 0; dy = 1; d = 1; } // cabeza con el centro dentro del techo: empujar hacia abajo
      const nx = dx / d, ny = dy / d, over = C.HEAD_R - d;
      p.x += nx * over; p.y += ny * over;
      if (ny > 0.4 && p.vy < 0) p.vy = 0;
      if (Math.abs(nx) > 0.5) { if (nx * p.vx < 0) p.vx = 0; }
      if (p.y > C.GROUND) p.y = C.GROUND;
    }
    _postPlayer(p, dt) {
      p.bumpVx *= Math.max(0, 1 - 9 * dt);
      if (Math.abs(p.bumpVx) < 2) p.bumpVx = 0;
    }

    // Colisión entre jugadores: se separan sin transferir impulso; el choque genera un pequeño rebote
    // que anula el "empujar continuamente" al rival.
    _playerVsPlayer() {
      const a = this.players[0], b = this.players[1];
      const ay = a.y - C.HEAD_OFF, by = b.y - C.HEAD_OFF;
      const dx = b.x - a.x, dy = by - ay;
      const d = Math.hypot(dx, dy), min = C.HEAD_R * 2 * 0.92;
      if (d < min && d > 1e-6) {
        const nx = dx / d, ny = dy / d, over = min - d;
        if (Math.abs(nx) > 0.35) {              // solapamiento mayormente horizontal
          const sx = Math.sign(dx) || 1;
          // el que avanza contra el otro queda bloqueado; el que está quieto no es arrastrado
          const va = Math.max(0, a.vx * sx), vb = Math.max(0, -b.vx * sx);
          const shareA = va + vb > 1e-6 ? va / (va + vb) : 0.5;
          a.x -= sx * over * shareA; b.x += sx * over * (1 - shareA);
          if (va > 0) { a.bumpVx = -sx * C.BUMP_V; a.vx *= 0.3; }   // rebota quien embiste
          if (vb > 0) { b.bumpVx = sx * C.BUMP_V; b.vx *= 0.3; }
        } else {                                 // uno cae encima del otro: se deslizan hacia los costados
          const upper = ay < by ? a : b, lower = upper === a ? b : a;
          const sx = Math.sign(upper.x - lower.x) || (upper === a ? -1 : 1);
          upper.y -= over * Math.abs(ny) * 0.5; upper.x += sx * over * 0.6; lower.x -= sx * over * 0.2;
          upper.bumpVx = sx * C.BUMP_V * 1.4;
          if (upper.y > C.GROUND) upper.y = C.GROUND;
        }
        [a, b].forEach(p => { p.x = Math.max(C.MIN_X, Math.min(C.MAX_X, p.x)); });
      }
    }

    _moveBall(h) {
      const b = this.ball;
      b.vy += C.BALL_G * h;
      const drag = 1 - C.BALL_AIR_DRAG * h;
      b.vx *= drag; b.vy *= drag;
      b.x += b.vx * h; b.y += b.vy * h;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > C.BALL_MAX_V) { b.vx *= C.BALL_MAX_V / sp; b.vy *= C.BALL_MAX_V / sp; }
    }

    _ballVsStatics() {
      const b = this.ball, R = C.BALL_R;
      // suelo
      if (b.y + R > C.GROUND) {
        b.y = C.GROUND - R;
        if (b.vy > 0) {
          if (b.vy > 70) { this.events.push({ type: 'bounce', v: b.vy }); b.vy = -b.vy * C.BALL_E_GROUND; } else b.vy = 0;
        }
        b.vx *= 1 - C.BALL_ROLL_DRAG * (1 / 60 / C.SUBSTEPS) * 6;
        if (Math.abs(b.vx) < 3 && b.vy === 0) b.vx = 0;
      }
      // techo
      if (b.y - R < C.CEILING) { b.y = C.CEILING + R; if (b.vy < 0) b.vy = -b.vy * 0.6; }
      // paredes (fondo de las redes)
      if (b.x - R < 0) { b.x = R; if (b.vx < 0) { b.vx = -b.vx * C.BALL_E_WALL; this.events.push({ type: 'wall' }); } }
      if (b.x + R > C.W) { b.x = C.W - R; if (b.vx > 0) { b.vx = -b.vx * C.BALL_E_WALL; this.events.push({ type: 'wall' }); } }
      // travesaños (rectángulo del techo de cada arco, con esquinas redondeadas por el cálculo de punto más cercano)
      this._ballVsRect(0, ROOF_Y, C.GOAL_ROOF_X, ROOF_BOTTOM);
      this._ballVsRect(C.W - C.GOAL_ROOF_X, ROOF_Y, C.W, ROOF_BOTTOM);
    }
    _ballVsRect(x0, y0, x1, y1) {
      const b = this.ball, R = C.BALL_R;
      const cx = Math.max(x0, Math.min(b.x, x1)), cy = Math.max(y0, Math.min(b.y, y1));
      let dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
      if (d >= R) return;
      if (d < 1e-6) { // centro dentro del rectángulo: expulsar por el lado más cercano
        const toTop = b.y - y0, toBot = y1 - b.y, toL = b.x - x0, toR = x1 - b.x;
        const m = Math.min(toTop, toBot, toL, toR);
        if (m === toTop) { dx = 0; dy = -1; b.y = y0 - R; }
        else if (m === toBot) { dx = 0; dy = 1; b.y = y1 + R; }
        else if (m === toL) { dx = -1; dy = 0; b.x = x0 - R; }
        else { dx = 1; dy = 0; b.x = x1 + R; }
        d = 1;
      } else { dx /= d; dy /= d; b.x = cx + dx * R; b.y = cy + dy * R; }
      const vn = b.vx * dx + b.vy * dy;
      if (vn < 0) { b.vx -= (1 + C.BALL_E_BAR) * vn * dx; b.vy -= (1 + C.BALL_E_BAR) * vn * dy; if (-vn > 80) this.events.push({ type: 'post', v: -vn }); }
    }

    _ballVsPlayer(p) {
      const b = this.ball, R = C.BALL_R;
      // 1) patada activa (con potencia y trayectoria diferenciadas)
      if (kickActive(p) && !p.kickHit) {
        const f = footCenter(p);
        const dx = b.x - f.x, dy = b.y - f.y, d = Math.hypot(dx, dy);
        if (d <= f.r + R + 3) {
          const inp = p._in;
          let ang = C.KICK_ANGLE, pow = C.KICK_POWER;
          if (inp.down) { ang = C.KICK_ANGLE_LOW; pow = C.KICK_POWER_LOW; }
          else if (inp.up) { ang = C.KICK_ANGLE_LOB; pow = C.KICK_POWER_LOB; }
          pow *= p.attrs.kick;
          const a = (ang * Math.PI) / 180;
          b.vx = p.facing * Math.cos(a) * pow + p.vx * 0.25;
          b.vy = -Math.sin(a) * pow + Math.min(0, p.vy) * 0.2;
          p.kickHit = true; this.lastTouch = p.side;
          const push = f.r + R + 1; // sacar la pelota del pie
          b.x = f.x + p.facing * push * 0.3 + (b.x - f.x) * 0.0 + (d > 1e-6 ? (dx / d) * push * 0.7 : 0);
          this.events.push({ type: 'kick', side: p.side, power: pow });
          return;
        }
      }
      // 2) colisiones sólidas: cabeza, piernas y pie en reposo
      const f = footCenter(p);
      const circles = [
        { x: p.x, y: p.y - C.HEAD_OFF, r: C.HEAD_R, e: C.BALL_E_HEAD, head: true },
        { x: p.x, y: p.y - C.LEGS_OFF, r: C.LEGS_R, e: 0.55 }
      ]; // el pie solo actúa como golpeo (arriba): no es sólido, para que la pelota no quede encajada entre cabeza y pie
      let touched = false;
      for (const c of circles) {
        const dx = b.x - c.x, dy = b.y - c.y;
        const d = Math.hypot(dx, dy), min = c.r + R;
        if (d >= min) continue;
        let nx, ny;
        if (d < 1e-6) { nx = 0; ny = -1; } else { nx = dx / d; ny = dy / d; }
        b.x = c.x + nx * min; b.y = c.y + ny * min;
        if (b.y + R > C.GROUND) { // empujada contra el suelo: deslizar horizontalmente para salir (evita quedar encajada)
          b.y = C.GROUND - R;
          const ddy = b.y - c.y;
          if (Math.abs(ddy) < min) { const sx = (b.x - c.x) >= 0 ? 1 : -1; b.x = c.x + sx * Math.sqrt(min * min - ddy * ddy); nx = sx * Math.sqrt(Math.max(0, 1 - (ddy / min) * (ddy / min))); ny = ddy / min; }
        }
        const rvx = b.vx - p.vx, rvy = b.vy - p.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          b.vx -= (1 + c.e) * vn * nx; b.vy -= (1 + c.e) * vn * ny;
          if (c.head) { // golpe de cabeza: mínimo de velocidad saliente para que no quede "muerta"
            const out = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
            if (out < 260) { b.vx += (260 - out) * nx; b.vy += (260 - out) * ny; }
            // si la pelota queda equilibrada arriba de la cabeza, se la desvía
            if (Math.abs(nx) < 0.18 && Math.hypot(b.vx, b.vy) < 330) b.vx += (nx >= 0 ? 1 : -1) * 120 + p.vx * 0.3;
          }
          if (-vn > 60) this.events.push({ type: 'touch', side: p.side, v: -vn });
        }
        touched = true; this.lastTouch = p.side;
      }
      // anti-pegado: si la pelota permanece en contacto lento demasiado tiempo, se la despide
      if (touched && Math.hypot(b.vx - p.vx, b.vy - p.vy) < 150) {
        p.contactT += 1 / 60 / C.SUBSTEPS;
        if (p.contactT > 0.7) {
          const dir = p.side === 'L' ? 1 : -1;
          b.vx = dir * 260 + (b.x < p.x ? -1 : 1) * 120; b.vy = -460; p.contactT = 0;
        }
      } else if (!touched) p.contactT = Math.max(0, p.contactT - 0.01);
    }

    // Si la pelota quedó aplastada entre un jugador y el suelo/pared/travesaño, se la libera hacia arriba.
    _resolveSqueeze() {
      const b = this.ball, R = C.BALL_R;
      // pelota encajada dentro de una cabeza (resoluciones contradictorias): se la expulsa hacia arriba
      for (const p of this.players) {
        const dx = b.x - p.x, dy = b.y - (p.y - C.HEAD_OFF), d = Math.hypot(dx, dy);
        if (d < (C.HEAD_R + R) * 0.8) {
          const sx = dx >= 0 ? 1 : -1;
          b.x = p.x + sx * (C.HEAD_R + R + 2) * 0.8; b.y = p.y - C.HEAD_OFF - (C.HEAD_R + R + 2) * 0.6;
          b.vx = sx * 220; b.vy = -420; this.events.push({ type: 'squeeze' });
        }
      }
      const overFloor = b.y + R > C.GROUND + 0.5, overL = b.x - R < -0.5, overR = b.x + R > C.W + 0.5;
      if (overFloor || overL || overR) {
        b.x = Math.max(R, Math.min(C.W - R, b.x)); b.y = Math.min(b.y, C.GROUND - R);
        b.vy = Math.min(b.vy, -380);
        this.events.push({ type: 'squeeze' });
      }
    }

    // Gol: la pelota entera (centro + radio) debe estar detrás de la línea de gol y por debajo del travesaño.
    _checkGoal() {
      if (this.goalLock) return;
      const b = this.ball, R = C.BALL_R;
      const belowBar = b.y - R >= ROOF_BOTTOM - 0.01 && b.y + R <= C.GROUND + 0.01;
      if (belowBar && b.x + R < C.GOAL_LINE) { this.goalLock = true; this.events.push({ type: 'goal', scorer: 'R', side: 'L' }); }
      else if (belowBar && b.x - R > C.W - C.GOAL_LINE) { this.goalLock = true; this.events.push({ type: 'goal', scorer: 'L', side: 'R' }); }
    }
  }

  // Predicción balística de la pelota (ignora jugadores) para la IA. Devuelve muestras cada `dt` hasta T.
  function predictBall(ball, T, dt) {
    const R = C.BALL_R, out = [];
    let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
    const sub = 4, h = dt / sub;
    for (let t = 0; t < T; t += dt) {
      for (let i = 0; i < sub; i++) {
        vy += C.BALL_G * h; const dr = 1 - C.BALL_AIR_DRAG * h; vx *= dr; vy *= dr;
        x += vx * h; y += vy * h;
        if (y + R > C.GROUND) { y = C.GROUND - R; if (vy > 70) vy = -vy * C.BALL_E_GROUND; else vy = 0; vx *= 1 - C.BALL_ROLL_DRAG * h * 6; }
        if (x - R < 0) { x = R; vx = Math.abs(vx) * C.BALL_E_WALL; }
        if (x + R > C.W) { x = C.W - R; vx = -Math.abs(vx) * C.BALL_E_WALL; }
        // techos de los arcos (rebote simple por arriba)
        if ((x < C.GOAL_ROOF_X + R || x > C.W - C.GOAL_ROOF_X - R) && y + R > ROOF_Y && y - R < ROOF_BOTTOM) {
          if (vy > 0 && y < ROOF_Y) { y = ROOF_Y - R; vy = -vy * C.BALL_E_BAR; }
        }
      }
      out.push({ t: t + dt, x: x, y: y, vx: vx, vy: vy });
    }
    return out;
  }

  PC.Physics = { World, makePlayer, footCenter, kickActive, predictBall, ROOF_Y, ROOF_BOTTOM };
  if (typeof module !== 'undefined') module.exports = PC;
})(typeof window !== 'undefined' ? window : globalThis);
