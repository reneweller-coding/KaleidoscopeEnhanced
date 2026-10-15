/**
 * @file mesh.cpp
 * @brief Implementation of Mesh: a two-pass Wavefront .obj/.mtl text parser and a legacy fixed-function (glBegin/glEnd)
 * renderer for the result.
 */
// Program from Stephan Mock 324612 and Randolf Sch�rfig 327639
// modifiziert von cg.in.tu-clausthal

#include <QtGui/qopengl.h>
#include <GL/gl.h>


#include <float.h>
#include "mesh.h"
using namespace std;

/* Draw the mesh using smooth or flat normals accordingly to the parameter */
void Mesh::draw()
{
    bool normals_available = ( 0 < m_normals.size() );
    bool texcoords_available = false;
    // glPolygonMode(GL_FRONT_AND_BACK,GL_LINE);
    if ( normals_available )
    {
        glEnable( GL_LIGHTING );
    }
    else
    {
        glDisable( GL_LIGHTING );
    }

    for ( unsigned int mesh_counter = 0; mesh_counter < m_meshPartInfo.size(); mesh_counter++ )
    {
        glDisable( GL_TEXTURE_2D );
        // assign material
        int matidx = m_meshPartInfo[mesh_counter]->materialIndex;
        if ( matidx >= 0 )
        { // if materials available
            texcoords_available = ( m_textcoords.size() > 0 );
            glMaterialfv( GL_FRONT, GL_AMBIENT, m_materialList[matidx]->ambient );
            glMaterialfv( GL_FRONT, GL_DIFFUSE, m_materialList[matidx]->diffuse );
            glMaterialfv( GL_FRONT, GL_SPECULAR, m_materialList[matidx]->specular );
            glMaterialfv( GL_FRONT, GL_SHININESS, &( m_materialList[matidx]->shininess ) );
            // bind texture
            // (left disabled below: texcoords are still emitted per-vertex further
            // down whenever texcoords_available, but with no glBindTexture call the
            // currently-bound texture unit — if any — is whatever a previous
            // caller left active, not this material's own texture.)
            // if(m_materialList[matidx]->textureIndex >=0 )
            //{
            //	int texidx = m_materialList[matidx]->textureIndex;
            //	glEnable(GL_TEXTURE_2D);
            //	int texid = textures[texidx].textureId;
            //	glBindTexture(GL_TEXTURE_2D,textures[texidx].textureId);
            //}
        }
        else
        {
            // No material assigned to this part: fall back to a dim flat grey
            // rather than leaving whatever GL color state the previous part left
            // behind.
            glColor3f( 0.1f, 0.1f, 0.1f );
        }
        int from = m_meshPartInfo[mesh_counter]->fromFace;
        int to = m_meshPartInfo[mesh_counter]->toFace;
        glBegin( GL_TRIANGLES );
        for ( int face_counter = from; face_counter < to; face_counter++ )
        {
            Triangle &triangle = m_triangles[face_counter];
            for ( int j = 0; j < 3; j++ )
            {
                Vector3D &vertex = m_vertices[triangle.v[j]];
                if ( texcoords_available )
                {
                    Vector3D &texcoord = m_textcoords[triangle.t[j]];
                    glTexCoord2f( texcoord.x, texcoord.y );
                }
                if ( normals_available )
                {
                    Vector3D &normal = m_normals[triangle.n[j]];
                    glNormal3f( normal.x, normal.y, normal.z );
                }
                glVertex3f( vertex.x, vertex.y, vertex.z );
            }
        }
        glEnd();
    }
}


void Mesh::clear()
{
    m_vertices.clear();
    m_normals.clear();
    m_textcoords.clear();
    m_triangles.clear();
    m_textures.clear();

    for ( unsigned int i = 0; i < m_meshPartInfo.size(); i++ )
        delete m_meshPartInfo[i];
    for ( unsigned int i = 0; i < m_materialList.size(); i++ )
        delete m_materialList[i];

    m_meshPartInfo.clear();
    m_materialList.clear();

    bmin = Vector3D( FLT_MAX, FLT_MAX, FLT_MAX );
    bmax = Vector3D( -FLT_MAX, -FLT_MAX, -FLT_MAX );
}


// Sequential line-based .mtl parser: "newmtl" starts a new MaterialNode and
// pushes the PREVIOUS one (matnode) onto m_materialList, so the node currently
// being filled is always one line behind what's already committed; the last
// material only gets pushed after the loop ends (see below).
void Mesh::loadMaterials( const char *sFilename )
{

    char          ac_line[256];
    char          texname[256];
    std::ifstream istr_in( sFilename );
    if ( !istr_in.is_open() )
    {
        std::cerr << "could not read " << sFilename << std::endl;
    }

    MaterialNode *matnode = NULL;

    std::cerr << " reading Materials " << sFilename << std::endl;
    while ( istr_in && ( !istr_in.eof() ) && istr_in.getline( ac_line, 256 ) )
    {
        float ar, ag, ab, sr, sg, sb, rr, dr, dg, db;
        float refractive_index, shininess;
        // comment
        if ( ac_line[0] == '#' )
            continue;

        // Load Material File
        if ( strncmp( ac_line, "newmtl ", 7 ) == 0 )
        {
            char matname[1024];
            if ( sscanf( ac_line, "newmtl %s", matname ) )
            {
                // Put Last material to the MaterialList
                if ( matnode != NULL )
                {
                    m_materialList.push_back( matnode );
                }

                // Create new Shader
                matnode = new MaterialNode;
                strcpy( matnode->m_name, matname );
            }
        }
        else if ( strncmp( ac_line, "Ns ", 3 ) == 0 )
        {
            sscanf( ac_line, "Ns %f", &shininess );
            if ( matnode != NULL )
                matnode->shininess = shininess;
        }
        else if ( strncmp( ac_line, "Ka ", 3 ) == 0 )
        {
            sscanf( ac_line, "Ka %f %f %f", &ar, &ag, &ab );
            if ( matnode != NULL )
                matnode->setAmbientColor( ar, ag, ab );
        }
        else if ( strncmp( ac_line, "Kd ", 3 ) == 0 )
        {
            sscanf( ac_line, "Kd %f %f %f", &dr, &dg, &db );
            if ( matnode != NULL )
                matnode->setDiffuseColor( dr, dg, db );
        }
        else if ( strncmp( ac_line, "Ks ", 3 ) == 0 )
        {
            sscanf( ac_line, "Ks %f %f %f", &sr, &sg, &sb );
            if ( matnode != NULL )
                matnode->setSpecularColor( sr, sg, sb );
        }
        else if ( strncmp( ac_line, "Ni ", 3 ) == 0 )
        {
            sscanf( ac_line, "Ni %f", &refractive_index );
        }
        else if ( strncmp( ac_line, "map_Kd ", 7 ) == 0 )
        {
            sscanf( ac_line, "map_Kd %s", texname );
            char texture_filename[256];
            replaceFilename( texture_filename, sFilename, texname );
            matnode->textureIndex = getTextureNode( texture_filename );
        }

        else if ( ( strncmp( ac_line, "Tr ", 3 ) == 0 ) )
        {
            // Warning: We simply use transparency for refractive color
            // if refractive index != 1.0 && no transparency => set refractive color to 1.0
            sscanf( ac_line, "Tr %f", &rr );
            if ( matnode != NULL )
                matnode->alpha = rr;
        }
        // Alternative version of alpha value
        else if ( ( strncmp( ac_line, "d ", 2 ) == 0 ) )
        {
            // Warning: We simply use transparency for refractive color
            sscanf( ac_line, "d %f", &rr );
            if ( matnode != NULL )
                matnode->alpha = rr;
        }
    }

    // Not to forget to add the last Shader to the MaterialList
    if ( matnode != NULL )
        m_materialList.push_back( matnode );
}

int Mesh::getTextureNode( char *filename )
{
    int idx = -1;
    for ( unsigned int tc = 0; tc < m_textures.size(); tc++ )
    {
        if ( !strcmp( m_textures[tc].texname, filename ) )
        {
            idx = tc;
        }
    }
    if ( idx < 0 ) // not yet known texture image
    {
        TextureNode texnode;
        texnode.qImageTexture = 0;
        texnode.textureId = 0;
        strcpy( texnode.texname, filename );
        idx = static_cast<int>( m_textures.size() );
        m_textures.push_back( texnode );
    }
    return idx;
}

// Two-pass .obj parser: this first pass only COUNTS vertices/texcoords/faces
// (below) so the second pass — the one that actually fills the vectors — can
// reserve() up front instead of growing/reallocating one element at a time.
void Mesh::readObj( const char *sFilename )
{
    this->clear();

    char ac_line[256];

    std::ifstream istr_in( sFilename );
    if ( !istr_in.is_open() )
    {
        std::cerr << "could not read " << sFilename << std::endl;
        m_meshRead = false;
    }
    m_meshRead = true;
    unsigned int vertexcounter = 0;
    unsigned int texcoordcounter = 0;
    unsigned int facecounter = 0;
    std::cerr << " reading " << sFilename << std::endl;
    while ( istr_in && ( !istr_in.eof() ) && istr_in.getline( ac_line, 256 ) )
    {
        // comment
        if ( ac_line[0] == '#' )
            continue;

        // vertex
        else if ( strncmp( ac_line, "v ", 2 ) == 0 )
        {
            vertexcounter++;
        }
        else if ( strncmp( ac_line, "vt ", 2 ) == 0 )
        {
            texcoordcounter++;
        }
        // face
        else if ( strncmp( ac_line, "f ", 2 ) == 0 )
        {
            int i_3v_i[4] = { 0, 0, 0, 0 };
            int i_3t_i[4] = { 0, 0, 0, 0 };
            int i_3n_i[4] = { 0, 0, 0, 0 };
            // Quadrangel: add 2 triangles
            if ( 12
                 == sscanf( ac_line, "f %d//%d//%d %d//%d//%d %d//%d//%d %d//%d//%d", &i_3v_i[0], &i_3t_i[0],
                            &i_3n_i[0], &i_3v_i[1], &i_3t_i[1], &i_3n_i[1], &i_3v_i[2], &i_3t_i[2], &i_3n_i[2],
                            &i_3v_i[3], &i_3t_i[3], &i_3n_i[3] ) )
            {
                facecounter++;
            }
            else if ( 8
                      == sscanf( ac_line, "f %d//%d %d//%d %d//%d %d//%d", &i_3v_i[0], &i_3n_i[0], &i_3v_i[1],
                                 &i_3n_i[1], &i_3v_i[2], &i_3n_i[2], &i_3v_i[3], &i_3n_i[3] ) )
            {
                facecounter++;
            }
            else if ( 8
                      == sscanf( ac_line, "f %d/%d %d/%d %d/%d %d/%d", &i_3v_i[0], &i_3n_i[0], &i_3v_i[1], &i_3n_i[1],
                                 &i_3v_i[2], &i_3n_i[2], &i_3v_i[3], &i_3n_i[3] ) )
            {
                facecounter++;
            }
            else if ( 4 == sscanf( ac_line, "f %d %d %d %d", &i_3v_i[0], &i_3v_i[1], &i_3v_i[2], &i_3v_i[3] ) )
            {
                facecounter++;
            }

            // NOTE: facecounter is incremented once more here, unconditionally,
            // on top of whatever the matched branch above already added — so a
            // recognised "f " line counts twice (and an unrecognised one still
            // counts once). Harmless: facecounter only sizes the reserve() calls
            // below, so over-counting merely reserves a bit more capacity than
            // is strictly needed, it never affects how many triangles get parsed.
            facecounter++;
        }
    }

    istr_in.close();


    unsigned int ui_normals_created = 0;
    unsigned int act_face = 0;

    std::list<MaterialNode> material_nodes;
    material_nodes.clear();

    m_vertices.reserve( vertexcounter );
    m_normals.reserve( vertexcounter );
    m_textcoords.reserve( texcoordcounter );
    m_triangles.reserve( facecounter );

    std::ifstream istr2_in( sFilename );

    MeshPartInfo *mpi = 0;

    while ( istr2_in && ( !istr2_in.eof() ) && istr2_in.getline( ac_line, 256 ) )
    {

        // comment
        if ( ac_line[0] == '#' )
            continue;

        // Load Material File
        if ( strncmp( ac_line, "mtllib ", 7 ) == 0 )
        {
            char filename[1024];
            if ( sscanf( ac_line, "mtllib %s", filename ) )
            {
                char newname[256];
                replaceFilename( newname, sFilename, filename );
                loadMaterials( newname );
            }
        }

        // New Material => push New Material to material List
        if ( strncmp( ac_line, "usemtl ", 7 ) == 0 )
        {
            if ( mpi != NULL )
            {
                mpi->toFace = act_face;
                m_meshPartInfo.push_back( mpi );
            }

            mpi = new MeshPartInfo();
            mpi->fromFace = act_face;


            bool foundmaterial = false;

            char matname[1024];
            if ( sscanf( ac_line, "usemtl %s", matname ) )
            {
                for ( unsigned int counter = 0; counter < m_materialList.size(); ++counter )
                {
                    if ( !strncmp( matname, m_materialList[counter]->m_name, strlen( matname ) ) )
                    {
                        mpi->materialIndex = counter;
                        foundmaterial = true;
                        break;
                    }
                }
            }
            if ( !foundmaterial )
            {
                delete mpi;
                mpi = NULL;
            }
        }

        // vertex
        else if ( strncmp( ac_line, "v ", 2 ) == 0 )
        {
            float f_x, f_y, f_z;
            if ( sscanf( ac_line, "v %f %f %f", &f_x, &f_y, &f_z ) )
            {
                m_vertices.push_back( Vector3D( f_x, f_y, f_z ) );
            }
        }
        // vertex normals
        else if ( strncmp( ac_line, "vn ", 3 ) == 0 )
        {
            float f_n1, f_n2, f_n3;
            if ( sscanf( ac_line, "vn %f %f %f", &f_n1, &f_n2, &f_n3 ) )
            {
                m_normals.push_back( Vector3D( f_n1, f_n2, f_n3 ) );
            }
        }
        // vertex normals
        else if ( strncmp( ac_line, "vt ", 3 ) == 0 )
        {
            float f_t1 = 0, f_t2 = 0;
            if ( sscanf( ac_line, "vt %f %f", &f_t1, &f_t2 ) )
            {
                m_textcoords.push_back( Vector3D( f_t1, 1.0f - f_t2, 0.0f ) );
            }
        }
        // face — cascade of sscanf attempts, most specific format first, to cover
        // every face notation the OBJ spec allows: "v/vt/vn", "v//vn" (no
        // texcoord), "v/vn" (a looser variant some exporters emit) and bare "v"
        // (position only), each in both triangle and quad form. Formats with no
        // texcoord index read straight into i_3n_i's slot and simply never touch
        // i_3t_i, which stays at its {0,0,0,-1} default — the "-= 1" below then
        // turns that unwritten 0 into -1, the "no texcoord" sentinel, exactly
        // like the 4th (quad) slot when the face has only 3 vertices.
        else if ( strncmp( ac_line, "f ", 2 ) == 0 )
        {
            int i_3v_i[4] = { 0, 0, 0, -1 };
            int i_3n_i[4] = { 0, 0, 0, -1 };
            int i_3t_i[4] = { 0, 0, 0, -1 };

            // Quadrangel
            if ( 12
                 == sscanf( ac_line, "f %d//%d//%d %d//%d//%d %d//%d//%d %d//%d//%d", &i_3v_i[0], &i_3t_i[0],
                            &i_3n_i[0], &i_3v_i[1], &i_3t_i[1], &i_3n_i[1], &i_3v_i[2], &i_3t_i[2], &i_3n_i[2],
                            &i_3v_i[3], &i_3t_i[3], &i_3n_i[3] ) )
            {
            }
            // Quadrangel
            else if ( 12
                      == sscanf( ac_line, "f %d/%d/%d %d/%d/%d %d/%d/%d %d/%d/%d", &i_3v_i[0], &i_3t_i[0], &i_3n_i[0],
                                 &i_3v_i[1], &i_3t_i[1], &i_3n_i[1], &i_3v_i[2], &i_3t_i[2], &i_3n_i[2], &i_3v_i[3],
                                 &i_3t_i[3], &i_3n_i[3] ) )
            {
            }
            else if ( 9
                      == sscanf( ac_line, "f %d//%d//%d %d//%d/%d %d//%d//%d", &i_3v_i[0], &i_3t_i[0], &i_3n_i[0],
                                 &i_3v_i[1], &i_3t_i[1], &i_3n_i[1], &i_3v_i[2], &i_3t_i[2], &i_3n_i[2] ) )
            {
            }
            else if ( 9
                      == sscanf( ac_line, "f %d/%d/%d %d/%d/%d %d/%d/%d", &i_3v_i[0], &i_3t_i[0], &i_3n_i[0],
                                 &i_3v_i[1], &i_3t_i[1], &i_3n_i[1], &i_3v_i[2], &i_3t_i[2], &i_3n_i[2] ) )
            {
            }
            // Quadrangel
            else if ( 8
                      == sscanf( ac_line, "f %d//%d %d//%d %d//%d %d//%d", &i_3v_i[0], &i_3n_i[0], &i_3v_i[1],
                                 &i_3n_i[1], &i_3v_i[2], &i_3n_i[2], &i_3v_i[3], &i_3n_i[3] ) )
            {
                ++ui_normals_created;
            }
            // Quadrangel
            else if ( 8
                      == sscanf( ac_line, "f %d/%d %d/%d %d/%d %d/%d", &i_3v_i[0], &i_3n_i[0], &i_3v_i[1], &i_3n_i[1],
                                 &i_3v_i[2], &i_3n_i[2], &i_3v_i[3], &i_3n_i[3] ) )
            {
                ++ui_normals_created;
            }
            else if ( 6
                      == sscanf( ac_line, "f %d//%d %d//%d %d//%d", &i_3v_i[0], &i_3n_i[0], &i_3v_i[1], &i_3n_i[1],
                                 &i_3v_i[2], &i_3n_i[2] ) )
            {
                ++ui_normals_created;
            }
            else if ( 6
                      == sscanf( ac_line, "f %d/%d %d/%d %d/%d", &i_3v_i[0], &i_3n_i[0], &i_3v_i[1], &i_3n_i[1],
                                 &i_3v_i[2], &i_3n_i[2] ) )
            {
                ++ui_normals_created;
            }
            // Quadrangel
            else if ( 4 == sscanf( ac_line, "f %d %d %d %d", &i_3v_i[0], &i_3v_i[1], &i_3v_i[2], &i_3v_i[3] ) )
            {
            }
            else if ( 3 == sscanf( ac_line, "f %d %d %d", &i_3v_i[0], &i_3v_i[1], &i_3v_i[2] ) )
            {
            }
            // obj-indices are 1-based
            i_3v_i[0] -= 1;
            i_3v_i[1] -= 1;
            i_3v_i[2] -= 1;
            i_3v_i[3] -= 1;
            i_3n_i[0] -= 1;
            i_3n_i[1] -= 1;
            i_3n_i[2] -= 1;
            i_3n_i[3] -= 1;
            i_3t_i[0] -= 1;
            i_3t_i[1] -= 1;
            i_3t_i[2] -= 1;
            i_3t_i[3] -= 1;
            m_triangles.push_back( Triangle( i_3v_i, i_3t_i, i_3n_i ) );

            // Quad-Case: Make second Triangle
            // Fan-triangulates the quad (0,1,2,3) as (0,1,2)+(0,2,3): the first
            // triangle was already pushed above using indices 0,1,2, so this one
            // reuses corners 0 and 2 and adds the 4th corner — assumes the quad
            // is convex/planar, which is the usual case for authored OBJ meshes.
            if ( i_3v_i[3] >= 0 )
            {
                int i_3v[3], i_3n[3], i_3t[3];
                i_3v[0] = i_3v_i[0];
                i_3v[1] = i_3v_i[2];
                i_3v[2] = i_3v_i[3];
                i_3n[0] = i_3n_i[0];
                i_3n[1] = i_3n_i[2];
                i_3n[2] = i_3n_i[3];
                i_3t[0] = i_3t_i[0];
                i_3t[1] = i_3t_i[2];
                i_3t[2] = i_3t_i[3];
                m_triangles.push_back( Triangle( i_3v, i_3t, i_3n ) );
                act_face++;
            }
            act_face++;
        }
    }

    if ( mpi != NULL )
    {
        mpi->toFace = act_face;
        m_meshPartInfo.push_back( mpi );
        m_objTexAvail = true;
    }
    else
    {                                                                // no materials available
        m_meshPartInfo.push_back( new MeshPartInfo( 0, act_face ) ); // set one materialnode with invalid index
        m_objTexAvail = false;
    }

    istr2_in.close();

    std::cout << "vertices:        " << int( m_vertices.size() ) << std::endl;
    std::cout << "normals:         " << int( m_normals.size() ) << std::endl;
    std::cout << "texcoords:       " << int( m_textcoords.size() ) << std::endl;
    std::cout << "normals created: " << ui_normals_created << std::endl;
    std::cout << "faces:           " << int( m_triangles.size() ) << std::endl;

    computeBoundingBox();
    // std::cout << "min:   " << "(" << bmin.x << "," << bmin.y << ","bmin.z << ")" << std::endl;
    // std::cout << "max:   " << "(" << bmax.x << "," << bmax.y << ","bmax.z << ")" << std::endl;
}

void Mesh::computeBoundingBox()
{
    // compute bounding box
    bmin.x = bmin.y = bmin.z = FLT_MAX;
    bmax.x = bmax.y = bmax.z = -FLT_MAX;
    for ( unsigned int i = 0; i < m_vertices.size(); ++i )
    {
        if ( m_vertices[i].x < bmin.x )
            bmin.x = m_vertices[i].x;
        if ( m_vertices[i].y < bmin.y )
            bmin.y = m_vertices[i].y;

        if ( m_vertices[i].z < bmin.z )
            bmin.z = m_vertices[i].z;

        if ( m_vertices[i].x > bmax.x )
            bmax.x = m_vertices[i].x;
        if ( m_vertices[i].y > bmax.y )
            bmax.y = m_vertices[i].y;
        if ( m_vertices[i].z > bmax.z )
            bmax.z = m_vertices[i].z;
    }
}

// Rebuilds tgt as "<directory of src>/<newName>", i.e. resolves newName (a
// filename from inside an .obj/.mtl file, e.g. "map_Kd wall.png") relative to
// the file that referenced it rather than relative to the process's working
// directory.
// CAUTION: if src has neither '/' nor '\\' at all (no directory component),
// p is still NULL after the inner if-block's strcpy(tgt,newName), and the
// unconditional `p++; strcpy(p,newName);` below then writes through that
// stale NULL pointer. Every current call site passes sFilename (the .obj/
// .mtl path as given to the constructor), which in practice always carries a
// directory, so this path isn't normally exercised — but a bare filename
// with no path prefix would hit it.
void Mesh::replaceFilename( char *tgt, const char *src, const char *newName )
{
    strcpy( tgt, src );
    char *p = strrchr( tgt, '/' );
    if ( NULL == p )
    {
        p = strrchr( tgt, '\\' );
        if ( NULL == p )
        {
            strcpy( tgt, newName );
        }
    }
    p++;
    strcpy( p, newName );
}

void Mesh::loadTextureImages()
{
    for ( unsigned int tc = 0; tc < m_textures.size(); tc++ )
    {
        if ( NULL == m_textures[tc].qImageTexture )
        {
            m_textures[tc].qImageTexture = new QImage;
            loadTexture( *( m_textures[tc].qImageTexture ), m_textures[tc].textureId, m_textures[tc].texname );
        }
    }
}

void Mesh::assignTexture( char *filename )
{
    if ( !m_objTexAvail ) // no textures already available from obj file
    {
        m_meshPartInfo[0]->materialIndex = 0;
        m_materialList.push_back( new MaterialNode( 0 ) );
        m_textures.push_back( TextureNode() );
        m_textures[0].qImageTexture = new QImage;
        strcpy( m_textures[0].texname, filename );
        loadTexture( *( m_textures[0].qImageTexture ), m_textures[0].textureId, m_textures[0].texname );
    }
}


bool Mesh::loadTexture( QImage &qimg, GLuint &textureId, const char *filename )
{
    QImage img;
    if ( !img.load( QString( filename ) ) )
    {
        cerr << "Could not load image: " << filename << endl;
        return false;
    }
    // Format_RGB32 stores each pixel in memory as B,G,R,0xFF (little-endian
    // 0xFFrrggbb); rgbSwapped() flips it to R,G,B,0xFF, which is exactly the
    // byte order glTexImage2D is told to expect below (GL_RGBA / UNSIGNED_BYTE)
    // — without the swap the red and blue channels would come out exchanged.
    QImage img2 = img.convertToFormat( QImage::Format_RGB32 );
    qimg = img2.rgbSwapped();
    glGenTextures( 1, &textureId );
    glBindTexture( GL_TEXTURE_2D, textureId );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
    glTexImage2D( GL_TEXTURE_2D,
                  0,                // level
                  GL_RGB8,          // internal format
                  qimg.width(),     // width
                  qimg.height(),    // height
                  0,                // border
                  GL_RGBA,          // format
                  GL_UNSIGNED_BYTE, // type
                  qimg.bits() );    // pixel data

    return true;
}




void Mesh::generateSphereTexCoords()
{
    // Only synthesize coordinates when the .obj file didn't already supply its
    // own materials/texcoords (m_objTexAvail) — this is a fallback mapping, not
    // an override.
    if ( !m_objTexAvail )
    {
        float multp[2] = { 5.0, 5.0f }; // texture repeat count in theta/phi
        m_textcoords.clear();
        // generate Texture Coordinates through Spere Mapping
        Vector3D center( ( bmin + bmax ) / 2 );
        m_textcoords.reserve( m_vertices.size() );
        for ( unsigned int i = 0; i < m_vertices.size(); i++ )
        {
            float    theta, phi;
            Vector3D delta = m_vertices[i] - center;
            delta.normalize();
            theta = atan2( delta.z, delta.x );
            theta = theta / ( 2 * M_PI ) + 0.5f;
            phi = acos( delta.y );
            phi = phi / M_PI;
            m_textcoords.push_back( Vector3D( multp[0] * theta, multp[1] * phi, 0 ) );
        }

        correctTheta( multp[0] );
    }
}


void Mesh::generateCylinderTexCoords()
{
    // Same "only if the .obj didn't already provide texcoords" guard as
    // generateSphereTexCoords().
    if ( !m_objTexAvail )
    {
        float multp[2] = { 5.0, 10.0f }; // texture repeat count in theta/height
        // generate Texture Coordinates throug Cylinder Mapping
        m_textcoords.clear();
        // generate Texture Coordinates through Spere Mapping
        Vector3D center( ( bmin + bmax ) / 2 );
        float    box_height = bmax.y - bmin.y;
        m_textcoords.reserve( m_vertices.size() );
        for ( unsigned int i = 0; i < m_vertices.size(); i++ )
        {
            float    theta, h;
            Vector3D delta( m_vertices[i].x - center.x, 0, m_vertices[i].z - center.z );
            theta = atan2( delta.z, delta.x );
            theta = theta / ( 2 * M_PI ) + 0.5f;
            h = ( m_vertices[i].y - bmin.y ) / box_height;
            m_textcoords.push_back( Vector3D( multp[0] * theta, multp[1] * h, 0 ) );
        }

        correctTheta( multp[0] );
    }
}

// Called right after generateSphereTexCoords()/generateCylinderTexCoords(),
// which emit exactly one texcoord per vertex in vertex order — so at this
// point triangle.t (still whatever readObj() parsed from the file, usually
// unset/-1 since these generators only run when m_objTexAvail is false) can
// simply be replaced with a copy of triangle.v, because index i in vertices
// and index i in textcoords now refer to the same point.
void Mesh::correctTheta( float multp )
{
    Vector3D center( ( bmin + bmax ) / 2 );

    // update triangle texture indices and
    // correct border cases, faces crossing the 0/1 texcoord border
    unsigned int texcoord_count = static_cast<unsigned int>( m_textcoords.size() );
    for ( unsigned int t = 0; t < m_triangles.size(); t++ )
    {
        memcpy( m_triangles[t].t, m_triangles[t].v, sizeof( int ) * 3 );
        Triangle &triangle = m_triangles[t];
        bool      back_vert = false, front_vert = false, left_vert = false;
        for ( int j = 0; j < 3; j++ )
        {
            Vector3D &vertex = m_vertices[triangle.v[j]];
            Vector3D  delta = vertex - center;
            if ( delta.z < 0 )
                back_vert = true;
            if ( delta.z >= 0 )
                front_vert = true;
            if ( delta.x < 0 )
                left_vert = true;
        }
        // Heuristic seam test: theta = atan2(z,x)/(2*PI)+0.5 wraps from ~1 back
        // to ~0 across the negative-x/z==0 line, so a triangle that has corners
        // on BOTH sides of z==0 while also reaching into the left (x<0) half is
        // the shape a seam-crossing triangle takes under this mapping. For such
        // a triangle, the corner(s) behind the seam (z<0) get their OWN, newly
        // appended texcoord shifted by +multp (one extra theta "wrap") instead
        // of sharing the original one — so interpolation walks smoothly past
        // 1.0 instead of tearing back across the whole texture to 0.0.
        if ( back_vert && front_vert && left_vert )
        {
            for ( int j = 0; j < 3; j++ )
            {
                Vector3D &vertex = m_vertices[triangle.v[j]];
                Vector3D  delta = vertex - center;
                if ( delta.z < 0 )
                {
                    Vector3D new_coord( m_textcoords[triangle.t[j]] );
                    new_coord.x += multp;
                    m_textcoords.push_back( new_coord );
                    triangle.t[j] = texcoord_count;
                    texcoord_count++;
                }
            }
        }
    }
}
