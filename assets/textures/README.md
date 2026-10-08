# Texturas

Imágenes de muestra del repositorio de ejemplos de three.js
(https://github.com/mrdoob/three.js/tree/r160/examples/textures), con licencia MIT.
Redimensionadas a 1024 px como máximo y recomprimidas en JPEG.

| Archivo | Original | Uso |
| --- | --- | --- |
| grass.jpg | terrain/grasslight-big.jpg | Hierba de la zona verde |
| wood.jpg | hardwood2_diffuse.jpg | Madera de plataformas y puentes |
| brick.jpg | brick_diffuse.jpg | Fachadas de la zona industrial |
| floor.jpg | floors/FloorsCheckerboard_S_Diffuse.jpg | Suelo de la zona industrial |
| waternormal.jpg | waternormals.jpg | Destellos del agua |
| rock_normal.webp | normals/0010.webp de `@pmndrs/assets` 1.7.0 (npm), 512 px | Relieve de roca de las cordilleras |

`rock_normal.webp` viene del paquete `@pmndrs/assets`, que declara licencia CC0 1.0. Su README remite a
emmelleppi/normal-maps para ver los mapas originales. Se usa solo como relieve (`normalMap`): el color de las montañas
sale de la textura procedural y de los colores de cada zona.

El juego usa textura procedural si alguna imagen no carga.
