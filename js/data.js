/* Pingu Cup - datos de equipos y jugadores (única fuente de verdad). */
(function (root) {
  'use strict';
  const PC = (root.PC = root.PC || {});

  PC.TEAMS = {
    pingu: {
      id: 'pingu', name: 'Pingu F.C.', short: 'PIN',
      crest: 'assets/crests/pingu.png',
      colors: { main: '#f2e6cf', second: '#35505f', trim: '#15191c', text: '#15191c' },
      kit: 'pingu'
    },
    wachines: {
      id: 'wachines', name: 'CA Wachines', short: 'WAC',
      crest: 'assets/crests/wachines.png',
      colors: { main: '#ffffff', second: '#1a3fb5', trim: '#0e2470', text: '#ffffff' },
      kit: 'wachines'
    }
  };
  PC.TEAM_IDS = ['pingu', 'wachines'];

  // Los ids internos son únicos aunque dos jugadores compartan dorsal (67).
  // photoUrl: URL original indicada; la foto local se espera en assets/players/<id>.png
  const BASE = 'https://pingucup.gamer.free/uploads/jugadores/';
  const P = (id, team, num, name, pos, file) => ({
    id, team, number: num, name, pos, photoUrl: BASE + file, photo: 'assets/players/' + id + '.png'
  });
  PC.PLAYERS = [
    P('pin-salvatierra-10', 'pingu', 10, 'Alejo Salvatierra', 'Arquero', 'jugador_6a7a6eaf83aed.png'),
    P('pin-saya-11', 'pingu', 11, 'Facundo Saya', 'Delantero', 'jugador_6a7a6f2a12e8e.png'),
    P('pin-romero-13', 'pingu', 13, 'Gonzalo Romero', 'Mediocampo', 'jugador-default.png'),
    P('pin-coria-20', 'pingu', 20, 'Mateo Coria', 'Defensor', 'jugador_6a7a6f01c8e32.png'),
    P('pin-florentin-24', 'pingu', 24, 'Nicolas Florentin', 'Defensor', 'jugador_6a7a6edc31b3b.png'),
    P('pin-gudenschwager-67', 'pingu', 67, 'Owen Gudenschwager', 'Delantero', 'jugador_6a7a6ec667845.png'),
    P('pin-sauch-67', 'pingu', 67, 'Ivan Sauch', 'Mediocampo', 'jugador_6a7a6f17bba6d.png'),
    P('pin-deltoro-98', 'pingu', 98, 'Benicio Del Toro', 'Defensor', 'jugador_6a7a6f3e38886.png'),

    P('pin-guzman-8', 'wachines', 8, 'Ezequiel Guzmán Tapia', 'Delantero', 'jugador_6a7a77bec7d9d.png'),
    P('wac-romero-2', 'wachines', 2, 'Santino Ariel Romero', 'Defensor', 'jugador_6a7a77276d271.png'),
    P('wac-dapueto-3', 'wachines', 3, 'Lautaro Dapueto', 'Defensor', 'jugador_6a7a7778a12fd.png'),
    P('wac-jaimes-4', 'wachines', 4, 'Luciano Jaimes', 'Defensor', 'jugador_6a7a778b9bd2c.png'),
    P('wac-gomez-11', 'wachines', 11, 'Nicolas Gomez Riviere', 'Defensor', 'jugador_6a7a7714a5774.png'),
    P('wac-falcinelli-21', 'wachines', 21, 'Esteban Falcinelli', 'Mediocampo', 'jugador_6a7a774690f4.png'),
    P('wac-iniguez-31', 'wachines', 31, 'Bautista Iñiguez', 'Delantero', 'jugador_6a7a775ba5dc8.png'),
    P('wac-dalzotto-42', 'wachines', 42, 'Federico Dalzotto', 'Arquero', 'jugador_6a7a77a1378d9.png'),
    P('wac-caggia-69', 'wachines', 69, 'Francisco Caggia', 'Mediocampo', 'jugador_6a7a6b1467cc1.png')
  ];

  // Atributos por posición (multiplicadores sobre los valores base de física).
  // La hitbox (radio de cabeza) NO cambia: es la misma para todos.
  PC.POSITIONS = {
    Delantero:  { speed: 1.04, jump: 0.98, kick: 1.16, reach: 1.00, desc: 'Remate potente, algo más rápido' },
    Mediocampo: { speed: 1.00, jump: 1.00, kick: 1.00, reach: 1.00, desc: 'Equilibrado' },
    Defensor:   { speed: 0.98, jump: 1.06, kick: 0.98, reach: 1.04, desc: 'Buen salto y alcance de pierna' },
    Arquero:    { speed: 0.95, jump: 1.13, kick: 0.92, reach: 1.10, desc: 'Gran salto y alcance, remate suave' }
  };

  PC.getPlayer = id => PC.PLAYERS.find(p => p.id === id) || null;
  PC.teamPlayers = teamId => PC.PLAYERS.filter(p => p.team === teamId);
  PC.otherTeam = teamId => (teamId === 'pingu' ? 'wachines' : 'pingu');

  // Lista de fotos disponibles localmente (la genera tools/descargar_imagenes.py).
  PC.AVAILABLE_PHOTOS = PC.AVAILABLE_PHOTOS || [];
  PC.hasPhoto = id => PC.AVAILABLE_PHOTOS.indexOf(id) >= 0;

  if (typeof module !== 'undefined') module.exports = PC;
})(typeof window !== 'undefined' ? window : globalThis);
