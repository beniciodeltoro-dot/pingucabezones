# PINGU CUP

Fútbol arcade 1 vs 1 de navegador, basado en el formato de Football Heads. Equipos: **Pingu F.C.** y **CA Wachines**. Interfaz en español.

## Cómo abrirlo
1. Descomprimí el ZIP.
2. Opción simple: abrí `index.html` con doble clic (Chrome, Edge o Firefox actuales).
3. Opción recomendada (el audio y las imágenes se cargan mejor): en la carpeta del juego ejecutá
   `python3 -m http.server 8000` y abrí http://localhost:8000
   (o `node tests/serve.js` y abrí http://localhost:8123).
No necesita internet ni instalar nada.

## Modos
- **JUGAR**: amistoso (elegís equipo, dificultad y jugador). No toca el campeonato.
- **CAMPEONATO**: 19 fechas, un partido por fecha. Pingu F.C. es local en las fechas impares (10) y CA Wachines en las pares (9). Elegís equipo y dificultad al empezar y **un jugador distinto si querés antes de cada partido**; el rival elige al azar uno de su plantel. El progreso se guarda solo (localStorage). «NUEVO CAMPEONATO» pide confirmación.
- **TABLA DE POSICIONES**, **CONTROLES** y botones de **sonido** y **música** (independientes) en el menú.

## Controles
| Acción | Teclas |
|---|---|
| Mover | ← → o A D |
| Saltar | ↑ o W (una vez por pulsación) |
| Patear | Espacio o Z |
| Chute rasante (más bajo y potente) | Espacio + ↓ / S |
| Pelotazo alto | Espacio + ↑ / W |
| Pausa | Esc o P, o el botón de pausa |
| Cambiar de jugador | Botón ⇄ al lado del de pausa (Esc o CANCELAR cierra el panel) |

## Cambios de jugador
- **Vos**: botón **⇄** a la izquierda del de pausa (el número es cuántos cambios te quedan). Hasta **2 por partido**, en **cualquier momento** (también en la cuenta inicial o durante el festejo de un gol). Al tocarlo el partido se pausa, elegís a uno de los otros jugadores de tu plantel y se reanuda. Cancelar no gasta cambios.
- **Rival (IA)**: hasta **2 por partido** y **solo cuando el juego está detenido por un gol** (se aplica al reiniciar el saque, no necesariamente en los primeros goles). En cada gol, de cualquiera de los dos equipos, tiene un 50 % de chances de cambiar (`BOT_SUB_CHANCE` en `js/match.js`) y elige al azar a otro de su plantel. Si el partido tiene pocos goles puede hacer menos de 2.
- El cambio reemplaza foto, dorsal y atributos de posición (velocidad, salto, remate, alcance); la posición, la velocidad, el marcador y el reloj no se tocan. Aparece un aviso arriba con quién sale y quién entra.
- La revancha del amistoso vuelve a empezar con el jugador que elegiste al principio.

## Reglas implementadas
- Partido de **60 s de juego**. El reloj corre solo con pasos de simulación en juego (paso fijo 1/60 s): no se acelera ni se frena por el renderizado y no corre durante celebraciones ni pausa.
- **Gol**: solo cuando la pelota cruza *completa* (centro + radio) la línea de gol y está por debajo del travesaño. Poste, travesaño, techo del arco, cruces parciales y pelotas por encima no cuentan. Un gol se registra una sola vez. Tras el gol hay celebración, se recolocan jugadores y pelota y se reanuda con el tiempo restante.
- **Gol al agotarse el tiempo**: un gol cuyo cruce ocurre en el mismo paso en que se acaba el reloj cuenta una sola vez; si deja menos de un paso de reloj, el partido termina de inmediato. Después del pitazo final no se registra nada.
- **Abandono** (desde la pausa, con confirmación): siempre es derrota del usuario. Si ya perdía conserva el marcador; si ganaba o empataba se registra **0-3 por abandono**. Se guarda una sola vez.
- **Tabla**: 3/1/0 puntos. Orden: puntos, diferencia de gol, goles a favor, victorias de visitante y, como último criterio, un sorteo fijo (hash de una semilla guardada al crear el campeonato). Si el campeón se define por ese sorteo (empate absoluto), la pantalla de campeón lo informa. La tabla se calcula siempre desde los partidos jugados, por eso nunca se duplican estadísticas.
- **Posiciones con efecto real** (la hitbox es igual para todos): Delantero remate +16 % y algo más rápido; Mediocampo equilibrado; Defensor salto +6 % y mejor alcance de pierna; Arquero salto +13 %, alcance +10 %, remate más suave.
- **IA**: máquina de estados (ATAQUE, DEFENSA, PERSECUCIÓN, INTERCEPCIÓN, REMATE, DESPEJE, RECUPERACIÓN) con predicción balística de la pelota, elección de remate simulando trayectorias, tiempo mínimo en cada estado, detección de atascos y tiempos de reacción por dificultad. **No hace trampa**: usa los mismos controles y la misma física. Fácil: reacción 0,30 s, error de posición ±40 px, falla patadas/saltos; Normal: 0,14 s; Difícil: 0,05 s.

## Fotos de jugadores y escudos (IMPORTANTE)
- Los **escudos** de Pingu F.C. y CA Wachines son las imágenes que adjuntaste (recortadas y reducidas, en `assets/crests/`).
- **Las fotos de los 17 jugadores NO están incluidas**: durante el desarrollo no hubo acceso a internet y el dominio `pingucup.gamer.free` no se pudo resolver. En su lugar se muestra un retrato provisional (colores del equipo, iniciales y dorsal); no se inventaron fotos ni se reasignaron.
- Para incorporarlas: con internet ejecutá `python3 tools/descargar_imagenes.py` (descarga a `assets/players/<id>.png` y regenera `js/photos.js`), o copiá tus imágenes a mano con el nombre `<id>.png` y ejecutá `python3 tools/descargar_imagenes.py --solo-indexar`. Los ids están en `js/data.js` (p. ej. `pin-saya-11`, `pin-gudenschwager-67`, `pin-sauch-67`, `wac-iniguez-31`). La foto se recorta en círculo sobre la cabeza del personaje sin tocar animaciones ni hitbox (probado con una imagen de prueba).

## Qué se conservó y qué se cambió del juego original
- **Se analizó** `fh_de_1920.zip`: es un bundle webpack de ~2,7 MB (PixiJS + pixi-sound, moment, crypto-browserify, webfontloader) con la lógica del juego **ofuscada** (tabla de cadenas en base64 con rotación y código anti-depuración). No era mantenible, así que **se reconstruyó el motor de forma legible** (ver `js/`). Las físicas se recrearon observando el formato del original (cabeza grande, pierna que patea, arcos laterales); las constantes se ajustaron con pruebas propias, no son un volcado del código original.
- **Seguridad**: al iniciar, el bundle original hace un `POST` (XMLHttpRequest) a un servidor configurable con un `gameID` (estadística/seguimiento), y trae enlaces a servicios de fuentes externos (Typekit, Google Fonts, fast.fonts.net, fontdeck) y publicidad cruzada de Dvadi/Igrodel. **Nada de eso está en Pingu Cup**: el bundle original no se incluye y se verificó en pruebas que el juego no hace ninguna solicitud externa.
- **Se conservaron**: sprites de pelota, arco, sombras, botines y botón de pausa; fondo del estadio (con los carteles «DVADI.COM» reemplazados por carteles de Pingu Cup); los sonidos (gol, golpe, silbatos, estadio, música, botón) y las fuentes Cadillac Sans / Century Gothic. **No se incluyen** las cabezas de futbolistas reales ni los logos de clubes alemanes del original.

## Estructura
```
index.html  css/style.css
js/data.js      equipos, plantel (ids únicos), atributos por posición
js/league.js    calendario, tabla, campeón, validación + persistencia (localStorage)
js/physics.js   motor físico y detección de goles (sin DOM)
js/ai.js        inteligencia artificial
js/match.js     reloj, goles, pausa, abandono, fin de partido
js/audio.js     efectos y música      js/render.js  dibujo en canvas
js/ui.js        pantallas             js/main.js    bucle y teclado
assets/         img, crests, players (fotos), sounds, fonts
tools/descargar_imagenes.py   tests/   pruebas
```

## Pruebas (carpeta `tests/`)
`node tests/physics.test.js`, `node tests/league.test.js`, `node tests/match.test.js`, `node tests/ai.sim.js` (simulaciones sin interfaz) y `node tests/subs.e2e.js` (botón de cambio en Chromium real) y `node tests/e2e.test.js` (Chromium real; requiere `npm i playwright` y `PLAYWRIGHT_PATH` si no es global).
