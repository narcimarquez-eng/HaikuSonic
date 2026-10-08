# HaikuSonic

Juego de plataformas 2.5D estilo Sonic, hecho con Three.js en un único archivo (`index.html`).
Funciona en el navegador del móvil Android: no hay instalación ni compilación.

## Cómo jugarlo

- **En el móvil**: sirve la carpeta con cualquier hosting estático (p. ej. GitHub Pages) y abre el enlace en Chrome. Juega en horizontal.
- **En PC**: abre `index.html` con un servidor local (`python3 -m http.server`) y usa el teclado.

## Controles

| Acción | Táctil | Teclado |
| --- | --- | --- |
| Moverse | Joystick | ← → / A D |
| Saltar | SALTAR | Espacio / ↑ / W / Z |
| Spin dash | Mantén SPIN parado y suelta | Mantén X / Shift y suelta (con ↓ / S también) |
| Rodar | Mantén abajo corriendo | ↓ / S |
| Picado en el aire | SPIN en el aire | X / Shift en el aire |

## Contenido

- 3 zonas (Verde, Industrial, Acuática) × 3 actos = 9 niveles generados proceduralmente con semilla fija.
- Tramos planos largos para correr, rampas que suben y bajan, huecos con puente opcional.
- Franjas de aceleración con flechas: al pisarlas, el erizo sale disparado.
- Salientes de roca que se pasan por debajo (no se puede saltar a través de ellos).
- Puentes con cuerdas o barandillas, plataformas de roca con hierba y móviles con engranajes.
- Anillos (instancing), muelles, plataformas de una cara, plataformas móviles, enemigos que se pisan o se destruyen rodando, postes de control y meta.
- Texturas procedurales (sin imágenes externas) para hierba, tierra, madera, acero, arena y roca.
- Iluminación con sombras, reflejos de entorno y tone mapping; cielo y agua con shaders propios.
- Terreno de fondo continuo con la pista: colinas, bosque, fábricas con humo y mar con islas, todo apoyado en el suelo.
- Hierba 3D (briznas instanciadas) y flores sobre el suelo de la zona verde; suelo con cuadros estilo Green Hill.
- Arcos de roca en el fondo, tótems, setas, palmeras, muelles y montañas lejanas.
- Enemigos robot con cúpula, antenas y ruedas que giran.
- El erizo gira en el salto y rueda al correr con SPIN.

## Limitaciones actuales

- Sin bucles, tubos ni túneles por los que el carril atraviese la pantalla: con esta cámara 2.5D taparían al jugador. Los salientes de roca son la alternativa.
- Sin raíles con cuerdas ni cadenas colgantes todavía.
- Sin sonido.
- Los escenarios son geometría procedural de Three.js; no se usan modelos de Blender.

## Estructura

- `index.html`: el juego completo (HTML, CSS y JavaScript). Three.js se carga desde jsDelivr (v0.160.0).
