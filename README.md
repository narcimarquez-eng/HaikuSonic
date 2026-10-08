# HaikuSonic

Juego de plataformas 2.5D estilo Sonic, hecho con Three.js (r160, desde jsDelivr).
Funciona en el navegador del móvil Android: no hay instalación ni compilación.

## Cómo jugarlo

- **En el móvil**: sirve la carpeta con cualquier hosting estático (p. ej. GitHub Pages) y abre el enlace en Chrome. Juega en horizontal.
- **En PC**: sirve la carpeta con un servidor local (`python3 -m http.server`, luego abre `http://localhost:8000`) y usa el teclado. Abrir `index.html` directamente como archivo no funciona: los módulos ES necesitan servidor.
- **Modo de pruebas**: `index.html?debug` expone `window.__hs` (arranque, carga de fase, paso de física y estado) para scripts automáticos.

## Controles

| Acción | Táctil | Teclado |
| --- | --- | --- |
| Moverse | Joystick | ← → / A D |
| Saltar | SALTAR (mantén para saltar más alto) | Espacio / ↑ / W / Z |
| Spin dash | Mantén SPIN parado y suelta | Mantén X / Shift y suelta (con ↓ / S también) |
| Rodar | Mantén abajo corriendo | ↓ / S |
| Picado en el aire | SPIN en el aire | X / Shift en el aire |

## Contenido

- 3 zonas (Verde, Industrial, Acuática) × 3 actos = 9 fases generadas proceduralmente con semilla fija. Cada fase mide entre 950 y 1350 unidades y cambia su mezcla de tramos según el acto.
- Tramos para correr, colinas con rampas, huecos (puentes de troncos, pasarelas de acero o cuerdas; en el agua, balsas), franjas de aceleración con flechas, escaladas con muelles.
- Tubos verticales que se recorren por dentro: **bucles** (hay que venir rápido, por eso hay una franja de aceleración antes) y **bajadas a una galería subterránea**: un tubo baja de la superficie a un pasadizo bajo la pista, recorre la galería (con cristales, estalactitas y piedras) y otro tubo la devuelve arriba. La bajada es opcional: se puede saltar el pozo por encima. Los tubos tienen cuadros, anillos de refuerzo y bridas en las bocas, y se corta la mitad cercana para ver al erizo dentro. Una señal con flecha marca cada bajada.
- Salientes de roca que se pasan por debajo (no se puede saltar a través de ellos) y piedras sólidas que se saltan o se rodean.
- Anillos (instancing), muelles, plataformas de una cara, plataformas móviles con engranajes, enemigos que se pisan o se destruyen rodando, postes de control y meta.
- Terreno de fondo continuo con la pista, por tramos, con colinas (verde), fábricas (industrial) o mar con islas (acuática).
- Cordilleras de crestas con roca, estratos y nieve, con niebla atmosférica.
- Decoración por acto: árboles redondos, pinos, matorrales con flores, tótems, setas y arcos (verde); edificios, grúas, tanques, tuberías y contenedores (industrial); palmeras, muelles, islas de arena y arcos (acuática).
- Hierba 3D (briznas instanciadas) y flores sobre las superficies verdes.
- Cielo, niebla, luz del sol y colores que cambian en cada acto (día, tarde, atardecer o noche según la zona).
- Iluminación con sombras, reflejos de entorno y tone mapping; agua con shader propio.

## Limitaciones actuales

- Los tubos son planos (en el eje X-Y): no hay tubos que se crucen en profundidad.
- La zona acuática no tiene bajadas: el agua llega hasta -3.4 (línea de muerte), así que no cabe una galería bajo la pista.
- Sin raíles con cadenas colgantes ni sonido.
- Los escenarios son geometría procedural de Three.js; no se usan modelos de Blender.
- Pendiente de probar en un móvil real: rendimiento y tamaño de la pantalla. Las pruebas automáticas se han hecho en Chromium headless con renderizado por software.

## Texturas

Las texturas de hierba, madera, ladrillo, suelo y agua son imágenes de muestra de three.js (MIT). Ver `assets/textures/README.md`. Las demás (roca, montaña, tierra, arena, tubos, nubes, ventanas) se generan en el juego (`js/textures.js`).

## Estructura

- `index.html`: HTML, CSS, marcador, controles táctiles y pantallas. Carga `js/main.js` como módulo y define el mapa de importación de Three.js.
- `js/main.js`: renderer, cielo, luces, flujo (título, juego, acto completado, fin) y bucle principal.
- `js/physics.js`: física del jugador (sólidos AABB, rampas, tubos) y reglas (anillos, enemigos, control, meta). Paso fijo de 1/120 s.
- `js/input.js`: teclado, joystick y botones táctiles.
- `js/level.js`: generador de fases: secciones, trayectorias de tubos y datos de cada sólido.
- `js/lane.js`: geometría de la pista (suelo, rampas, muelles, piedras, salientes, plataformas, puentes, tubos, hierba).
- `js/backdrop.js`: fondo: terreno por tramos, cordilleras, decoración instanciada, nubes, agua y humo; colores por zona y acto.
- `js/entities.js`: anillos y enemigos (instancias compartidas), postes, meta, muelles y plataformas móviles.
- `js/world.js`: construye el mundo de una fase en grupos por tramo y oculta los lejanos.
- `js/player.js`: modelo del erizo y su animación.
- `js/textures.js`, `js/geo.js`, `js/util.js`: texturas, geometrías compartidas y utilidades.
- `assets/textures/`: texturas de muestra usadas por el juego.
