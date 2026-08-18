// See Scene3DPreview.h for why this file stands alone.
#include "../Source/glcore.h"      // MUST be the first GL-touching include (see .h)
#include "Scene3DPreview.h"

#include "../Source/Scene3DShader.h"
#include "../Source/shader_setup.h"
#include "../Source/textfile.h"

#include <QtCore/QFile>
#include <QtCore/QFileInfo>
#include <cstdio>
#include <cmath>
#include <string>
#include <functional>
#include <io.h>

// EffectShader is a CONCRETE class (draw()/checkGLErrors() are virtual but not
// pure), so its own vtable -- emitted once, in EffectShader.obj -- keeps
// EffectShader::draw() reachable even though every scene this editor actually
// renders is a Scene3DShader whose OWN draw() override replaces it.  That
// unreachable-in-practice function still calls an `extern GLuint
// fullscreenVAO()` that normally lives in filterShader.cpp, which is not
// linked here (it is almost entirely Qt-widget code).  A second definition in
// any linked translation unit satisfies the linker; it is never actually
// invoked.
GLuint fullscreenVAO()
{
    static GLuint vao = 0;
    if( vao == 0 )
        glGenVertexArrays( 1, &vao );
    return vao;
}

Scene3DPreview::Scene3DPreview() {}

Scene3DPreview::~Scene3DPreview()
{
    clear();
    if( m_fbo )        glDeleteFramebuffers( 1, &m_fbo );
    if( m_colorTex )   glDeleteTextures( 1, &m_colorTex );
    if( m_depthTex )   glDeleteTextures( 1, &m_depthTex );
    if( m_shadowFbo )  glDeleteFramebuffers( 1, &m_shadowFbo );
    if( m_shadowTex )  glDeleteTextures( 1, &m_shadowTex );
    if( m_oitFbo )     glDeleteFramebuffers( 1, &m_oitFbo );
    if( m_oitAccum )   glDeleteTextures( 1, &m_oitAccum );
    if( m_oitReveal )  glDeleteTextures( 1, &m_oitReveal );
    if( m_quadVao )    glDeleteVertexArrays( 1, &m_quadVao );
}

bool Scene3DPreview::ensureGL()
{
    if( m_glReady )
        return true;
    m_glReady = glcoreInit() != 0;
    if( !m_glReady )
        fputs( "Scene3DPreview: glcoreInit() failed - some GL 4.3 entry points missing\n", stderr );
    return m_glReady;
}

void Scene3DPreview::clear()
{
    delete m_scene;
    m_scene = nullptr;
}

void Scene3DPreview::addFloatRange( const QString &name, float lo, float hi )
{
    if( m_scene )
        m_scene->addUniform( name.toStdString(), lo, hi );
}

void Scene3DPreview::addIntRange( const QString &name, int lo, int hi )
{
    if( m_scene )
        m_scene->addUniform( name.toStdString(), lo, hi );
}

void Scene3DPreview::addExpr( const QString &name, const QString &formula )
{
    if( m_scene )
        m_scene->addExpression( name.toStdString(), formula.toStdString() );
}

// Redirect stderr to a temp file for the duration of one compile call, then
// read it back as the status-panel log.  Every compiler/linker message in
// this codebase goes straight to stderr (printShaderInfoLog / printProgram-
// InfoLog in shader_setup.cpp) with no string-returning alternative — this is
// the least invasive way to surface it in the editor's UI without changing
// that shared, shipped code path.
static QString captureStderr( const std::function<void()> &body )
{
    fflush( stderr );
    char tmpPath[MAX_PATH];
    char tmpDir[MAX_PATH];
    GetTempPathA( MAX_PATH, tmpDir );
    GetTempFileNameA( tmpDir, "kle", 0, tmpPath );

    // Duplicate the REAL stderr descriptor first, whatever it actually is --
    // a console, a file, or (any headless/automated run: --render, a test
    // harness, output piped to a log) a pipe.  The previous version restored
    // via freopen("CONOUT$", ...), which only works when a console is
    // attached; under a pipe it silently leaves stderr broken for the rest
    // of the process, so every fprintf(stderr, ...) anywhere else in the app
    // -- including shader_setup.cpp's own compile-error logging -- goes
    // dark with no error of its own. Found by chasing exactly that symptom.
    const int savedFd = _dup( _fileno( stderr ) );

    FILE *redirected = freopen( tmpPath, "w", stderr );
    body();
    fflush( stderr );

    QString log;
    if( redirected && savedFd != -1 )
    {
        _dup2( savedFd, _fileno( stderr ) );   // restore the ORIGINAL stderr target
        QFile f( QString::fromLocal8Bit( tmpPath ) );
        if( f.open( QIODevice::ReadOnly | QIODevice::Text ) )
            log = QString::fromLocal8Bit( f.readAll() ).trimmed();
        f.remove();
    }
    if( savedFd != -1 )
        _close( savedFd );
    return log;
}

bool Scene3DPreview::setShader( const QString &fragPathRelative, const QString &geom,
                                 int stateBytes, double shadowExtent, QString &log )
{
    clear();
    if( !ensureGL() )
    {
        log = "glcore init failed";
        return false;
    }

    Scene3DShader *scene = new Scene3DShader(
        fragPathRelative.toStdString(), geom.toStdString(), 0, 0, 0, 0 );
    if( stateBytes > 0 )   scene->setStateBytes( stateBytes );
    if( shadowExtent > 0 ) scene->setShadowExtent( float(shadowExtent) );
    // width/height are irrelevant here: Scene3DShader's initUniforms() never
    // allocates anything sized by them (that is the effect FBO's job, owned by
    // the host) - it only records them for the perspective aspect ratio, which
    // ensureFbo() re-derives itself from the widget size every frame anyway.
    scene->prepare( 16, 16 );

    log = captureStderr( [&]{ scene->ensureCompiled(); } );

    m_scene = scene;
    return true;
}

// ---- geometry: a single empty VAO, matching Engine/Fullscreen.vert's
// gl_VertexID-driven big triangle (no vertex attributes at all) ----
static unsigned ensureQuadVao( unsigned &vao )
{
    if( vao == 0 )
        glGenVertexArrays( 1, &vao );
    return vao;
}

static bool checkFbo()
{
    GLenum s = glCheckFramebufferStatus( GL_FRAMEBUFFER );
    if( s == GL_FRAMEBUFFER_COMPLETE )
        return true;
    fprintf( stderr, "Scene3DPreview: framebuffer incomplete (0x%x)\n", s );
    return false;
}

void Scene3DPreview::ensureFbo( int w, int h )
{
    if( m_fbo != 0 && m_fboW == w && m_fboH == h )
        return;
    m_fboW = w; m_fboH = h;

    if( m_fbo == 0 ) glGenFramebuffers( 1, &m_fbo );
    if( m_colorTex == 0 ) glGenTextures( 1, &m_colorTex );
    if( m_depthTex == 0 ) glGenTextures( 1, &m_depthTex );

    glBindTexture( GL_TEXTURE_2D, m_colorTex );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr );

    // A TEXTURE, not a renderbuffer: a depth-reading combine (fog, AO, sun
    // shafts, the edge/rim/heat-shimmer trio) needs to SAMPLE it, which is the
    // entire reason the main host's depth attachment is a texture too.
    glBindTexture( GL_TEXTURE_2D, m_depthTex );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, w, h, 0,
                  GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, nullptr );

    glBindFramebuffer( GL_FRAMEBUFFER, m_fbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_colorTex, 0 );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, m_depthTex, 0 );
    checkFbo();
    glBindFramebuffer( GL_FRAMEBUFFER, 0 );
    glBindTexture( GL_TEXTURE_2D, 0 );
}

// ---- shadow map: ported from FilterShader::ensureShadowMap/updateLightMatrix/
// renderShadowPass, adapted to this class's own members.  See filterShader.cpp
// for the reasoning behind every choice here (LINEAR+COMPARE for free PCF,
// CLAMP_TO_BORDER=white so "no occluder" reads as lit, no face culling because
// the geometry's winding is not guaranteed, orthographic because the light is
// a sun).  Kept in lock-step with that file rather than shared, because the
// main app's versions are private FilterShader members reaching into its own
// FBO bookkeeping. ----
bool Scene3DPreview::ensureShadowMap()
{
    if( m_shadowFbo != 0 )
        return true;

    glGenTextures( 1, &m_shadowTex );
    glBindTexture( GL_TEXTURE_2D, m_shadowTex );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_BORDER );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_BORDER );
    const float border[4] = { 1.f, 1.f, 1.f, 1.f };
    glTexParameterfv( GL_TEXTURE_2D, GL_TEXTURE_BORDER_COLOR, border );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_COMPARE_MODE, GL_COMPARE_REF_TO_TEXTURE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_COMPARE_FUNC, GL_LEQUAL );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, kShadowSize, kShadowSize,
                  0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, nullptr );

    glGenFramebuffers( 1, &m_shadowFbo );
    glBindFramebuffer( GL_FRAMEBUFFER, m_shadowFbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, m_shadowTex, 0 );
    glDrawBuffer( GL_NONE );
    glReadBuffer( GL_NONE );
    bool ok = checkFbo();
    glBindFramebuffer( GL_FRAMEBUFFER, 0 );
    glBindTexture( GL_TEXTURE_2D, 0 );

    if( !ok )
    {
        fputs( "Scene3DPreview: shadow map FBO incomplete\n", stderr );
        glDeleteFramebuffers( 1, &m_shadowFbo );
        glDeleteTextures( 1, &m_shadowTex );
        m_shadowFbo = m_shadowTex = 0;
    }
    return ok;
}

void Scene3DPreview::updateLightMatrix( float t )
{
    const float E = EffectShader::s_shadowExtent;
    float a = t * 0.06f;
    float lx = 0.42f * sinf( a );
    float ly = 1.15f + 0.16f * sinf( a * 0.43f );
    float lz = -0.42f * cosf( a ) - 0.18f;
    float ln = sqrtf( lx * lx + ly * ly + lz * lz );
    lx /= ln; ly /= ln; lz /= ln;
    EffectShader::s_lightDir[0] = lx;
    EffectShader::s_lightDir[1] = ly;
    EffectShader::s_lightDir[2] = lz;

    float fx = -lx, fy = -ly, fz = -lz;
    float ux = 0.f, uy = 1.f, uz = 0.f;
    if( fabsf( fy ) > 0.98f ) { ux = 1.f; uy = 0.f; }
    float sx = fy * uz - fz * uy;
    float sy = fz * ux - fx * uz;
    float sz = fx * uy - fy * ux;
    float sn = sqrtf( sx * sx + sy * sy + sz * sz );
    sx /= sn; sy /= sn; sz /= sn;
    float tx = sy * fz - sz * fy;
    float ty = sz * fx - sx * fz;
    float tz = sx * fy - sy * fx;

    const float dist = E * 2.f;
    float ex = lx * dist, ey = ly * dist, ez = lz * dist;

    float V[16] = {
         sx,  tx, -fx, 0.f,
         sy,  ty, -fy, 0.f,
         sz,  tz, -fz, 0.f,
        -( sx * ex + sy * ey + sz * ez ),
        -( tx * ex + ty * ey + tz * ez ),
          ( fx * ex + fy * ey + fz * ez ), 1.f
    };

    const float zn = 0.1f, zf = dist + E * 2.f;
    float P[16] = {
        1.f / E, 0.f,     0.f,                        0.f,
        0.f,     1.f / E, 0.f,                        0.f,
        0.f,     0.f,    -2.f / ( zf - zn ),           0.f,
        0.f,     0.f,    -( zf + zn ) / ( zf - zn ),   1.f
    };

    float *M = EffectShader::s_lightM;
    for( int c = 0; c < 4; ++c )
        for( int r = 0; r < 4; ++r )
        {
            float sum = 0.f;
            for( int k = 0; k < 4; ++k )
                sum += P[k * 4 + r] * V[c * 4 + k];
            M[c * 4 + r] = sum;
        }
}

void Scene3DPreview::renderShadowPass( float time, float interpolation, const AudioFeatures &features )
{
    if( !ensureShadowMap() )
        return;

    glBindFramebuffer( GL_FRAMEBUFFER, m_shadowFbo );
    glViewport( 0, 0, kShadowSize, kShadowSize );
    glClearDepth( 1.0 );
    glClear( GL_DEPTH_BUFFER_BIT );
    glDisable( GL_CULL_FACE );
    // Explicit, and load-bearing: with GL_DEPTH_TEST disabled, a fragment's
    // depth is never written to the bound depth attachment at all, whatever
    // glDepthMask says -- so the "shadow map" comes back as the clear value
    // (far plane) EVERYWHERE, and every receiver's lookup passes as fully lit.
    // The main app's own renderShadowPass never sets this either, because by
    // the time it runs, an earlier pass in FilterShader::paint() has already
    // left depth testing on for the whole frame.  This class has no such
    // earlier pass to inherit from -- worse, the previous frame's OWN opaque
    // pass explicitly disables it again right after drawing -- so leaving
    // this implicit here silently breaks shadows on every frame after the
    // first, in a way that reads as "shading looks a bit off" rather than as
    // an obvious black rectangle where a shadow map should be.
    glEnable( GL_DEPTH_TEST );

    EffectShader::s_shadowPass = 1.f;
    m_scene->enableShader();
    m_scene->setUniforms( time, interpolation, 0, 1 );
    m_scene->applyAudioFeatures( features );
    m_scene->draw();
    EffectShader::s_shadowPass = 0.f;

    glActiveTexture( GL_TEXTURE0 + 31 );
    glBindTexture( GL_TEXTURE_2D, m_shadowTex );
    glActiveTexture( GL_TEXTURE0 );
}

// ---- OIT: ported from FilterShader::ensureOitTargets/renderOitPass ----
bool Scene3DPreview::ensureOitTargets( int w, int h )
{
    if( m_oitFbo != 0 && m_oitW == w && m_oitH == h )
        return true;
    if( !glBlendFunci || !glDrawBuffers || !glClearBufferfv )
        return false;
    m_oitW = w; m_oitH = h;

    if( m_oitAccum == 0 )  glGenTextures( 1, &m_oitAccum );
    glBindTexture( GL_TEXTURE_2D, m_oitAccum );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, w, h, 0, GL_RGBA, GL_FLOAT, nullptr );

    if( m_oitReveal == 0 ) glGenTextures( 1, &m_oitReveal );
    glBindTexture( GL_TEXTURE_2D, m_oitReveal );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_R16F, w, h, 0, GL_RED, GL_FLOAT, nullptr );

    if( m_oitFbo == 0 ) glGenFramebuffers( 1, &m_oitFbo );
    glBindFramebuffer( GL_FRAMEBUFFER, m_oitFbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_oitAccum, 0 );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1, GL_TEXTURE_2D, m_oitReveal, 0 );
    const GLenum bufs[2] = { GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1 };
    glDrawBuffers( 2, bufs );
    bool ok = checkFbo();
    glBindFramebuffer( GL_FRAMEBUFFER, 0 );
    glBindTexture( GL_TEXTURE_2D, 0 );

    if( ok && m_oitResolveProg == 0 )
        m_oitResolveProg = setShaders( "..\\standard.vert", "..\\Engine\\OitResolve.frag" );

    if( !ok )
    {
        fputs( "Scene3DPreview: OIT targets incomplete\n", stderr );
        glDeleteFramebuffers( 1, &m_oitFbo );
        glDeleteTextures( 1, &m_oitAccum );
        glDeleteTextures( 1, &m_oitReveal );
        m_oitFbo = m_oitAccum = m_oitReveal = 0;
    }
    return ok;
}

void Scene3DPreview::renderOitPass( float time, float interpolation, const AudioFeatures &features )
{
    if( !ensureOitTargets( m_fboW, m_fboH ) )
        return;

    glBindFramebuffer( GL_FRAMEBUFFER, m_oitFbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, m_depthTex, 0 );

    const GLfloat zero[4] = { 0.f, 0.f, 0.f, 0.f };
    const GLfloat one[4]  = { 1.f, 1.f, 1.f, 1.f };
    glClearBufferfv( GL_COLOR, 0, zero );
    glClearBufferfv( GL_COLOR, 1, one );

    glEnable( GL_DEPTH_TEST );
    glDepthMask( GL_FALSE );
    glEnable( GL_BLEND );
    glBlendFunci( 0, GL_ONE, GL_ONE );
    glBlendFunci( 1, GL_ZERO, GL_ONE_MINUS_SRC_COLOR );

    EffectShader::s_oitPass = 1.f;
    m_scene->enableShader();
    m_scene->setUniforms( time, interpolation, 0, 1 );
    m_scene->applyAudioFeatures( features );
    m_scene->draw();
    EffectShader::s_oitPass = 0.f;

    glDepthMask( GL_TRUE );
    glDisable( GL_BLEND );
    glDisable( GL_DEPTH_TEST );

    // ---- resolve: composite the accumulated transparency back over m_fbo ----
    glBindFramebuffer( GL_FRAMEBUFFER, m_fbo );
    glViewport( 0, 0, m_fboW, m_fboH );
    if( m_oitResolveProg == 0 )
        return;
    glUseProgram( m_oitResolveProg );
    glActiveTexture( GL_TEXTURE0 );
    glBindTexture( GL_TEXTURE_2D, m_oitAccum );
    glActiveTexture( GL_TEXTURE1 );
    glBindTexture( GL_TEXTURE_2D, m_oitReveal );
    glActiveTexture( GL_TEXTURE0 );
    GLint l0 = glGetUniformLocation( m_oitResolveProg, "texAccum" );
    GLint l1 = glGetUniformLocation( m_oitResolveProg, "texReveal" );
    GLint lr = glGetUniformLocation( m_oitResolveProg, "resolution" );
    if( l0 >= 0 ) glUniform1i( l0, 0 );
    if( l1 >= 0 ) glUniform1i( l1, 1 );
    if( lr >= 0 ) glUniform2f( lr, float(m_fboW), float(m_fboH) );

    glEnable( GL_BLEND );
    glBlendFunc( GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA );
    glBindVertexArray( ensureQuadVao( m_quadVao ) );
    glDrawArrays( GL_TRIANGLES, 0, 3 );
    glBindVertexArray( 0 );
    glDisable( GL_BLEND );
}

void Scene3DPreview::render( int w, int h, float time, float interpolation,
                              const AudioFeatures &features,
                              unsigned tex0, unsigned tex1,
                              unsigned &outColorTex, unsigned &outDepthTex )
{
    if( !m_scene )
    {
        outColorTex = outDepthTex = 0;
        return;
    }
    ensureFbo( w, h );

    glActiveTexture( GL_TEXTURE0 ); glBindTexture( GL_TEXTURE_2D, tex0 );
    glActiveTexture( GL_TEXTURE1 ); glBindTexture( GL_TEXTURE_2D, tex1 );
    glActiveTexture( GL_TEXTURE0 );

    // Same broadcast the main host uses (EffectShader::s_shadowExtent/s_light*):
    // the box is sized by THIS scene, because only it knows its own scale.
    EffectShader::s_shadowExtent = m_scene->shadowExtent();
    updateLightMatrix( time );
    if( m_scene->usesShadow() )
        renderShadowPass( time, interpolation, features );
    EffectShader::s_depthValid[0] = 1.f;   // this pass IS a 3D scene, always

    // Bound and viewport-set unconditionally, whether or not the shadow pass
    // just ran -- it leaves both the framebuffer and viewport pointed at its
    // own 2048x2048 depth target.
    glBindFramebuffer( GL_FRAMEBUFFER, m_fbo );
    glViewport( 0, 0, w, h );
    glEnable( GL_DEPTH_TEST );
    glClearDepth( 1.0 );
    glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );

    m_scene->enableShader();
    m_scene->setUniforms( time, interpolation, 0, 1 );
    m_scene->applyAudioFeatures( features );
    m_scene->draw();
    glDisable( GL_DEPTH_TEST );

    if( m_scene->usesOit() )
        renderOitPass( time, interpolation, features );

    glBindFramebuffer( GL_FRAMEBUFFER, 0 );
    outColorTex = m_colorTex;
    outDepthTex = m_depthTex;
}
