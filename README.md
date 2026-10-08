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
- Tramos para correr, colinas (algunas empinadas, de hasta 5 de altura), huecos (puentes de troncos, pasarelas de acero o cuerdas; en el agua, balsas), franjas de aceleración con flechas, escaladas con muelles.
- Tubos verticales que se recorren por dentro: **bucles** (hay que venir rápido, por eso hay una franja de aceleración antes; el tubo entra por la pista y sale 3.6 unidades más adelante, delante de una pared de cuadros con un agujero circular por donde pasa el lazo y una abertura abajo, por la que la pista entra y sale) y **bajadas a una galería subterránea**: un tubo baja de la superficie a un pasadizo bajo la pista, recorre la galería (un túnel de aceleración con cristales, estalactitas y piedras) y otro tubo la devuelve arriba. La bajada es opcional: se puede saltar el pozo por encima. Los tubos tienen cuadros, anillos de refuerzo y bridas en las bocas, y se corta la mitad cercana para ver al erizo dentro. Una señal con flecha marca cada bajada.
- Salientes de roca que se pasan por debajo (no se puede saltar a través de ellos) y piedras sólidas que se saltan o se rodean.
- Zonas de peligro: **pinchos** (en verde e industrial, a veces con una galería bajo ellos que sirve de atajo sin peligro) y **agua** (huecos que matan al caer). Un muelle, pisado corriendo, lanza al jugador por encima de la franja hasta una meseta: terreno sólido que sube de golpe 6.5 sobre la pista y baja después por una rampa.
- Mesetas con muelle: un muelle en la pista lanza a una meseta de 4 de altura, y una escalada lleva desde esa meseta a otra de 8. Son terreno sólido que sube de golpe, no plataformas colgantes.
- Anillos (instancing), muelles, plataformas de una cara, plataformas móviles con engranajes, enemigos que se pisan o se destruyen rodando (con chispas), postes de control y meta.
- Enemigos nuevos (modelos de Blender): **drones voladores** que ondulan sobre la pista (se pisan desde un salto o un picado), **torretas** que disparan al jugador que se acerca (los proyectiles hieren al tocarlos) y un **jefe final** al final del tercer acto de cada zona: aguanta tres golpes (rodar contra él o pisarlo), con invulnerabilidad breve tras cada golpe. También hay **moscas** que zumban en círculos a la altura de un salto (sobre todo sobre el agua), **gusanos** que asoman del suelo cada pocos segundos (solo tocan cuando están fuera) y **escarabajos** que caminan por la pista (zonas verde e industrial).
- Enemigos: caminantes; **avispas** que ondulan y se lanzan en picado; **saltamontes** que dan saltos; **erizos** con púas (solo los destruye rodar o cargar); **peces** que saltan del agua; drones, moscas, gusanos, escarabajos y torretas. El giro en el aire (un salto o un muelle) destruye a cualquiera que toque, salvo a los erizos.
- Más desniveles para coger velocidad: **valles** (una bajada en rampa hasta un fondo con franja de aceleración y una subida) y **mesetas**. Bajar una pendiente acelera y subir frena un poco. La velocidad al salir de un muelle se limita a 24 para que la meseta siguiente se alcance.
- Enemigos repartidos: cada tramo de 100 unidades tiene al menos seis, sobre la pista llana y lejos de trampas. En los tramos largos hay un segundo caminante, y las ramas altas y los túneles traen los suyos.
- **Potenciadores** (se recogen al pasar cerca): anillo azul = escudo, que absorbe un golpe sin perder anillos ni vida; rombo naranja = zapatillas, 10 s más rápido; estrella amarilla = 10 s invencible, que destruye lo que toca; esfera roja = vida extra. Aparecen en la pista, en los túneles, en la rama alta y en la cámara oculta. El marcador muestra los que están activos.
- **Cadenas de túneles** (zonas verde e industrial): dos o tres bajadas a galerías subterráneas seguidas, cada una con su potenciador.
- **Rama alta** (todas las zonas): un muelle lanza a una plataforma sobre la pista, con anillos, enemigos y potenciadores, y un tubo devuelve a la pista. Es opcional: la pista central sigue sin ella.
- **Cámara oculta** (en la mayoría de los actos): desde la rama alta, un tubo sube a una cámara en un piso más alto, con dos potenciadores. Es el único camino hasta ella: no se puede saltar hasta la cámara desde la plataforma ni desde la pista.
- Agua: **arroyos** y **lagunas** poco profundos por los que se chapotea (más despacio y salpicando), con superficie de ondas y un frente translúcido que se desvanece hacia el fondo; **cascadas** de estrías verticales que bajan por el borde de una meseta hasta un estanque, con salpicaduras en la base; y los huecos con agua con peces dentro.
- Terreno de fondo continuo con la pista, por tramos, con colinas (verde), fábricas (industrial) o mar con islas (acuática). En la zona verde y en la industrial, un camino serpentea por el fondo; en la verde, además, un río cruza los valles y hay arboledas.
- Cordilleras de crestas con roca, estratos y nieve, con niebla atmosférica. Cada cordillera tiene columnas más finas que antes, dientes en la cresta, barrancos verticales, una línea de nieve irregular y un relieve de roca (mapa de normales CC0). En la zona verde hay cuatro capas de montañas, con pinos, árboles y rocas al pie; en la acuática, cuatro capas con rocas al pie; en la industrial, dos capas tras el skyline.
- Decoración por acto: árboles, pinos, matorrales con flores, rocas, tótems, setas y arcos (verde); edificios, grúas, tanques, tuberías y contenedores (industrial); palmeras, muelles, islas de arena y arcos (acuática). Árboles, rocas y arbustos son modelos de Blender (`assets/models/`), con figuras de respaldo si no cargan.
- Hierba 3D (briznas instanciadas) y flores sobre las superficies verdes.
- Cielo, niebla, luz del sol y colores que cambian en cada acto (día, tarde, atardecer o noche según la zona).
- Iluminación con sombras, reflejos de entorno y tone mapping; agua con shader propio.

## Limitaciones actuales

- Los tubos son planos (en el eje X-Y): no hay tubos que se crucen en profundidad.
- La zona acuática no tiene bajadas: el agua llega hasta -3.4 (línea de muerte), así que no cabe una galería bajo la pista.
- Sin raíles con cadenas colgantes ni sonido.
- Los escenarios son geometría procedural de Three.js, salvo los enemigos y la decoración de árboles, rocas y arbustos, que son modelos de Blender (`assets/models/*.glb`). Las fotos de textura de bibliotecas gratuitas (Poly Haven, ambientCG) no son accesibles desde el entorno de desarrollo, así que el color de la roca y de las montañas es procedural. Sí se usa un mapa de normales CC0 del paquete npm `@pmndrs/assets` para el relieve de las cordilleras.
- Pendiente de probar en un móvil real: rendimiento y tamaño de la pantalla. Las pruebas automáticas se han hecho en Chromium headless con renderizado por software.

## Texturas

Las texturas de hierba, madera, ladrillo y suelo son imágenes de muestra de three.js (MIT). El relieve de las cordilleras es un mapa de normales CC0 (`assets/textures/rock_normal.webp`). El agua (ondas, espuma y estrías de las cascadas) se genera en `js/water.js`. Ver `assets/textures/README.md`. Las demás (roca, montaña, tierra, arena, tubos, nubes, ventanas) se generan en el juego (`js/textures.js`).

## Estructura

- `index.html`: HTML, CSS, marcador, controles táctiles y pantallas. Carga `js/main.js` como módulo y define el mapa de importación de Three.js.
- `js/main.js`: renderer, cielo, luces, flujo (título, juego, acto completado, fin) y bucle principal.
- `js/physics.js`: física del jugador (sólidos AABB, rampas, tubos, muelles) y reglas (anillos, enemigos, pinchos, agua, control, meta). Paso fijo de 1/120 s.
- `js/input.js`: teclado, joystick y botones táctiles.
- `js/level.js`: generador de fases: secciones, trayectorias de tubos y datos de cada sólido.
- `js/lane.js`: geometría de la pista (suelo, rampas, muelles, piedras, salientes, plataformas, puentes, tubos, arcos de los bucles, hierba).
- `js/backdrop.js`: fondo: terreno por tramos, caminos y río, cordilleras, decoración instanciada, nubes, agua y humo; colores por zona y acto.
- `js/entities.js`: anillos y enemigos (instancias compartidas), postes, meta, muelles y plataformas móviles.
- `js/fx.js`: chispas al destruir enemigos (partículas en una malla instanciada que se reciclan).
- `js/water.js`: agua somera (vados, arroyos, lagunas y estanques, con superficie de ondas) y cascadas de estrías verticales con salpicaduras.
- `js/models.js`: carga los modelos `.glb` (enemigos y decoración, `assets/models/`); cada pieza se dibuja como malla instanciada.
- `tools/blender/make_enemies.py`: crea esos modelos (enemigos y decoración) con Blender como módulo de Python (`pip install bpy`; `python tools/blender/make_enemies.py -- assets/models`).
- `js/world.js`: construye el mundo de una fase en grupos por tramo y oculta los lejanos.
- `js/player.js`: modelo del erizo y su animación.
- `js/textures.js`, `js/geo.js`, `js/util.js`: texturas, geometrías compartidas y utilidades.
- `assets/textures/`: texturas de muestra usadas por el juego.
