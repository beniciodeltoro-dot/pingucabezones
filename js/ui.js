/* Pingu Cup - pantallas e interfaz (todo en español). Una sola pantalla en el DOM a la vez. */
(function (root) {
  'use strict';
  const PC = root.PC, C = PC.CONST, L = PC.League;
  const app = () => document.getElementById('app');
  const DIFF = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const crest = (id, cls) => `<img class="${cls || 'crest'}" src="${PC.TEAMS[id].crest}" alt="Escudo de ${esc(PC.TEAMS[id].name)}">`;

  const App = PC.App = {
    champ: null, settings: PC.Storage.loadSettings(), screen: null, match: null, ctx: null,
    sel: null
  };

  /* ---------- utilidades ---------- */
  function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
  function photoHTML(p) {
    if (PC.hasPhoto(p.id)) return `<div class="photo"><img src="${p.photo}" alt="${esc(p.name)}" onerror="this.parentNode.className='photo ph';this.parentNode.textContent='${esc(initials(p.name))}'"></div>`;
    const t = PC.TEAMS[p.team].colors;
    return `<div class="photo ph" style="background:${t.second};color:${t.main}">${esc(initials(p.name))}</div>`;
  }
  function playerCard(p, selected, act) {
    return `<button class="pcard ${selected ? 'sel' : ''}" data-act="${act}" data-id="${p.id}" aria-pressed="${!!selected}">
      <span class="num">${p.number}</span>${photoHTML(p)}<div class="nm">${esc(p.name)}</div><span class="pos">${p.pos}</span>
      <div class="desc">${esc(PC.POSITIONS[p.pos].desc)}</div></button>`;
  }
  function missingPhotosNote() {
    const miss = PC.PLAYERS.filter(p => !PC.hasPhoto(p.id)).length;
    return miss ? `<div class="notice">Faltan ${miss} de ${PC.PLAYERS.length} fotos de jugadores: se muestran retratos provisionales con las iniciales y el dorsal. Ver LEEME.md para incorporarlas.</div>` : '';
  }
  function sound(n) { PC.Audio.play(n); }
  function setScreen(name, html, cls) {
    if (App.match && name !== 'match') { App.match = null; PC.Audio.leaveMatch(); }
    App.screen = name; app().innerHTML = `<section class="screen ${cls || name}" data-screen="${name}">${html}</section>`;
    const f = app().querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true });
  }
  function modal(text, buttons) {
    const r = document.getElementById('modal-root');
    r.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true"><p>${text}</p><div class="row">${buttons.map((b, i) => `<button class="btn small ${b.cls || ''}" data-m="${i}">${b.label}</button>`).join('')}</div></div></div>`;
    r.onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; sound('button'); r.innerHTML = ''; r.onclick = null; const f = buttons[+b.dataset.m].fn; if (f) f(); };
  }
  const back = (act, label) => `<button class="btn small" data-act="${act}">${label || '← VOLVER'}</button>`;
  const toggles = () => `<div class="toggles"><button class="toggle ${App.settings.sound ? '' : 'off'}" data-act="tsound" aria-pressed="${App.settings.sound}">🔊 Sonido</button><button class="toggle ${App.settings.music ? '' : 'off'}" data-act="tmusic" aria-pressed="${App.settings.music}">🎵 Música</button></div>`;

  /* ---------- pantallas ---------- */
  App.showMenu = function () {
    const hasSave = !!App.champ;
    setScreen('menu', `
      <div style="flex:1"></div>
      <div class="logo">${crest('pingu')}<h1>PINGU<span>CUP</span></h1>${crest('wachines')}</div>
      <div class="buttons">
        <button class="btn primary" data-act="friendly" data-focus>JUGAR</button>
        <button class="btn" data-act="champ">CAMPEONATO${hasSave ? ' · CONTINUAR' : ''}</button>
        <button class="btn" data-act="online">ONLINE · 1 VS 1</button>
        <button class="btn" data-act="table">TABLA DE POSICIONES</button>
        <button class="btn" data-act="controls">CONTROLES</button>
        ${toggles()}
      </div>
      <div style="flex:1"></div>
      <div class="foot">Fútbol arcade de 1 vs 1 · Juego basado en el formato de Football Heads</div>`);
  };

  App.showControls = function (from) {
    setScreen('controls', `<h2>CONTROLES</h2><p class="sub">Teclado · tu jugador siempre mira hacia donde te moviste por última vez</p>
      <div class="panel keys">
        <div><span class="kbd">←</span><span class="kbd">→</span> o <span class="kbd">A</span><span class="kbd">D</span></div><div>Mover a izquierda / derecha</div>
        <div><span class="kbd">↑</span> o <span class="kbd">W</span></div><div>Saltar (se salta una vez por pulsación; sirve para cabecear)</div>
        <div><span class="kbd">ESPACIO</span> o <span class="kbd">Z</span></div><div>Patear (chute normal, 32°)</div>
        <div><span class="kbd">ESPACIO</span> + <span class="kbd">↓</span>/<span class="kbd">S</span></div><div>Chute rasante: más potente y bajo</div>
        <div><span class="kbd">ESPACIO</span> + <span class="kbd">↑</span>/<span class="kbd">W</span></div><div>Pelotazo alto: despeje o pase por arriba (también salta si estás en el suelo)</div>
        <div><span class="kbd">ESC</span> o <span class="kbd">P</span></div><div>Pausa (o el botón de pausa en pantalla)</div>
        <div><span class="kbd">⇄</span></div><div>Botón junto a la pausa: cambiar de jugador (hasta 2 cambios por partido, cuando quieras)</div>
      </div>
      <p class="sub" style="margin-top:14px">Un gol vale solo si la pelota cruza <b>completa</b> la línea por debajo del travesaño. Cada partido dura 60 segundos.</p>
      ${back(from || 'menu')}`);
  };

  App.showTable = function (from) {
    if (!App.champ) {
      setScreen('table', `<h2>TABLA DE POSICIONES</h2><div class="panel col"><p class="sub">Todavía no hay un campeonato en curso.</p><button class="btn primary" data-act="champ">EMPEZAR CAMPEONATO</button></div>${back('menu')}`); return;
    }
    setScreen('table', `<h2>TABLA DE POSICIONES</h2><p class="sub">Fechas jugadas: ${App.champ.fixtures.filter(f => f.played).length} de ${L.ROUNDS} · Desempate: puntos, diferencia de gol, goles a favor, victorias de visitante, sorteo fijo del campeonato</p>${tableHTML()}<div style="height:16px"></div>${back(from || 'menu')}`);
  };
  function tableHTML() {
    const rows = L.computeTable(App.champ);
    return `<table class="tbl"><thead><tr><th>Pos</th><th></th><th style="text-align:left">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.team === App.champ.userTeam ? 'mine' : ''}"><td>${r.pos}</td><td>${crest(r.team, 'crest-s').replace('class="crest-s"', 'class="crest-s" height="28"')}</td><td class="team">${esc(PC.TEAMS[r.team].name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.points}</td></tr>`).join('')}
    </tbody></table>`;
  }

  /* --- amistoso --- */
  App.showFriendlySetup = function () {
    const s = App.setup || (App.setup = { team: 'pingu', difficulty: App.settings.difficulty });
    setScreen('setup', `<h2>PARTIDO AMISTOSO</h2><p class="sub">No modifica el campeonato ni la tabla · 60 segundos</p>
      <div class="team-pick">${PC.TEAM_IDS.map(t => `<button class="team-card ${s.team === t ? 'sel' : ''}" data-act="pickteam" data-team="${t}">${crest(t)}<h3>${esc(PC.TEAMS[t].name)}</h3></button>`).join('')}</div>
      <p class="sub" style="margin-top:16px">Dificultad del rival</p>${diffSeg(s.difficulty)}
      <div class="row" style="margin-top:22px">${back('menu')}<button class="btn primary" data-act="friendly-next" data-focus>ELEGIR JUGADOR →</button></div>`);
  };
  const diffSeg = d => `<div class="seg" role="group" aria-label="Dificultad">${Object.keys(DIFF).map(k => `<button class="${d === k ? 'sel' : ''}" data-act="pickdiff" data-d="${k}">${DIFF[k]}</button>`).join('')}</div>`;

  /* --- campeonato --- */
  App.showChampionship = function () {
    if (!App.champ) {
      const s = App.setup || (App.setup = { team: 'pingu', difficulty: App.settings.difficulty });
      setScreen('champnew', `<h2>NUEVO CAMPEONATO</h2><p class="sub">${L.ROUNDS} fechas · un partido por fecha entre Pingu F.C. y CA Wachines · elegí tu equipo</p>
        <div class="team-pick">${PC.TEAM_IDS.map(t => `<button class="team-card ${s.team === t ? 'sel' : ''}" data-act="pickteam" data-team="${t}" data-back="champ">${crest(t)}<h3>${esc(PC.TEAMS[t].name)}</h3></button>`).join('')}</div>
        <p class="sub" style="margin-top:16px">Dificultad del rival</p>${diffSeg(s.difficulty)}
        <div class="row" style="margin-top:22px">${back('menu')}<button class="btn primary" data-act="champ-start" data-focus>COMENZAR CAMPEONATO</button></div>`);
      return;
    }
    const c = App.champ, fx = L.currentFixture(c), t = c.userTeam;
    if (c.finished) { App.showChampion(); return; }
    const myHome = fx.home === t;
    setScreen('champ', `<h2>CAMPEONATO · ${esc(PC.TEAMS[t].name)}</h2><p class="sub">Dificultad: ${DIFF[c.difficulty]}</p>
      <div class="hub"><div class="col">
        <div class="panel next" style="width:100%"><h3>FECHA ${fx.round} DE ${L.ROUNDS}</h3>
          <div class="vs"><div>${crest(fx.home)}<br>${esc(PC.TEAMS[fx.home].name)}<br><small>LOCAL</small></div><b>VS</b><div>${crest(fx.away)}<br>${esc(PC.TEAMS[fx.away].name)}<br><small>VISITANTE</small></div></div>
          <p class="sub">Jugás de ${myHome ? 'local (arco izquierdo)' : 'visitante (arco derecho)'}</p>
          <button class="btn primary" data-act="play-round" data-focus>JUGAR FECHA ${fx.round}</button></div>
        <div class="panel" style="width:100%">${miniTable()}</div>
        <div class="row"><button class="btn small" data-act="table-champ">TABLA COMPLETA</button><button class="btn small danger" data-act="champ-reset">NUEVO CAMPEONATO</button></div>
        ${back('menu')}
      </div><div class="panel"><h3 style="margin-bottom:10px;text-align:center">CALENDARIO</h3><div class="cal" id="cal">${calendarHTML(c, fx)}</div></div></div>`);
    const cur = document.querySelector('.fx.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
  };
  function miniTable() { const rows = L.computeTable(App.champ); return rows.map(r => `<div class="row" style="justify-content:space-between;padding:4px 8px"><span>${r.pos}. ${crest(r.team, 'crest-s').replace('class="crest-s"', 'height="24" style="vertical-align:middle"')} ${esc(PC.TEAMS[r.team].name)}</span><span>${r.played} PJ · DG ${r.gd > 0 ? '+' : ''}${r.gd} · <b style="color:var(--gold)">${r.points} pts</b></span></div>`).join(''); }
  function calendarHTML(c, cur) {
    return c.fixtures.map(f => {
      const isCur = cur && f.round === cur.round;
      return `<div class="fx ${isCur ? 'cur' : ''}"><b>F${f.round}</b><div class="t">${crest(f.home)}<span>${esc(PC.TEAMS[f.home].name)}</span></div>
        <div class="sc">${f.played ? f.homeGoals + ' - ' + f.awayGoals : 'vs'}</div><div class="t r">${crest(f.away)}<span>${esc(PC.TEAMS[f.away].name)}</span></div>
        <div>${f.played ? `<span class="chip ok">${f.forfeit ? 'Abandono' : 'Jugado'}</span>` : isCur ? `<button class="chip cur" data-act="play-round" style="border:0;cursor:pointer">JUGAR</button>` : '<span class="chip">Pendiente</span>'}</div></div>`;
    }).join('');
  }

  App.showChampion = function () {
    const ch = L.champion(App.champ); const t = PC.TEAMS[ch.team];
    const rows = ch.table;
    setScreen('champion', `<div class="champ-card"><h2>¡CAMPEÓN DE LA PINGU CUP!</h2>${crest(ch.team, 'big')}<h1>${esc(t.name)}</h1>
      ${ch.decidedBySeed ? '<div class="notice">Empate absoluto en todos los criterios deportivos: el campeón se definió por el sorteo fijo guardado al comenzar el campeonato.</div>' : ''}</div>
      <div style="height:12px"></div>${tableHTML()}
      <p class="sub" style="margin-top:10px">${esc(PC.TEAMS[App.champ.userTeam].name)} fue tu equipo · ${ch.team === App.champ.userTeam ? '¡lo lograste!' : 'el rival se quedó con la copa'}</p>
      <div class="row">${back('menu', 'MENÚ')}<button class="btn primary" data-act="champ-reset" data-focus>NUEVO CAMPEONATO</button></div>`);
  };

  /* --- selección de jugador --- */
  App.startSelect = function (ctx) { App.ctx = ctx; App.sel = null; App.showSelect(); };
  App.showSelect = function () {
    const ctx = App.ctx, tm = PC.TEAMS[ctx.userTeam];
    const head = ctx.mode === 'league' ? `FECHA ${ctx.fixture.round} · ${esc(PC.TEAMS[ctx.fixture.home].name)} vs ${esc(PC.TEAMS[ctx.fixture.away].name)}` : `AMISTOSO · ${esc(tm.name)} vs ${esc(PC.TEAMS[PC.otherTeam(ctx.userTeam)].name)}`;
    setScreen('select', `<h2>ELEGÍ TU JUGADOR</h2><p class="sub">${head}</p>
      <div class="row" style="margin-bottom:10px">${crest(ctx.userTeam, 'crest-s').replace('class="crest-s"', 'height="48"')}<b style="font-size:20px">${esc(tm.name)}</b></div>
      <div class="players" role="listbox">${PC.teamPlayers(ctx.userTeam).map(p => playerCard(p, App.sel === p.id, 'pickplayer')).join('')}</div>
      <div class="row" style="margin-top:18px">${back(ctx.mode === 'league' ? 'champ' : 'friendly')}<button class="btn primary" data-act="confirm-player" ${App.sel ? '' : 'disabled'} id="confirmBtn">CONFIRMAR →</button></div>`);
  };
  App.showPrematch = function () {
    const ctx = App.ctx, mine = PC.getPlayer(App.sel);
    const rivalTeam = PC.otherTeam(ctx.userTeam); const squad = PC.teamPlayers(rivalTeam);
    ctx.rival = ctx.rival && ctx.rival.team === rivalTeam ? ctx.rival : squad[Math.floor(Math.random() * squad.length)];
    const rv = ctx.rival;
    setScreen('prematch', `<h2>${ctx.mode === 'league' ? 'FECHA ' + ctx.fixture.round : 'AMISTOSO'}</h2><p class="sub">Dificultad: ${DIFF[ctx.difficulty]} · 60 segundos · el rival eligió a ${esc(rv.name)}</p>
      <div class="row" style="gap:28px;align-items:stretch">
        <div class="col" style="width:200px">${crest(ctx.userTeam, 'crest-s').replace('class="crest-s"', 'height="64"')}${playerCard(mine, true, 'none')}<b>TÚ</b></div>
        <b style="font-family:'Cadillac Sans',sans-serif;font-size:46px;color:var(--gold)">VS</b>
        <div class="col" style="width:200px">${crest(rivalTeam, 'crest-s').replace('class="crest-s"', 'height="64"')}${playerCard(rv, false, 'none')}<b>RIVAL</b></div></div>
      <div class="panel" style="margin-top:14px;max-width:640px;font-size:14px;line-height:1.7;text-align:center">
        <span class="kbd">←</span><span class="kbd">→</span> mover · <span class="kbd">↑</span> saltar · <span class="kbd">ESPACIO</span> patear · <span class="kbd">ESPACIO</span>+<span class="kbd">↓</span> rasante · <span class="kbd">ESPACIO</span>+<span class="kbd">↑</span> pelotazo · <span class="kbd">ESC</span> pausa</div>
      <div class="row" style="margin-top:18px">${back('select', '← CAMBIAR JUGADOR')}<button class="btn primary" data-act="kickoff" data-focus>¡A JUGAR!</button></div>`);
  };

  /* --- partido --- */
  App.startMatch = function () {
    const ctx = App.ctx, user = PC.getPlayer(App.sel), rival = ctx.rival;
    const userSide = ctx.mode === 'league' ? (ctx.fixture.home === ctx.userTeam ? 'L' : 'R') : 'L';
    const leftIsUser = userSide === 'L';
    const m = new PC.Match({
      leftTeam: leftIsUser ? ctx.userTeam : PC.otherTeam(ctx.userTeam), rightTeam: leftIsUser ? PC.otherTeam(ctx.userTeam) : ctx.userTeam,
      leftPlayer: leftIsUser ? user : rival, rightPlayer: leftIsUser ? rival : user, userSide, difficulty: ctx.difficulty, rng: Math.random,
      onEnd: res => App.onMatchEnd(res), onSub: info => App.onSub(info)
    });
    PC.PLAYERS.forEach(p => PC.Images.photo(p)); // precarga: los cambios no deben mostrar un retrato vacío
    App.match = m; m.resultSaved = false; App.renderMatchScreen(m, {});
  };
  // Dibuja la pantalla de partido (también la usa el modo online). o.online: sin pausa ni cambios; o.names: nombres de las personas.
  App.renderMatchScreen = function (m, o) {
    o = o || {}; const L0 = m.teams[0], R0 = m.teams[1], nm = o.names || [];
    const nmTag = n => (n ? `<small>${esc(n)}</small>` : '');
    const btns = o.online
      ? `<button class="leave-btn" data-act="ol-leave" aria-label="Salir de la partida" title="Salir de la partida (ESC)">✕</button>`
      : `<button class="pause-btn" data-act="pause" aria-label="Pausa" title="Pausa (ESC)"></button>
        <button class="sub-btn" id="subBtn" data-act="subopen" aria-label="Cambiar jugador" title="Cambiar jugador (máx. 2 por partido)">⇄<span class="badge" id="subBadge">2</span></button>`;
    setScreen('match', `<div class="stage" id="stage"><canvas id="cv" width="1600" height="1100"></canvas>
      <div class="hud"><div class="scoreboard">${crest(L0.id, 'crest-s').replace('class="crest-s"', 'height="38"')}<div class="tn l">${esc(L0.name)}${nmTag(nm[0])}</div><div class="sc" id="sc">0 - 0</div><div class="tn r">${esc(R0.name)}${nmTag(nm[1])}</div>${crest(R0.id, 'crest-s').replace('class="crest-s"', 'height="38"')}</div>
        <div class="clock" id="clock">1:00</div>${btns}<div class="toast hidden" id="toast"></div><div class="toast warn hidden" id="netwarn">Conexión inestable…</div></div>
      <div class="overlay hidden" id="pauseOv"><h2>PAUSA</h2><button class="btn primary" data-act="resume">REANUDAR</button>${toggles()}<button class="btn danger" data-act="abandon">ABANDONAR PARTIDO</button></div>
      <div class="overlay subov hidden" id="subOv"></div><div class="overlay hidden" id="endOv"></div></div>`, 'match-screen');
    const cv = document.getElementById('cv'); App.ctx2d = cv.getContext('2d'); App.ctx2d.setTransform(2, 0, 0, 2, 0, 0);
    PC.PLAYERS.forEach(p => PC.Images.photo(p)); // precarga: los cambios no deben mostrar un retrato vacío
    App.fitStage(); PC.Audio.enterMatch();
  };
  App.fitStage = function () {
    const st = document.getElementById('stage'); if (!st) return;
    const s = Math.min(innerWidth / 800, innerHeight / 550);
    st.style.transform = `scale(${s}) translate(-50%,-50%)`; st.style.left = '50%'; st.style.top = '50%';
    st.style.transformOrigin = '0 0';
    st.style.marginLeft = '0'; st.style.transform = `translate(${-400 * s}px, ${-275 * s}px) scale(${s})`;
  };
  App.updateHUD = function () {
    const m = App.match; if (!m) return;
    const sc = document.getElementById('sc'), ck = document.getElementById('clock'); if (!sc) return;
    const t = `${m.score.L} - ${m.score.R}`; if (sc.textContent !== t) sc.textContent = t;
    const secs = Math.ceil(m.timeLeft - 1e-9); const txt = `0:${String(Math.max(0, secs)).padStart(2, '0')}`.replace('0:60', '1:00');
    if (ck.textContent !== txt) { ck.textContent = txt; ck.classList.toggle('low', secs <= 10); }
    const sb = document.getElementById('subBtn'), bd = document.getElementById('subBadge');
    if (sb && m.subsLeft) { const n = m.subsLeft.user; if (bd.textContent !== String(n)) bd.textContent = n; sb.classList.toggle('off', n <= 0); sb.disabled = n <= 0 || m.ended; }
  };
  App.doPause = function () { const m = App.match; if (!m || !m.pause()) return; document.getElementById('pauseOv').classList.remove('hidden'); app().querySelector('#pauseOv .btn').focus(); };
  App.doResume = function () {
    const m = App.match; if (!m) return;
    if (m.resume()) { document.getElementById('pauseOv').classList.add('hidden'); document.getElementById('subOv').classList.add('hidden'); }
  };
  /* --- cambio de jugador --- */
  App.openSub = function () {
    const m = App.match; if (!m || !m.canUserSub() || m.state === 'paused') return;
    if (!m.pause()) return;
    const cur = m.world.players[m.userIdx].def, ov = document.getElementById('subOv');
    ov.innerHTML = `<h2>CAMBIO DE JUGADOR</h2>
      <p class="sub">En cancha: <b>${esc(cur.name)}</b> (${cur.pos}) · Cambios disponibles: <b>${m.subsLeft.user}</b> de ${PC.Match.MAX_SUBS}</p>
      <div class="subgrid">${m.userBench().map(p => `<button class="subcard" data-act="dosub" data-id="${p.id}" title="${esc(PC.POSITIONS[p.pos].desc)}">
        <span class="n">${p.number}</span>${photoHTML(p)}<span class="nm">${esc(p.name)}</span><span class="ps">${p.pos}</span></button>`).join('')}</div>
      <button class="btn small" data-act="subcancel">CANCELAR</button>`;
    ov.classList.remove('hidden'); const f = ov.querySelector('.subcard'); if (f) f.focus({ preventScroll: true });
  };
  App.toast = function (text) {
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = text; t.classList.remove('hidden'); clearTimeout(App._toastT);
    App._toastT = setTimeout(() => t.classList.add('hidden'), 3200);
  };
  App.onSub = function (i) {
    App.toast(i.who === 'user' ? `Cambio: sale ${i.out.name}, entra ${i.inn.name}` : `Cambio del rival: sale ${i.out.name}, entra ${i.inn.name}`);
  };
  App.onMatchEnd = function (res) {
    const m = App.match, ctx = App.ctx;
    if (m.resultSaved) return; m.resultSaved = true;
    if (ctx.mode === 'league') { // se guarda una sola vez (recordResult es idempotente por fecha)
      const r = L.recordResult(App.champ, ctx.fixture.round, res.homeGoals, res.awayGoals, res.forfeit);
      if (r.ok) PC.Storage.save(App.champ);
    }
    const userSide = m.userSide, u = res.homeGoals * (userSide === 'L' ? 1 : 0) + res.awayGoals * (userSide === 'R' ? 1 : 0);
    const ug = userSide === 'L' ? res.homeGoals : res.awayGoals, rg = userSide === 'L' ? res.awayGoals : res.homeGoals;
    const verdict = res.forfeit ? 'DERROTA POR ABANDONO' : ug > rg ? '¡VICTORIA!' : ug < rg ? 'DERROTA' : 'EMPATE';
    const ov = document.getElementById('endOv'); document.getElementById('pauseOv').classList.add('hidden');
    const done = ctx.mode === 'league' ? (App.champ.finished ? 'VER CAMPEÓN' : 'CONTINUAR') : null;
    ov.innerHTML = `<h2>FINAL DEL PARTIDO</h2><div class="res">${crest(m.teams[0].id)}<span>${res.homeGoals} - ${res.awayGoals}</span>${crest(m.teams[1].id)}</div>
      <div class="verdict">${verdict}</div>${ctx.mode === 'league' ? `<p class="sub">Fecha ${ctx.fixture.round} guardada · ${esc(PC.TEAMS[m.teams[0].id].name)} ${res.homeGoals}-${res.awayGoals} ${esc(PC.TEAMS[m.teams[1].id].name)}</p>` : ''}
      ${ctx.mode === 'league' ? `<button class="btn primary" data-act="after-match" data-focus>${done}</button>` : `<button class="btn primary" data-act="rematch" data-focus>REVANCHA</button><button class="btn" data-act="menu">MENÚ PRINCIPAL</button>`}`;
    ov.classList.remove('hidden'); const f = ov.querySelector('[data-focus]'); if (f) f.focus();
  };

  /* ---------- acciones ---------- */
  const A = {
    friendly() { App.setup = App.setup || { team: 'pingu', difficulty: App.settings.difficulty }; App.showFriendlySetup(); },
    'friendly-next'() { const s = App.setup; App.startSelect({ mode: 'friendly', userTeam: s.team, difficulty: s.difficulty }); },
    champ() { App.showChampionship(); },
    'champ-start'() { const s = App.setup; App.champ = L.newChampionship(s.team, s.difficulty); PC.Storage.save(App.champ); App.settings.difficulty = s.difficulty; PC.Storage.saveSettings(App.settings); App.showChampionship(); },
    'champ-reset'() { modal('¿Empezar un campeonato nuevo? Se borrará el progreso y los resultados del campeonato actual.', [{ label: 'CANCELAR' }, { label: 'SÍ, BORRAR Y EMPEZAR', cls: 'danger', fn() { PC.Storage.clear(); App.champ = null; App.setup = null; App.showChampionship(); } }]); },
    'play-round'() { const fx = L.currentFixture(App.champ); if (!fx) return; App.startSelect({ mode: 'league', userTeam: App.champ.userTeam, difficulty: App.champ.difficulty, fixture: fx }); },
    pickteam(el) { App.setup = App.setup || {}; App.setup.team = el.dataset.team; (el.dataset.back === 'champ' ? App.showChampionship : App.showFriendlySetup)(); },
    pickdiff(el) { App.setup.difficulty = el.dataset.d; (App.screen === 'champnew' ? App.showChampionship : App.showFriendlySetup)(); },
    pickplayer(el) { App.sel = el.dataset.id; document.querySelectorAll('.pcard').forEach(c => { const on = c.dataset.id === App.sel; c.classList.toggle('sel', on); c.setAttribute('aria-pressed', on); }); const b = document.getElementById('confirmBtn'); if (b) b.disabled = false; },
    'confirm-player'() { if (App.sel) App.showPrematch(); },
    select() { App.showSelect(); },
    kickoff() { App.startMatch(); },
    pause() { App.doPause(); }, resume() { App.doResume(); },
    subopen() { App.openSub(); }, subcancel() { App.doResume(); },
    dosub(el) { const m = App.match; if (m && m.substituteUser(el.dataset.id)) App.doResume(); },
    abandon() { modal('¿Abandonar el partido? Se registrará como una derrota tuya y no podrás reanudarlo.', [{ label: 'VOLVER' }, { label: 'ABANDONAR', cls: 'danger', fn() { App.match.abandon(); } }]); },
    'after-match'() { App.match = null; PC.Audio.leaveMatch(); App.showChampionship(); },
    rematch() { App.ctx.rival = null; App.startMatch(); },
    menu() { if (App.online && App.leaveOnline) App.leaveOnline(); App.showMenu(); },
    controls() { App.showControls('menu'); },
    table() { App.showTable('menu'); }, 'table-champ'() { App.showTable('champ'); },
    tsound() { App.settings.sound = !App.settings.sound; PC.Audio.setSound(App.settings.sound); PC.Storage.saveSettings(App.settings); refreshToggles(); },
    tmusic() { App.settings.music = !App.settings.music; PC.Audio.setMusic(App.settings.music); PC.Storage.saveSettings(App.settings); refreshToggles(); },
    none() {}
  };
  function refreshToggles() {
    document.querySelectorAll('[data-act="tsound"]').forEach(b => { b.classList.toggle('off', !App.settings.sound); b.setAttribute('aria-pressed', App.settings.sound); });
    document.querySelectorAll('[data-act="tmusic"]').forEach(b => { b.classList.toggle('off', !App.settings.music); b.setAttribute('aria-pressed', App.settings.music); });
  }
  App.actions = A;
  const BACKS = { menu: 'menu', champ: 'champ', friendly: 'friendly', select: 'select' };
  App.ui = { setScreen, modal, esc, crest, photoHTML, playerCard, back, toggles, DIFF };
  App.handleClick = function (e) {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    PC.Audio.unlock(); sound('button');
    const act = el.dataset.act; if (A[act]) A[act](el);
  };
})(window);
