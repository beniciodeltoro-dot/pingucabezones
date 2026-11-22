/* Pingu Cup - arranque, bucle principal (paso fijo) y teclado. */
(function () {
  'use strict';
  const PC = window.PC, App = PC.App;
  const STEP = 1 / 60;
  const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyZ', 'KeyK']);
  let last = 0, acc = 0;

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    const m = App.match;
    if (m && App.screen === 'match') {
      if (m.state !== 'paused' && m.state !== 'ended') { acc += dt; let n = 0; while (acc >= STEP && n++ < 6) { m.step(); if (App.online) App.online.tick(m); acc -= STEP; } if (n >= 6) acc = 0; }
      else acc = 0;
      PC.Renderer.draw(App.ctx2d, m.view());
      App.updateHUD();
    } else acc = 0;
  }

  document.addEventListener('click', App.handleClick);
  document.addEventListener('keydown', e => {
    PC.Audio.unlock();
    const m = App.match;
    if (m && App.screen === 'match') {
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { e.preventDefault(); if (App.online) { if (!document.querySelector('.modal-bg')) App.onlineLeavePrompt(); return; } if (m.state === 'paused') App.doResume(); else if (!m.ended) App.doPause(); return; }
      if (GAME_KEYS.has(e.code)) { e.preventDefault(); if (!m.ended) m.keyDown(e.code); }
    }
  });
  document.addEventListener('keyup', e => { const m = App.match; if (m && GAME_KEYS.has(e.code)) m.keyUp(e.code); });
  window.addEventListener('blur', () => { const m = App.match; if (m) { m.clearKeys(); if (!m.ended && App.screen === 'match') App.doPause(); } });
  document.addEventListener('visibilitychange', () => { const m = App.match; if (document.hidden && m && !m.ended && App.screen === 'match') App.doPause(); });
  window.addEventListener('resize', () => App.fitStage());

  window.addEventListener('error', e => console.error('Error en Pingu Cup:', e.message));
  PC.Audio.init(App.settings);
  App.champ = PC.Storage.load(); // datos validados; si están corruptos se descartan y se abre un campeonato nuevo
  PC.Images.loadBase().then(() => {
    PC.Images.crest('pingu'); PC.Images.crest('wachines');
    App.showMenu(); if (App.bootOnline) App.bootOnline(); requestAnimationFrame(frame);
  });
})();
