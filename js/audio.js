/* Pingu Cup - audio: efectos y música independientes, sin reinicios ni duplicados. */
(function (root) {
  'use strict';
  const PC = (root.PC = root.PC || {});
  const BASE = 'assets/sounds/';
  const ext = (function () { try { const a = new Audio(); return a.canPlayType('audio/mpeg') ? 'mp3' : 'ogg'; } catch (e) { return 'mp3'; } })();
  const FX = { goal: 'goal_sound', ball: 'ball_sound', whistle: 'one_whistle', final: 'final_whistle', button: 'button_sound' };
  const pools = {}; const last = {};
  let music = null, stadium = null, unlocked = false;
  const st = { sound: true, music: true, inMatch: false, paused: false };

  function mk(src, loop, vol) { const a = new Audio(src); a.loop = !!loop; a.volume = vol; a.preload = 'auto'; return a; }
  function safePlay(a) { try { const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }

  PC.Audio = {
    state: st,
    init(settings) {
      st.sound = settings.sound; st.music = settings.music;
      try {
        music = mk(BASE + 'background_music.' + ext, true, 0.3);
        stadium = mk(BASE + 'stadium.ogg', true, 0.25);
        Object.keys(FX).forEach(k => { pools[k] = [mk(BASE + FX[k] + '.' + ext, false, 0.7), mk(BASE + FX[k] + '.' + ext, false, 0.7), mk(BASE + FX[k] + '.' + ext, false, 0.7)]; });
      } catch (e) {}
    },
    // Los navegadores exigen un gesto del usuario antes de reproducir audio.
    unlock() { if (unlocked) return; unlocked = true; this.sync(); },
    sync() {
      if (!unlocked || !music) return;
      music.volume = st.inMatch ? 0.12 : 0.3;
      if (st.music) { if (music.paused) safePlay(music); } else if (!music.paused) music.pause();
      const wantStadium = st.sound && st.inMatch && !st.paused;
      if (wantStadium) { if (stadium.paused) safePlay(stadium); } else if (!stadium.paused) stadium.pause();
    },
    setSound(on) { st.sound = !!on; this.sync(); },
    setMusic(on) { st.music = !!on; this.sync(); },
    enterMatch() { st.inMatch = true; st.paused = false; this.sync(); },
    pauseMatch(p) { st.paused = !!p; this.sync(); },
    leaveMatch() { st.inMatch = false; st.paused = false; try { stadium.currentTime = 0; } catch (e) {} this.sync(); },
    play(name, volume) {
      if (!st.sound || !unlocked || !pools[name]) return;
      const now = performance.now();
      const minGap = name === 'ball' ? 70 : 0;
      if (last[name] && now - last[name] < minGap) return;
      last[name] = now;
      const pool = pools[name]; let a = pool.find(x => x.paused || x.ended);
      if (!a) { a = pool[0]; try { a.currentTime = 0; } catch (e) {} }
      a.volume = Math.max(0.05, Math.min(1, volume == null ? 0.7 : volume));
      try { a.currentTime = 0; } catch (e) {}
      safePlay(a);
    }
  };
})(window);
