"""Modelos de los enemigos nuevos (dron volador, torreta que dispara y jefe final), hechos con Blender.

Usa Blender como módulo de Python (bpy; probado con bpy 5.2 en Python 3.13):
    pip install bpy
    python tools/blender/make_enemies.py -- assets/models

Escribe assets/models/flyer.glb, shooter.glb y boss.glb. Unidades: 1 unidad = 1 de la pista del juego.
La base del modelo está en z = 0 de Blender (y = 0 en el juego) y el modelo mira a +X (hacia la derecha).
Blender tiene Z hacia arriba; el exportador lo pasa a Y hacia arriba, como pide glTF.
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


def sphere(r, loc, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=24, ring_count=14, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def cylinder(r, depth, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=24, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.data.materials.append(mat)
    return o


def cone(r, depth, loc, mat):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0, depth=depth, vertices=16, location=loc)
    o = bpy.context.active_object
    o.data.materials.append(mat)
    return o


def torus(major, minor, loc, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc,
                                     major_segments=40, minor_segments=8)
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


def export(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT_DIR, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    print('escrito', path, os.path.getsize(path), 'bytes')


def build_flyer():
    """Dron volador: cuerpo redondo, dos rotores y un visor que brilla. Vuela en la pista."""
    clear()
    steel = material('steel', '3b4a5c', metallic=0.6, roughness=0.35)
    dark = material('dark', '23272d', metallic=0.4, roughness=0.6)
    gold = material('gold', 'ffd23f', metallic=0.3, roughness=0.3)
    eye = material('eye', 'ffea00', glow=8.0)
    objs = [
        sphere(0.42, (0, 0, 0), steel, scale=(1.0, 1.0, 0.8)),
        sphere(0.2, (0, 0, 0.3), dark),
        sphere(0.12, (0.36, 0, 0.1), eye),
        cylinder(0.035, 1.3, (0, 0, 0.36), dark, rot=(0, math.pi / 2, 0)),      # brazo
    ]
    for s in (-1, 1):
        objs.append(cylinder(0.36, 0.035, (s * 0.6, 0, 0.5), gold))             # disco del rotor
        objs.append(cylinder(0.07, 0.14, (s * 0.6, 0, 0.44), dark))             # buje
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
        objs.append(cylinder(0.3, 1.1, (x, 0, 0.55), dark))                       # pierna
        objs.append(box((1.0, 0.7, 0.2), (x, 0, 0.1), dark, bevel=0.05))           # pie
    for y in (-1.35, 1.35):
        objs.append(cylinder(0.17, 1.6, (0.3, y, 1.7), dark, rot=(math.pi / 2, 0, 0)))  # brazo
        objs.append(cylinder(0.2, 1.0, (1.1, y * 0.96, 1.7), gold, rot=(0, math.pi / 2, 0)))  # cañón
    for a in (0, 2.094, 4.189):                                                    # púas en el lomo
        objs.append(cone(0.2, 0.7, (-0.6 + 0.55 * math.cos(a), 0.55 * math.sin(a), 2.95), gold))
    export('boss', objs)


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for build in (build_flyer, build_shooter, build_boss):
        build()
