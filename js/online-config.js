/* Pingu Cup - configuración del modo ONLINE.
   Por defecto usa los servicios gratuitos de PeerJS (señalización) y sus servidores STUN/TURN públicos: no hace falta tocar nada.
   Si algún día querés usar tus propios servidores, editá este archivo (ver LEEME.md, sección "Online"). */
(function (root) {
  'use strict';
  const PC = (root.PC = root.PC || {});
  PC.ONLINE_CONFIG = {
    // Opciones extra para `new Peer()`. Vacío = PeerJS Cloud (gratis). Ejemplo con servidor propio:
    // peer: { host: 'mi-servidor.com', port: 443, path: '/peerjs', secure: true }
    peer: {},
    // Lista de servidores ICE (STUN/TURN). null = los que trae PeerJS (STUN de Google + TURN gratuito de PeerJS).
    // OJO: si ponés una lista propia reemplaza a la de PeerJS, así que incluí también un STUN. Ejemplo:
    // iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:HOST:443', username: 'USUARIO', credential: 'CLAVE' }]
    iceServers: null
  };
})(typeof window !== 'undefined' ? window : globalThis);
