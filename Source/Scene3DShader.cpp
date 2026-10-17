/*****************************************************************************\
 *                              Scene3DShader
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of Scene3DShader: per-geom-kind procedural mesh generation, the compute-generator ("indirect")
 *  pipeline, the CPU-side formula-driven camera rig, and the per-geom-kind draw state (blend/depth, shadow pass,
 *  OIT pass).
 *
 *  See Scene3DShader.h.
 *
 *  @author René Weller
 */

#include <thread>
#include <mutex>
#include <condition_variable>
#include <deque>
#include <algorithm>
#include <chrono>
#include "glcore.h" // MUST come before any gl.h include (Qt's qopengl.h)
#include "shader_setup.h"
#include "Scene3DShader.h"
#include "MeshImport.h"

#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <vector>
#include <map>
#include <fstream>
#include <sstream>
#include <string>

#ifndef GL_POINT_SPRITE
#define GL_POINT_SPRITE \
    0x8861 ///< Legacy enable for textured point sprites (gl_PointCoord), for GL headers that lack it; a no-op in the
           ///< core profile.
#endif
#ifndef GL_VERTEX_PROGRAM_POINT_SIZE
#define GL_VERTEX_PROGRAM_POINT_SIZE \
    0x8642 ///< Enable letting the vertex shader set gl_PointSize (GEOM_POINTS / GEOM_SCATTER), for GL headers that lack
           ///< it.
#endif

/**  A craft's own frame, measured by Tools/model_orient.py and read from Engine/model_orient.tsv.
 *
 * The ship scenes guessed a craft's direction of travel from its longest bounding-box axis and never knew which end
 * was the nose; hulls modelled at an angle flew crabwise and hair-thin generator needles set the box (17.10.2026).
 * The table holds, per model file, the rotation into the craft frame (nose +Z, up +Y) and the half-extents and centre
 * in that frame, measured without the needles.  It is handed to the shaders as uniforms only -- a shader that does not
 * ask for meshOriented sees the model exactly as before.
 **/
struct ModelOrient
{
    float rot[9];  ///< The rotation into the craft frame, row-major.
    float ext[3];  ///< Half-extents in the craft frame.
    float cen[3];  ///< Centre in the craft frame.
    float threads; ///< Share of the surface in generator threads, % (removeThreads() from 1 % on).
    float oext[3]; ///< Half-extents without the threads in the model's own frame (meshExtent for a model with threads).
    float ocen[3]; ///< Centre without the threads in the model's own frame (meshCenter for a model with threads).
};

/**  Looks a model up in Engine/model_orient.tsv (read once, on first use).
 *
 * @param modelPath  The model's path as the scene entry gives it; only the file name counts. (in)
 *
 * @return
 *   The model's frame, or nullptr if the table does not list it.
 **/
static const ModelOrient *findModelOrient( const std::string &modelPath )
{
    static std::map<std::string, ModelOrient> table;
    static std::once_flag                     once;
    std::call_once( once, []
    {
        std::ifstream in( "..\\Engine\\model_orient.tsv" );
        std::string   line;
        while ( std::getline( in, line ) )
        {
            if ( line.empty() || line[0] == '#' )
                continue;
            std::istringstream ss( line );
            std::string        name;
            ModelOrient        o{};
            ss >> name;
            for ( float &x : o.rot )
                ss >> x;
            for ( float &x : o.ext )
                ss >> x;
            for ( float &x : o.cen )
                ss >> x;
            ss >> o.threads;
            for ( float &x : o.oext )
                ss >> x;
            for ( float &x : o.ocen )
                ss >> x;
            if ( ss )
                table[name] = o;
        }
    } );
    const size_t cut = modelPath.find_last_of( "\\/" );
    const auto   it = table.find( cut == std::string::npos ? modelPath : modelPath.substr( cut + 1 ) );
    return ( it == table.end() ) ? nullptr : &it->second;
}

/**  Removes a generated model's threads: hair-thin vertical strings of tiny triangles that hang from the hull to the
 * model's full height and read as black rain on screen (17.10.2026).  The same two rules as Tools/model_orient.py's
 * thread_mask, all lengths as fractions of the model's longest side S:
 *
 *   1. thin geometry (narrower than 0.008 S) in a column (0.006 S wide) whose eight neighbour columns are at most once
 *      occupied at that height, over a run of 0.05 S -- a thread standing free; a hull wall always has neighbours;
 *   2. slivers (narrower than 0.006 S, 2.5 times taller than wide) with no other geometry in their column or next to
 *      it at their height, chained up the column over 0.06 S -- a thread inside a dense curtain of threads.
 *
 * Called only for a model the table lists with a thread share of 1 % or more; a clean model keeps every triangle.
 *
 * @param v      The vertex buffer, 8 floats a vertex, three vertices a triangle. (in,out)
 * @param first  The model's first vertex; everything after it is the model. (in)
 *
 * @return
 *   The number of triangles removed.
 **/
static size_t removeThreads( std::vector<float> &v, size_t first )
{
    const size_t nt = ( v.size() / 8 - first ) / 3;
    if ( nt == 0 )
        return 0;
    auto at = [&]( size_t t, int k, int c )
    { return v[( first + t * 3 + static_cast<size_t>( k ) ) * 8 + c]; };
    float lo[3] = { 1e30f, 1e30f, 1e30f }, hi[3] = { -1e30f, -1e30f, -1e30f };
    for ( size_t t = 0; t < nt; ++t )
        for ( int k = 0; k < 3; ++k )
            for ( int c = 0; c < 3; ++c )
            {
                lo[c] = std::min( lo[c], at( t, k, c ) );
                hi[c] = std::max( hi[c], at( t, k, c ) );
            }
    const float S = std::max( { hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2] } );
    if ( S <= 0.f )
        return 0;
    const int   Ny = 100;
    const float cell = 0.006f * S, hy = std::max( hi[1] - lo[1], 1e-6f ) / static_cast<float>( Ny );
    const int   nx = static_cast<int>( ( hi[0] - lo[0] ) / cell ) + 5;
    const int   nz = static_cast<int>( ( hi[2] - lo[2] ) / cell ) + 5;
    auto        bin = [&]( float y )
    { return std::clamp( static_cast<int>( ( y - lo[1] ) / hy ), 0, Ny - 1 ); };
    auto idx = [&]( int x, int z, int y )
    { return ( static_cast<size_t>( x ) * static_cast<size_t>( nz ) + static_cast<size_t>( z ) ) * Ny + y; };

    struct Tri
    {
        int   cx, cz, b0, b1, yc;
        float y0, y1;
        bool  thin, sliver;
    };
    std::vector<Tri> tri( nt );
    for ( size_t t = 0; t < nt; ++t )
    {
        float mn[3] = { 1e30f, 1e30f, 1e30f }, mx[3] = { -1e30f, -1e30f, -1e30f }, c[3] = { 0.f, 0.f, 0.f };
        for ( int k = 0; k < 3; ++k )
            for ( int a = 0; a < 3; ++a )
            {
                const float x = at( t, k, a );
                mn[a] = std::min( mn[a], x );
                mx[a] = std::max( mx[a], x );
                c[a] += x / 3.f;
            }
        const float hxz = std::hypot( mx[0] - mn[0], mx[2] - mn[2] );
        Tri        &r = tri[t];
        r.cx = static_cast<int>( ( c[0] - lo[0] ) / cell ) + 2;
        r.cz = static_cast<int>( ( c[2] - lo[2] ) / cell ) + 2;
        r.b0 = bin( mn[1] );
        r.b1 = bin( mx[1] );
        r.yc = bin( c[1] );
        r.y0 = mn[1];
        r.y1 = mx[1];
        r.thin = hxz < 0.008f * S;
        r.sliver = hxz < 0.006f * S && ( mx[1] - mn[1] ) > 2.5f * hxz;
    }
    const size_t         n = static_cast<size_t>( nx ) * static_cast<size_t>( nz ) * Ny;
    std::vector<uint8_t> occ( n, 0 ), thin_occ( n, 0 ), body( n, 0 );
    for ( const Tri &r : tri )
        for ( int b = r.b0; b <= r.b1; ++b )
        {
            const size_t i = idx( r.cx, r.cz, b );
            occ[i] = 1;
            if ( r.thin )
                thin_occ[i] = 1;
            if ( !r.sliver )
                body[i] = 1;
        }
    // Rule 1: isolated thin bins, in runs of 0.05 S up a column.
    std::vector<uint8_t> thread_bin( n, 0 );
    const int            need = std::max( 2, static_cast<int>( std::ceil( 0.05f * S / hy ) ) );
    for ( int x = 1; x < nx - 1; ++x )
        for ( int z = 1; z < nz - 1; ++z )
        {
            int run = 0;
            for ( int y = 0; y <= Ny; ++y )
            {
                bool iso = false;
                if ( y < Ny && thin_occ[idx( x, z, y )] )
                {
                    int nb = 0;
                    for ( int dx = -1; dx <= 1; ++dx )
                        for ( int dz = -1; dz <= 1; ++dz )
                            if ( ( dx || dz ) && occ[idx( x + dx, z + dz, y )] )
                                ++nb;
                    iso = nb <= 1;
                }
                if ( iso )
                    ++run;
                else
                {
                    if ( run >= need )
                        for ( int k = y - run; k < y; ++k )
                            thread_bin[idx( x, z, k )] = 1;
                    run = 0;
                }
            }
        }
    std::vector<uint8_t> drop( nt, 0 );
    for ( size_t t = 0; t < nt; ++t )
        drop[t] = tri[t].thin && thread_bin[idx( tri[t].cx, tri[t].cz, tri[t].yc )];

    // Rule 2: slivers free of the body (none in their column or next to it at their height), chained up a column.
    std::vector<size_t> free_slivers;
    for ( size_t t = 0; t < nt; ++t )
    {
        const Tri &r = tri[t];
        if ( !r.sliver )
            continue;
        bool by_body = false;
        for ( int dx = -1; dx <= 1 && !by_body; ++dx )
            for ( int dz = -1; dz <= 1 && !by_body; ++dz )
                by_body = body[idx( r.cx + dx, r.cz + dz, r.yc )] != 0;
        if ( !by_body )
            free_slivers.push_back( t );
    }
    std::sort( free_slivers.begin(), free_slivers.end(), [&]( size_t a, size_t b )
    {
        const Tri &p = tri[a], &q = tri[b];
        if ( p.cx != q.cx )
            return p.cx < q.cx;
        if ( p.cz != q.cz )
            return p.cz < q.cz;
        return p.y0 < q.y0;
    } );
    const float tol = 0.012f * S, chain = 0.06f * S;
    for ( size_t a = 0; a < free_slivers.size(); )
    {
        size_t b = a;
        while ( b < free_slivers.size() && tri[free_slivers[b]].cx == tri[free_slivers[a]].cx
                && tri[free_slivers[b]].cz == tri[free_slivers[a]].cz )
            ++b;
        // one column: union of the height ranges, joined across gaps under tol
        size_t s = a;
        float  c0 = tri[free_slivers[a]].y0, c1 = tri[free_slivers[a]].y1;
        for ( size_t i = a + 1; i <= b; ++i )
        {
            if ( i < b && tri[free_slivers[i]].y0 <= c1 + tol )
            {
                c1 = std::max( c1, tri[free_slivers[i]].y1 );
                continue;
            }
            if ( c1 - c0 >= chain )
                for ( size_t j = s; j < i; ++j )
                    drop[free_slivers[j]] = 1;
            if ( i < b )
            {
                s = i;
                c0 = tri[free_slivers[i]].y0;
                c1 = tri[free_slivers[i]].y1;
            }
        }
        a = b;
    }

    // Compact the buffer.
    size_t out = first, removed = 0;
    for ( size_t ti = 0; ti < nt; ++ti )
    {
        if ( drop[ti] )
        {
            ++removed;
            continue;
        }
        const size_t src = ( first + ti * 3 ) * 8;
        if ( src != out * 8 )
            std::copy( v.begin() + static_cast<std::ptrdiff_t>( src ),
                       v.begin() + static_cast<std::ptrdiff_t>( src + 24 ),
                       v.begin() + static_cast<std::ptrdiff_t>( out * 8 ) );
        out += 3;
    }
    v.resize( out * 8 );
    return removed;
}

/**  Deterministic integer hash producing a pseudo-random float in [0,1).
 *
 * @param n  Input key (typically a vertex/primitive index combined with a small seed slot). (in)
 *
 * @return
 *   Pseudo-random value in [0,1).
 *
 * The geometry must be identical every run (the vertex shader animates it; re-rolled variety
 * comes from the per-activation params), so this is a fixed bit-mixing hash rather than a PRNG
 * with hidden state.
 **/
static float hash01( unsigned int n )
{
    n = ( n ^ 61u ) ^ ( n >> 16 );
    n *= 9u;
    n = n ^ ( n >> 4 );
    n *= 0x27d4eb2du;
    n = n ^ ( n >> 15 );
    return static_cast<float>( n & 0xffffff ) / static_cast<float>( 0x1000000 );
}

// FPS-driven cube budget (see RenderPipeline::paint's hysteresis).
float Scene3DShader::M_CubeBudget = 1.f;

// Shared by all geom="indirect" scenes (see setupIndirect()).
GLuint Scene3DShader::M_ClampProg = 0;

/**  Basic uniform random float in [0,1) using the C standard library RNG (used only for one-shot per-activation
 * rolls, not per-vertex geometry).
 *
 * @return
 *   Pseudo-random value in [0,1).
 **/
static float rand01()
{
    return static_cast<float>( rand() ) / static_cast<float>( RAND_MAX );
}

// Roll a fresh activation epoch: time offset, gentle speed factor, hue
// rotation and the generic scene seed.  All CONSTANT within the activation
// (only derivatives matter for flicker — these have none).
void Scene3DShader::rollVariation()
{
    m_sceneSeed = rand01();
    m_timeOffset = rand01() * 900.f;
    m_speedFactor = 0.82f + 0.36f * rand01();
    m_hueOffset = rand01() * 6.2831853f;
}

Scene3DShader::Scene3DShader( const std::string &filenameFragmentShader, const std::string &geom,
                              unsigned int minTimeSolo, unsigned int maxTimeSolo,
                              unsigned int minTimeInterpolation, unsigned int maxTimeInterpolation )
    : EffectShader( filenameFragmentShader, minTimeSolo, maxTimeSolo,
                    minTimeInterpolation, maxTimeInterpolation )
{
    if ( geom == "cubes" )
        m_geomKind = GEOM_CUBES;
    else if ( geom == "ribbon" )
        m_geomKind = GEOM_RIBBON;
    else if ( geom == "grid" )
        m_geomKind = GEOM_GRID;
    else if ( geom == "quads" )
        m_geomKind = GEOM_QUADS;
    else if ( geom == "patches" )
        m_geomKind = GEOM_PATCHES;
    else if ( geom == "scatter" )
        m_geomKind = GEOM_SCATTER;
    else if ( geom == "indirect" )
        m_geomKind = GEOM_INDIRECT;
    else if ( geom == "mesh" )
        m_geomKind = GEOM_MESH;
    else
        m_geomKind = GEOM_POINTS;

    rollVariation();

    // The matching vertex shader sits next to the fragment shader
    // ("..\Scene3D\X.frag" -> "..\Scene3D\X.vert").
    // sibling(): replaces the ".frag" suffix with another extension and
    // returns a malloc'd C string, matching the ownership convention of
    // EffectShader::m_vertexShaderFilename / m_fragmentShaderFilename (plain
    // char* rather than std::string) so this class can be freed the same way.
    auto sibling = []( const std::string &frag, const char *ext ) -> std::string
    {
        std::string s = frag;
        size_t      p = s.rfind( ".frag" );
        if ( p != std::string::npos )
            s.replace( p, 5, ext );
        return s;
    };

    m_vertexShaderFilename = sibling( filenameFragmentShader, ".vert" );
    // Optional stages: named, but only used if the file actually exists.
    m_tescFilename = sibling( filenameFragmentShader, ".tesc" );
    m_teseFilename = sibling( filenameFragmentShader, ".tese" );
    m_geomFilename = sibling( filenameFragmentShader, ".geom" );
    m_compFilename = sibling( filenameFragmentShader, ".comp" );
}

// ---------------------------------------------------------------------------
// Asynchronous mesh warm-up: one worker thread, one FIFO of shaders.
//
// The queue object is deliberately LEAKED (never destroyed): the worker is a
// detached daemon, and destroying the mutex/condvar under a parked thread at
// process exit would be UB for nothing -- the process teardown reclaims it.
// Shader lifetime is the real hazard and is handled in ~Scene3DShader(): it
// removes itself from the queue and, if the worker is mid-load on THIS shader,
// blocks until that load finished. The worker itself never touches GL.
// ---------------------------------------------------------------------------
namespace
{
/** The mesh warm-up queue and its worker's state (see the comment above). */
struct MeshWarmupQueue
{
    std::mutex                  mtx;                   ///< Guards queue and inFlight.
    std::condition_variable     cv;                    ///< Wakes the worker; signals that a load finished.
    std::deque<Scene3DShader *> queue;                 ///< Shaders waiting for their mesh to be loaded.
    Scene3DShader              *inFlight = nullptr;    ///< The shader whose mesh the worker is loading now, or null.
    bool                        threadStarted = false; ///< Whether the detached worker thread runs.
};
/**  The process-wide queue, created on first use.
 *
 * @return
 *   The queue; deliberately never destroyed.
 **/
MeshWarmupQueue &warmQ()
{
    static MeshWarmupQueue *q = new MeshWarmupQueue; // leaked on purpose, see above
    return *q;
}
/** The detached worker thread: takes one shader after the other off the queue and loads its mesh (never GL). */
void warmupWorker()
{
    MeshWarmupQueue &q = warmQ();
    for ( ;; )
    {
        Scene3DShader *s = nullptr;
        {
            std::unique_lock<std::mutex> lk( q.mtx );
            q.cv.wait( lk, [&]
            { return !q.queue.empty(); } );
            s = q.queue.front();
            q.queue.pop_front();
            q.inFlight = s;
        }
        s->warmupLoadNow();
        {
            std::lock_guard<std::mutex> lk( q.mtx );
            q.inFlight = nullptr;
        }
        q.cv.notify_all();
    }
}
} // namespace

bool Scene3DShader::meshWarmupPending() const
{
    if ( m_geomKind != GEOM_MESH || m_vbo != 0 || m_modelPath.empty() )
        return false;
    const int ws = m_warmState.load( std::memory_order_acquire );
    return ws == WARM_NONE || ws == WARM_QUEUED || ws == WARM_LOADING;
}

void Scene3DShader::requestMeshWarmup()
{
    if ( m_geomKind != GEOM_MESH || m_vbo != 0 || m_modelPath.empty() )
        return;
    int expect = WARM_NONE;
    if ( !m_warmState.compare_exchange_strong( expect, WARM_QUEUED ) )
    {
        // Already queued: a REPEATED request is the host saying "I need this
        // one NOW" (the fade-hold path asks every frame) -- move it to the
        // queue front so an active fade never waits behind the background
        // crawl of the whole preset.
        if ( expect == WARM_QUEUED )
        {
            MeshWarmupQueue            &q = warmQ();
            std::lock_guard<std::mutex> lk( q.mtx );
            auto                        it = std::find( q.queue.begin(), q.queue.end(), this );
            if ( it != q.queue.end() && it != q.queue.begin() )
            {
                q.queue.erase( it );
                q.queue.push_front( this );
            }
        }
        return;
    }
    MeshWarmupQueue &q = warmQ();
    {
        std::lock_guard<std::mutex> lk( q.mtx );
        q.queue.push_back( this );
        if ( !q.threadStarted )
        {
            q.threadStarted = true;
            std::thread( warmupWorker ).detach();
        }
    }
    q.cv.notify_all();
}

void Scene3DShader::warmupLoadNow()
{
    m_warmState.store( WARM_LOADING, std::memory_order_relaxed );
    const auto t0 = std::chrono::steady_clock::now();
    m_warmOk = loadMeshAsset( m_modelPath, m_warmAsset );
    if ( !m_modelPath2.empty() )
        m_warmOk2 = loadMeshAsset( m_modelPath2, m_warmAsset2 );
    const float ms = std::chrono::duration<float, std::milli>(
                         std::chrono::steady_clock::now() - t0 )
                         .count();
    fprintf( stderr, "MESHWARM %s %.0f ms (worker)\n", m_modelPath.c_str(), ms );
    // Release-publish: the render thread's acquire-load of WARM_READY makes the
    // asset writes above visible to it.
    m_warmState.store( WARM_READY, std::memory_order_release );
}

bool Scene3DShader::finishMeshWarmup()
{
    if ( m_geomKind != GEOM_MESH || m_vbo != 0 || !isCompiled() )
        return false;
    if ( m_warmState.load( std::memory_order_acquire ) != WARM_READY )
        return false;
    buildGeometry();
    bakeVao();
    return m_vbo != 0;
}

// ---------------------------------------------------------------------------
// Residency budget: give a model's GL memory back.
//
// Every mesh scene holds its own vertex buffer -- about 27 MB for a typical
// 850k-vertex model -- plus its material texture array. With 245 mesh scenes
// in the full preset that is over 20 GB if they all stay resident, which is
// exactly what the old eager warm-up produced (measured: 5 GB at start, 26 GB
// a minute later). The host keeps a handful and calls this for the rest; the
// scene reloads through the normal asynchronous path when it is next due.
//
// Only ever called for a scene that is neither on screen nor fading in.
// ---------------------------------------------------------------------------
void Scene3DShader::releaseMesh()
{
    if ( m_geomKind != GEOM_MESH || m_vbo == 0 )
        return;
    glDeleteBuffers( 1, &m_vbo );
    m_vbo = 0;
    if ( m_vao )
    {
        glDeleteVertexArrays( 1, &m_vao );
        m_vao = 0;
    }
    if ( m_meshMaterialTex )
    {
        glDeleteTextures( 1, &m_meshMaterialTex );
        m_meshMaterialTex = 0;
    }
    if ( m_meshMaterialTex2 )
    {
        glDeleteTextures( 1, &m_meshMaterialTex2 );
        m_meshMaterialTex2 = 0;
    }
    m_meshMaterialLayers = 0;
    m_meshMaterialLayers2 = 0;
    m_meshOwnVertexCount = 0;
    m_mesh2VertexCount = 0;
    m_vertexCount = 0;
    // Back to square one, so a later requestMeshWarmup() is accepted again.
    m_warmState.store( WARM_NONE, std::memory_order_release );
}

Scene3DShader::~Scene3DShader()
{
    // Async warm-up teardown BEFORE any member dies: drop a queued request,
    // and if the worker is loading THIS shader right now, wait it out -- the
    // worker writes into members the destructor is about to free.
    {
        MeshWarmupQueue             &q = warmQ();
        std::unique_lock<std::mutex> lk( q.mtx );
        q.queue.erase( std::remove( q.queue.begin(), q.queue.end(), this ),
                       q.queue.end() );
        q.cv.wait( lk, [&]
        { return q.inFlight != this; } );
    }

    if ( m_vbo )
        glDeleteBuffers( 1, &m_vbo );
    if ( m_cmdBuf )
        glDeleteBuffers( 1, &m_cmdBuf );
    if ( m_stateBuf )
        glDeleteBuffers( 1, &m_stateBuf );
    if ( m_genProg )
        glDeleteProgram( m_genProg );
    if ( m_meshMaterialTex )
        glDeleteTextures( 1, &m_meshMaterialTex );
    if ( m_meshMaterialTex2 )
        glDeleteTextures( 1, &m_meshMaterialTex2 );
}

void Scene3DShader::resetParameters()
{
    EffectShader::resetParameters();
    rollVariation();
}

// The variation is injected HOST-side so every scene benefits without shader
// edits: the time uniform gets this activation's epoch + speed, the audio
// phases and the key hue get constant offsets.
void Scene3DShader::setUniforms( double time, float interpolation,
                                 GLint texLoc1, GLint texLoc2 )
{
    // In double: the speed factor on the program time (the base class takes it relative to the activation).
    EffectShader::setUniforms( m_timeOffset + time * m_speedFactor,
                               interpolation, texLoc1, texLoc2 );
    m_lastTime = m_exprTime; // the indirect generator needs it in draw(): the `time` the render stages got
}

void Scene3DShader::applyAudioFeatures( const AudioFeatures &f )
{
    AudioFeatures v = f;
    // Different (non-1:1) multipliers on rotation vs. advance phase so the
    // three offset channels drift out of lockstep with each other across
    // activations, instead of every hue-driven phase just being m_hueOffset
    // again under a different name.
    v.chromaHue = f.chromaHue + m_hueOffset;
    // (The phase offsets are the base class's per-activation clock bases since 17.10.2026: audioRotPhase and
    // audioAdvance are taken relative to the activation there, from the exact values.)
    EffectShader::applyAudioFeatures( v );
    // Kept for the indirect generator, which is a separate program and so is
    // not reached by the shared uniform upload above: the features as the render stages saw them.
    m_lastAudio = m_audioSeen;
}

// A generator can sample the host's data textures too, and the host only
// uploads and binds those while something on screen actually wants them.  The
// base class only inspects the render program, so a scene whose ONLY reader is
// its compute generator would find unit 28 empty.
bool Scene3DShader::usesSpectro()
{
    if ( EffectShader::usesSpectro() )
        return true;
    if ( m_genSpectro < 0 )
        m_genSpectro = ( m_genProg != 0 && glGetUniformLocation( m_genProg, "texSpectro" ) >= 0 ) ? 1 : 0;
    return m_genSpectro == 1;
}

// Interleaved layout: attrA.xyzw, attrB.xyzw = 8 floats per vertex.
void Scene3DShader::buildGeometry()
{
    // Timed, permanently: for GEOM_MESH this runs synchronously on the render
    // thread at the scene's FIRST activation, so its duration is exactly the
    // stall the viewer feels (the early-minutes stutter). The scheduler
    // subtracts the stall from its clocks (absorbHitch), but the per-model
    // numbers logged below are what any future async-loading work starts from.
    const auto         mesh_t0 = std::chrono::steady_clock::now();
    std::vector<float> v;

    if ( m_geomKind == GEOM_INDIRECT )
    {
        // Nothing to build: setupIndirect() allocates an empty vertex buffer
        // that a compute shader fills every frame.  Returning here keeps the
        // vector empty, and the code below uploads a zero-sized buffer, which
        // setupIndirect() then resizes.
    }
    else if ( m_geomKind == GEOM_POINTS || m_geomKind == GEOM_SCATTER )
    {
        const int N = 60000;
        v.reserve( static_cast<size_t>( N ) * 8 );
        for ( int i = 0; i < N; ++i )
        {
            v.push_back( 0.f );
            v.push_back( 0.f );
            v.push_back( 0.f );
            v.push_back( static_cast<float>( i ) );
            v.push_back( hash01( i * 4u + 0u ) );
            v.push_back( hash01( i * 4u + 1u ) );
            v.push_back( hash01( i * 4u + 2u ) );
            v.push_back( hash01( i * 4u + 3u ) );
        }
    }
    else if ( m_geomKind == GEOM_CUBES )
    {
        // 4900 unit cubes (70 x 70 field), 36 vertices each.
        static const float C[36][3] = {
            { -.5f, -.5f, -.5f }, { .5f, -.5f, -.5f }, { .5f, .5f, -.5f },   { -.5f, -.5f, -.5f }, { .5f, .5f, -.5f },
            { -.5f, .5f, -.5f },  { -.5f, -.5f, .5f }, { .5f, .5f, .5f },    { .5f, -.5f, .5f },   { -.5f, -.5f, .5f },
            { -.5f, .5f, .5f },   { .5f, .5f, .5f },   { -.5f, -.5f, -.5f }, { -.5f, .5f, -.5f },  { -.5f, .5f, .5f },
            { -.5f, -.5f, -.5f }, { -.5f, .5f, .5f },  { -.5f, -.5f, .5f },  { .5f, -.5f, -.5f },  { .5f, .5f, .5f },
            { .5f, .5f, -.5f },   { .5f, -.5f, -.5f }, { .5f, -.5f, .5f },   { .5f, .5f, .5f },    { -.5f, .5f, -.5f },
            { .5f, .5f, -.5f },   { .5f, .5f, .5f },   { -.5f, .5f, -.5f },  { .5f, .5f, .5f },    { -.5f, .5f, .5f },
            { -.5f, -.5f, -.5f }, { .5f, -.5f, .5f },  { .5f, -.5f, -.5f },  { -.5f, -.5f, -.5f }, { -.5f, -.5f, .5f },
            { .5f, -.5f, .5f } };
        const int N = 4900;
        v.reserve( static_cast<size_t>( N ) * 36 * 8 );
        for ( int i = 0; i < N; ++i )
            for ( int k = 0; k < 36; ++k )
            {
                v.push_back( C[k][0] );
                v.push_back( C[k][1] );
                v.push_back( C[k][2] );
                v.push_back( static_cast<float>( i ) );
                v.push_back( hash01( i * 4u + 0u ) );
                v.push_back( hash01( i * 4u + 1u ) );
                v.push_back( hash01( i * 4u + 2u ) );
                v.push_back( hash01( i * 4u + 3u ) );
            }
    }
    else if ( m_geomKind == GEOM_GRID )
    {
        // A 220 x 120 heightfield mesh (two triangles per cell); per-vertex
        // u/v in attrA.xy, per-cell seeds in attrB — terrain-style scenes.
        const int W = 220, H = 120;
        v.reserve( static_cast<size_t>( W ) * H * 6 * 8 );
        for ( int cy = 0; cy < H; ++cy )
            for ( int cx = 0; cx < W; ++cx )
            {
                const float u0 = static_cast<float>( cx ) / static_cast<float>( W );
                const float u1 = static_cast<float>( cx + 1 ) / static_cast<float>( W );
                const float w0 = static_cast<float>( cy ) / static_cast<float>( H );
                const float w1 = static_cast<float>( cy + 1 ) / static_cast<float>( H );
                const float q[6][2] = {
                    { u0, w0 }, { u1, w0 }, { u1, w1 }, { u0, w0 }, { u1, w1 }, { u0, w1 } };
                const unsigned int cell = static_cast<unsigned int>( cy * W + cx );
                for ( int k = 0; k < 6; ++k )
                {
                    v.push_back( q[k][0] );
                    v.push_back( q[k][1] );
                    v.push_back( 0.f );
                    v.push_back( static_cast<float>( cell ) );
                    v.push_back( hash01( cell * 4u + 0u ) );
                    v.push_back( hash01( cell * 4u + 1u ) );
                    v.push_back( hash01( cell * 4u + 2u ) );
                    v.push_back( hash01( cell * 4u + 3u ) );
                }
            }
    }
    else if ( m_geomKind == GEOM_QUADS )
    {
        // 3000 unit quads (photo cards / shards / tiles), two triangles each;
        // corner u/v in attrA.xy, per-quad seeds in attrB.
        const int N = 3000;
        v.reserve( static_cast<size_t>( N ) * 6 * 8 );
        static const float Q[6][2] = {
            { 0.f, 0.f }, { 1.f, 0.f }, { 1.f, 1.f }, { 0.f, 0.f }, { 1.f, 1.f }, { 0.f, 1.f } };
        for ( int i = 0; i < N; ++i )
            for ( int k = 0; k < 6; ++k )
            {
                v.push_back( Q[k][0] );
                v.push_back( Q[k][1] );
                v.push_back( 0.f );
                v.push_back( static_cast<float>( i ) );
                v.push_back( hash01( i * 4u + 0u ) );
                v.push_back( hash01( i * 4u + 1u ) );
                v.push_back( hash01( i * 4u + 2u ) );
                v.push_back( hash01( i * 4u + 3u ) );
            }
    }
    else if ( m_geomKind == GEOM_PATCHES )
    {
        // A 64 x 64 field of QUAD PATCHES — four control points each, in CCW
        // order, which is what a tessellation control shader consumes.  The
        // corners carry their global (u,v) so the evaluation shader can place
        // and displace them; the actual triangle count is decided on the GPU.
        const int W = 64, H = 64;
        v.reserve( static_cast<size_t>( W ) * H * 4 * 8 );
        for ( int cy = 0; cy < H; ++cy )
            for ( int cx = 0; cx < W; ++cx )
            {
                const float u0 = static_cast<float>( cx ) / static_cast<float>( W );
                const float u1 = static_cast<float>( cx + 1 ) / static_cast<float>( W );
                const float w0 = static_cast<float>( cy ) / static_cast<float>( H );
                const float w1 = static_cast<float>( cy + 1 ) / static_cast<float>( H );
                const float c[4][2] = {
                    { u0, w0 }, { u1, w0 }, { u1, w1 }, { u0, w1 } };
                const unsigned int cell = static_cast<unsigned int>( cy * W + cx );
                for ( int k = 0; k < 4; ++k )
                {
                    v.push_back( c[k][0] );
                    v.push_back( c[k][1] );
                    v.push_back( 0.f );
                    v.push_back( static_cast<float>( cell ) );
                    v.push_back( hash01( cell * 4u + 0u ) );
                    v.push_back( hash01( cell * 4u + 1u ) );
                    v.push_back( hash01( cell * 4u + 2u ) );
                    v.push_back( hash01( cell * 4u + 3u ) );
                }
            }
    }
    else if ( m_geomKind == GEOM_MESH )
    {
        // Deferred while the warm-up worker is still on it: leave m_vbo at 0,
        // draw() skips rendering and the host holds the fade, so nothing is
        // ever shown half-loaded. draw() calls back in here the frame the
        // worker publishes WARM_READY.  A mesh is NEVER loaded on this
        // thread: a load is 200-700 ms and this is the render thread, so
        // without a finished warm-up there is simply nothing to build.
        const int ws = m_warmState.load( std::memory_order_acquire );
        if ( ws != WARM_READY )
            return;
        // The only non-procedural kind: v comes from a real file instead of a
        // generated pattern, but still lands in the same 8-floats-per-vertex
        // layout (attrA.xyz=pos/.w=U, attrB.xyz=normal/.w=V) every other kind
        // uses, so the upload code below needs no branch of its own.
        //
        // The buffer ends up in three consecutive runs:
        //   [0, m_meshOwnVertexCount)                 model 1 (model=)
        //   [m_meshOwnVertexCount, m_mesh2VertexCount) model 2 (model2=, may be empty)
        //   [m_mesh2VertexCount, end)                  the sky shell
        // With no model2 the middle run is empty and m_mesh2VertexCount ==
        // m_meshOwnVertexCount, so every existing single-model shader's
        // "gl_VertexID >= meshVertexCount means shell" test still holds.
        auto load_into = [&]( const std::string &path, MeshAsset *pre, GLuint &tex, int &layers ) -> bool
        {
            // A warmed asset skips the expensive part; the GL work below
            // stays on this thread either way. The sync path remains for
            // every caller that never went through the warm-up (startup
            // scene, review sweep, a failed worker load).
            MeshAsset local;
            if ( pre && !pre->vertices.empty() )
                local.vertices.swap( pre->vertices ),
                    local.materialRGBA.swap( pre->materialRGBA ),
                    local.materialLayers = pre->materialLayers,
                    local.materialW = pre->materialW,
                    local.materialH = pre->materialH;
            MeshAsset &asset = local;
            if ( asset.vertices.empty() && !loadMeshAsset( path, asset ) )
            {
                fprintf( stderr, "Scene3DShader: failed to load mesh '%s'\n", path.c_str() );
                return false;
            }
            v.insert( v.end(), asset.vertices.begin(), asset.vertices.end() );
            if ( asset.materialLayers > 0 )
            {
                if ( tex == 0 )
                    glGenTextures( 1, &tex );
                glBindTexture( GL_TEXTURE_2D_ARRAY, tex );
                glTexImage3D( GL_TEXTURE_2D_ARRAY, 0, GL_RGBA8,
                              asset.materialW, asset.materialH, asset.materialLayers,
                              0, GL_RGBA, GL_UNSIGNED_BYTE, asset.materialRGBA.data() );
                glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
                glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
                glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_S, GL_REPEAT );
                glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_T, GL_REPEAT );
                glGenerateMipmap( GL_TEXTURE_2D_ARRAY );
                glBindTexture( GL_TEXTURE_2D_ARRAY, 0 );
                layers = asset.materialLayers;
            }
            return true;
        };

        const bool warmed = ( ws == WARM_READY );
        load_into( m_modelPath, ( warmed && m_warmOk ) ? &m_warmAsset : nullptr,
                   m_meshMaterialTex, m_meshMaterialLayers );
        if ( const ModelOrient *o = findModelOrient( m_modelPath ); o && o->threads >= 1.f )
        {
            const size_t gone = removeThreads( v, 0 );
            fprintf( stderr, "Modell %s: %zu Faden-Dreiecke entfernt (%.1f %% der Flaeche)\n", m_modelPath.c_str(),
                     gone, o->threads );
        }
        m_meshOwnVertexCount = static_cast<int>( v.size() / 8 );

        // Measure the model's own bounding box, exposed as meshCenter/meshExtent.
        // The generator normalises each asset so its LONGEST axis is about 1.0,
        // which says nothing about the other two: a shader that sweeps a plane
        // or spaces a formation over a hardcoded range is right for one model
        // and wrong for the next. With the real half-extents in hand a shader
        // can be written once and be correct for all 108.
        if ( m_meshOwnVertexCount > 0 )
        {
            float lo[3] = { 1e30f, 1e30f, 1e30f };
            float hi[3] = { -1e30f, -1e30f, -1e30f };
            for ( int i = 0; i < m_meshOwnVertexCount; ++i )
                for ( int c = 0; c < 3; ++c )
                {
                    const float x = v[static_cast<size_t>( i ) * 8 + c];
                    if ( x < lo[c] )
                        lo[c] = x;
                    if ( x > hi[c] )
                        hi[c] = x;
                }
            for ( int c = 0; c < 3; ++c )
            {
                m_meshCenter[c] = 0.5f * ( hi[c] + lo[c] );
                // Never zero: a flat model would otherwise divide a shader by 0.
                m_meshExtent[c] = ( hi[c] - lo[c] ) * 0.5f;
                if ( m_meshExtent[c] < 1e-4f )
                    m_meshExtent[c] = 1e-4f;
            }
        }
        // A model with generator threads: its box without them -- what the rules miss of a dense curtain set the box,
        // and every scene sized the model by it, too small (18.10.2026).
        if ( const ModelOrient *o = findModelOrient( m_modelPath ); o && o->threads >= 1.f )
            for ( int c = 0; c < 3; ++c )
            {
                m_meshExtent[c] = std::max( o->oext[c], 1e-4f );
                m_meshCenter[c] = o->ocen[c];
            }
        setOrient( m_modelPath, m_meshExtent, m_meshCenter, m_orient, m_orientExt, m_orientCen, m_oriented );

        if ( !m_modelPath2.empty() )
            load_into( m_modelPath2, ( warmed && m_warmOk2 ) ? &m_warmAsset2 : nullptr,
                       m_meshMaterialTex2, m_meshMaterialLayers2 );
        if ( const ModelOrient *o = m_modelPath2.empty() ? nullptr : findModelOrient( m_modelPath2 );
             o && o->threads >= 1.f )
            removeThreads( v, static_cast<size_t>( m_meshOwnVertexCount ) );
        m_mesh2VertexCount = static_cast<int>( v.size() / 8 );

        // Consumed: release the prefetched CPU copies (tens of MB per model).
        if ( warmed )
        {
            m_warmAsset = MeshAsset();
            m_warmAsset2 = MeshAsset();
            m_warmState.store( WARM_CONSUMED, std::memory_order_relaxed );
        }

        // model2's own box, measured over ITS vertex range only.
        if ( m_mesh2VertexCount > m_meshOwnVertexCount )
        {
            float lo[3] = { 1e30f, 1e30f, 1e30f };
            float hi[3] = { -1e30f, -1e30f, -1e30f };
            for ( int i = m_meshOwnVertexCount; i < m_mesh2VertexCount; ++i )
                for ( int c = 0; c < 3; ++c )
                {
                    const float x = v[static_cast<size_t>( i ) * 8 + c];
                    if ( x < lo[c] )
                        lo[c] = x;
                    if ( x > hi[c] )
                        hi[c] = x;
                }
            for ( int c = 0; c < 3; ++c )
            {
                m_meshCenter2[c] = 0.5f * ( hi[c] + lo[c] );
                m_meshExtent2[c] = ( hi[c] - lo[c] ) * 0.5f;
                if ( m_meshExtent2[c] < 1e-4f )
                    m_meshExtent2[c] = 1e-4f;
            }
        }
        if ( const ModelOrient *o = m_modelPath2.empty() ? nullptr : findModelOrient( m_modelPath2 );
             o && o->threads >= 1.f )
            for ( int c = 0; c < 3; ++c )
            {
                m_meshExtent2[c] = std::max( o->oext[c], 1e-4f );
                m_meshCenter2[c] = o->ocen[c];
            }
        if ( !m_modelPath2.empty() )
            setOrient( m_modelPath2, m_meshExtent2, m_meshCenter2, m_orient2, m_orientExt2, m_orientCen2, m_oriented2 );

        // Append a big enclosing "sky shell" after the loaded mesh's own
        // vertices (same 36-corner unit-cube table GEOM_CUBES builds,
        // scaled way up and centered on the origin, NOT on the mesh's own
        // on-screen position) -- every geom="mesh" scene now renders
        // against this procedural backdrop instead of flat black. Skipped
        // if the mesh itself failed to load (v is empty; m_meshOwnVertexCount
        // stays 0), matching this class's existing fail-soft convention.
        // attrB carries the outward DIRECTION here (not a real lighting
        // normal) -- each geom="mesh" fragment shader uses it as the "sky
        // direction" for procedural nebula/asteroid-field/planet noise.
        if ( !v.empty() )
        {
            static const float SC[36][3] = {
                { -.5f, -.5f, -.5f }, { .5f, -.5f, -.5f },  { .5f, .5f, -.5f },   { -.5f, -.5f, -.5f },
                { .5f, .5f, -.5f },   { -.5f, .5f, -.5f },  { -.5f, -.5f, .5f },  { .5f, .5f, .5f },
                { .5f, -.5f, .5f },   { -.5f, -.5f, .5f },  { -.5f, .5f, .5f },   { .5f, .5f, .5f },
                { -.5f, -.5f, -.5f }, { -.5f, .5f, -.5f },  { -.5f, .5f, .5f },   { -.5f, -.5f, -.5f },
                { -.5f, .5f, .5f },   { -.5f, -.5f, .5f },  { .5f, -.5f, -.5f },  { .5f, .5f, .5f },
                { .5f, .5f, -.5f },   { .5f, -.5f, -.5f },  { .5f, -.5f, .5f },   { .5f, .5f, .5f },
                { -.5f, .5f, -.5f },  { .5f, .5f, -.5f },   { .5f, .5f, .5f },    { -.5f, .5f, -.5f },
                { .5f, .5f, .5f },    { -.5f, .5f, .5f },   { -.5f, -.5f, -.5f }, { .5f, -.5f, .5f },
                { .5f, -.5f, -.5f },  { -.5f, -.5f, -.5f }, { -.5f, -.5f, .5f },  { .5f, -.5f, .5f } };
            const float Side = 2.f * static_cast<float>( SkyShellRadius ); // corners are +-0.5 -> +-R
            for ( int k = 0; k < 36; ++k )
            {
                const float px = SC[k][0] * Side, py = SC[k][1] * Side, pz = SC[k][2] * Side;
                const float len = sqrtf( px * px + py * py + pz * pz );
                v.push_back( px );
                v.push_back( py );
                v.push_back( pz );
                v.push_back( 0.f );
                v.push_back( px / len );
                v.push_back( py / len );
                v.push_back( pz / len );
                v.push_back( 0.f );
            }
        }
    }
    else // GEOM_RIBBON: 20 ribbons x 300 segments, two triangles per segment.
    {
        const int M = 20, S = 300;
        v.reserve( static_cast<size_t>( M ) * S * 6 * 8 );
        for ( int r = 0; r < M; ++r )
            for ( int s = 0; s < S; ++s )
            {
                const float t0 = static_cast<float>( s ) / static_cast<float>( S );
                const float t1 = static_cast<float>( s + 1 ) / static_cast<float>( S );
                // Two triangles of the (t0..t1) x (side -1..+1) quad.
                const float quad[6][2] = {
                    { t0, -1.f }, { t1, -1.f }, { t1, 1.f }, { t0, -1.f }, { t1, 1.f }, { t0, 1.f } };
                for ( int k = 0; k < 6; ++k )
                {
                    v.push_back( quad[k][0] );
                    v.push_back( quad[k][1] );
                    v.push_back( 0.f );
                    v.push_back( static_cast<float>( r ) );
                    v.push_back( hash01( r * 4u + 0u ) );
                    v.push_back( hash01( r * 4u + 1u ) );
                    v.push_back( hash01( r * 4u + 2u ) );
                    v.push_back( hash01( r * 4u + 3u ) );
                }
            }
    }

    m_vertexCount = static_cast<int>( v.size() / 8 );
    if ( m_vbo == 0 )
        glGenBuffers( 1, &m_vbo );
    glBindBuffer( GL_ARRAY_BUFFER, m_vbo );
    if ( m_geomKind == GEOM_INDIRECT )
    {
        // Room for the generator's output.  GL_DYNAMIC_COPY says what actually
        // happens to this buffer: written by the GPU, read by the GPU, never
        // touched by the CPU at all.
        //
        // 200k triangles is several times what an isosurface over a 64^3 field
        // produces, which is the headroom a generator needs to stay safe on a
        // loud frame.  MUST stay a multiple of 3 — the overflow guard relies on
        // a three-vertex reservation either fitting entirely or starting at or
        // past the end, so that no half-written triangle lands inside the
        // clamped range.  Allocated lazily, on the scene's first appearance.
        m_meshCapacity = 600000; // vertices (19.2 MB)
        glBufferData( GL_ARRAY_BUFFER,
                      static_cast<GLsizeiptr>( static_cast<size_t>( m_meshCapacity ) * 8 * sizeof( float ) ),
                      NULL, GL_DYNAMIC_COPY );
    }
    else
    {
        glBufferData( GL_ARRAY_BUFFER, static_cast<GLsizeiptr>( v.size() * sizeof( float ) ),
                      v.data(), GL_STATIC_DRAW );
        if ( m_geomKind == GEOM_MESH )
        {
            const float ms = std::chrono::duration<float, std::milli>(
                                 std::chrono::steady_clock::now() - mesh_t0 )
                                 .count();
            fprintf( stderr, "MESHLOAD %s %.0f ms (%zu verts)\n",
                     m_modelPath.c_str(), ms, v.size() / 8 );
        }
    }
    glBindBuffer( GL_ARRAY_BUFFER, 0 );
}

// Compile the scene's generator and allocate the indirect command buffer.
// Fails soft in every direction: no compute support, no .comp file, a compile
// error — the scene simply draws nothing rather than taking the app down.
bool Scene3DShader::setupIndirect()
{
    if ( m_genTried )
        return m_genProg != 0;
    m_genTried = true;

    if ( !glcoreHasCompute || !glDrawArraysIndirect || m_compFilename.empty() )
        return false;

    m_genProg = setComputeShader( m_compFilename.c_str() ); // 0 on any failure
    if ( m_genProg == 0 )
        return false;

    // The clamp pass is shared by every indirect scene, so it is compiled once
    // for the whole process.
    if ( M_ClampProg == 0 )
        M_ClampProg = setComputeShader( "..\\Engine\\IndirectClamp.comp" );
    if ( M_ClampProg == 0 )
    {
        glDeleteProgram( m_genProg );
        m_genProg = 0;
        return false;
    }

    // DrawArraysIndirectCommand = { count, instanceCount, first, baseInstance },
    // plus a fifth slot the generator counts into.  instanceCount/first/
    // baseInstance are set once here and never change.  This is the whole point
    // of the indirect path: the vertex count is produced and consumed on the
    // GPU, so the CPU never has to wait for a readback to learn how much
    // geometry there is.
    const GLuint cmd[8] = { 0u, 1u, 0u, 0u, 0u, 0u, 0u, 0u };
    glGenBuffers( 1, &m_cmdBuf );
    glBindBuffer( GL_DRAW_INDIRECT_BUFFER, m_cmdBuf );
    glBufferData( GL_DRAW_INDIRECT_BUFFER, sizeof( cmd ), cmd, GL_DYNAMIC_COPY );
    glBindBuffer( GL_DRAW_INDIRECT_BUFFER, 0 );

    // Persistent state, zeroed exactly once.  From here it belongs entirely to
    // the generator; the host never reads or writes it again, which is what
    // makes it cheap — no readback, no synchronisation, no per-frame upload.
    //
    // The zeroing goes through a CPU-side buffer rather than glClearBufferData.
    // It is a few hundred kilobytes, once, at scene load — while a state buffer
    // that came up holding whatever the driver left behind is a generator that
    // starts from garbage, and the symptom of that is a scene that looks wrong
    // on some machines and fine on others.
    if ( m_stateBytes > 0 )
    {
        std::vector<unsigned char> zero( static_cast<size_t>( m_stateBytes ), 0 );
        glGenBuffers( 1, &m_stateBuf );
        glBindBuffer( GL_SHADER_STORAGE_BUFFER, m_stateBuf );
        glBufferData( GL_SHADER_STORAGE_BUFFER, static_cast<GLsizeiptr>( m_stateBytes ),
                      &zero[0], GL_DYNAMIC_COPY );
        glBindBuffer( GL_SHADER_STORAGE_BUFFER, 0 );
    }
    return true;
}

// Run the generator, clamp its counter, and fence the results for both the
// vertex fetch and the indirect command fetch.  The raw counter is reset by the
// clamp pass, so there is no CPU-side buffer touch here at all.
void Scene3DShader::runGenerator( float time )
{
    glUseProgram( m_genProg );

    // The generator is a SECOND program, so it does not get the shared audio
    // uniforms.  It takes a deliberately small set by hand, plus the scene's
    // own preset <float> params looked up by name — which is what lets a
    // generator be tuned from the preset exactly like the render stages.
    // Per-program location cache (mirrors EffectShader::applyAudioFeatures's
    // m_audioLocs -- see GenLocCache's doc comment in the header for why this
    // is a SEPARATE cache rather than a reuse of m_exprs' own loc/progId
    // fields). Re-resolved once whenever m_genProg changes (first run, or a
    // hot-reload recompile), never per frame.
    if ( m_genLocs.progId != m_genProg )
    {
        GLuint p = m_genProg;
        m_genLocs.time = glGetUniformLocation( p, "time" );
        m_genLocs.sceneSeed = glGetUniformLocation( p, "sceneSeed" );
        m_genLocs.audioAdvance = glGetUniformLocation( p, "audioAdvance" );
        m_genLocs.audioLevel = glGetUniformLocation( p, "audioLevel" );
        m_genLocs.audioBeat = glGetUniformLocation( p, "audioBeat" );
        m_genLocs.audioKick = glGetUniformLocation( p, "audioKick" );
        m_genLocs.audioSubBass = glGetUniformLocation( p, "audioSubBass" );
        m_genLocs.audioHigh = glGetUniformLocation( p, "audioHigh" );
        m_genLocs.audioBass = glGetUniformLocation( p, "audioBass" );
        m_genLocs.audioMid = glGetUniformLocation( p, "audioMid" );
        m_genLocs.audioChroma = glGetUniformLocation( p, "audioChroma" );
        m_genLocs.audioSpectrum = glGetUniformLocation( p, "audioSpectrum" );
        m_genLocs.audioPhase = glGetUniformLocation( p, "audioPhase" );
        m_genLocs.audioSwell = glGetUniformLocation( p, "audioSwell" );
        m_genLocs.sceneAdvance = glGetUniformLocation( p, "sceneAdvance" );
        m_genLocs.sceneTime = glGetUniformLocation( p, "sceneTime" );
        m_genLocs.sceneProgress = glGetUniformLocation( p, "sceneProgress" );
        m_genLocs.texSpectro = glGetUniformLocation( p, "texSpectro" );
        m_genLocs.spectroHead = glGetUniformLocation( p, "spectroHead" );
        m_genLocs.spectroFill = glGetUniformLocation( p, "spectroFill" );
        m_genLocs.maxVertices = glGetUniformLocation( p, "maxVertices" );
        m_genLocs.frameIndex = glGetUniformLocation( p, "frameIndex" );
        m_genLocs.genPass = glGetUniformLocation( p, "genPass" );

        m_genUniformLocs.resize( m_uniforms.size() );
        for ( size_t i = 0; i < m_uniforms.size(); ++i )
            m_genUniformLocs[i] = glGetUniformLocation( p, m_uniforms[i]->getName().c_str() );

        m_genExprLocs.resize( m_exprs.size() );
        for ( size_t i = 0; i < m_exprs.size(); ++i )
            m_genExprLocs[i] = glGetUniformLocation( p, m_exprs[i].name.c_str() );

        m_genLocs.progId = m_genProg;
    }

    auto set_f = [&]( GLint l, float v )
    { if( l >= 0 ) glUniform1f( l, v ); };
    const AudioFeatures &a = m_lastAudio; // already carries this scene's offsets
    set_f( m_genLocs.time, time );        // already the render stages' `time` (setUniforms())
    set_f( m_genLocs.sceneSeed, m_sceneSeed );
    set_f( m_genLocs.audioAdvance, a.audioAdvance );
    set_f( m_genLocs.audioLevel, a.overallLevel );
    set_f( m_genLocs.audioBeat, a.beatDecay );
    set_f( m_genLocs.audioKick, a.onsetKick );
    set_f( m_genLocs.audioSubBass, a.subBassLevel );
    set_f( m_genLocs.audioHigh, a.highLevel );
    set_f( m_genLocs.audioBass, a.bassLevel );
    set_f( m_genLocs.audioMid, a.midLevel );
    set_f( m_genLocs.audioPhase, a.audioRotPhase );
    set_f( m_genLocs.audioSwell, a.swell );
    // Scene clocks, same definitions as the fragment stage: advance and time
    // since this activation, and the staged progress the regie may bend.
    set_f( m_genLocs.sceneAdvance, ( m_advanceAtReset > -1.0e8f ) ? a.audioAdvance - m_advanceAtReset : 0.f );
    // The value the render stages got this frame.  Until 17.10.2026 this was `time - m_activationTime` -- the RAW
    // time against an activation stamped in the VARIED time (m_timeOffset + time * m_speedFactor, see
    // setUniforms()), so the generator's sceneTime ran some hundreds of seconds below zero: GalaxyMergerNBody
    // re-seeded its 32,768 stars every frame and never drew one, and 81 other generators read the same wrong clock.
    set_f( m_genLocs.sceneTime, m_lastSceneTime );
    set_f( m_genLocs.sceneProgress, m_sceneProgress );
    if ( m_genLocs.audioChroma >= 0 )
        glUniform1fv( m_genLocs.audioChroma, 12, a.chroma );
    if ( m_genLocs.audioSpectrum >= 0 )
        glUniform1fv( m_genLocs.audioSpectrum, AudioFeatures::SpectrumBands, a.spectrum );
    // The host binds the spectrogram to unit 28 whenever usesSpectro() says
    // somebody wants it — which, for an indirect scene, includes this program.
    if ( m_genLocs.texSpectro >= 0 )
        glUniform1i( m_genLocs.texSpectro, 28 );
    set_f( m_genLocs.spectroHead, a.spectroHead );
    set_f( m_genLocs.spectroFill, a.spectroFill );
    if ( m_genLocs.maxVertices >= 0 )
        glUniform1ui( m_genLocs.maxVertices, static_cast<GLuint>( m_meshCapacity ) );
    for ( size_t i = 0; i < m_uniforms.size(); ++i )
        set_f( m_genUniformLocs[i], m_uniforms[i]->snapshotValue() );

    // FORMULA-LAYER CONSISTENCY: the render stages get their uniforms
    // remapped by the formula layer — applyAudioFeatures evaluates the
    // preset's <expr> entries AFTER the raw uploads and overrides them by
    // name (audio remaps AND scripted config params alike).  The generator
    // is a SECOND program whose uniforms were just set by hand above, so
    // without this pass a scene with a formula on a uniform BOTH programs
    // read would half-follow two different values: fragment stage on the
    // formula, compute-built geometry on the raw/rolled value.
    if ( !m_exprs.empty() )
    {
        float ev[ExprVars::V_COUNT];
        fillExprVars( a, m_exprTime, m_exprSeeds, ev );
        ev[ExprVars::V_PROGRESS] = m_sceneProgress;
        for ( size_t i = 0; i < m_exprs.size(); ++i )
        {
            if ( !m_exprs[i].prog.valid() || m_genExprLocs[i] < 0 )
                continue;
            glUniform1f( m_genExprLocs[i], m_exprs[i].prog.eval( ev ) );
        }
    }

    glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, m_vbo );
    glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, m_cmdBuf );
    if ( m_stateBuf )
        glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, m_stateBuf );

    if ( m_genLocs.frameIndex >= 0 )
        glUniform1ui( m_genLocs.frameIndex, static_cast<GLuint>( m_frameIndex ) );
    GLint pass_loc = m_genLocs.genPass;

    // A fixed invocation budget: 64^3 = 262144, in 4x4x4 blocks.  What one
    // invocation MEANS is entirely the generator's business — a voxel for an
    // isosurface, a node for a tree, a lot for a city.  A generator that needs
    // fewer simply returns early, which costs nothing worth measuring.
    //
    // A stateful generator runs TWICE: once to advance its simulation, then —
    // after a barrier — once to build geometry from the result.  Doing both in
    // one dispatch would race, because invocations within a dispatch have no
    // ordering, and the meshing half would read state the stepping half had not
    // finished writing.
    //
    // A scene that called setGenPassCount(N > 0) (the "genPasses" preset
    // attribute) gets N passes instead of the fixed 2 (0..N-1, barrier
    // between each) -- for pipelines that need more than "advance, then
    // mesh" (a grid-based fluid sim needs e.g. clear-density / splat /
    // integrate-forces / mesh, four passes that each depend on the previous
    // one having finished writing). A GLSL shader can't tell the host how
    // many passes it wants -- uniforms are host-to-shader, not the other way
    // around -- so this is scene-configured (like stateBytes/shadowExtent),
    // not shader-declared. Purely additive: a scene that never calls
    // setGenPassCount() is completely unaffected, still runs through the
    // exact branch below it always did.
    if ( pass_loc >= 0 && m_genPassCount > 0 )
    {
        for ( int p = 0; p < m_genPassCount; ++p )
        {
            glUniform1f( pass_loc, static_cast<float>( p ) );
            glDispatchCompute( 16, 16, 16 );
            glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT | GL_TEXTURE_FETCH_BARRIER_BIT
                             | GL_SHADER_IMAGE_ACCESS_BARRIER_BIT );
        }
    }
    else if ( pass_loc >= 0 && m_stateBuf )
    {
        glUniform1f( pass_loc, 0.f );
        glDispatchCompute( 16, 16, 16 );
        glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
        glUniform1f( pass_loc, 1.f );
        glDispatchCompute( 16, 16, 16 );
    }
    else
    {
        if ( pass_loc >= 0 )
            glUniform1f( pass_loc, 1.f );
        glDispatchCompute( 16, 16, 16 );
    }
    ++m_frameIndex;

    // The clamp pass has to see the finished counter, so it needs its own
    // barrier before it runs — not just one at the end.
    glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );

    glUseProgram( M_ClampProg );
    // M_ClampProg is process-shared (one compute program for every indirect
    // scene), so its two locations are cached in function-local statics
    // rather than per-instance -- resolved once for the program's whole
    // lifetime (it is compiled once and never relinked; the progId guard is
    // just cheap insurance against that changing later).
    static GLuint clamp_loc_prog = 0;
    static GLint  clamp_loc_max_v = -1;
    if ( clamp_loc_prog != M_ClampProg )
    {
        clamp_loc_max_v = glGetUniformLocation( M_ClampProg, "maxVertices" );
        clamp_loc_prog = M_ClampProg;
    }
    if ( clamp_loc_max_v >= 0 )
        glUniform1ui( clamp_loc_max_v, static_cast<GLuint>( m_meshCapacity ) );
    // No FPS budget here (it was, until 16.10.2026): a lower vertex count drops whichever triangles atomicAdd handed
    // out last, a different set every frame -- flicker, where the cube scenes shrink a fixed half smoothly.
    glDispatchCompute( 1, 1, 1 );

    // Three consumers to fence against: the vertex puller, the indirect command
    // fetch, and any later shader read.  Missing the COMMAND bit is the classic
    // bug here — the draw then reads a stale vertex count and the mesh flickers
    // between this frame's size and the last frame's.
    glMemoryBarrier( GL_VERTEX_ATTRIB_ARRAY_BARRIER_BIT
                     | GL_COMMAND_BARRIER_BIT
                     | GL_SHADER_STORAGE_BARRIER_BIT );

    glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 0, 0 );
    glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 1, 0 );
    if ( m_stateBuf )
        glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 2, 0 );
}

void Scene3DShader::initUniforms( int width, int height )
{
    m_width = width;
    m_height = height;

    // NOT the base initUniforms: setShaders() is deliberately fragment-only
    // (the classic effects run on the fixed-function vertex path) — a real
    // 3D scene needs its vertex shader actually attached.
    // Tessellation / geometry stages join in automatically when their file is
    // present next to the .vert/.frag — no engine change per scene.
    m_shProgId = setShadersPipeline( m_vertexShaderFilename.c_str(),
                                     m_tescFilename.c_str(), m_teseFilename.c_str(),
                                     m_geomFilename.c_str(), m_fragmentShaderFilename.c_str() );
    m_texPointUni1 = glGetUniformLocation( m_shProgId, "tex0" );
    m_texPointUni2 = glGetUniformLocation( m_shProgId, "tex1" );
    m_texSizeRcpUni = glGetUniformLocation( m_shProgId, "resolution" );
    m_timeUni = glGetUniformLocation( m_shProgId, "time" );
    m_interpolationUni = glGetUniformLocation( m_shProgId, "interpolation" );
    m_progressUni = glGetUniformLocation( m_shProgId, "sceneProgress" );
    m_sceneTimeUni = glGetUniformLocation( m_shProgId, "sceneTime" );
    for ( unsigned int i = 0; i < m_uniforms.size(); ++i )
        m_uniforms[i]->initUniform( m_shProgId );

    m_projUni = glGetUniformLocation( m_shProgId, "projM" );
    m_eyeUni = glGetUniformLocation( m_shProgId, "eyeOff" );
    m_seedUni = glGetUniformLocation( m_shProgId, "sceneSeed" );
    m_budgetUni = glGetUniformLocation( m_shProgId, "cubeBudget" );
    m_meshMaterialUni = glGetUniformLocation( m_shProgId, "texMeshMaterial" );
    m_meshMaterialLayersUni = glGetUniformLocation( m_shProgId, "texMeshMaterialLayers" );
    m_meshVertexCountUni = glGetUniformLocation( m_shProgId, "meshVertexCount" );
    m_meshExtentUni = glGetUniformLocation( m_shProgId, "meshExtent" );
    m_meshExtent2Uni = glGetUniformLocation( m_shProgId, "meshExtent2" );
    m_meshCenter2Uni = glGetUniformLocation( m_shProgId, "meshCenter2" );
    m_meshInstancesUni = glGetUniformLocation( m_shProgId, "meshInstances" );
    m_meshCenterUni = glGetUniformLocation( m_shProgId, "meshCenter" );
    m_orientUni = glGetUniformLocation( m_shProgId, "meshOrient" );
    m_orientedUni = glGetUniformLocation( m_shProgId, "meshOriented" );
    m_orientExtUni = glGetUniformLocation( m_shProgId, "meshOrientExtent" );
    m_orientCenUni = glGetUniformLocation( m_shProgId, "meshOrientCenter" );
    m_orient2Uni = glGetUniformLocation( m_shProgId, "meshOrient2" );
    m_oriented2Uni = glGetUniformLocation( m_shProgId, "meshOriented2" );
    m_orientExt2Uni = glGetUniformLocation( m_shProgId, "meshOrientExtent2" );
    m_orientCen2Uni = glGetUniformLocation( m_shProgId, "meshOrientCenter2" );
    m_mesh2VertexCountUni = glGetUniformLocation( m_shProgId, "mesh2VertexCount" );
    m_meshMaterial2Uni = glGetUniformLocation( m_shProgId, "texMeshMaterial2" );
    m_meshMaterial2LayersUni = glGetUniformLocation( m_shProgId, "texMeshMaterialLayers2" );

    // The array samplers get their units NOW, while linkOrFail() still has the
    // program bound -- not first in draw(). A sampler uniform defaults to 0,
    // and a sampler2DArray aimed at unit 0 (where a plain 2D photo lives) is
    // invalid state from the moment of linking: the compile warmer builds
    // programs long before their first draw(), and the driver flagged exactly
    // one such validation per model load. The units themselves get a complete
    // stand-in immediately, so the state is well-formed even before the real
    // material texture exists.
    if ( m_meshMaterialUni >= 0 || m_meshMaterial2Uni >= 0 )
    {
        if ( m_meshMaterialUni >= 0 )
            glUniform1i( m_meshMaterialUni, MeshMaterialTexUnit );
        if ( m_meshMaterial2Uni >= 0 )
            glUniform1i( m_meshMaterial2Uni, MeshMaterial2TexUnit );
        const GLuint dummy = glcoreDummyTex2DArray();
        glActiveTexture( GL_TEXTURE0 + MeshMaterialTexUnit );
        glBindTexture( GL_TEXTURE_2D_ARRAY, dummy );
        glActiveTexture( GL_TEXTURE0 + MeshMaterial2TexUnit );
        glBindTexture( GL_TEXTURE_2D_ARRAY, dummy );
        glActiveTexture( GL_TEXTURE0 );
    }
    m_attrA = glGetAttribLocation( m_shProgId, "attrA" );
    m_attrB = glGetAttribLocation( m_shProgId, "attrB" );

    if ( m_vbo == 0 )
        buildGeometry();

    // Built here rather than lazily on the first draw, so the generator program
    // exists before RenderPipeline asks which host textures this scene needs —
    // usesSpectro() inspects the generator too.
    if ( m_geomKind == GEOM_INDIRECT )
        setupIndirect();

    // Core profile: vertex attribs live in a VAO (the attrib locations are
    // program-specific, so the VAO is per-scene). Split out because a
    // deferred mesh build re-bakes it when the warm-up finishes.
    bakeVao();

    checkGLErrors( "Scene3DShader::initUniforms" );
}

void Scene3DShader::bakeVao()
{
    // Deferred mesh build: no VBO yet. Baking now would call
    // glVertexAttribPointer with buffer 0 bound, which the core profile
    // answers with GL_INVALID_OPERATION -- 237 of them per cold run, one
    // per worker-loaded scene, drowning the log. draw() re-bakes the VAO
    // the moment the real buffer exists.
    if ( m_vbo == 0 )
        return;
    if ( m_vao == 0 )
        glGenVertexArrays( 1, &m_vao );
    glBindVertexArray( m_vao );
    glBindBuffer( GL_ARRAY_BUFFER, m_vbo );
    if ( m_attrA >= 0 )
    {
        glEnableVertexAttribArray( static_cast<GLuint>( m_attrA ) );
        glVertexAttribPointer( static_cast<GLuint>( m_attrA ), 4, GL_FLOAT, GL_FALSE,
                               8 * sizeof( float ), nullptr );
    }
    if ( m_attrB >= 0 )
    {
        glEnableVertexAttribArray( static_cast<GLuint>( m_attrB ) );
        glVertexAttribPointer( static_cast<GLuint>( m_attrB ), 4, GL_FLOAT, GL_FALSE,
                               8 * sizeof( float ), reinterpret_cast<const void *>( 4 * sizeof( float ) ) );
    }
    glBindVertexArray( 0 );
    glBindBuffer( GL_ARRAY_BUFFER, 0 );
}

void Scene3DShader::draw()
{
    // Deferred mesh build: while the warm-up worker still owns the model,
    // draw NOTHING (the host is holding the fade at interp=1, so the
    // outgoing scene covers the frame). The frame the worker publishes,
    // the build runs here -- GL upload only, a few ms -- and the VAO is
    // re-baked against the now-real VBO.
    if ( m_geomKind == GEOM_MESH && m_vbo == 0 )
    {
        int ws = m_warmState.load( std::memory_order_acquire );
        // Not requested yet -- a forced scene, the review sweep, the very
        // first scene, or one whose model the residency budget evicted:
        // ask now and draw nothing until it lands.
        if ( ws == WARM_NONE || ws == WARM_CONSUMED )
        {
            requestMeshWarmup();
            ws = m_warmState.load( std::memory_order_acquire );
        }
        if ( ws != WARM_READY )
            return;
        buildGeometry();
        if ( m_vbo == 0 )
            return;
        bakeVao();
    }
    // Perspective projection (55° vertical FOV, near 0.5, far 220).  The
    // aspect uses the FULL frame even for a half-viewport stereo eye — the
    // display/HMD player unsqueezes the halves back to full width.
    // The three numbers come from EffectShader, because the combine stage needs
    // the same ones to turn a depth sample back into a view-space position.
    // Two copies would drift, and every depth-based effect would then be
    // subtly, invisibly wrong.
    const float aspect = ( m_height > 0 ) ? static_cast<float>( m_width ) / static_cast<float>( m_height ) : 1.f;
    const float zn = SceneNear, zf = SceneFar;
    const float f = 1.f / SceneTanHalfFovY;
    float       proj[16] = {
        f / aspect, 0.f, 0.f, 0.f,
        0.f, f, 0.f, 0.f,
        0.f, 0.f, ( zf + zn ) / ( zn - zf ), -1.f,
        0.f, 0.f, ( 2.f * zf * zn ) / ( zn - zf ), 0.f };

    // CAMERA RIG: preset formulas named rig* steer the view.  Evaluated
    // CPU-side against the same variable set as every other formula, then
    // composed INTO projM, so all Scene3D scenes get pitch/yaw/roll/dolly
    // (+ host-integrated V rates) without touching a single shader.  The
    // shadow pass renders through lightM, so shadows stay world-anchored.
    {
        bool has_rig = false;
        for ( ExprEntry &e : m_exprs )
            if ( e.prog.valid() && e.name.rfind( "rig", 0 ) == 0 )
            {
                has_rig = true;
                break;
            }
        if ( has_rig )
        {
            float ev[ExprVars::V_COUNT];
            fillExprVars( m_lastAudio, m_exprTime, m_exprSeeds, ev );
            ev[ExprVars::V_PROGRESS] = m_sceneProgress;
            float              absv[4] = { 0, 0, 0, 0 }; // pitch yaw roll dolly
            float              vel[4] = { 0, 0, 0, 0 };
            static const char *Abs[4] = { "rigPitch", "rigYaw", "rigRoll", "rigDolly" };
            static const char *Vel[4] = { "rigPitchV", "rigYawV", "rigRollV", "rigDollyV" };
            for ( ExprEntry &e : m_exprs )
            {
                if ( !e.prog.valid() )
                    continue;
                for ( int i = 0; i < 4; ++i )
                {
                    if ( e.name == Abs[i] )
                        absv[i] = e.prog.eval( ev );
                    if ( e.name == Vel[i] )
                        vel[i] = e.prog.eval( ev );
                }
            }
            // integrate rates once per FRAME (same m_exprTime across the
            // shadow/opaque/OIT draws of one frame)
            if ( m_exprTime != m_rigLastT )
            {
                float dt = m_exprTime - m_rigLastT;
                if ( dt < 0.f || dt > 0.1f )
                    dt = 0.f; // activation / reset
                for ( int i = 0; i < 4; ++i )
                    m_rigAcc[i] += vel[i] * dt;
                m_rigLastT = m_exprTime;
            }
            // The dolly accumulator is the one rig channel that must not run
            // away: rotations wrap harmlessly, but an integrated rigDollyV
            // with any non-zero mean would march the camera INTO the scene's
            // geometry without bound -- a camera collision by construction.
            // No catalogue entry uses the V channels today (audited: all 236
            // dolly formulas are the bounded absolute 0.5*swell), so this
            // clamp costs nothing now and defuses the first future one.
            m_rigAcc[3] = std::max( -1.5f, std::min( m_rigAcc[3], 1.5f ) );
            const float px = absv[0] + m_rigAcc[0], yw = absv[1] + m_rigAcc[1];
            const float rl = absv[2] + m_rigAcc[2], dl = absv[3] + m_rigAcc[3];
            // M = T(0,0,dolly) * Rz(roll) * Ry(yaw) * Rx(pitch), column-major.
            // dolly > 0 pushes the camera IN (view-space z is negative ahead).
            const float cx = cosf( px ), sx = sinf( px );
            const float cy = cosf( yw ), sy = sinf( yw );
            const float cz = cosf( rl ), sz = sinf( rl );
            const float R[16] = { // Rz*Ry*Rx
                                  cz * cy, sz * cy, -sy, 0.f,
                                  cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx, 0.f,
                                  cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx, 0.f,
                                  0.f, 0.f, dl, 1.f };
            float       pr[16];
            for ( int c = 0; c < 4; ++c )
                for ( int r = 0; r < 4; ++r )
                    pr[c * 4 + r] = proj[0 * 4 + r] * R[c * 4 + 0] + proj[1 * 4 + r] * R[c * 4 + 1]
                                    + proj[2 * 4 + r] * R[c * 4 + 2] + proj[3 * 4 + r] * R[c * 4 + 3];
            memcpy( proj, pr, sizeof( proj ) );
        }
    }

    if ( m_projUni >= 0 )
        glUniformMatrix4fv( m_projUni, 1, GL_FALSE, proj );
    if ( m_eyeUni >= 0 )
        glUniform1f( m_eyeUni, m_eyeOffset );
    if ( m_seedUni >= 0 )
        glUniform1f( m_seedUni, m_sceneSeed );
    if ( m_budgetUni >= 0 )
        glUniform1f( m_budgetUni, M_CubeBudget );

    // The sampler is declared unconditionally by every mesh shader, so it gets
    // its unit unconditionally too. A model without material layers used to
    // leave texMeshMaterial at its default of 0 -- pointing a sampler2DArray
    // at unit 0, where a plain 2D photo sits. Wrong type AND, between photos,
    // nothing at all. The layers count still says 0, so the shader does not
    // sample it; this only makes the state the driver validates well-formed.
    if ( m_meshMaterialUni >= 0 )
        glUniform1i( m_meshMaterialUni, MeshMaterialTexUnit );
    if ( m_meshMaterialLayersUni >= 0 )
        glUniform1i( m_meshMaterialLayersUni, m_meshMaterialLayers );
    if ( m_meshMaterialUni >= 0 )
    {
        glActiveTexture( GL_TEXTURE0 + MeshMaterialTexUnit );
        glBindTexture( GL_TEXTURE_2D_ARRAY, ( m_meshMaterialLayers > 0 )
                                                ? m_meshMaterialTex
                                                : glcoreDummyTex2DArray() );
        glActiveTexture( GL_TEXTURE0 );
    }
    if ( m_geomKind == GEOM_MESH && m_meshVertexCountUni >= 0 )
        glUniform1i( m_meshVertexCountUni, m_meshOwnVertexCount );
    if ( m_geomKind == GEOM_MESH && m_meshInstancesUni >= 0 )
        glUniform1i( m_meshInstancesUni, m_meshInstances );
    if ( m_geomKind == GEOM_MESH && m_meshExtentUni >= 0 )
        glUniform3f( m_meshExtentUni, m_meshExtent[0], m_meshExtent[1], m_meshExtent[2] );
    if ( m_geomKind == GEOM_MESH && m_meshCenterUni >= 0 )
        glUniform3f( m_meshCenterUni, m_meshCenter[0], m_meshCenter[1], m_meshCenter[2] );
    if ( m_geomKind == GEOM_MESH )
    {
        // The craft frames (see findModelOrient); identity and the raw box for a model the table does not list.
        if ( m_orientUni >= 0 )
            glUniformMatrix3fv( m_orientUni, 1, GL_TRUE, m_orient );
        if ( m_orientedUni >= 0 )
            glUniform1f( m_orientedUni, m_oriented );
        if ( m_orientExtUni >= 0 )
            glUniform3fv( m_orientExtUni, 1, m_orientExt );
        if ( m_orientCenUni >= 0 )
            glUniform3fv( m_orientCenUni, 1, m_orientCen );
        if ( m_orient2Uni >= 0 )
            glUniformMatrix3fv( m_orient2Uni, 1, GL_TRUE, m_orient2 );
        if ( m_oriented2Uni >= 0 )
            glUniform1f( m_oriented2Uni, m_oriented2 );
        if ( m_orientExt2Uni >= 0 )
            glUniform3fv( m_orientExt2Uni, 1, m_orientExt2 );
        if ( m_orientCen2Uni >= 0 )
            glUniform3fv( m_orientCen2Uni, 1, m_orientCen2 );
    }
    if ( m_geomKind == GEOM_MESH && m_meshExtent2Uni >= 0 )
        glUniform3f( m_meshExtent2Uni, m_meshExtent2[0], m_meshExtent2[1], m_meshExtent2[2] );
    if ( m_geomKind == GEOM_MESH && m_meshCenter2Uni >= 0 )
        glUniform3f( m_meshCenter2Uni, m_meshCenter2[0], m_meshCenter2[1], m_meshCenter2[2] );
    if ( m_geomKind == GEOM_MESH && m_mesh2VertexCountUni >= 0 )
        glUniform1i( m_mesh2VertexCountUni, m_mesh2VertexCount );
    // Same for model2's layers; see above.
    if ( m_meshMaterial2Uni >= 0 )
        glUniform1i( m_meshMaterial2Uni, MeshMaterial2TexUnit );
    if ( m_meshMaterial2LayersUni >= 0 )
        glUniform1i( m_meshMaterial2LayersUni, m_meshMaterialLayers2 );
    if ( m_meshMaterial2Uni >= 0 )
    {
        glActiveTexture( GL_TEXTURE0 + MeshMaterial2TexUnit );
        glBindTexture( GL_TEXTURE_2D_ARRAY, ( m_meshMaterialLayers2 > 0 )
                                                ? m_meshMaterialTex2
                                                : glcoreDummyTex2DArray() );
        glActiveTexture( GL_TEXTURE0 );
    }

    // During the OIT accumulation pass, the caller (RenderPipeline::renderOitPass
    // / Scene3DPreview::renderOitPass) has ALREADY bound the two-target OIT
    // FBO, cleared it to its own per-attachment values (0 for accumulation,
    // 1 for revealage -- NOT the same value, so a blanket glClear here would
    // stomp the revealage back to 0), and set up the additive/multiplicative
    // blend it needs.  Below, every geometry branch forces its own opaque
    // blend/depth state for the normal case; both the clear and that
    // per-branch state-forcing must defer to the OIT pass instead.
    const bool in_oit_pass = ( EffectShader::M_OitPass >= 0.5f );

    if ( !in_oit_pass )
    {
        // Clear colour AND depth (scissored to the eye viewport in true stereo).
        glClearColor( 0.f, 0.f, 0.f, 1.f );
        glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
    }

    glBindVertexArray( m_vao );

    if ( m_geomKind == GEOM_INDIRECT )
    {
        // Compute builds the mesh, then the draw reads its vertex count out of
        // a buffer the GPU just wrote.  Nothing about the geometry — not even
        // how much of it there is — passes through the CPU this frame.
        if ( setupIndirect() )
        {
            // The generator binds its own program.  Uniform values live in the
            // program object, not in the context, so simply switching back
            // restores everything the host already uploaded for this frame —
            // no need to replay setUniforms().
            //
            // A shadowed scene reaches draw() TWICE per frame.  The mesh is
            // built in the first of those passes and reused in the second:
            // regenerating would double the compute for an identical result,
            // and — worse — the shadow map would then describe a mesh the
            // camera pass no longer draws if any input changed between them.
            bool generate = ( EffectShader::M_ShadowPass > 0.5f ) || !usesShadow();
            if ( generate )
            {
                glBindVertexArray( 0 );
                runGenerator( m_lastTime );
            }
            glUseProgram( m_shProgId );

            glBindVertexArray( m_vao );
            if ( !in_oit_pass )
            {
                glEnable( GL_DEPTH_TEST );
                glDisable( GL_BLEND );
            }
            glBindBuffer( GL_DRAW_INDIRECT_BUFFER, m_cmdBuf );
            glDrawArraysIndirect( GL_TRIANGLES, 0 );
            glBindBuffer( GL_DRAW_INDIRECT_BUFFER, 0 );
            if ( !in_oit_pass )
                glDisable( GL_DEPTH_TEST );

            // Diagnostic: KALEIDO_INDIRECT_LOG=1 appends the buffer's ACTUAL
            // vertex count (read back from the GPU, not inferred from a
            // screenshot) plus the pass flags that gated whether this call
            // regenerated the mesh, to indirect_diag.log next to the exe.
            // Written with a plain fopen/fclose, not stderr: Scene3DPreview::
            // captureStderr() (used by ensureCompiled() to capture shader
            // compile logs) freopen()s the process-global stderr mid-frame,
            // and under a piped/captured process (any headless run, this
            // tool's own testing included) its restore step can leave stderr
            // broken for the rest of the process -- so anything logged here
            // via stderr can silently vanish for reasons that have nothing
            // to do with the geometry itself.
            if ( getenv( "KALEIDO_INDIRECT_LOG" ) )
            {
                glBindBuffer( GL_DRAW_INDIRECT_BUFFER, m_cmdBuf );
                GLuint *cmd4 = static_cast<GLuint *>( glMapBuffer( GL_DRAW_INDIRECT_BUFFER, GL_READ_ONLY ) );
                GLuint  count = cmd4 ? cmd4[0] : 0xffffffffu;
                if ( cmd4 )
                    glUnmapBuffer( GL_DRAW_INDIRECT_BUFFER );
                glBindBuffer( GL_DRAW_INDIRECT_BUFFER, 0 );
                FILE *df = fopen( "indirect_diag.log", "a" );
                if ( df )
                {
                    fprintf( df,
                             "shadowPass=%.0f oitPass=%.0f generate=%d count=%u frameIndex=%d\n",
                             EffectShader::M_ShadowPass, EffectShader::M_OitPass, generate,
                             count, m_frameIndex );
                    fclose( df );
                }
            }
        }
    }
    else if ( m_geomKind == GEOM_PATCHES )
    {
        // Tessellated surface: the patch is the primitive, and the tessellator
        // decides how many triangles it becomes.
        if ( !in_oit_pass )
        {
            glEnable( GL_DEPTH_TEST );
            glDisable( GL_BLEND );
        }
        if ( glPatchParameteri )
            glPatchParameteri( GL_PATCH_VERTICES, 4 );
        glDrawArrays( GL_PATCHES, 0, m_vertexCount );
        if ( !in_oit_pass )
            glDisable( GL_DEPTH_TEST );
    }
    else if ( m_geomKind == GEOM_SCATTER )
    {
        // Points that a geometry shader grows into solid bodies: depth-tested
        // and opaque, so a near blade hides the ones behind it.
        if ( !in_oit_pass )
        {
            glEnable( GL_DEPTH_TEST );
            glDisable( GL_BLEND );
        }
        glDrawArrays( GL_POINTS, 0, m_vertexCount );
        if ( !in_oit_pass )
            glDisable( GL_DEPTH_TEST );
    }
    else if ( m_geomKind == GEOM_CUBES || m_geomKind == GEOM_GRID
              || m_geomKind == GEOM_QUADS || m_geomKind == GEOM_MESH )
    {
        // Solid geometry: depth-tested, opaque -- EXCEPT during the OIT
        // accumulation pass, whose caller has already set up the blend and
        // depth state a transparent pass needs (additive/multiplicative
        // blending, depth-test on but depth-WRITE off); forcing this
        // branch's normal opaque state here would silently turn the whole
        // accumulation into an ordinary non-blended overwrite (GlassStack,
        // the first geom="cubes" scene to use OIT, was invisible-as-glass
        // this way -- flat opaque shards instead of layered translucency).
        if ( !in_oit_pass )
        {
            glEnable( GL_DEPTH_TEST );
            glDisable( GL_BLEND );
        }
        // instances="N" on a geom="mesh" scene draws the same buffer N times so a
        // single loaded model can be a whole formation. Guarded on the entry
        // point as well as the count: glDrawArraysInstanced is core since GL
        // 3.1, but this codebase reaches everything through its own loader and
        // a missing pointer would be a null call rather than a compile error.
        // KALEIDO_COVER_LOG: counts the fragments this draw writes.  Only in
        // the main pass -- the shadow and OIT passes would count the same
        // pixels a second time and drive the coverage above 100 %.
        static const bool CoverLog = getenv( "KALEIDO_COVER_LOG" ) != 0;
        const bool        do_cover = CoverLog && m_geomKind == GEOM_MESH
                                     && !in_oit_pass && M_ShadowPass < 0.5f;
        if ( do_cover && !m_coverQuery )
            glGenQueries( 1, &m_coverQuery );
        if ( m_geomKind == GEOM_MESH && m_meshInstances > 1 && glDrawArraysInstanced )
            glDrawArraysInstanced( GL_TRIANGLES, 0, m_vertexCount, m_meshInstances );
        else
            glDrawArrays( GL_TRIANGLES, 0, m_vertexCount );
        if ( do_cover && m_coverQuery )
        {
            // The draw above filled the depth buffer with the VISIBLE surface.
            // A repeated draw with GL_EQUAL passes exactly there -- once per
            // covered pixel, without overdraw.  Colour and depth writes stay
            // off; the picture does not change.
            glColorMask( GL_FALSE, GL_FALSE, GL_FALSE, GL_FALSE );
            glDepthMask( GL_FALSE );
            glDepthFunc( GL_EQUAL );
            glBeginQuery( GL_SAMPLES_PASSED, m_coverQuery );
            // ONLY the model's vertices: behind them the buffer also holds the
            // background dome, and that covers the whole picture.
            const GLsizei own = ( m_meshOwnVertexCount > 0 )
                                    ? static_cast<GLsizei>( m_meshOwnVertexCount )
                                    : m_vertexCount;
            if ( m_meshInstances > 1 && glDrawArraysInstanced )
                glDrawArraysInstanced( GL_TRIANGLES, 0, own, m_meshInstances );
            else
                glDrawArrays( GL_TRIANGLES, 0, own );
            glEndQuery( GL_SAMPLES_PASSED );
            glDepthFunc( GL_LESS );
            glDepthMask( GL_TRUE );
            glColorMask( GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE );
            // Read back synchronously: that costs a stall, but this path runs
            // only in a measurement run, and an asynchronous result would have
            // to be matched to the right scene again across frames.
            GLuint samples = 0;
            glGetQueryObjectuiv( m_coverQuery, GL_QUERY_RESULT, &samples );
            GLint vp[4] = { 0, 0, 1, 1 };
            glGetIntegerv( GL_VIEWPORT, vp );
            // GL_SAMPLES_PASSED counts SAMPLES, not pixels: with 4x MSAA a fully
            // covered picture gives 4 per pixel.  Without this division every
            // scene measured exactly 4.0000, which is what gave the bug away.
            GLint msaa = 1;
            glGetIntegerv( GL_SAMPLES, &msaa );
            if ( msaa < 1 )
                msaa = 1;
            const double px = static_cast<double>( vp[2] ) * static_cast<double>( vp[3] ) * static_cast<double>( msaa );
            if ( px > 0.0 )
            {
                m_coverSum += static_cast<double>( samples ) / px;
                ++m_coverN;
            }
        }
        if ( !in_oit_pass )
            glDisable( GL_DEPTH_TEST );
    }
    else
    {
        // Glowing geometry: additive, order-independent (no depth test).
        // (Core profile: point sprites are always on; only the programmable
        // point size still needs its enable.)
        if ( !in_oit_pass )
        {
            glDisable( GL_DEPTH_TEST );
            glEnable( GL_BLEND );
            glBlendFunc( GL_ONE, GL_ONE );
        }
        if ( m_geomKind == GEOM_POINTS )
        {
            glEnable( GL_VERTEX_PROGRAM_POINT_SIZE );
            glDrawArrays( GL_POINTS, 0, m_vertexCount );
            glDisable( GL_VERTEX_PROGRAM_POINT_SIZE );
        }
        else
            glDrawArrays( GL_TRIANGLES, 0, m_vertexCount );
        if ( !in_oit_pass )
            glDisable( GL_BLEND );
    }

    glBindVertexArray( 0 );

    checkGLErrors( "Scene3DShader::draw" );
}

/**  Fills one model's craft frame from Engine/model_orient.tsv, or with identity and its raw box if it is not listed.
 *
 * @param path      The model's path from the scene entry. (in)
 * @param rawExt    Its measured half-extents (the fallback). (in)
 * @param rawCen    Its measured centre (the fallback). (in)
 * @param rot       Receives the rotation, row-major. (out)
 * @param ext       Receives the half-extents in the craft frame. (out)
 * @param cen       Receives the centre in the craft frame. (out)
 * @param oriented  Receives 1 if the table lists the model (2 if it has generator threads), else 0. (out)
 **/
void Scene3DShader::setOrient( const std::string &path, const float rawExt[3], const float rawCen[3], float rot[9],
                               float ext[3], float cen[3], float &oriented )
{
    const ModelOrient *o = findModelOrient( path );
    for ( int i = 0; i < 9; ++i )
        rot[i] = o ? o->rot[i] : ( ( i % 4 == 0 ) ? 1.f : 0.f );
    for ( int c = 0; c < 3; ++c )
    {
        ext[c] = o ? o->ext[c] : rawExt[c];
        cen[c] = o ? o->cen[c] : rawCen[c];
    }
    // 2 for a model with generator threads: removeThreads() takes the free ones out, and a shader may cut what is
    // left beyond the hull's height (ShipFlyby does).
    oriented = o ? ( o->threads >= 1.f ? 2.f : 1.f ) : 0.f;
}
