/* Pingu Cup - dibujo del partido en canvas (lógico 800x550). */
(function (root) {
  'use strict';
  const PC = (root.PC = root.PC || {});
  const C = PC.CONST;
  const IMG = {}, cache = {};
  const names = { bg: 'background.png', goal: 'goal.png', hero_shadow: 'hero_shadow.png', ball_shadow: 'ball_shadow.png', ball: 'ball.png' };
  for (let i = 1; i <= 9; i++) names['foot' + i] = 'foot' + i + '.png';

  PC.Images = {
    loadBase() { // devuelve promesa; resuelve aunque algún recurso falle (se dibuja un reemplazo)
      return Promise.all(Object.keys(names).map(k => new Promise(res => { const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = () => { console.warn('Recurso no disponible: ' + names[k]); res(); }; im.src = 'assets/img/' + names[k]; })));
    },
    photo(player) { // retrato del jugador si existe localmente
      if (!PC.hasPhoto(player.id)) return null;
      let e = cache[player.id];
      if (!e) { e = cache[player.id] = { img: new Image(), ok: false }; e.img.onload = () => { e.ok = true; }; e.img.onerror = () => { e.ok = false; e.failed = true; console.warn('No se pudo cargar la foto de ' + player.name); }; e.img.src = player.photo; }
      return e.ok ? e.img : null;
    },
    crest(teamId) {
      const k = 'crest-' + teamId; let e = cache[k];
      if (!e) { e = cache[k] = { img: new Image(), ok: false }; e.img.onload = () => { e.ok = true; }; e.img.src = PC.TEAMS[teamId].crest; }
      return e.ok ? e.img : null;
    }
  };

  function drawShirt(ctx, p, team, x, y) {
    const c = team.colors, w = 36;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x - w / 2, y - 22); ctx.lineTo(x + w / 2, y - 22); ctx.lineTo(x + w / 2 - 4, y - 5); ctx.lineTo(x - w / 2 + 4, y - 5); ctx.closePath();
    ctx.fillStyle = c.main; ctx.fill(); ctx.clip();
    if (team.kit === 'wachines') { ctx.fillStyle = c.second; for (let i = -2; i <= 2; i += 2) ctx.fillRect(x - 4 + i * 8 - 4, y - 24, 8, 22); }
    else { ctx.fillStyle = c.second; ctx.fillRect(x - w / 2, y - 22, 7, 20); ctx.fillRect(x + w / 2 - 7, y - 22, 7, 20); }
    ctx.restore();
    ctx.lineWidth = 1.5; ctx.strokeStyle = c.trim;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y - 22); ctx.lineTo(x + w / 2, y - 22); ctx.lineTo(x + w / 2 - 4, y - 5); ctx.lineTo(x - w / 2 + 4, y - 5); ctx.closePath(); ctx.stroke();
    // shorts
    ctx.fillStyle = c.second === '#35505f' ? '#15191c' : c.trim; ctx.fillRect(x - 15, y - 6, 30, 5);
  }

  function drawHead(ctx, p, team, x, y, tilt) {
    const r = C.HEAD_R, c = team.colors;
    const photo = PC.Images.photo(p.def);
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.closePath();
    ctx.save(); ctx.clip();
    if (photo) {
      const s = Math.max((2 * r) / photo.width, (2 * r) / photo.height);
      ctx.fillStyle = '#d9d2c3'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.drawImage(photo, -photo.width * s / 2, -photo.height * s / 2 + (photo.height > photo.width * 1.2 ? r * 0.55 : 0), photo.width * s, photo.height * s);
    } else { // retrato provisional: colores del equipo + dorsal (no se fingen fotos)
      ctx.fillStyle = c.second; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.fillStyle = c.main; ctx.beginPath(); ctx.arc(0, -4, r * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.second; ctx.font = 'bold 22px "Cadillac Sans", "Century Gothic", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p.def.number), 0, -3);
    }
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = c.main === '#ffffff' ? c.second : c.second; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawBoot(ctx, x, y, ang, facing, idx) {
    const im = IMG['foot' + idx];
    ctx.save(); ctx.translate(x, y); ctx.scale(facing, 1); ctx.rotate(ang);
    if (im) ctx.drawImage(im, -9, -11, 18, 15); else { ctx.fillStyle = '#222'; ctx.fillRect(-9, -8, 18, 9); }
    ctx.restore();
  }

  PC.Renderer = {
    draw(ctx, view) {
      const { world, teams, time, celebrate, userSide } = view;
      ctx.clearRect(0, 0, C.W, C.H);
      if (IMG.bg) ctx.drawImage(IMG.bg, 0, 0); else { ctx.fillStyle = '#1b5e2b'; ctx.fillRect(0, 0, C.W, C.H); }
      // arcos
      const gy = C.GROUND - C.GOAL_H;
      if (IMG.goal) { ctx.drawImage(IMG.goal, 0, gy); ctx.save(); ctx.translate(C.W, 0); ctx.scale(-1, 1); ctx.drawImage(IMG.goal, 0, gy); ctx.restore(); }
      // sombras
      const b = world.ball;
      for (const p of world.players) if (IMG.hero_shadow) ctx.drawImage(IMG.hero_shadow, p.x - 24, C.GROUND - 4, 48, 11);
      if (IMG.ball_shadow) { const k = Math.max(0.35, 1 - (C.GROUND - b.y) / 520); ctx.globalAlpha = 0.8 * k; ctx.drawImage(IMG.ball_shadow, b.x - 12 * k, C.GROUND - 3, 24 * k, 6); ctx.globalAlpha = 1; }
      // jugadores
      world.players.forEach((p, i) => {
        const team = teams[i], c = team.colors;
        const bob = p.onGround ? Math.abs(Math.sin(time * 14)) * (Math.abs(p.vx) > 30 ? 2.2 : 0) : 0;
        const hx = p.x, hy = p.y - C.HEAD_OFF - bob;
        // pierna/bota trasera
        const idx = i === 0 ? 1 : 5; // botas de colores distintos por lado
        drawBoot(ctx, p.x - p.facing * 9, p.y - 2, 0, p.facing, idx);
        drawShirt(ctx, p, team, p.x, p.y - 1 - bob * 0.5);
        // pie delantero (animación de patada)
        const f = PC.Physics.footCenter(p);
        const sw = p.kickT > 0 ? Math.sin(Math.PI * Math.min(1, p.kickT / C.KICK_DUR)) : 0;
        drawBoot(ctx, p.kickT > 0 ? f.x : p.x + p.facing * 9, p.kickT > 0 ? f.y + 6 : p.y - 2, -sw * 0.9, p.facing, idx + 1);
        drawHead(ctx, p, team, hx, hy, p.vx * 0.0006 + (p.onGround ? 0 : p.vy * 0.0002));
        if (i === userSide) { // marcador del jugador controlado
          ctx.fillStyle = c.second === '#35505f' ? '#f2e6cf' : '#ffd84a'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
          const ty = hy - C.HEAD_R - 14 + Math.sin(time * 6) * 2;
          ctx.beginPath(); ctx.moveTo(hx - 8, ty - 8); ctx.lineTo(hx + 8, ty - 8); ctx.lineTo(hx, ty + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      });
      // pelota
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      if (IMG.ball) ctx.drawImage(IMG.ball, -C.BALL_R, -C.BALL_R, C.BALL_R * 2, C.BALL_R * 2); else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, C.BALL_R, 0, 7); ctx.fill(); }
      ctx.restore();
      if (b.y + C.BALL_R < 0) { // indicador cuando la pelota sale por arriba de la pantalla
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.moveTo(b.x, 6); ctx.lineTo(b.x - 9, 22); ctx.lineTo(b.x + 9, 22); ctx.closePath(); ctx.fill();
      }
      // celebración de gol
      if (celebrate) {
        const t = celebrate.t, team = celebrate.team;
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const sc = Math.min(1, t * 5) * (1 + 0.05 * Math.sin(t * 10));
        ctx.translate(C.W / 2, 200); ctx.scale(sc, sc);
        ctx.font = '84px "Cadillac Sans", "Century Gothic", Impact, sans-serif'; ctx.lineWidth = 9; ctx.strokeStyle = '#101418'; ctx.strokeText('¡GOL!', 0, 0);
        ctx.fillStyle = team.colors.main; ctx.fillText('¡GOL!', 0, 0);
        ctx.font = '26px "Century Gothic", Arial, sans-serif'; ctx.lineWidth = 5; ctx.strokeText(celebrate.text, 0, 54); ctx.fillStyle = '#fff'; ctx.fillText(celebrate.text, 0, 54);
        ctx.restore();
        for (const q of celebrate.confetti) { ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, 5, 8); }
      }
      if (view.banner) {
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '60px "Cadillac Sans", "Century Gothic", Impact, sans-serif';
        ctx.lineWidth = 8; ctx.strokeStyle = '#101418'; ctx.strokeText(view.banner, C.W / 2, 190); ctx.fillStyle = '#fff'; ctx.fillText(view.banner, C.W / 2, 190); ctx.restore();
      }
    }
  };
})(window);
