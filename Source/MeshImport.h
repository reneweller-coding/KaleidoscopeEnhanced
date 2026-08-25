/**
 * @file MeshImport.h
 * @brief Loads a static 3D model (.glb/.gltf via cgltf, .obj via tinyobjloader) into the vertex/material layout Scene3DShader's geom="mesh" kind expects.
 */
#pragma once
// Source/MeshImport.h
// ---------------------------------------------------------------------------
// Distinct from Source/mesh.h's Mesh class (a legacy immediate-mode .obj
// loader used elsewhere in the app) -- this module targets the SAME 8-float
// interleaved attrA/attrB vertex layout every other Scene3DShader geom kind
// uses (see Scene3DShader.h), so a real mesh slots into the existing
// VAO/shader contract without a parallel rendering path:
//   attrA.xyz = object-space position, attrA.w = U
//   attrB.xyz = object-space normal,   attrB.w = V
// Non-indexed GL_TRIANGLES, matching every existing geom kind (no EBO exists
// anywhere in Scene3DShader) -- any indexed source mesh is expanded to a flat
// triangle list on load.
//
// One material set per object (MVP scope; no per-submesh materials): the
// first primitive/shape with a material wins. Its textures are packed into
// up to 2 RGBA8 layers of one GL_TEXTURE_2D_ARRAY --
//   layer 0 = base color (RGB) + opacity (A)
//   layer 1 = metallic-roughness, glTF channel convention (R unused, G =
//             roughness, B = metallic) -- present only if the source had a
//             metallic-roughness (glTF) or separate roughness/metallic (OBJ)
//             map.
// -- one texture unit per mesh scene instead of one per map, which is what
// makes this affordable on hardware with only the GL-spec-minimum 16 texture
// image units.
// ---------------------------------------------------------------------------
#include <string>
#include <vector>

/**
 * @brief Host-side result of loading a mesh file: flattened geometry plus (optionally) its packed material texture layers, ready for Scene3DShader::buildGeometry() to upload.
 */
struct MeshAsset
{
	std::vector<float> vertices;      ///< 8 floats/vertex (attrA.xyzw, attrB.xyzw), GL_TRIANGLES, non-indexed.
	int  materialLayers = 0;          ///< 0 = no material texture at all, 1 = base color only, 2 = base color + metallic-roughness.
	int  materialW = 0;                ///< Width, in texels, shared by every material layer.
	int  materialH = 0;                ///< Height, in texels, shared by every material layer.
	std::vector<unsigned char> materialRGBA;   ///< materialLayers * materialW * materialH * 4 bytes, layer 0 first.
};

/**
 * @brief Loads a mesh file into host memory.
 * @param path Filesystem path to a .glb/.gltf or .obj file, resolved exactly like every other asset path this codebase already opens directly (no extra base-directory logic).
 * @param out Filled with flattened vertex data and, if the source had one, a packed material texture. Left empty on failure.
 * @return true if at least one triangle was loaded; false leaves `out` empty so the caller can fail soft (an empty-VBO scene simply draws nothing, matching every other geom kind's convention).
 */
bool loadMeshAsset( const std::string &path, MeshAsset &out );
