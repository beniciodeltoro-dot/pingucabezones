/* Pingu Cup - modo ONLINE 1 vs 1 (WebRTC con PeerJS, sin servidor propio).
   Arquitectura: el ANFITRIÓN (quien crea la sala) corre la simulación completa (la misma física del modo offline) y
   envía el estado al INVITADO ~60 veces por segundo; el invitado solo manda sus teclas y dibuja (con interpolación).
   Dos canales por sala: «ctl» (ordenado y confiable: lobby, inicio, final) y «game» (sin orden: teclas y estado).
   En este modo no hay cambios de jugador, pausa libre, campeonato ni tabla. */
(function (root) {
  'use strict';
  const PC = root.PC, App = PC.App, U = App.ui, C = PC.CONST, M = PC.Match, STEP = 1 / 60;
  const esc = U.esc, CFG = PC.ONLINE_CONFIG || {};
  const PREFIX = 'pingucup-', PROTO = 1, ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const KEYS = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], jump: ['ArrowUp', 'KeyW'], kick: ['Space', 'KeyZ', 'KeyK'], down: ['ArrowDown', 'KeyS'], up: ['ArrowUp', 'KeyW'] };
  const SFX_OK = { goal: 1, ball: 1, whistle: 1 };
  let S = null; // sesión online activa (null = ninguna)

  /* ---------- utilidades ---------- */
  const cleanName = s => String(s == null ? '' : s).replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  const cleanCode = s => String(s == null ? '' : s).toUpperCase().split('').filter(c => ALPHA.indexOf(c) >= 0).join('').slice(0, 5);
  const randomCode = () => { let c = ''; for (let i = 0; i < 5; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return c; };
  const num = (n, d) => (Number.isFinite(+n) ? +n : (d || 0));
  const lerp = (a, b, f) => a + (b - a) * f;
  const teamOK = id => !!PC.TEAMS[id];
  const savedName = () => cleanName(App.settings.name) || '';

  function makePeer(id) {
    if (!root.peerjs || !root.peerjs.Peer) throw new Error('PeerJS no está cargado');
    const o = Object.assign({ debug: 0 }, CFG.peer || {});
    if (CFG.iceServers) o.config = { iceServers: CFG.iceServers };
    return id ? new root.peerjs.Peer(id, o) : new root.peerjs.Peer(o);
  }
  function netErrText(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return 'No existe una sala con ese código (o ya se cerró).';
    if (t === 'browser-incompatible') return 'Tu navegador no soporta conexiones online (WebRTC).';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'No se pudo conectar con el servidor de salas. Revisá tu internet y probá de nuevo.';
    return 'No se pudo establecer la conexión (' + (t || 'error') + '). Probá de nuevo.';
  }
  function sendCtl(o) { try { if (S && S.ctl && S.ctl.open) S.ctl.send(o); } catch (e) {} }
  function sendGame(o) { try { if (S && S.game && S.game.open) S.game.send(o); } catch (e) {} }

  function newSession(role, name) {
    return { role, name, hostName: role === 'host' ? name : '', guestName: role === 'guest' ? name : '', peer: null, ctl: null, game: null, pendingGame: null, code: '', opened: false, joined: false,
      lobby: { ht: 'pingu', hp: null, hr: false, gp: null, gr: false }, match: null, gm: null, rm: { h: false, g: false }, rivalGone: false, notice: '',
      lastMsg: Date.now(), lastPing: 0, lastSnap: Date.now(), timers: [], tick: hostTick };
  }
  function closeSession() {
    if (!S) return; const s = S; S = null; App.online = null;
    s.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
    [s.ctl, s.game, s.pendingGame].forEach(c => { try { if (c) c.close(); } catch (e) {} });
    try { if (s.peer) s.peer.destroy(); } catch (e) {}
  }
  function fatal(msg) { closeSession(); App.showOnlineHub(msg || ''); }
  // Salir de la sesión (avisa al otro y cierra todo un instante después para que el aviso alcance a enviarse).
  App.leaveOnline = function () {
    const s = S; if (!s) return;
    sendCtl({ t: s.role === 'host' && s.screenLobby ? 'closed' : 'bye' });
    S = null; App.online = null; s.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
    setTimeout(() => { [s.ctl, s.game, s.pendingGame].forEach(c => { try { if (c) c.close(); } catch (e) {} }); try { if (s.peer) s.peer.destroy(); } catch (e) {} }, 250);
  };

  /* ---------- pantallas ---------- */
  App.showOnlineHub = function (msg, code) {
    if (S) closeSession();
    U.setScreen('onhub', `<h2>JUGAR ONLINE</h2>
      <p class="sub">1 vs 1 con otra persona · uno crea la sala y le pasa el código al otro · 60 segundos · sin cambios de jugador</p>
      <div class="panel col olhub">
        <label class="ollabel" for="olName">Tu nombre</label>
        <input class="olinput" id="olName" maxlength="14" autocomplete="off" spellcheck="false" placeholder="Jugador" value="${esc(savedName())}">
        <button class="btn primary" data-act="ol-create">CREAR SALA</button>
        <div class="olor">— o —</div>
        <div class="row"><input class="olinput code" id="olCode" maxlength="5" autocomplete="off" spellcheck="false" placeholder="CÓDIGO" value="${esc(code || '')}"><button class="btn" data-act="ol-join" style="min-width:0">UNIRSE</button></div>
        <div class="notice ${msg ? '' : 'hidden'}" id="olMsg">${esc(msg || '')}</div>
      </div>
      <div class="row" style="margin-top:16px">${U.back('menu')}</div>`);
    const f = document.getElementById('olName'); if (f && !savedName()) f.focus({ preventScroll: true });
  };
  function hubStatus(t) { const m = document.getElementById('olMsg'); if (m) { m.textContent = t; m.classList.remove('hidden'); } }
  function readName() { const el = document.getElementById('olName'); const n = cleanName(el ? el.value : '') || 'Jugador'; App.settings.name = n; PC.Storage.saveSettings(App.settings); return n; }

  function lobbyInfo() {
    const L = S.lobby, host = S.role === 'host', gt = PC.otherTeam(L.ht);
    return { L, host, myTeam: host ? L.ht : gt, rvTeam: host ? gt : L.ht, myId: host ? L.hp : L.gp, rvId: host ? L.gp : L.hp,
      myReady: host ? L.hr : L.gr, rvReady: host ? L.gr : L.hr, myName: host ? S.hostName : S.guestName, rvName: host ? S.guestName : S.hostName, hasRival: host ? !!S.guestName && !S.rivalGone : true };
  }
  function showLobby() {
    if (!S) return; S.screenLobby = true; const I = lobbyInfo(), tm = PC.TEAMS[I.myTeam], rt = PC.TEAMS[I.rvTeam], myP = PC.getPlayer(I.myId), rvP = PC.getPlayer(I.rvId);
    const status = !I.hasRival ? 'Esperando que se una tu rival… pasale el código.' : I.myReady && I.rvReady ? 'Empezando…' : I.myReady ? 'Estás listo. Esperando a tu rival…' : I.rvReady ? `${esc(I.rvName)} está listo.` : (myP ? 'Tocá LISTO cuando quieras empezar.' : 'Elegí tu jugador.');
    const side = (team, name, p, ready, you) => `<div class="olside ${you ? 'you' : ''}">${U.crest(team.id, 'crest-s').replace('class="crest-s"', 'height="64"')}<h3>${esc(team.name)}</h3><div class="olname">${you ? 'TÚ' : 'RIVAL'} · ${esc(name || '…')}</div>
      <div class="olplayer">${p ? `<span class="n">${p.number}</span> ${esc(p.name)} <small>${p.pos}</small>` : '<small>Sin elegir</small>'}</div><div class="olready ${ready ? 'on' : ''}">${ready ? '✔ LISTO' : '…'}</div></div>`;
    const head = I.host ? `<div class="roomcode">CÓDIGO DE SALA <b>${S.code}</b></div>
      <div class="row" style="margin-bottom:6px"><button class="btn small" data-act="ol-copy" data-what="code">COPIAR CÓDIGO</button>${location.protocol === 'file:' ? '' : '<button class="btn small" data-act="ol-copy" data-what="link">COPIAR LINK</button>'}</div>`
      : `<div class="roomcode">SALA <b>${S.code}</b></div>`;
    const card = p => `<button class="subcard ${p.id === I.myId ? 'sel' : ''}" data-act="ol-pick" data-id="${p.id}" aria-pressed="${p.id === I.myId}" title="${esc(PC.POSITIONS[p.pos].desc)}"><span class="n">${p.number}</span>${U.photoHTML(p)}<span class="nm">${esc(p.name)}</span><span class="ps">${p.pos}</span></button>`;
    U.setScreen('onlobby', `<h2>SALA ONLINE</h2>${head}
      <div class="olrow">${side(tm, I.myName, myP, I.myReady, true)}<b class="olvs">VS</b>${I.hasRival ? side(rt, I.rvName, rvP, I.rvReady, false) : `<div class="olside wait"><h3>${esc(rt.name)}</h3><div class="olname">Esperando rival…</div></div>`}</div>
      <p class="sub" id="olStatus">${status}${S.notice ? ' · <b>' + esc(S.notice) + '</b>' : ''}${I.host ? '' : ` · Te tocó ${esc(tm.name)}`}</p>
      <div class="row"><button class="btn small" data-act="ol-exit-lobby">← SALIR</button>${I.host ? `<button class="btn small" data-act="ol-swap">JUGAR CON ${esc(PC.TEAMS[PC.otherTeam(I.L.ht)].name).toUpperCase()}</button>` : ''}<button class="btn primary small" data-act="ol-ready" ${myP && I.hasRival ? '' : 'disabled'}>${I.myReady ? 'CANCELAR LISTO' : 'LISTO'}</button></div>
      <p class="sub" style="margin:12px 0 6px">Elegí tu jugador</p>
      <div class="lobbygrid" role="listbox">${PC.teamPlayers(I.myTeam).map(card).join('')}</div>`);
    S.notice = '';
  }

  /* ---------- conexión: anfitrión ---------- */
  function openHost(name) {
    closeSession(); S = newSession('host', name); App.online = S; S.lobby.ht = (App.setup && App.setup.team) || 'pingu';
    hubStatus('Creando sala…'); tryCreate(0);
  }
  function tryCreate(n) {
    const s = S, code = randomCode(); let peer;
    try { peer = makePeer(PREFIX + code); } catch (e) { return fatal('Tu navegador no soporta el modo online.'); }
    s.peer = peer; s.code = code;
    peer.on('open', () => { if (S !== s || s.peer !== peer) return; s.opened = true; wireHostPeer(peer); startHeartbeat(); showLobby(); });
    peer.on('error', err => {
      if (S !== s || s.peer !== peer) return;
      if (!s.opened) { if (err.type === 'unavailable-id' && n < 6) { try { peer.destroy(); } catch (e) {} return tryCreate(n + 1); } return fatal(netErrText(err)); }
      console.warn('PeerJS:', err.type);
    });
    s.timers.push(setTimeout(() => { if (S === s && !s.opened) fatal('No se pudo conectar con el servidor de salas (tiempo agotado). Revisá tu internet.'); }, 20000));
  }
  function wireHostPeer(peer) {
    peer.on('connection', conn => onHostIncoming(conn));
    peer.on('disconnected', () => { if (S && S.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } }); // la sala sigue valida mientras haya señalización
  }
  function onHostIncoming(conn) {
    const s = S; if (!s) return;
    if (conn.label === 'ctl') {
      if (s.ctl && s.ctl.open) { conn.on('open', () => { try { conn.send({ t: 'full' }); } catch (e) {} setTimeout(() => { try { conn.close(); } catch (e) {} }, 400); }); return; }
      s.ctl = conn; s.rivalGone = false; s.lastMsg = Date.now();
      conn.on('data', d => { if (S === s && s.ctl === conn) onHostCtl(d); });
      conn.on('close', () => { if (S === s && s.ctl === conn) peerLost('close'); });
      conn.on('error', () => {});
      if (s.pendingGame && s.pendingGame.peer === conn.peer) acceptGame(s.pendingGame);
    } else if (conn.label === 'game') {
      if (s.ctl && s.ctl.peer !== conn.peer) { conn.on('open', () => { try { conn.close(); } catch (e) {} }); return; }
      if (!s.ctl) { s.pendingGame = conn; return; }
      acceptGame(conn);
    } else { conn.on('open', () => { try { conn.close(); } catch (e) {} }); }
  }
  function acceptGame(conn) {
    const s = S; if (!s) return; s.game = conn; s.pendingGame = null;
    conn.on('data', d => { if (S !== s || s.game !== conn) return; s.lastMsg = Date.now(); if (d && typeof d.i === 'number' && s.match) s.match.setRemoteInput(d.i); });
    conn.on('error', () => {});
  }
  function onHostCtl(d) {
    if (!S || !d || typeof d !== 'object') return; S.lastMsg = Date.now(); const L = S.lobby;
    switch (d.t) {
      case 'hello':
        if (d.v !== PROTO) { sendCtl({ t: 'bad' }); return; }
        if (App.screen !== 'onlobby') { sendCtl({ t: 'full' }); const c = S.ctl; S.ctl = null; S.game = null; setTimeout(() => { try { if (c) c.close(); } catch (e) {} }, 400); return; } // la sala ya está en partida
        S.guestName = cleanName(d.name) || 'Invitado'; L.gp = null; L.gr = false; L.hr = false; S.rivalGone = false; S.rm = { h: false, g: false };
        broadcastLobby(); if (S.screenLobby && !S.match) showLobby(); break;
      case 'pick': {
        const p = PC.getPlayer(d.p); if (!p || p.team !== PC.otherTeam(L.ht)) { L.gp = null; L.gr = false; } else { L.gp = p.id; L.gr = !!d.r; }
        broadcastLobby(); if (App.screen === 'onlobby') showLobby(); maybeStart(); break; }
      case 'rematch': S.rm.g = true; sendCtl({ t: 'rm', h: S.rm.h, g: S.rm.g }); refreshEnd(); checkRematch(); break;
      case 'leave': case 'bye':
        if (S.match && !S.match.ended && App.screen === 'match') S.match.forfeitBy('R'); else peerLost('bye'); break;
      default: break; // ping y desconocidos
    }
  }
  function broadcastLobby() { const L = S.lobby; sendCtl({ t: 'lobby', hn: S.hostName, gn: S.guestName, ht: L.ht, hp: L.hp, hr: L.hr, gp: L.gp, gr: L.gr }); }
  function maybeStart() { const L = S.lobby; if (S.role === 'host' && S.ctl && S.ctl.open && L.hp && L.gp && L.hr && L.gr && App.screen === 'onlobby') hostStart(); }

  function hostStart() {
    const L = S.lobby, s = S; s.rm = { h: false, g: false }; s.screenLobby = false;
    const m = new PC.Match({ leftTeam: L.ht, rightTeam: PC.otherTeam(L.ht), leftPlayer: PC.getPlayer(L.hp), rightPlayer: PC.getPlayer(L.gp), userSide: 'L', difficulty: 'normal', rng: Math.random, online: true, onEnd: r => hostMatchEnded(r) });
    s.match = m; s.lastSnap = Date.now();
    sendCtl({ t: 'start', ht: L.ht, hp: L.hp, gp: L.gp, hn: s.hostName, gn: s.guestName });
    App.match = m; m.resultSaved = true; App.renderMatchScreen(m, { online: true, names: [s.hostName, s.guestName] });
  }
  function hostTick(m) { // se llama después de cada paso de simulación del anfitrión
    if (!S || S.role !== 'host' || !m.sfxLog) return;
    if (!S.game || !S.game.open || m.state === 'ended') { m.sfxLog.length = 0; return; }
    try { S.game.send(m.snapshot()); } catch (e) {}
  }
  function hostMatchEnded(r) {
    if (!S) return; S.rm = { h: false, g: false };
    const res = { hg: r.homeGoals, ag: r.awayGoals, reason: r.reason, fb: r.forfeitBy || null };
    sendCtl({ t: 'end', hg: res.hg, ag: res.ag, reason: res.reason, fb: res.fb }); showOnlineEnd(res);
  }

  /* ---------- conexión: invitado ---------- */
  function openGuest(name, code) {
    closeSession(); S = newSession('guest', name); App.online = S; const s = S; s.code = code; hubStatus('Conectando con la sala…');
    let peer; try { peer = makePeer(null); } catch (e) { return fatal('Tu navegador no soporta el modo online.'); }
    s.peer = peer;
    s.timers.push(setTimeout(() => { if (S === s && !s.joined) fatal('No se pudo entrar a la sala (tiempo agotado). Revisá el código y tu internet.'); }, 25000));
    peer.on('error', err => { if (S !== s || s.peer !== peer) return; if (!s.joined) fatal(netErrText(err)); else console.warn('PeerJS:', err.type); });
    peer.on('open', () => {
      if (S !== s) return; s.opened = true; const id = PREFIX + code;
      const ctl = peer.connect(id, { label: 'ctl', reliable: true, serialization: 'json' });
      const game = peer.connect(id, { label: 'game', reliable: false, serialization: 'json' });
      s.ctl = ctl; s.game = game;
      ctl.on('open', () => { if (S === s) sendCtl({ t: 'hello', name: s.name, v: PROTO }); });
      ctl.on('data', d => { if (S === s) onGuestCtl(d); });
      ctl.on('close', () => { if (S === s) peerLost('close'); });
      ctl.on('error', () => {});
      game.on('data', d => { if (S !== s) return; s.lastMsg = Date.now(); s.lastSnap = Date.now(); if (s.gm) s.gm.receive(d); });
      game.on('error', () => {});
    });
  }
  function onGuestCtl(d) {
    if (!S || !d || typeof d !== 'object') return; S.lastMsg = Date.now();
    switch (d.t) {
      case 'lobby': {
        if (!teamOK(d.ht)) return; const L = S.lobby; L.ht = d.ht; L.hp = d.hp || null; L.hr = !!d.hr; L.gp = d.gp || null; L.gr = !!d.gr;
        S.hostName = cleanName(d.hn) || 'Anfitrión'; if (d.gn) S.guestName = cleanName(d.gn) || S.guestName;
        if (!S.joined) { S.joined = true; startHeartbeat(); }
        if (App.screen !== 'match') showLobby(); break; }
      case 'start': guestStart(d); break;
      case 'end': if (S.gm) { S.gm.finish({ hg: num(d.hg) | 0, ag: num(d.ag) | 0, reason: d.reason, fb: d.fb === 'L' || d.fb === 'R' ? d.fb : null }); S.rm = { h: false, g: false }; showOnlineEnd({ hg: S.gm.score.L, ag: S.gm.score.R, reason: d.reason, fb: d.fb === 'L' || d.fb === 'R' ? d.fb : null }); } break;
      case 'rm': S.rm = { h: !!d.h, g: !!d.g }; refreshEnd(); break;
      case 'full': fatal('Esa sala ya está completa.'); break;
      case 'bad': fatal('La versión del juego del anfitrión es distinta. Pedile el link actualizado.'); break;
      case 'closed': fatal('El anfitrión cerró la sala.'); break;
      case 'bye': peerLost('bye'); break;
      default: break;
    }
  }
  function guestStart(d) {
    const hp = PC.getPlayer(d.hp), gp = PC.getPlayer(d.gp);
    if (!teamOK(d.ht) || !hp || !gp || hp.team !== d.ht || gp.team !== PC.otherTeam(d.ht)) return fatal('Datos de partida inválidos.');
    S.screenLobby = false; S.rm = { h: false, g: false }; S.hostName = cleanName(d.hn) || S.hostName; S.guestName = cleanName(d.gn) || S.guestName; S.lastSnap = Date.now();
    const gm = new GuestMatch({ leftTeam: d.ht, rightTeam: PC.otherTeam(d.ht), leftPlayer: hp, rightPlayer: gp }, mask => sendGame({ i: mask }));
    S.gm = gm; App.match = gm; App.renderMatchScreen(gm, { online: true, names: [S.hostName, S.guestName] });
  }

  /* ---------- latido y desconexiones ---------- */
  function startHeartbeat() {
    if (!S || S.hb) return; const s = S; s.hb = true;
    s.timers.push(setInterval(() => {
      if (S !== s) return; const now = Date.now();
      if (s.ctl && s.ctl.open && now - s.lastPing >= 2000) { sendCtl({ t: 'ping' }); s.lastPing = now; }
      const inMatch = !!App.match && App.screen === 'match' && !App.match.ended, connected = s.role === 'guest' ? s.joined : !!s.ctl;
      if (connected && now - s.lastMsg > (inMatch ? 8000 : 15000)) return peerLost('timeout');
      const w = document.getElementById('netwarn'); if (w) w.classList.toggle('hidden', !(inMatch && s.role === 'guest' && now - s.lastSnap > 1500));
    }, 1000));
  }
  function peerLost() {
    const s = S; if (!s) return;
    if (s.role === 'host') {
      const c = s.ctl, g = s.game; s.ctl = null; s.game = null; s.pendingGame = null; try { if (c) c.close(); } catch (e) {} try { if (g) g.close(); } catch (e) {}
      s.rm = { h: false, g: false }; s.rivalGone = true;
      const m = s.match;
      if (App.screen === 'match' && m && !m.ended) m.forfeitBy('R'); // hostMatchEnded muestra el final
      else if (App.screen === 'match') refreshEnd();
      else if (App.screen === 'onlobby') { s.guestName = ''; s.lobby.gp = null; s.lobby.gr = false; s.lobby.hr = false; s.notice = 'Tu rival se desconectó'; showLobby(); }
    } else {
      s.rivalGone = true; const gm = s.gm;
      if (App.screen === 'match' && gm && !gm.ended) { const fs = PC.League.forfeitScore(gm.score.L, gm.score.R), res = { hg: fs.user, ag: fs.rival, reason: 'abandono', fb: 'L' }; gm.finish(res); showOnlineEnd(res); }
      else if (App.screen === 'match') refreshEnd();
      else fatal('Se perdió la conexión con la sala.');
    }
  }

  /* ---------- final del partido y revancha ---------- */
  function showOnlineEnd(res) {
    if (!S) return; S.lastRes = res; const ov = document.getElementById('endOv'); if (!ov) return;
    const me = S.role === 'host' ? 'L' : 'R', mg = me === 'L' ? res.hg : res.ag, rg = me === 'L' ? res.ag : res.hg;
    const verdict = res.fb ? (res.fb === me ? 'DERROTA POR ABANDONO' : (S.rivalGone ? '¡GANASTE! Tu rival se desconectó' : '¡GANASTE! Tu rival abandonó')) : mg > rg ? '¡VICTORIA!' : mg < rg ? 'DERROTA' : 'EMPATE';
    const m = App.match, t = m ? m.teams : [PC.TEAMS.pingu, PC.TEAMS.wachines];
    const hn = S.hostName, gn = S.guestName;
    ov.innerHTML = `<h2>FINAL DEL PARTIDO</h2><div class="res">${U.crest(t[0].id)}<span>${res.hg} - ${res.ag}</span>${U.crest(t[1].id)}</div>
      <div class="verdict">${verdict}</div><p class="sub">${esc(hn)} (${esc(t[0].name)}) ${res.hg}-${res.ag} ${esc(gn)} (${esc(t[1].name)})</p>
      <div id="olEndBtns"></div>`;
    ov.classList.remove('hidden'); refreshEnd();
  }
  function refreshEnd() {
    const box = document.getElementById('olEndBtns'); if (!box || !S || !S.lastRes) return;
    const me = S.role === 'host' ? 'h' : 'g', rv = me === 'h' ? 'g' : 'h', res = S.lastRes, can = !res.fb && !S.rivalGone;
    let rm = '';
    if (can) rm = S.rm[me] ? '<button class="btn primary" disabled>ESPERANDO AL RIVAL…</button>' : `<button class="btn primary" data-act="ol-rematch" data-focus>${S.rm[rv] ? 'ACEPTAR REVANCHA' : 'REVANCHA'}</button>`;
    else if (S.rivalGone) rm = '<p class="sub">Tu rival ya no está en la sala.</p>';
    box.innerHTML = `${rm}<button class="btn" data-act="ol-exit">SALIR AL MENÚ</button>`;
    const f = box.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true });
  }
  function checkRematch() { if (S && S.role === 'host' && S.rm.h && S.rm.g && S.ctl && S.ctl.open) hostStart(); }

  /* ---------- vista del invitado: recibe el estado y lo dibuja interpolado ---------- */
  class GuestMatch {
    constructor(cfg, sendInput) {
      this.userSide = 'R'; this.userIdx = 1; this.state = 'intro'; this.score = { L: 0, R: 0 }; this.timeLeft = M.DURATION; this.time = 0; this.ended = false;
      this.subsLeft = { user: 0, rival: 0 }; this.teams = [PC.TEAMS[cfg.leftTeam], PC.TEAMS[cfg.rightTeam]];
      const mk = (side, def) => ({ side, def, attrs: PC.POSITIONS[def.pos] || PC.POSITIONS.Mediocampo, x: side === 'L' ? 250 : 550, y: C.GROUND, vx: 0, vy: 0, facing: side === 'L' ? 1 : -1, onGround: true, kickT: 0 });
      this.world = { players: [mk('L', cfg.leftPlayer), mk('R', cfg.rightPlayer)], ball: { x: C.W / 2, y: 220, vx: 0, vy: 0, rot: 0 } };
      this.keys = new Set(); this.sendInput = sendInput; this.lastMask = -1; this.rep = 0; this.snaps = []; this.lastQ = -1; this.rq = null; this.lastView = 0; this.lastArr = 0; this.jit = 0; this.buf = 3; this.celebrate = null; this.banner = null; this.result = null;
    }
    keyDown(c) { this.keys.add(c); } keyUp(c) { this.keys.delete(c); } clearKeys() { this.keys.clear(); }
    _held(n) { return KEYS[n].some(k => this.keys.has(k)); }
    pause() { return false; } resume() { return false; } canUserSub() { return false; }
    // Un paso por 1/60 s: manda las teclas al anfitrión (al cambiar y, por si se pierde un mensaje, cada 5 pasos).
    step() {
      if (this.ended) return; this.time += STEP;
      if (this.celebrate) { const c = this.celebrate; c.t += STEP; for (const q of c.confetti) { q.x += q.vx * STEP; q.y += q.vy * STEP; } }
      const B = M.BITS; let mask = 0; if (this._held('left')) mask |= B.left; if (this._held('right')) mask |= B.right; if (this._held('jump')) mask |= B.jump;
      if (this._held('kick')) mask |= B.kick; if (this._held('up')) mask |= B.up; if (this._held('down')) mask |= B.down;
      if ((mask & B.left) && (mask & B.right)) mask &= ~(B.left | B.right);
      if (mask !== this.lastMask || ++this.rep >= 5) { this.sendInput(mask); this.lastMask = mask; this.rep = 0; }
    }
    receive(s) {
      if (this.ended || !s || typeof s !== 'object' || !Array.isArray(s.p) || s.p.length !== 2 || !Array.isArray(s.b)) return;
      const q = num(s.q, -1); if (!(q > this.lastQ)) return; // descarta duplicados y mensajes viejos que llegan desordenados
      const pl = s.p.map(a => (Array.isArray(a) && a.length >= 7 ? a.slice(0, 7).map(n => num(n)) : null)); if (pl.some(a => !a)) return;
      const nowA = performance.now(); // colchón adaptativo: más delay de dibujo si las llegadas son irregulares (jitter)
      if (this.lastArr && this.lastQ >= 0) { const d = Math.abs((nowA - this.lastArr) - (1000 / 60) * (q - this.lastQ)); this.jit += (Math.min(d, 200) - this.jit) * 0.08; this.buf = Math.max(3, Math.min(10, 2 + this.jit / 7)); }
      this.lastArr = nowA; this.lastQ = q; this.snaps.push({ q, p: pl, b: s.b.slice(0, 3).map(n => num(n)) }); if (this.snaps.length > 24) this.snaps.shift();
      const st = M.STATE_NAMES[num(s.s) | 0]; if (st && st !== 'ended') this.state = st;
      this.timeLeft = Math.max(0, Math.min(M.DURATION, num(s.t) / 1000)); if (Array.isArray(s.sc)) { this.score.L = Math.max(0, num(s.sc[0]) | 0); this.score.R = Math.max(0, num(s.sc[1]) | 0); }
      this.banner = M.BANNERS[num(s.bn) | 0] || null;
      if (s.g === 0 || s.g === 1) { if (!this.celebrate) this.celebrate = this._cel(s.g); } else this.celebrate = null;
      if (Array.isArray(s.ev)) for (const e of s.ev.slice(0, 8)) if (Array.isArray(e) && SFX_OK[e[0]] && PC.Audio) PC.Audio.play(e[0], Math.max(0.05, Math.min(1, num(e[1], 0.7))));
      if (this.rq === null) this.rq = q - 3;
    }
    _cel(i) {
      const t = this.teams[i], cols = [t.colors.main, t.colors.second, '#fff'], arr = [];
      for (let k = 0; k < 70; k++) arr.push({ x: Math.random() * C.W, y: -Math.random() * 300, vy: 120 + Math.random() * 180, vx: (Math.random() - 0.5) * 80, c: cols[k % 3] });
      return { t: 0, team: t, confetti: arr, text: t.name };
    }
    view() {
      const now = performance.now(), dt = this.lastView ? Math.min(100, now - this.lastView) : 16; this.lastView = now; const sn = this.snaps;
      if (sn.length) {
        const latest = this.lastQ; this.rq += dt * 0.06; this.rq += (latest - this.buf - this.rq) * 0.04; // reloj de dibujo: ~3 pasos (50 ms) detrás del último estado en una red estable
        if (this.rq > latest - 1) this.rq = latest - 1; if (this.rq < latest - 14) this.rq = latest - 14;
        let idx = -1; for (let i = sn.length - 1; i >= 0; i--) if (sn[i].q <= this.rq) { idx = i; break; }
        const a = idx < 0 ? sn[0] : sn[idx], b = idx < 0 ? sn[0] : (sn[idx + 1] || sn[idx]);
        const f = b.q === a.q ? 0 : Math.max(0, Math.min(1, (this.rq - a.q) / (b.q - a.q)));
        this.world.players.forEach((pw, i) => {
          const pa = a.p[i], pb = b.p[i], jump = Math.abs(pb[0] - pa[0]) > 150 || Math.abs(pb[1] - pa[1]) > 250, ff = jump ? 1 : f, near = ff < 0.5 ? pa : pb;
          pw.x = lerp(pa[0], pb[0], ff); pw.y = lerp(pa[1], pb[1], ff); pw.vx = pb[2]; pw.vy = pb[3]; pw.facing = near[4] >= 0 ? 1 : -1; pw.onGround = !!near[5]; pw.kickT = Math.max(0, near[6]);
        });
        const ja = Math.abs(b.b[0] - a.b[0]) > 150 || Math.abs(b.b[1] - a.b[1]) > 250, fb = ja ? 1 : f, bl = this.world.ball;
        bl.x = lerp(a.b[0], b.b[0], fb); bl.y = lerp(a.b[1], b.b[1], fb); bl.rot = lerp(a.b[2], b.b[2], fb);
      }
      return { world: this.world, teams: this.teams, time: this.time, celebrate: this.celebrate, userSide: 1, banner: this.banner };
    }
    finish(res) {
      if (this.ended) return; this.ended = true; this.state = 'ended'; this.celebrate = null; this.clearKeys(); this.banner = null;
      this.score.L = res.hg; this.score.R = res.ag; this.result = res;
      if (PC.Audio) { PC.Audio.pauseMatch(true); if (res.reason !== 'abandono') PC.Audio.play('final'); }
    }
  }

  /* ---------- acciones de la interfaz ---------- */
  App.onlineLeavePrompt = function () {
    const m = App.match; if (!S) return;
    if (!m || m.ended) { U.modal('¿Salir al menú?', [{ label: 'VOLVER' }, { label: 'SALIR', fn() { App.leaveOnline(); App.showMenu(); } }]); return; }
    U.modal('¿Salir de la partida? Contará como derrota tuya (como mínimo 0-3) y no se puede reanudar.', [{ label: 'VOLVER' }, { label: 'SALIR', cls: 'danger', fn() { forfeitSelf(); } }]);
  };
  function forfeitSelf() {
    const m = App.match; if (!S || !m || m.ended) return;
    if (S.role === 'host') m.forfeitBy('L'); // onEnd → hostMatchEnded avisa al invitado
    else { sendCtl({ t: 'leave' }); const fs = PC.League.forfeitScore(m.score.R, m.score.L); const res = { hg: fs.rival, ag: fs.user, reason: 'abandono', fb: 'R' }; m.finish(res); showOnlineEnd(res); }
  }
  const A = App.actions;
  A.online = () => App.showOnlineHub('');
  A['ol-create'] = () => openHost(readName());
  A['ol-join'] = () => {
    const code = cleanCode((document.getElementById('olCode') || {}).value);
    const name = readName(); if (code.length !== 5) return hubStatus('Escribí el código de 5 letras/números que te pasó el anfitrión.');
    openGuest(name, code);
  };
  A['ol-leave'] = () => App.onlineLeavePrompt();
  A['ol-exit'] = () => { App.leaveOnline(); App.showMenu(); };
  A['ol-exit-lobby'] = () => { App.leaveOnline(); App.showOnlineHub(''); };
  A['ol-swap'] = () => { if (!S || S.role !== 'host') return; const L = S.lobby; L.ht = PC.otherTeam(L.ht); L.hp = null; L.hr = false; L.gp = null; L.gr = false; broadcastLobby(); showLobby(); };
  A['ol-pick'] = el => {
    if (!S) return; const I = lobbyInfo(), p = PC.getPlayer(el.dataset.id); if (!p || p.team !== I.myTeam) return;
    if (S.role === 'host') { S.lobby.hp = p.id; S.lobby.hr = false; broadcastLobby(); } else { S.lobby.gp = p.id; S.lobby.gr = false; sendCtl({ t: 'pick', p: p.id, r: false }); }
    showLobby();
  };
  A['ol-ready'] = () => {
    if (!S) return; const I = lobbyInfo(); if (!I.myId || !I.hasRival) return;
    if (S.role === 'host') { S.lobby.hr = !S.lobby.hr; broadcastLobby(); showLobby(); maybeStart(); }
    else { S.lobby.gr = !S.lobby.gr; sendCtl({ t: 'pick', p: S.lobby.gp, r: S.lobby.gr }); showLobby(); }
  };
  A['ol-copy'] = el => {
    if (!S) return; const txt = el.dataset.what === 'link' ? location.origin + location.pathname + '#sala=' + S.code : S.code;
    const done = () => { el.textContent = '¡COPIADO!'; setTimeout(() => { if (el.isConnected) el.textContent = el.dataset.what === 'link' ? 'COPIAR LINK' : 'COPIAR CÓDIGO'; }, 1500); };
    try { navigator.clipboard.writeText(txt).then(done, () => {}); } catch (e) {}
  };
  A['ol-rematch'] = () => {
    if (!S || S.rivalGone) return;
    if (S.role === 'host') { S.rm.h = true; sendCtl({ t: 'rm', h: S.rm.h, g: S.rm.g }); refreshEnd(); checkRematch(); }
    else { S.rm.g = true; sendCtl({ t: 'rematch' }); refreshEnd(); }
  };

  document.addEventListener('keydown', e => {
    if (e.code !== 'Enter' || !e.target || !e.target.id) return;
    if (e.target.id === 'olName') { const c = document.getElementById('olCode'); if (c) c.focus(); } else if (e.target.id === 'olCode') A['ol-join']();
  });
  // Si abren un link con #sala=CODIGO, se abre directo la pantalla de unirse con el código ya escrito.
  App.bootOnline = function () { const m = /#sala=([A-Za-z0-9]{5})/.exec(root.location.hash || ''); if (m) App.showOnlineHub('', cleanCode(m[1])); };
  PC.Online = { cleanName, cleanCode, GuestMatch };
})(window);
