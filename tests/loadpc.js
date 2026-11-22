// Carga los módulos puros del juego en Node (para pruebas).
const path = require('path');
globalThis.PC = globalThis.PC || {};
['data', 'league', 'physics', 'ai'].forEach(m => { try { require(path.join(__dirname, '..', 'js', m + '.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; } });
module.exports = globalThis.PC;
