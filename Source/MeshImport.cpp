/**
 * @file MeshImport.cpp
 * @brief Implementation of loadMeshAsset() -- see MeshImport.h.
 */
// Source/MeshImport.cpp
#define CGLTF_IMPLEMENTATION
#include "../ThirdParty/cgltf/cgltf.h"
#define TINYOBJLOADER_IMPLEMENTATION
#include "../ThirdParty/tinyobjloader/tiny_obj_loader.h"

#include "MeshImport.h"

#include <QtGui/QImage>
#include <QtCore/QFileInfo>
#include "Platform.h"
#include <QtCore/QDir>
#include <QtCore/QByteArray>

#include <cstring>
#include <cctype>
#include <cstdio>
#include <algorithm>
#include <map>

namespace
{

bool endsWithNoCase( const std::string &s, const char *suffix )
{
	size_t n = strlen( suffix );
	if( s.size() < n ) return false;
	for( size_t i = 0; i < n; ++i )
		if( tolower( (unsigned char) s[s.size() - n + i] ) != tolower( (unsigned char) suffix[i] ) )
			return false;
	return true;
}

// Decodes a cgltf image, whether it is embedded in the .glb's binary chunk
// (the common case -- TRELLIS-style exporters embed WebP there, which
// QImage::fromData() sniffs and decodes on its own; no format hint needed)
// or referenced by a loose file / base64 data URI (rarer, but valid glTF).
QImage decodeGltfImage( const cgltf_image *img, const std::string &gltfPath )
{
	if( !img ) return QImage();
	if( img->buffer_view )
	{
		const uint8_t *data = cgltf_buffer_view_data( img->buffer_view );
		if( !data ) return QImage();
		return QImage::fromData( data, int( img->buffer_view->size ) );
	}
	if( img->uri )
	{
		const std::string uri = img->uri;
		if( uri.rfind( "data:", 0 ) == 0 )
		{
			const size_t comma = uri.find( ',' );
			if( comma == std::string::npos ) return QImage();
			const QByteArray b64 = QByteArray::fromStdString( uri.substr( comma + 1 ) );
			return QImage::fromData( QByteArray::fromBase64( b64 ) );
		}
		const QFileInfo base( QString::fromStdString( gltfPath ) );
		return QImage( base.absoluteDir().filePath( QString::fromStdString( uri ) ) );
	}
	return QImage();
}

/**
 * @brief Packs base-color(+opacity), optional metallic-roughness and optional tangent-space normal into MeshAsset's layered RGBA8 buffer.
 *
 * Both layers are flipped vertically before packing -- the same convention
 * Utils.cpp::prepareImage() uses for every other texture this app uploads
 * (QImage row 0 is the image TOP, but GL samples (s,t)=(0,0) at the
 * BOTTOM-left texel). Callers must flip their V texture coordinate to match
 * (`1 - v`) UNLESS their source format's V already runs bottom-up the way
 * OBJ's does -- see loadGlb()/loadObj()'s differing V handling for why.
 */
void packMaterialLayers( QImage base, QImage mr, QImage nrm, MeshAsset &out )
{
	int w = 0, h = 0;
	if( !base.isNull() ) { w = std::max( w, base.width() ); h = std::max( h, base.height() ); }
	if( !mr.isNull() )   { w = std::max( w, mr.width() );   h = std::max( h, mr.height() );   }
	if( !nrm.isNull() )  { w = std::max( w, nrm.width() );  h = std::max( h, nrm.height() );  }
	if( w == 0 || h == 0 )
		return;
	// The generator now writes 4096 maps and some assets carry a real normal
	// map, which is exactly the layer that suffers most from being shrunk --
	// a halved normal map loses the fine relief it exists to carry. Still
	// capped, because three layers at 4096 would be 200 MB of texture per
	// scene, but capped higher than before.
	const int maxSize = ( nrm.isNull() ? 2048 : 3072 );
	w = std::min( w, maxSize );
	h = std::min( h, maxSize );

	auto prep = [&]( const QImage &img, QColor fallback ) -> QImage
	{
		if( img.isNull() )
		{
			QImage flat( w, h, QImage::Format_RGBA8888 );
			flat.fill( fallback );
			return flat;
		}
		return img.convertToFormat( QImage::Format_RGBA8888 ).mirrored( false, true ).scaled( w, h );
	};

	const QImage baseImg = prep( base, QColor( 255, 255, 255, 255 ) );
	out.materialW = w;
	out.materialH = h;
	// Layer 0 base color, 1 metallic-roughness, 2 tangent-space normal. A
	// normal map without a metallic-roughness map still occupies layer 2, so
	// the layer INDEX is fixed and a shader can test the count instead of
	// hunting for what is present.
	out.materialLayers = nrm.isNull() ? ( mr.isNull() ? 1 : 2 ) : 3;
	out.materialRGBA.resize( size_t( out.materialLayers ) * size_t( w ) * size_t( h ) * 4 );
	memcpy( out.materialRGBA.data(), baseImg.constBits(), size_t( w ) * size_t( h ) * 4 );
	if( out.materialLayers >= 2 )
	{
		// R unused (no AO map from either source format), G = roughness,
		// B = metallic -- the same channel order glTF's own
		// metallicRoughnessTexture uses, so one shader convention covers both
		// loaders' output.
		const QImage mrImg = prep( mr, QColor( 255, 255, 0, 255 ) );
		memcpy( out.materialRGBA.data() + size_t( w ) * size_t( h ) * 4,
		        mrImg.constBits(), size_t( w ) * size_t( h ) * 4 );
	}
	if( out.materialLayers == 3 )
	{
		// Tangent-space normal, the usual RGB = XYZ mapped into 0..1. The
		// FLIP matters: mirroring the image vertically also mirrors the
		// direction its green channel encodes, so G has to be inverted to
		// keep the map pointing the way it did before the flip. Getting this
		// wrong lights every dent as a bump.
		QImage nImg = prep( nrm, QColor( 128, 128, 255, 255 ) );
		const size_t plane = size_t( w ) * size_t( h ) * 4;
		unsigned char *dst = out.materialRGBA.data() + 2 * plane;
		memcpy( dst, nImg.constBits(), plane );
		for( size_t i = 1; i < plane; i += 4 )
			dst[i] = (unsigned char)( 255 - dst[i] );
	}
}

// Combines separate OBJ roughness/metallic greyscale maps into one glTF-style
// packed image (G = roughness, B = metallic) so packMaterialLayers() only
// ever has to deal with one metallic-roughness convention.
QImage packObjRoughnessMetallic( const QImage &roughness, const QImage &metallic )
{
	if( roughness.isNull() && metallic.isNull() )
		return QImage();
	int w = std::max( roughness.width(), metallic.width() );
	int h = std::max( roughness.height(), metallic.height() );
	if( w <= 0 || h <= 0 )
		return QImage();
	const QImage r = roughness.isNull() ? QImage() : roughness.convertToFormat( QImage::Format_Grayscale8 ).scaled( w, h );
	const QImage m = metallic.isNull()  ? QImage() : metallic.convertToFormat( QImage::Format_Grayscale8 ).scaled( w, h );
	QImage out( w, h, QImage::Format_RGBA8888 );
	for( int y = 0; y < h; ++y )
	{
		uchar *row = out.scanLine( y );
		const uchar *rRow = r.isNull() ? nullptr : r.constScanLine( y );
		const uchar *mRow = m.isNull() ? nullptr : m.constScanLine( y );
		for( int x = 0; x < w; ++x )
		{
			row[x * 4 + 0] = 255;
			row[x * 4 + 1] = rRow ? rRow[x] : 255;   // default: fully rough
			row[x * 4 + 2] = mRow ? mRow[x] : 0;     // default: non-metal
			row[x * 4 + 3] = 255;
		}
	}
	return out;
}

bool loadGlb( const std::string &path, MeshAsset &out )
{
	cgltf_options options;
	memset( &options, 0, sizeof( options ) );
	cgltf_data *data = nullptr;
	if( cgltf_parse_file( &options, path.c_str(), &data ) != cgltf_result_success )
		return false;
	if( cgltf_load_buffers( &options, data, path.c_str() ) != cgltf_result_success )
	{
		cgltf_free( data );
		return false;
	}

	QImage baseColorImg, metalRoughImg, normalImg;
	bool haveMaterial = false;

	for( cgltf_size mi = 0; mi < data->meshes_count; ++mi )
	{
		const cgltf_mesh &mesh = data->meshes[mi];
		for( cgltf_size pi = 0; pi < mesh.primitives_count; ++pi )
		{
			const cgltf_primitive &prim = mesh.primitives[pi];
			if( prim.type != cgltf_primitive_type_triangles )
				continue;

			const cgltf_accessor *posAcc = nullptr, *normAcc = nullptr, *uvAcc = nullptr;
			for( cgltf_size ai = 0; ai < prim.attributes_count; ++ai )
			{
				const cgltf_attribute &a = prim.attributes[ai];
				if( a.type == cgltf_attribute_type_position && !posAcc ) posAcc = a.data;
				else if( a.type == cgltf_attribute_type_normal && !normAcc ) normAcc = a.data;
				else if( a.type == cgltf_attribute_type_texcoord && !uvAcc ) uvAcc = a.data;
			}
			if( !posAcc )
				continue;

			// glTF's V runs top-down (v=0 at the image top); packMaterialLayers()
			// flips every texture vertically to match this app's bottom-up GL
			// upload convention, so V must flip too, or the two flips would
			// cancel out and the texture would land mirrored on the mesh.
			auto pushVertex = [&]( cgltf_size vi )
			{
				float p[3] = { 0, 0, 0 }, n[3] = { 0, 0, 1 }, uv[2] = { 0, 0 };
				if( posAcc && vi < posAcc->count ) cgltf_accessor_read_float( posAcc, vi, p, 3 );
				if( normAcc && vi < normAcc->count ) cgltf_accessor_read_float( normAcc, vi, n, 3 );
				if( uvAcc && vi < uvAcc->count ) cgltf_accessor_read_float( uvAcc, vi, uv, 2 );
				out.vertices.push_back( p[0] ); out.vertices.push_back( p[1] ); out.vertices.push_back( p[2] );
				out.vertices.push_back( uv[0] );
				out.vertices.push_back( n[0] ); out.vertices.push_back( n[1] ); out.vertices.push_back( n[2] );
				out.vertices.push_back( 1.f - uv[1] );
			};

			if( prim.indices )
			{
				const cgltf_size triCount = prim.indices->count / 3;
				for( cgltf_size t = 0; t < triCount; ++t )
					for( int k = 0; k < 3; ++k )
					{
						float idxf = 0.f;
						cgltf_accessor_read_float( prim.indices, t * 3 + k, &idxf, 1 );
						pushVertex( cgltf_size( idxf + 0.5f ) );
					}
			}
			else
			{
				const cgltf_size triCount = posAcc->count / 3;
				for( cgltf_size t = 0; t < triCount; ++t )
					for( int k = 0; k < 3; ++k )
						pushVertex( t * 3 + k );
			}

			// One material set per object (MVP scope, see MeshImport.h): the
			// first primitive that has one wins.
			if( !haveMaterial && prim.material && prim.material->has_pbr_metallic_roughness )
			{
				const cgltf_pbr_metallic_roughness &pbr = prim.material->pbr_metallic_roughness;
				if( pbr.base_color_texture.texture )
				{
					const cgltf_texture *t = pbr.base_color_texture.texture;
					baseColorImg = decodeGltfImage( t->has_webp ? t->webp_image : t->image, path );
				}
				// Only some assets ship one: the generator discards a normal map
				// it judges unusable, and then the glb simply has no
				// normalTexture. Absent is normal, not an error.
				if( prim.material->normal_texture.texture )
				{
					const cgltf_texture *nt = prim.material->normal_texture.texture;
					normalImg = decodeGltfImage( nt->has_webp ? nt->webp_image : nt->image, path );
				}
				if( pbr.metallic_roughness_texture.texture )
				{
					const cgltf_texture *t = pbr.metallic_roughness_texture.texture;
					metalRoughImg = decodeGltfImage( t->has_webp ? t->webp_image : t->image, path );
				}
				haveMaterial = true;
			}
		}
	}

	cgltf_free( data );
	if( out.vertices.empty() )
		return false;
	if( !baseColorImg.isNull() || !metalRoughImg.isNull() || !normalImg.isNull() )
		packMaterialLayers( baseColorImg, metalRoughImg, normalImg, out );

	// KALEIDO_MESH_DUMP=1: dump the packed material layers to PNGs next to
	// the exe, so a wrong-looking mesh material can be diagnosed by eye
	// without a GL debugger attached.
	if( getenv( "KALEIDO_MESH_DUMP" ) && out.materialLayers > 0 )
	{
		QImage layer0( out.materialRGBA.data(), out.materialW, out.materialH, QImage::Format_RGBA8888 );
		layer0.save( "mesh_dump_layer0.png" );
		if( out.materialLayers >= 2 )
		{
			QImage layer1( out.materialRGBA.data() + size_t( out.materialW ) * size_t( out.materialH ) * 4,
			               out.materialW, out.materialH, QImage::Format_RGBA8888 );
			layer1.save( "mesh_dump_layer1.png" );
		}
		fprintf( stderr, "KALEIDO_MESH_DUMP: %dx%d, %d layer(s), baseColorImg.isNull=%d metalRoughImg.isNull=%d\n",
		         out.materialW, out.materialH, out.materialLayers,
		         (int) baseColorImg.isNull(), (int) metalRoughImg.isNull() );
	}
	return true;
}

bool loadObj( const std::string &path, MeshAsset &out )
{
	tinyobj::ObjReaderConfig config;
	config.triangulate = true;
	tinyobj::ObjReader reader;
	if( !reader.ParseFromFile( path, config ) )
		return false;

	const tinyobj::attrib_t &attrib = reader.GetAttrib();
	const std::vector<tinyobj::shape_t> &shapes = reader.GetShapes();
	const std::vector<tinyobj::material_t> &materials = reader.GetMaterials();

	// OBJ's V already runs bottom-up (v=0 at the image bottom) -- the SAME
	// direction packMaterialLayers()'s vertical flip produces, so unlike
	// glTF's loader above, this one does NOT flip V.
	auto pushVertex = [&]( const tinyobj::index_t &idx )
	{
		float px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 1, u = 0, v = 0;
		if( idx.vertex_index >= 0 )
		{
			px = attrib.vertices[3 * idx.vertex_index + 0];
			py = attrib.vertices[3 * idx.vertex_index + 1];
			pz = attrib.vertices[3 * idx.vertex_index + 2];
		}
		if( idx.normal_index >= 0 )
		{
			nx = attrib.normals[3 * idx.normal_index + 0];
			ny = attrib.normals[3 * idx.normal_index + 1];
			nz = attrib.normals[3 * idx.normal_index + 2];
		}
		if( idx.texcoord_index >= 0 )
		{
			u = attrib.texcoords[2 * idx.texcoord_index + 0];
			v = attrib.texcoords[2 * idx.texcoord_index + 1];
		}
		out.vertices.push_back( px ); out.vertices.push_back( py ); out.vertices.push_back( pz );
		out.vertices.push_back( u );
		out.vertices.push_back( nx ); out.vertices.push_back( ny ); out.vertices.push_back( nz );
		out.vertices.push_back( v );
	};

	for( const tinyobj::shape_t &shape : shapes )
		for( const tinyobj::index_t &idx : shape.mesh.indices )
			pushVertex( idx );

	if( out.vertices.empty() )
		return false;

	if( !materials.empty() )
	{
		const QFileInfo objInfo( QString::fromStdString( path ) );
		const QDir dir = objInfo.absoluteDir();
		auto loadTex = [&]( const std::string &name ) -> QImage
		{
			if( name.empty() ) return QImage();
			return QImage( dir.filePath( QString::fromStdString( name ) ) );
		};
		// Same "first material with anything usable wins" MVP rule as loadGlb().
		for( const tinyobj::material_t &mat : materials )
		{
			QImage base = loadTex( mat.diffuse_texname );
			QImage rough = loadTex( mat.roughness_texname );
			QImage metal = loadTex( mat.metallic_texname );
			if( base.isNull() && rough.isNull() && metal.isNull() )
				continue;
			// OBJ has no normal-map convention this loader commits to, so the
			// third layer stays empty for that format.
			packMaterialLayers( base, packObjRoughnessMetallic( rough, metal ), QImage(), out );
			break;
		}
	}
	return true;
}

} // namespace

bool loadMeshAsset( const std::string &pathIn, MeshAsset &out )
{
	// The catalogue writes model="..\\Models\\x.glb" -- a Windows path. It is shared
	// between platforms, so the separators are normalised here rather than in
	// 238 XML entries. On Windows this is the identity.
	const std::string path = Platform::assetPath( pathIn );
	out = MeshAsset();
	if( endsWithNoCase( path, ".glb" ) || endsWithNoCase( path, ".gltf" ) )
		return loadGlb( path, out );
	if( endsWithNoCase( path, ".obj" ) )
		return loadObj( path, out );
	fprintf( stderr, "loadMeshAsset: unrecognised extension for '%s' (expected .glb/.gltf/.obj)\n", path.c_str() );
	return false;
}
