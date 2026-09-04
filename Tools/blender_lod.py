# -*- coding: utf-8 -*-
"""Decimate a generator GLB to a face budget, keeping UVs and the material.

Why: a model that is INSTANCED (instances="N" on a mesh scene) is drawn N
times per frame, and the generator's 290k-face export times 150 heliostat
mirrors is 43 million triangles a frame. A mirror on a post needs a few
thousand. Blender's collapse decimation keeps UV seams and the material
binding (the generator venv's quadric simplifiers do not).

    "<blender.exe>" -b -P Tools/blender_lod.py -- in.glb out.glb 4000

Textures are re-encoded on export (WEBP), which is fine for a LOD: the
4096 px maps of the full model are far more than a distant instance needs,
so the script also halves them to 1024 px.
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst, target = argv[0], argv[1], int(argv[2])
tex_size = int(argv[3]) if len(argv) > 3 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
faces = sum(len(o.data.polygons) for o in meshes)
ratio = min(1.0, float(target) / max(faces, 1))
for o in meshes:
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    if ratio < 1.0:
        m = o.modifiers.new("lod", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = ratio
        m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    o.select_set(False)

# Shrink the textures: a LOD is seen small.
for img in bpy.data.images:
    if img.size[0] > tex_size or img.size[1] > tex_size:
        img.scale(min(img.size[0], tex_size), min(img.size[1], tex_size))

after = sum(len(o.data.polygons) for o in meshes)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="WEBP",
                          export_apply=True, export_yup=True)
print("LOD: %s  %d -> %d faces  (%.1f MB)" % (os.path.basename(dst), faces, after, os.path.getsize(dst) / 1e6))
