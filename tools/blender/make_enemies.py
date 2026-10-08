"""Modelos de los enemigos (drones, torretas, jefe, avispa, saltamontes, erizo, pez, mosca, gusano y
escarabajo) y del escenario (árboles, rocas y arbusto), hechos con Blender.

Usa Blender como módulo de Python (bpy; probado con bpy 5.2 en Python 3.13):
    pip install bpy
    python tools/blender/make_enemies.py -- assets/models

Escribe assets/models/<nombre>.glb para cada modelo. Unidades: 1 unidad = 1 de la pista del juego.
La base del modelo está en z = 0 de Blender (y = 0 en el juego) y el modelo mira a +X (hacia la derecha).
Blender tiene Z hacia arriba; el exportador lo pasa a Y hacia arriba, como pide glTF.
Las piezas de un mismo material se unen en una sola malla: cada modelo se dibuja con pocas llamadas.
"""
import math
import os
import sys

import bpy

OUT_DIR = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'assets/models'


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hex_color, metallic=0.2, roughness=0.5, glow=0.0):
    """Material de color (hexadecimal sRGB); con glow > 0 también brilla (ojos, núcleos)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    rgb = tuple(to_linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if glow > 0:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1.0)
        bsdf.inputs['Emission Strength'].default_value = glow
    return mat


def sphere(r, loc, mat, scale=(1, 1, 1), segments=24, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=segments, ring_count=rings, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def blob(r, loc, mat, scale=(1, 1, 1)):
    """Esfera de baja resolución (16 x 10) para los modelos nuevos."""
    return sphere(r, loc, mat, scale, segments=16, rings=10)


def cylinder(r, depth, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=20, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.data.materials.append(mat)
    return o


def cone(r, depth, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0, depth=depth, vertices=14, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.data.materials.append(mat)
    return o


def torus(major, minor, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot,
                                     major_segments=32, minor_segments=8)
    o = bpy.context.active_object
    o.data.materials.append(mat)
    return o


def box(size, loc, mat, bevel=0.0):
    """Caja de medidas size; con bevel se redondean las aristas (la escala se aplica antes)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    o.data.materials.append(mat)
    if bevel:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        mod = o.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def flatten_bottom(o):
    """Corta lo que queda bajo z = 0 y cierra la base con una cara plana."""
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), use_fill=True, clear_inner=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    return o


def export(name, objs):
    """Une las piezas de cada material en una malla y exporta el modelo como .glb."""
    groups = {}
    for o in objs:
        groups.setdefault(o.data.materials[0].name, []).append(o)
    merged = []
    for group in groups.values():
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        merged.append(bpy.context.view_layer.objects.active)
    bpy.ops.object.select_all(action='DESELECT')
    for o in merged:
        o.select_set(True)
    bpy.context.view_layer.objects.active = merged[0]
    path = os.path.join(OUT_DIR, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    print('escrito', path, os.path.getsize(path), 'bytes,', len(merged), 'materiales')


def build_flyer():
    """Dron volador: cuerpo redondo, dos rotores y un visor que brilla."""
    clear()
    steel = material('steel', '3b4a5c', metallic=0.6, roughness=0.35)
    dark = material('dark', '23272d', metallic=0.4, roughness=0.6)
    gold = material('gold', 'ffd23f', metallic=0.3, roughness=0.3)
    eye = material('eye', 'ffea00', glow=8.0)
    objs = [
        sphere(0.42, (0, 0, 0), steel, scale=(1.0, 1.0, 0.8)),
        sphere(0.2, (0, 0, 0.3), dark),
        sphere(0.12, (0.36, 0, 0.1), eye),
        cylinder(0.035, 1.3, (0, 0, 0.36), dark, rot=(0, math.pi / 2, 0)),
    ]
    for s in (-1, 1):
        objs.append(cylinder(0.36, 0.035, (s * 0.6, 0, 0.5), gold))
        objs.append(cylinder(0.07, 0.14, (s * 0.6, 0, 0.44), dark))
    export('flyer', objs)


def build_shooter():
    """Torreta sobre una base que dispara hacia el frente; el visor y la boca del cañón brillan."""
    clear()
    steel = material('steel', '5a5f66', metallic=0.7, roughness=0.4)
    dark = material('dark', '2a2e34', metallic=0.5, roughness=0.6)
    red = material('red', 'e8452c', metallic=0.3, roughness=0.4)
    eye = material('eye', 'ff5a2a', glow=6.0)
    objs = [
        cylinder(0.45, 0.3, (0, 0, 0.15), dark),
        box((0.5, 0.5, 0.45), (0, 0, 0.6), steel, bevel=0.06),
        sphere(0.28, (0, 0, 1.0), steel, scale=(1, 1, 0.9)),
        sphere(0.11, (0.22, 0, 1.02), eye),
        cylinder(0.09, 0.75, (0.52, 0, 0.95), red, rot=(0, math.pi / 2, 0)),
        cylinder(0.12, 0.08, (0.9, 0, 0.95), dark, rot=(0, math.pi / 2, 0)),
    ]
    export('shooter', objs)


def build_boss():
    """Jefe final: cuerpo grande sobre dos patas, núcleo que brilla, cabina y dos cañones delanteros."""
    clear()
    plate = material('plate', '3a2a52', metallic=0.7, roughness=0.35)
    dark = material('dark', '1d1f26', metallic=0.5, roughness=0.6)
    gold = material('gold', 'ffd23f', metallic=0.4, roughness=0.3)
    glass = material('glass', '7ee8ff', metallic=0.0, roughness=0.1, glow=2.0)
    core = material('core', 'ff7a00', glow=10.0)
    objs = [sphere(1.15, (0, 0, 1.85), plate, scale=(1.0, 1.0, 0.95)),
            torus(1.18, 0.08, (0, 0, 1.45), gold),
            sphere(0.45, (1.0, 0, 1.9), core),
            sphere(0.55, (0.2, 0, 2.95), glass, scale=(1, 1, 0.8))]
    for x in (-0.55, 0.55):
        objs.append(cylinder(0.3, 1.1, (x, 0, 0.55), dark))
        objs.append(box((1.0, 0.7, 0.2), (x, 0, 0.1), dark, bevel=0.05))
    for y in (-1.35, 1.35):
        objs.append(cylinder(0.17, 1.6, (0.3, y, 1.7), dark, rot=(math.pi / 2, 0, 0)))
        objs.append(cylinder(0.2, 1.0, (1.1, y * 0.96, 1.7), gold, rot=(0, math.pi / 2, 0)))
    for a in (0, 2.094, 4.189):
        objs.append(cone(0.2, 0.7, (-0.6 + 0.55 * math.cos(a), 0.55 * math.sin(a), 2.95), gold))
    export('boss', objs)


def build_wasp():
    """Avispa: cuerpo amarillo con franjas negras, alas claras, aguijón y ojos que brillan."""
    clear()
    yellow = material('yellow', 'ffc62b', metallic=0.1, roughness=0.4)
    dark = material('dark', '1d1f26', metallic=0.2, roughness=0.5)
    wing = material('wing', 'dfeaf2', metallic=0.1, roughness=0.15)
    eye = material('eye', 'ff3b2e', glow=4.0)
    objs = [sphere(0.42, (0, 0, 0), yellow, scale=(1.35, 1.0, 1.0)),
            sphere(0.22, (0.62, 0, 0.03), dark),
            cone(0.07, 0.35, (-0.78, 0, 0), dark, rot=(0, -math.pi / 2, 0))]
    for x in (0.12, -0.18):
        objs.append(torus(0.4, 0.07, (x, 0, 0), dark, rot=(0, math.pi / 2, 0)))
    for s in (-1, 1):
        objs.append(sphere(0.08, (0.74, s * 0.12, 0.1), eye))
        objs.append(cylinder(0.018, 0.42, (0.8, s * 0.09, 0.3), dark, rot=(0, 0.45, 0)))
        objs.append(sphere(0.3, (0.05, s * 0.36, 0.34), wing, scale=(1.3, 0.05, 0.85)))
        objs.append(sphere(0.2, (-0.25, s * 0.3, 0.3), wing, scale=(1.0, 0.05, 0.6)))
    export('wasp', objs)


def build_hopper():
    """Saltamontes: cuerpo verde, patas traseras largas para saltar, antenas y alas marrones."""
    clear()
    green = material('green', '58a83a', metallic=0.0, roughness=0.6)
    dark = material('dark', '1d1f26', metallic=0.2, roughness=0.5)
    brown = material('brown', '9c7a4a', metallic=0.0, roughness=0.8)
    objs = [sphere(0.32, (0, 0, 0.32), green, scale=(1.5, 0.8, 0.85)),
            sphere(0.25, (0.6, 0, 0.36), green)]
    for s in (-1, 1):
        objs.append(sphere(0.09, (0.72, s * 0.14, 0.45), dark))
        objs.append(cylinder(0.015, 0.6, (0.7, s * 0.08, 0.6), dark, rot=(0, 0.6, s * 0.2)))
        objs.append(cylinder(0.07, 0.75, (-0.05, s * 0.28, 0.12), green, rot=(0, 0.8, 0)))
        objs.append(cylinder(0.035, 0.5, (0.25, s * 0.22, 0.08), dark, rot=(0, 0.5, 0)))
        objs.append(box((0.9, 0.2, 0.02), (-0.1, s * 0.08, 0.6), brown))
    export('hopper', objs)


def build_spiky():
    """Erizo con púas: cuerpo de color óxido, púas plateadas y ojos amarillos. Solo lo destruye rodar."""
    clear()
    body = material('body', '8b3a2b', metallic=0.2, roughness=0.6)
    dark = material('dark', '2a2e34', metallic=0.5, roughness=0.6)
    spike = material('spike', 'e6ebf0', metallic=0.6, roughness=0.3)
    eye = material('eye', 'ffd23f', glow=5.0)
    objs = [sphere(0.5, (0, 0, 0.42), body, scale=(1.1, 1.0, 0.75)),
            box((1.0, 0.8, 0.22), (0, 0, 0.12), dark, bevel=0.05)]
    for k in range(7):
        a = math.pi * (0.1 + k * 0.13)
        objs.append(cone(0.1, 0.45, (0.42 * math.cos(a) * 1.1, 0, 0.42 + 0.42 * math.sin(a) * 0.75), spike,
                         rot=(0, math.pi / 2 - a, 0)))
    for s in (-1, 1):
        objs.append(sphere(0.08, (0.42, s * 0.2, 0.5), eye))
    export('spiky', objs)


def build_fish():
    """Pez saltarín: cuerpo naranja, aleta dorsal, cola y ojos."""
    clear()
    orange = material('orange', 'ff7a3d', metallic=0.1, roughness=0.4)
    white = material('white', 'f4f6f8', metallic=0.0, roughness=0.3)
    dark = material('dark', '111318', metallic=0.0, roughness=0.3)
    objs = [sphere(0.36, (0, 0, 0.36), orange, scale=(1.5, 0.55, 0.9)),
            cone(0.3, 0.5, (-0.8, 0, 0.36), orange, rot=(0, -math.pi / 2, 0)),
            cone(0.12, 0.3, (0.0, 0, 0.7), orange)]
    for s in (-1, 1):
        objs.append(sphere(0.1, (0.55, s * 0.2, 0.45), white))
        objs.append(sphere(0.05, (0.62, s * 0.23, 0.45), dark))
    export('fish', objs)


def build_housefly():
    """Mosca doméstica: cuerpo oliva, ojos rojos que brillan y cuatro alas claras, centrada en el origen."""
    clear()
    body = material('body', '4a4f2a', metallic=0.0, roughness=0.5)
    eye = material('eye', 'e0262b', metallic=0.1, roughness=0.3, glow=3.0)
    wing = material('wing', 'e6eef5', metallic=0.0, roughness=0.1)
    objs = [blob(0.22, (0, 0, 0), body, scale=(1.1, 0.85, 0.9)),
            blob(0.13, (0.26, 0, 0.02), body)]
    for s in (-1, 1):
        objs.append(blob(0.1, (0.3, s * 0.09, 0.05), eye))
        objs.append(blob(0.28, (-0.02, s * 0.2, 0.12), wing, scale=(1.1, 0.04, 0.55)))
        back = blob(0.28, (-0.02, s * 0.2, 0.12), wing, scale=(1.1, 0.04, 0.55))
        back.rotation_euler = (0, 0, s * 0.3)  # segundo par de alas, en el mismo sitio y abierto en V
        objs.append(back)
    export('housefly', objs)


def build_worm():
    """Gusano segmentado: cinco segmentos rosados, cabeza más oscura y dos ojos negros; mira a +X."""
    clear()
    skin = material('skin', 'e88a7a', metallic=0.0, roughness=0.6)
    head = material('head', 'd46f60', metallic=0.0, roughness=0.5)
    dark = material('dark', '1d1f26', metallic=0.2, roughness=0.4)
    objs = [blob(0.22, (x, 0, 0.22), skin) for x in (-0.6, -0.3, 0.0, 0.3, 0.6)]
    objs.append(blob(0.24, (0.75, 0, 0.24), head))
    for s in (-1, 1):
        objs.append(blob(0.05, (0.92, s * 0.09, 0.32), dark))
    export('worm', objs)


def build_beetle():
    """Escarabajo: caparazón rojo abombado, cabeza negra, seis patas que tocan el suelo y cuatro manchas."""
    clear()
    shell = material('shell', 'c8321e', metallic=0.1, roughness=0.25)
    dark = material('dark', '1d1f26', metallic=0.2, roughness=0.5)
    objs = [blob(0.42, (0, 0, 0.42), shell, scale=(1.15, 0.95, 0.7)),
            blob(0.18, (0.6, 0, 0.25), dark)]
    # Tres pares de patas, cada una inclinada 40 grados hacia fuera. El centro se sube lo justo
    # para que el pie quede en z = 0 (con z = 0.12 el pie se hundiría unos 0.09).
    tilt = math.radians(40)
    leg_z = 0.25 * math.cos(tilt) + 0.035 * math.sin(tilt)
    for x in (-0.3, 0.0, 0.3):
        for y in (-0.35, 0.35):
            n = math.hypot(x, y)
            objs.append(cylinder(0.035, 0.5, (x, y, leg_z), dark, rot=(0, tilt, math.atan2(-y / n, -x / n))))
    for x, y in ((0.2, 0.16), (0.2, -0.16), (-0.2, 0.16), (-0.2, -0.16)):
        z = 0.42 + 0.294 * math.sqrt(1 - (x / 0.483) ** 2 - (y / 0.399) ** 2)  # sobre la superficie
        objs.append(blob(0.09, (x, y, z), dark))
    export('beetle', objs)


def build_tree_oak():
    """Roble: tronco recto y copa ancha formada por seis bolas verdes en dos tonos."""
    clear()
    bark = material('bark', '6b4a2b', metallic=0.0, roughness=0.9)
    leaf = material('leaf', '3f9a3c', metallic=0.0, roughness=0.8)
    leaf_light = material('leaf_light', '5cb54a', metallic=0.0, roughness=0.8)
    objs = [cylinder(0.22, 2.6, (0, 0, 1.3), bark)]
    crown = ((0.0, 0.0, 4.3, 1.35), (-0.75, 0.25, 4.0, 1.15), (0.7, -0.2, 4.1, 1.2),
             (0.1, 0.8, 4.4, 1.1), (-0.2, -0.75, 4.4, 1.1), (-0.2, -0.1, 3.7, 1.6))
    for i, (x, y, z, r) in enumerate(crown):
        objs.append(blob(r, (x, y, z), leaf if i % 2 == 0 else leaf_light))
    export('tree_oak', objs)


def build_tree_birch():
    """Abedul: tronco blanco con marcas oscuras y copa alta de bolas amarillas y verdes."""
    clear()
    birch = material('birch', 'e9e6dc', metallic=0.0, roughness=0.6)
    birch_dark = material('birch_dark', '2b2b2b', metallic=0.0, roughness=0.7)
    leaf_yellow = material('leaf_yellow', 'b5d24a', metallic=0.0, roughness=0.8)
    leaf_green = material('leaf_green', '8fc34a', metallic=0.0, roughness=0.8)
    objs = [cylinder(0.16, 4.8, (0, 0, 2.4), birch)]
    for z, a in ((0.5, 0.3), (1.1, 1.6), (1.7, 2.9), (2.3, 4.2), (2.9, 5.5)):
        # placa pegada al tronco: el lado fino apunta hacia fuera y el largo sigue la curva
        mark = box((0.22, 0.04, 0.14), (0.15 * math.cos(a), 0.15 * math.sin(a), z), birch_dark)
        mark.rotation_euler = (0, 0, a - math.pi / 2)
        objs.append(mark)
    crown = ((0.0, 0.0, 4.4, 0.9), (0.55, 0.25, 4.25, 0.8), (-0.55, -0.2, 4.3, 0.85),
             (0.25, -0.6, 4.55, 0.8), (-0.3, 0.6, 4.6, 0.8), (0.7, -0.15, 4.65, 0.8),
             (-0.7, 0.15, 4.1, 0.8), (0.05, 0.35, 4.1, 0.8), (-0.15, -0.5, 4.2, 0.9))
    for i, (x, y, z, r) in enumerate(crown):
        objs.append(blob(r, (x, y, z), leaf_yellow if i % 2 == 0 else leaf_green, scale=(1, 1, 1.2)))
    export('tree_birch', objs)


def build_tree_palm():
    """Palmera: tronco de seis tramos que se curva un poco hacia +X y siete frondes que caen desde la copa."""
    clear()
    trunk_m = material('palm_trunk', 'b58a4f', metallic=0.0, roughness=0.8)
    frond_m = material('frond', '3fa34d', metallic=0.0, roughness=0.6)
    objs = [cylinder(0.2, 0.9, (0.08 * i, 0, 0.45 + 0.8 * i), trunk_m) for i in range(6)]
    crown = (0.5, 0.0, 5.0)
    for k in range(7):
        a = 2 * math.pi * k / 7 + 0.3  # acimut de la fronde
        t = math.radians(25 + 4 * (k % 3))  # cuánto cae la fronde
        d = (math.cos(t) * math.cos(a), math.cos(t) * math.sin(a), -math.sin(t))
        frond = blob(0.9, tuple(c + 1.4 * v for c, v in zip(crown, d)), frond_m, scale=(1.7, 0.22, 0.22))
        frond.rotation_euler = (0, t, a)
        objs.append(frond)
    export('tree_palm', objs)


def build_tree_pine():
    """Pino: tronco corto y cuatro pisos de conos verdes que se estrechan hacia arriba."""
    clear()
    bark = material('bark', '5a4030', metallic=0.0, roughness=0.9)
    needle = material('needle', '2e6b3a', metallic=0.0, roughness=0.8)
    objs = [cylinder(0.18, 2.2, (0, 0, 1.1), bark)]
    for r, z in ((1.9, 2.4), (1.5, 3.4), (1.1, 4.4), (0.7, 5.3)):
        objs.append(cone(r, 1.6, (0, 0, z), needle))
    export('tree_pine', objs)


def build_rock_a():
    """Roca con base plana, dos piedras pequeñas a los lados y un parche de musgo arriba."""
    clear()
    stone = material('stone', '8b8782', metallic=0.0, roughness=0.9)
    moss = material('moss', '4f7a3a', metallic=0.0, roughness=0.9)
    objs = [flatten_bottom(blob(1.0, (0, 0, 0.5), stone, scale=(1.2, 0.9, 0.7))),
            blob(0.45, (-0.8, 0.45, 0.45), stone),
            blob(0.45, (0.75, -0.5, 0.45), stone),
            blob(0.5, (-0.1, 0.05, 1.14), moss, scale=(1, 0.6, 0.25))]
    export('rock_a', objs)


def build_rock_b():
    """Roca más alargada en Y y más baja, con otro tono de piedra y musgo arriba."""
    clear()
    stone = material('stone', '7a7c80', metallic=0.0, roughness=0.9)
    moss = material('moss', '4f7a3a', metallic=0.0, roughness=0.9)
    objs = [flatten_bottom(blob(1.0, (0, 0, 0.5), stone, scale=(0.8, 1.1, 0.6))),
            blob(0.45, (0.6, 0.6, 0.45), stone),
            blob(0.45, (-0.5, -0.65, 0.45), stone),
            blob(0.5, (0.0, 0.0, 1.0), moss, scale=(1, 0.6, 0.25))]
    export('rock_b', objs)


def build_bush():
    """Arbusto redondo de hojas verdes, con flores rosas y amarillas en la superficie."""
    clear()
    leaf = material('leaf', '3d8f3a', metallic=0.0, roughness=0.8)
    pink = material('flower_pink', 'ff6fa0', metallic=0.0, roughness=0.5)
    yellow = material('flower_yellow', 'ffd54a', metallic=0.0, roughness=0.5)
    leaves = [((0.0, 0.0, 0.55), 0.55), ((0.3, 0.2, 0.55), 0.5), ((-0.3, -0.15, 0.55), 0.5),
              ((-0.2, 0.3, 0.5), 0.5), ((0.25, -0.3, 0.5), 0.5)]
    objs = [blob(r, c, leaf) for c, r in leaves]
    # (hoja, dirección hacia fuera, material): cada flor queda justo fuera de la superficie de su hoja
    for i, d, m in ((1, (0.7, 0.3, 0.6), pink), (2, (-0.6, -0.4, 0.7), yellow), (3, (-0.5, 0.6, 0.6), pink),
                    (4, (0.6, -0.7, 0.4), yellow), (0, (0.2, 0.2, 1.0), pink), (3, (-0.9, 0.4, 0.2), yellow)):
        (cx, cy, cz), r = leaves[i]
        k = (r + 0.02) / math.sqrt(sum(v * v for v in d))
        objs.append(blob(0.09, (cx + k * d[0], cy + k * d[1], cz + k * d[2]), m))
    export('bush', objs)


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for build in (build_flyer, build_shooter, build_boss, build_wasp, build_hopper, build_spiky, build_fish,
                  build_housefly, build_worm, build_beetle, build_tree_oak, build_tree_birch, build_tree_palm,
                  build_tree_pine, build_rock_a, build_rock_b, build_bush):
        build()
