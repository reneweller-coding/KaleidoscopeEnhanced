/*****************************************************************************\
 *                              EffectShader
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of EffectShader: shader compile/uniform plumbing, solo/interpolation timing, the audio-feature
 *  and formula-layer uniform uploads, and the cached "usesXxx" shader-capability queries.
 *
 *  @author René Weller
 */

#include <float.h>

#include "shader_setup.h"
#include "ShaderForge.h"
#include "EffectShader.h"
#include "ComputeFX.h"
#include "LongRunVariety.h"
#include "coreclock.h"
#include "textfile.h"
#include <string>
#include <cstring>
#include <cmath>

#include <cstdlib>
#include <chrono>
#include <set>
#include <typeinfo>
#include <algorithm>
#include <fstream>
#include <mutex>
#include <sstream>
#include <QtCore/qdir.h>
#include <QtCore/QSet>
#include "PlatformQt.h"
#include <QtCore/qfileinfo.h>

#include <GL/GLU.h>

/**  Whether Engine/ChainPass holds a file of this name.
 *
 * @param file  The bare file name, e.g. "Final_ChainLab2D.frag". (in)
 *
 * @return
 *   True if it is there.
 *
 * One listing of the folder, read once, instead of an fopen() per preset entry: 8,400 at every start, nearly all
 * of them for files that do not exist.  Compared without case, as Windows does.
 **/
static bool chainPassHas( const std::string &file )
{
    static const QSet<QString> Names = []
    {
        QSet<QString> n;
        for ( const QString &f :
              QDir( Platform::assetPath( QString( "..\\Engine\\ChainPass" ) ) ).entryList( QDir::Files ) )
            n.insert( f.toLower() );
        return n;
    }();
    return Names.contains( QString::fromStdString( file ).toLower() );
}

// Constructor
EffectShader::EffectShader( const std::string &filenameFragmentShader, unsigned int minTimeSolo,
                            unsigned int maxTimeSolo, unsigned int minTimeInterpolation,
                            unsigned int maxTimeInterpolation )
    : m_minTimeSolo( minTimeSolo ),
      m_maxTimeSolo( maxTimeSolo ),
      m_minTimeInterpolation( minTimeInterpolation ),
      m_maxTimeInterpolation( maxTimeInterpolation ),
      m_complexity( 1 ),
      m_probability( 1.0 )
{


    m_vertexShaderFilename = "..\\standard.vert";
    // m_fragmentShaderFilename = filenameFragmentShader.c_str();//filenameFragmentShader.toLocal8Bit().data();

    m_fragmentShaderFilename = filenameFragmentShader;

    // A chain lab with a generated pass shader set runs its chain as passes
    // (runChainPasses) and compiles the small final shader instead of its
    // all-classes uber-shader (which the editor and the catalogue keep).
    {
        std::string s = filenameFragmentShader;
        size_t      a = s.find_last_of( "\\/" );
        std::string base = s.substr( a == std::string::npos ? 0 : a + 1 );
        size_t      d = base.rfind( ".frag" );
        if ( d != std::string::npos )
            base = base.substr( 0, d );
        const std::string fin = "..\\Engine\\ChainPass\\Final_" + base + ".frag";
        if ( M_ChainRunner && !getenv( "KALEIDO_NO_CHAINPASS" ) && chainPassHas( "Final_" + base + ".frag" ) )
        {
            m_compileFile = fin;
            const std::string t = textFileRead( m_compileFile.c_str() );
            if ( !t.empty() )
            {
                if ( const char *b = strstr( t.c_str(), "// @chainbake " ) )
                    m_chainBake = atoi( b + 14 );
                m_chain3D = strstr( t.c_str(), "// @chain3d" ) != nullptr;
            }
            if ( m_chain3D )
            {
                const std::string g = "..\\Engine\\ChainPass\\Geom_" + base + ".frag";
                m_geomSrc = textFileRead( g.c_str() );
                if ( m_geomSrc.empty() )
                    m_chain3D = false;
            }
        }
    }

    // Optional per-scene bake compute shader: "X.frag" -> "X.comp", sibling of
    // the fragment file (same convention as Scene3DShader's .vert/.tesc/.comp
    // derivation); the file need not exist, checked lazily in ensureBakeProg().
    {
        std::string s = filenameFragmentShader;
        size_t      p = s.rfind( ".frag" );
        if ( p != std::string::npos )
            s.replace( p, 5, ".comp" );
        m_bakeCompFilename = s;
    }


    m_uniforms.clear();


    m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
    m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );
}



// Constructor
EffectShader::EffectShader()
{
    m_vertexShaderFilename = "..\\standard.vert";
}

// Constructor
EffectShader::EffectShader( unsigned int minTimeSolo, unsigned int maxTimeSolo, unsigned int minTimeInterpolation,
                            unsigned int maxTimeInterpolation )
    : m_minTimeSolo( minTimeSolo ),
      m_maxTimeSolo( maxTimeSolo ),
      m_minTimeInterpolation( minTimeInterpolation ),
      m_maxTimeInterpolation( maxTimeInterpolation ),
      m_complexity( 1 ),
      m_probability( 1.0 )
{
    m_vertexShaderFilename = "..\\standard.vert";

    m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
    m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );
}

// Destructor
EffectShader::~EffectShader()
{
    freeChainTextures();
    cleanShaderPrograms();
}


namespace
{
std::set<EffectShader *> s_chainHolders; ///< Labs holding chain textures (retireIdleChains)
}

void EffectShader::freeChainTextures()
{
    s_chainHolders.erase( this );
    const int n = m_chain3D ? 8 : 5;
    if ( m_cpTex[0] )
    {
        glDeleteTextures( n, m_cpTex );
        glDeleteFramebuffers( n, m_cpFbo );
    }
    if ( m_gbTex[0] )
    {
        glDeleteTextures( 2, m_gbTex );
        glDeleteFramebuffers( 1, &m_gbFbo );
    }
    if ( m_stTex )
    {
        glDeleteTextures( 1, &m_stTex );
        glDeleteFramebuffers( 1, &m_stFbo );
    }
    for ( int i = 0; i < 8; ++i )
    {
        m_cpTex[i] = 0;
        m_cpFbo[i] = 0;
    }
    m_gbTex[0] = m_gbTex[1] = 0;
    m_gbFbo = 0;
    m_stTex = 0;
    m_stFbo = 0;
    m_cpW = m_cpH = 0;
}

void EffectShader::retireIdleChains()
{
    // A lab keeps its coordinate textures between frames (75-525 MB at
    // 2880x1620); a preset with four labs held them all for its whole life.
    // The textures of a lab not run for 25 s go (as ComputeFX::retireIdle).
    m_chainUsed = EngineClock::now();
    s_chainHolders.insert( this );
    retireIdleChainTextures();
}

void EffectShader::retireIdleChainTextures()
{
    const auto now = EngineClock::now();
    for ( auto it = s_chainHolders.begin(); it != s_chainHolders.end(); )
    {
        EffectShader *e = *it++;
        if ( now - e->m_chainUsed > std::chrono::seconds( 25 ) )
            e->freeChainTextures(); // erases e: the iterator has moved on
    }
}

float                         EffectShader::M_DepthValid[2] = { 0.f, 0.f };
float                         EffectShader::M_ShadowPass = 0.f;
float                         EffectShader::M_ReviewSolo = 0.f;
bool                          EffectShader::M_ChainRunner = false;
bool                          EffectShader::M_Headless = false;
bool                          EffectShader::M_ExprLog = qEnvironmentVariableIsSet( "KALEIDO_EXPR_LOG" );
int                           EffectShader::M_ExprCompiled = 0;
float                         EffectShader::M_ChainScale = 1.f;
bool                          EffectShader::M_ChainSS = true;
float                         EffectShader::M_FreezeTime = -1.f;
bool                          EffectShader::M_Frozen = false;
std::map<std::string, float>  EffectShader::M_ClassTaste;
std::map<std::string, double> EffectShader::M_ClassSeen;
std::set<std::string>         EffectShader::M_ClassSeenDirty;
bool                          EffectShader::M_ClassNovelty = true;
bool                          EffectShader::M_CueLive = false;
int                           EffectShader::M_CueSections = 0;
int                           EffectShader::M_CueDrops = 0;
float                         EffectShader::M_ShadowExtent = EffectShader::ShadowExtent;
float                         EffectShader::M_LightDir[3] = { 0.45f, 0.80f, -0.40f };
float                         EffectShader::M_LightM[16] = { 1.f, 0.f, 0.f, 0.f, 0.f, 1.f, 0.f, 0.f,
                                                             0.f, 0.f, 1.f, 0.f, 0.f, 0.f, 0.f, 1.f };
float                         EffectShader::M_ShadowPass2 = 0.f;
float                         EffectShader::M_LightDir2[3] = { -0.35f, 0.55f, 0.60f };
float                         EffectShader::M_LightM2[16] = { 1.f, 0.f, 0.f, 0.f, 0.f, 1.f, 0.f, 0.f,
                                                              0.f, 0.f, 1.f, 0.f, 0.f, 0.f, 0.f, 1.f };

void EffectShader::cleanShaderPrograms()
{
    dropVariants( true ); // back to the generic program, variants released
    // NOT glDeleteProgram: this program may be shared. 212 of the 831 scene
    // entries reuse a program another entry compiled -- almost all of them
    // the 3D-model families, where 24 shaders carry 238 scenes. Deleting it
    // here would pull the shader out from under the others.
    shaderProgramRelease( m_shProgId );
    if ( m_bakeProg )
        glDeleteProgram( m_bakeProg );
    if ( m_bakeTex )
        glDeleteTextures( 1, &m_bakeTex );

    // Leave the object in the state it had before its first compile, so that
    // calling this twice is harmless and a later ensureCompiled() actually
    // rebuilds. Without this the ids survived their objects: the effect still
    // reported itself compiled and went on drawing with a released program,
    // which the driver answers with <program> has not been linked -- and, one
    // release per call against a single acquire, the refcount underflowed and
    // took a program still in use with it.
    m_shProgId = 0;
    m_bakeProg = 0;
    m_bakeTex = 0;
    m_glReady = false;
}


/**  The solo span (seconds) that sceneProgress is normalised over in review/measurement runs.
 *
 * @return
 *   KALEIDO_SOLO_SECS if set to a positive value (read once), else EffectShader::M_ReviewSolo (0 outside review
 *   mode = no cap).
 *
 * KALEIDO_SOLO_SECS pins it for measurement runs whose window is shorter
 * than the review span of 25 s: with a holding time of 8 s the screening
 * never saw the end of a staged scene's arc -- Assembly stood as a cloud in
 * every window.
 **/
static float soloCap()
{
    static const int Env = []
    { const char *e = getenv( "KALEIDO_SOLO_SECS" ); return e ? atoi( e ) : 0; }();
    return ( Env > 0 ) ? static_cast<float>( Env ) : EffectShader::M_ReviewSolo;
}


void EffectShader::resetParameters()
{
    m_secCount = -1; // section memory restarts: the first sight is no door
    // Randomness PER SCENE instead of global.  With KALEIDO_SEED every
    // activation gets its own stream from (seed, shader name, appearance
    // counter).  Before, every draw depended on who came BEFORE this scene:
    // the same shader measured 0.22 in a nine-scene probe and 0.0006 in a
    // chunk of 112, and reproducing it failed because the neighbours were
    // different.  Without KALEIDO_SEED nothing is reseeded -- the show stays
    // seeded from the clock.
    static const char *pin_env = getenv( "KALEIDO_SEED" );
    ++m_activations;
    if ( pin_env )
    {
        unsigned h = static_cast<unsigned>( strtoul( pin_env, nullptr, 10 ) ) ^ 2166136261u;
        for ( const char *c = m_fragmentShaderFilename.c_str(); *c; ++c )
            h = ( h ^ static_cast<unsigned>( static_cast<unsigned char>( *c ) ) ) * 16777619u; // FNV-1a
        h = ( h ^ m_activations ) * 16777619u;
        srand( h ^ ( h >> 15 ) );
    }

    m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
    m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );

    // Restart the sceneProgress ramp. The length is captured HERE because
    // setUniforms() re-rolls m_timeSolo every frame; the activation time is
    // left as a sentinel because this function has no time to work from, so
    // the first setUniforms() after the reset fills it in.
    m_soloAtReset = static_cast<float>( m_timeSolo );
    // On the review bench the scheduler shows each scene for only
    // ReviewSoloSecs, but sceneProgress kept normalising over the rolled solo
    // span -- a staged scene thus never ran to its end exactly where one
    // wants to judge it.
    if ( soloCap() > 0.01f && m_soloAtReset > soloCap() )
        m_soloAtReset = soloCap();
    m_activationTime = -1.0e9f;
    m_progressT0 = -1.0e9f;
    m_advanceAtReset = -1.0e9f; // sceneAdvance starts again at 0
    // The clocks start again (m_clockT0): at a base of their own, hashed from the shader, the activation count and a
    // run salt -- not drawn with rand(), which would shift every parameter roll after it.
    m_clockT0 = -1.0e300;
    m_clockA0 = -1.0e300;
    {
        static const unsigned Salt = pin_env ? static_cast<unsigned>( strtoul( pin_env, nullptr, 10 ) ) * 2654435761u
                                             : static_cast<unsigned>( std::chrono::steady_clock::now()
                                                                          .time_since_epoch()
                                                                          .count() );
        unsigned              h = Salt ^ 2166136261u;
        for ( const char *c = m_fragmentShaderFilename.c_str(); *c; ++c )
            h = ( h ^ static_cast<unsigned>( static_cast<unsigned char>( *c ) ) ) * 16777619u;
        h = ( h ^ m_activations ) * 16777619u;
        auto next = [&h]()
        {
            h ^= h >> 13;
            h *= 0x5bd1e995u;
            h ^= h >> 15;
            return static_cast<float>( h & 0xffffu ) / 65535.f;
        };
        m_clockBaseT = 600.f * next();
        m_clockBaseA = 40.f * next();
        m_clockBaseR = 100.f * next();
        // The 3D chains' camera (flight start, hold times) from the same hash: under KALEIDO_SEED a sample of
        // rolls shows the same views in every run, so two shader versions can be compared picture by picture.
        m_cam.seed = ( h ^ 0x9e3779b9u ) | 1u;
    }
    m_sceneProgress = 0.f;

    // The "life" budget handed to each Uniform is solo + 2*interpolation: one
    // interpolation span to fade IN, the solo span held at full value, and one
    // interpolation span to fade back OUT — so a Uniform's own randomised
    // min/max sweep can be timed to complete exactly once across the effect's
    // whole active lifetime rather than per solo/interpolation phase.
    for ( unsigned int i = 0; i < m_uniforms.size(); ++i )
        m_uniforms[i]->resetParameters( static_cast<float>( m_timeSolo + 2 * m_timeInterpolation ) );

    // Fresh per-activation seeds for the formula layer (seed1..seed3).
    for ( int i = 0; i < 3; ++i )
        m_exprSeeds[i] = static_cast<float>( rand() ) / static_cast<float>( RAND_MAX );

    // Colour grade (preset entry grade="fade,grey,sepia"): one of the listed
    // looks per activation.  Entries without the attribute draw nothing, so
    // their random stream stays exactly as before.
    m_gradeMode = m_gradeModes.empty() ? 0 : m_gradeModes[rand() % m_gradeModes.size()];

    // A chain lab starts its walk afresh from the knobs just rolled.
    m_walk.pending = true;
    m_cam.pending = true;

    // Under KALEIDO_SEED, log what was drawn: the proof that the same scene
    // gets the same numbers in every configuration is a diff of these lines
    // -- not a picture comparison, which the cross-fade from the neighbour
    // falsifies.
    if ( pin_env )
        fprintf( stderr,
                 "SEEDED %s act=%u seeds=%.4f %.4f %.4f solo=%u"
                 "\n",
                 m_fragmentShaderFilename.c_str(), m_activations, m_exprSeeds[0], m_exprSeeds[1], m_exprSeeds[2],
                 m_timeSolo );
}


void EffectShader::enableShader()
{
    ensureCompiled(); // lazy: compile on first use (see prepare())
    // A specialised variant chosen last frame takes over at the START of this
    // one, before setUniforms(), so every uniform of the frame goes to it.
    if ( m_specRevert )
    {
        m_specRevert = false;
        dropVariants( false );
    }
    if ( m_specNext )
    {
        if ( !m_genericProg )
            m_genericProg = m_shProgId;
        bindProgram( m_specNext );
        m_specBound = m_specNextKey;
        static const bool SpecLog = getenv( "KALEIDO_SPEC_LOG" ) != 0;
        if ( SpecLog )
            fprintf( stderr, "SPEC bind %u for %s\n", m_shProgId, fragmentName() );
        m_specNext = 0;
        m_specNextKey.clear();
    }
    glUseProgram( m_shProgId );
}

void EffectShader::bindProgram( GLuint prog )
{
    m_shProgId = prog;
    glUseProgram( prog );
    m_texPointUni1 = glGetUniformLocation( prog, "tex0" );
    m_texPointUni2 = glGetUniformLocation( prog, "tex1" );
    m_texSizeRcpUni = glGetUniformLocation( prog, "resolution" );
    m_timeUni = glGetUniformLocation( prog, "time" );
    m_interpolationUni = glGetUniformLocation( prog, "interpolation" );
    m_progressUni = glGetUniformLocation( prog, "sceneProgress" );
    m_sceneTimeUni = glGetUniformLocation( prog, "sceneTime" );
    for ( unsigned int i = 0; i < m_uniforms.size(); ++i )
        m_uniforms[i]->initUniform( prog );
    // every other location cache is keyed by the program id and refreshes
    // itself -- the walk's must not take the switch for a new activation
    m_walkProgSwap = true;
}

void EffectShader::dropVariants( bool release )
{
    if ( m_genericProg && m_shProgId != m_genericProg )
        bindProgram( m_genericProg );
    m_genericProg = 0;
    m_specBound.clear();
    m_specNext = 0;
    m_specNextKey.clear();
    m_specWait = 0.f;
    if ( release )
    {
        for ( auto &kv : m_specProgs )
            shaderProgramRelease( kv.second );
        m_specProgs.clear();
        m_specLru.clear();
    }
}


void EffectShader::setUniforms( double programTime, float interpolation, GLint texLoc1, GLint texLoc2 )
{
    // `time` relative to the activation (m_clockT0); a comparison run keeps its frozen moment.
    if ( m_clockT0 < -1.0e299 )
        m_clockT0 = programTime;
    const float time = ( M_FreezeTime >= 0.f ) ? static_cast<float>( programTime )
                                               : static_cast<float>( programTime - m_clockT0 ) + m_clockBaseT;
    m_exprTime = time;                      // formula layer reads this frame's time
    glUniform1i( m_texPointUni1, texLoc1 ); // combine unit 0, not to be confused with texId
    glUniform1i( m_texPointUni2, texLoc2 ); // combine unit 0, not to be confused with texId
    glUniform2f( m_texSizeRcpUni, static_cast<float>( m_width ), static_cast<float>( m_height ) );
    glUniform1f( m_timeUni, time );
    glUniform1f( m_interpolationUni, interpolation );

    // sceneProgress: 0 at activation, 1 at the end of the rolled solo span.
    // The length is normally captured by resetParameters(), but the FIRST
    // effect the scheduler shows is never reset -- it is simply already
    // selected when the show starts -- so without this fallback that one
    // scene would divide by zero and sit at progress 0 forever. Found by
    // rendering a single-scene probe and watching sceneProgress never move.
    if ( m_soloAtReset <= 0.01f )
    {
        m_soloAtReset = static_cast<float>( m_timeSolo );
        if ( soloCap() > 0.01f && m_soloAtReset > soloCap() )
            m_soloAtReset = soloCap(); // same cap as resetParameters()
    }
    if ( m_activationTime < -0.9e9f )
        m_activationTime = time;
    if ( m_progressT0 < -0.9e9f )
        m_progressT0 = time;
    m_sceneProgress = ( m_soloAtReset > 0.01f )
                          ? ( time - m_progressT0 ) / m_soloAtReset
                          : 0.f;
    m_sceneProgress = ( m_sceneProgress < 0.f )   ? 0.f
                      : ( m_sceneProgress > 1.f ) ? 1.f
                                                  : m_sceneProgress;
    if ( m_progressUni >= 0 )
        glUniform1f( m_progressUni, m_sceneProgress );

    // sceneTime: seconds SINCE THIS activation, unlike `time`, which runs
    // since program start and is never reset.  A camera pushed forward with
    // `time` through a world that exists only near the origin flies out of
    // it after minutes and shows nothing but background -- measured on a
    // scene with a structure of 0.19 at clock 0 and only 0.0005 at clock
    // 3600.  Written against sceneTime, such a flight starts anew at every
    // activation.
    m_lastSceneTime = time - m_activationTime;
    if ( M_FreezeTime >= 0.f ) // a comparison run: the scene stands at this moment
        m_lastSceneTime = M_FreezeTime;
    if ( m_sceneTimeUni >= 0 )
        glUniform1f( m_sceneTimeUni, m_lastSceneTime );


    for ( unsigned int i = 0; i < m_uniforms.size(); ++i )
        m_uniforms[i]->setUniform();

    m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
    m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );
}


void EffectShader::startInterpolators()
{
    for ( unsigned int i = 0; i < m_uniforms.size(); ++i )
        m_uniforms[i]->startInterpolator();
}


void EffectShader::draw()
{
    if ( usesBake() )
        stepBake( m_exprTime, m_lastAudioForBake );
    // texMandelbrot always reads unit 35 (RenderPipeline.cpp binds the
    // compute result there -- see ComputeFX::stepMandelbrot()'s comment for
    // why this bypasses the generic cfxMask() unit table); same one-line-
    // per-draw pattern as texBake just above, no per-program location cache
    // needed for a single constant.
    if ( usesMandelbrot() )
    {
        GLint l_tex_mandelbrot = glGetUniformLocation( m_shProgId, "texMandelbrot" );
        if ( l_tex_mandelbrot >= 0 )
            glUniform1i( l_tex_mandelbrot, 35 );
    }
    drawWindow();
}


void EffectShader::drawWindow()
{
    // Core profile: fullscreen triangle via the shared Fullscreen.vert
    // (the VAO lives in RenderPipeline.cpp — one empty VAO for all passes).
    extern GLuint fullscreenVAO();
    glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
    glBindVertexArray( fullscreenVAO() );
    glDrawArrays( GL_TRIANGLES, 0, 3 );
    glBindVertexArray( 0 );
}


/**  Sets up the GLSL runtime and creates shader.
 *
 * Compiles the vertex+fragment program (setShaders), resolves the common
 * uniform locations, and lets every already-registered Uniform resolve its
 * own location.
 **/
void EffectShader::initUniforms( int width, int height )
{
    m_width = width;
    m_height = height;

    // A 3D lab forges its geometry variants: start the helper while this lab is
    // being prepared (the warm-up), not in its first frames -- its own GL
    // context costs the app a short stutter (ShaderForge.h).
    if ( m_chain3D )
        shaderForgeStartHelper();

    // Entry drain: whatever this reports happened BEFORE initUniforms, not in
    // it. The old label ("loadShader 1") read as an accusation against the
    // shader being loaded and cost real time chasing that.
    checkGLErrors( "entry of initUniforms" );

    // load and compile shader
    m_shProgId = setShaders( m_vertexShaderFilename.c_str(), fragmentFile() );
    m_texPointUni1 = glGetUniformLocation( m_shProgId, "tex0" );
    m_texPointUni2 = glGetUniformLocation( m_shProgId, "tex1" );
    m_texSizeRcpUni = glGetUniformLocation( m_shProgId, "resolution" );
    m_timeUni = glGetUniformLocation( m_shProgId, "time" );
    m_interpolationUni = glGetUniformLocation( m_shProgId, "interpolation" );
    m_progressUni = glGetUniformLocation( m_shProgId, "sceneProgress" );
    m_sceneTimeUni = glGetUniformLocation( m_shProgId, "sceneTime" );



    for ( unsigned int i = 0; i < m_uniforms.size(); ++i )
        m_uniforms[i]->initUniform( m_shProgId );

    checkGLErrors( "loadShader 2" );
}


/**  Extremely useful debugging function: when developing, make sure to call this after almost every GL call.
 *
 * The label (see the declaration in EffectShader.h for the parameter list) is a short tag for the checkpoint, printed
 * with the error message.
 **/
void EffectShader::checkGLErrors( const char *label )
{
    GLenum err_code = glGetError();
    if ( err_code == GL_NO_ERROR )
        return;

    // gluErrorString returns NULL for codes it does not know (newer GL) —
    // fputs(NULL) crashed the app the moment such an error occurred.
    const char *msg = reinterpret_cast<const char *>( gluErrorString( err_code ) );
    // "noticed at", not "in": glGetError drains a GLOBAL queue, so the label
    // names the checkpoint that FOUND the error, not the call that raised it.
    // The cause lies between the previous checkpoint and this one -- and since
    // RenderPipeline::checkGLErrors() is a no-op unless KALEIDO_GL_DEBUG is
    // set, in a normal run "the previous checkpoint" can be a long way back,
    // in another subsystem entirely. Reading the label as a location has sent
    // debugging down the wrong path here more than once.
    fprintf( stderr, "OpenGL ERROR: %s (0x%04x, noticed at: %s; raised before "
                     "this checkpoint, not necessarily here)\n",
             msg ? msg : "?", static_cast<unsigned>( err_code ), label ? label : "?" );
}


// LATE REGISTRATION: initUniforms() binds each Uniform's GL location exactly
// once, at compile time.  A Uniform added AFTER the program was compiled (the
// editor's Scene3DPreview registers ranges right after setShader()) therefore
// never got a location and its per-frame upload silently no-opped — every
// per-activation param sat at GLSL's 0.0 in the whole scene3d preview, which
// degenerated camera-height/extent scenes (Ocean at swell 0 from eye level =
// black) and skewed the metric scan.  Binding immediately when a program
// already exists fixes that; in the shipped app registration happens BEFORE
// the compile, so m_shProgId is 0 here and nothing changes.
void EffectShader::addUniform( const std::string &name, float minf, float maxf )
{
    Uniform *u = new Uniform( name, BASE_TYPE_FLOAT );
    u->setMinMax( minf, maxf );
    u->resetParameters();
    m_uniforms.push_back( u );
    if ( m_shProgId )
        u->initUniform( m_shProgId );
}

void EffectShader::addUniform( const std::string &name, int minf, int maxf )
{
    Uniform *u = new Uniform( name, BASE_TYPE_INT );
    u->setMinMax( minf, maxf );
    u->resetParameters();
    m_uniforms.push_back( u );
    if ( m_shProgId )
        u->initUniform( m_shProgId );
}

void EffectShader::addUniform( const std::string &name, float pro )
{
    Uniform *u = new Uniform( name, BASE_TYPE_BOOL );
    u->setProbability( pro );
    u->resetParameters();
    m_uniforms.push_back( u );
    if ( m_shProgId )
        u->initUniform( m_shProgId );
}



void EffectShader::addUniformInterpolator( const std::string &name, float interpolatorMinMinf,
                                           float interpolatorMinMaxf,
                                           float interpolatorMaxMinf,
                                           float interpolatorMaxMaxf )
{
    Uniform *u = new Uniform( name, BASE_TYPE_INTERPOLATOR_FLOAT );
    u->setInterpolator( interpolatorMinMinf, interpolatorMinMaxf, interpolatorMaxMinf, interpolatorMaxMaxf,
                        static_cast<float>( m_timeSolo + 2 * m_timeInterpolation ) );
    u->resetParameters();
    m_uniforms.push_back( u );
    if ( m_shProgId )
        u->initUniform( m_shProgId );
}




unsigned int EffectShader::getTimeSolo() const
{
    return m_timeSolo; // getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
}

unsigned int EffectShader::getTimeInterpolation() const
{

    return m_timeInterpolation; // getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );
}


unsigned int EffectShader::getInterpolatedTime( unsigned int minTime, unsigned int maxTime )
{
    // min == max in the config would be rand() % 0 → integer div-by-zero crash.
    return ( maxTime > minTime ) ? minTime + ( rand() % ( maxTime - minTime ) ) : minTime;
}


// ---------------------------------------------------------------------------
// applyAudioFeatures
// Called after setUniforms() while the shader program is still active.
//
// IMPORTANT – why we no longer scale speed/speedTunnel here:
//   Those uniforms are multiplied by the absolute 'time' uniform inside the
//   shaders (phase = time*speed).  Scaling them per-frame therefore remapped
//   the WHOLE accumulated phase every time the audio changed, producing large
//   discontinuous jumps – the "wild flicker".  Audio-driven motion is now
//   delivered as pre-integrated, continuous phase offsets (audioPhase /
//   audioAdvance), computed once per frame in RenderPipeline::paint().  The base
//   speed/speedTunnel uniforms keep advancing smoothly and untouched.
//
// This function only uploads dedicated audio uniforms.  glGetUniformLocation
// returns -1 for any uniform a shader does not declare, so the corresponding
// upload is silently skipped (e.g. plain combine shaders react to nothing).
// ---------------------------------------------------------------------------
// Audio-uniform name table for the per-program location cache below
// (indices = the AL_* enum; order must match).
namespace
{
/** Slot of each audio uniform in the per-program location cache; AL_COUNT is the number of slots. */
enum AudioLocE
{
    AL_PHASE,
    AL_ADVANCE,
    AL_BEAT,
    AL_LEVEL,
    AL_SIDES,
    AL_FLIP,
    AL_CENTROID,
    AL_FLUX,
    AL_SUBBASS,
    AL_BASS,
    AL_LOWMID,
    AL_MID,
    AL_UPPERMID,
    AL_HIGH,
    AL_ROLLOFF,
    AL_SPREAD,
    AL_MODE,
    AL_PITCH,
    AL_AROUSAL,
    AL_VALENCE,
    AL_HCDF,
    AL_ROUGH,
    AL_SHARP,
    AL_ONSET,
    AL_DOWNBEAT,
    AL_BEATPH,
    AL_STEREO,
    AL_DPITCH,
    AL_MUSIC,
    AL_STBANDL,
    AL_STBANDR,
    AL_CHROMA,
    AL_SWELL,
    AL_BARPH,
    AL_AMBIENT,
    AL_KICK,
    AL_SNARE,
    AL_HAT,
    AL_SPECTRUM,
    AL_TEXSIM,
    AL_TEXFLUID,
    AL_BUILDUP,
    AL_DROP,
    AL_WAVE,
    AL_BASSREL,
    AL_MIDREL,
    AL_TREBREL,
    AL_DAYPHASE,
    AL_TEXSMOKE3D,
    AL_CHROMA12,
    AL_FLATNESS,
    AL_ZCR,
    AL_TEXSSM,
    AL_SSMHEAD,
    AL_SSMFILL,
    AL_TEXPHYS,
    AL_FADEOUT,
    AL_MELODY,
    AL_MELODYHEAD,
    AL_TEXSPECTRO,
    AL_SPECTROHEAD,
    AL_SPECTROFILL,
    AL_TEXDEPTH0,
    AL_TEXDEPTH1,
    AL_DEPTHVALID,
    AL_NEARFAR,
    AL_TANHALFFOV,
    AL_TEXSHADOW,
    AL_LIGHTM,
    AL_SHADOWPASS,
    AL_LIGHTDIR,
    AL_SHADOWTEXEL,
    AL_OITPASS,
    AL_SHADOWEXTENT,
    AL_TEXSHADOW2,
    AL_LIGHTM2,
    AL_SHADOWPASS2,
    AL_LIGHTDIR2,
    AL_TEXPREVFRAME,
    // audioAdvance since THIS activation.  `audioAdvance` itself is an
    // integrator without an upper bound (m_audioAdvance += dt * advRate) and
    // is therefore -- like `time` -- good only as a phase, not as a position.
    // The counterpart of `sceneTime`, so that a scene can keep its flight
    // music-driven without flying away from it.
    AL_SCENEADVANCE,
    // The MELODY pitch (HPS from 150 Hz), so that a scene gets the melody
    // instead of the root; audioPitch stays the dominant tone.
    AL_MELODYPITCH,
    // The 8-bar phrase: position 0..1 and seconds to the next boundary (= the
    // predicted drop).  For scenes that count towards the drop.
    AL_PHRASEPOS,
    AL_PHRASELEFT,
    AL_SECTIONID,
    AL_SECTIONPREV,
    AL_SECTIONAGE,
    AL_SECTIONKNOWN,
    AL_SECTIONCOUNT,
    AL_MELODYPHASE,
    // The harmony's advance (AudioFeatures::harmAdvance): what a scene adds to
    // a phase where it used to add the harmonic-change pulse.
    AL_HARMADVANCE,
    // How sure the analysis is that a melody sounds (AudioFeatures::melodyConf).
    AL_MELODYCONF,
    AL_COUNT
};
/** The audio uniforms' names, indexed by AudioLocE (the order must match). */
const char *kAudioLocNames[AL_COUNT] = {
    "audioPhase", "audioAdvance", "audioBeat", "audioLevel", "sides",
    "audioFlip", "audioCentroid", "audioFlux", "audioSubBass", "audioBass",
    "audioLowMid", "audioMid", "audioUpperMid", "audioHigh", "audioRolloff",
    "audioSpread", "audioMode", "audioPitch", "audioArousal", "audioValence",
    "audioHarmChange", "audioRoughness", "audioSharpness", "audioOnset",
    "audioDownbeat", "audioBeatPhase", "audioStereo", "audioDeltaPitch",
    "audioMusic", "audioStereoL", "audioStereoR", "audioChromaHue",
    "audioSwell", "audioBarPhase", "audioAmbient", "audioKick", "audioSnare",
    "audioHat", "audioSpectrum", "texSim", "texFluid",
    "audioBuildUp", "audioDrop", "audioWave", "audioBassRel", "audioMidRel",
    "audioTrebRel", "dayPhase", "texSmoke3D", "audioChroma", "audioFlatness",
    "audioZCR", "texSSM", "ssmHead", "ssmFill", "texPhysarum",
    "audioFadeOut", "audioMelody", "audioMelodyHead",
    "texSpectro", "spectroHead", "spectroFill",
    "texDepth0", "texDepth1", "depthValid", "nearFar", "tanHalfFov",
    "texShadow", "lightM", "shadowPass", "lightDir", "shadowTexel",
    "oitPass", "shadowExtent",
    "texShadow2", "lightM2", "shadowPass2", "lightDir2", "texPrevFrame",
    "sceneAdvance", // the order MUST match the AL_ enum (Tools/check_enum_tables.py)
    "audioMelodyPitch",
    "audioPhrasePos", "audioPhraseLeft",
    "audioSectionId", "audioSectionPrev", "audioSectionAge", "audioSectionKnown", "audioSectionCount",
    "audioMelodyPhase", "audioHarmAdvance", "audioMelodyConf" };
}

void EffectShader::applyAudioFeatures( const AudioFeatures &features )
{
    // The music's accumulators relative to this activation (see m_clockT0): exact, and small however long the show.
    if ( m_clockA0 < -1.0e299 )
    {
        m_clockA0 = features.audioAdvanceD;
        m_clockR0 = features.audioRotPhaseD;
        m_clockH0 = features.harmAdvanceD;
    }
    m_audioSeen = features;
    m_audioSeen.audioAdvance = static_cast<float>( features.audioAdvanceD - m_clockA0 ) + m_clockBaseA;
    m_audioSeen.audioRotPhase = static_cast<float>( features.audioRotPhaseD - m_clockR0 ) + m_clockBaseR;
    m_audioSeen.harmAdvance = static_cast<float>( features.harmAdvanceD - m_clockH0 );
    const AudioFeatures &f = m_audioSeen;

    // Cached for stepBake(), called later from draw() -- which, unlike this
    // function, takes no AudioFeatures parameter.
    m_lastAudioForBake = f;

    // Chain labs: the music steers the walk (no-op for every other shader).
    stepChainWalk( f );
    stepChainCam( f );
    if ( !m_compileFile.empty() && m_glReady )
    {
        if ( m_chain3D )
            runChain3D( f );
        else
            runChainPasses( f );
    }

    // Per-program LOCATION CACHE: this used to perform ~45 string-keyed
    // glGetUniformLocation lookups per shader per FRAME - the single biggest
    // CPU cost in the render loop.  Locations are looked up once per program
    // and auto-refresh when the program id changes (recompile / hot reload).
    if ( m_audioLocs.progId != m_shProgId )
    {
        for ( int i = 0; i < AL_COUNT; ++i )
            m_audioLocs.L[i] = glGetUniformLocation( m_shProgId, kAudioLocNames[i] );
        m_audioLocs.progId = m_shProgId;

        m_powerUniform = nullptr;
        for ( Uniform *u : m_uniforms )
            if ( u->getName() == "power" )
            {
                m_powerUniform = u;
                break;
            }
    }
    const GLint *locs = m_audioLocs.L;

    // Live-modulate this scene's own "power" (superellipse/fold exponent)
    // with the beat/ambient-driven powerScale -- safe because it is a plain
    // per-frame shape parameter, not integrated over time like speed/
    // speedTunnel (see the big comment above on why those stay untouched).
    if ( m_powerUniform )
        m_powerUniform->setGLValueScaled( f.powerScale );

    if ( locs[AL_KICK] >= 0 )
        glUniform1f( locs[AL_KICK], f.onsetKick );
    if ( locs[AL_SNARE] >= 0 )
        glUniform1f( locs[AL_SNARE], f.onsetSnare );
    if ( locs[AL_HAT] >= 0 )
        glUniform1f( locs[AL_HAT], f.onsetHat );
    if ( locs[AL_AROUSAL] >= 0 )
        glUniform1f( locs[AL_AROUSAL], f.arousal );
    if ( locs[AL_VALENCE] >= 0 )
        glUniform1f( locs[AL_VALENCE], f.valence );
    if ( locs[AL_HCDF] >= 0 )
        glUniform1f( locs[AL_HCDF], f.harmonicChange );
    if ( locs[AL_ROUGH] >= 0 )
        glUniform1f( locs[AL_ROUGH], f.roughness );
    if ( locs[AL_SHARP] >= 0 )
        glUniform1f( locs[AL_SHARP], f.sharpness );
    if ( locs[AL_ONSET] >= 0 )
        glUniform1f( locs[AL_ONSET], f.onsetStrength );
    if ( locs[AL_DOWNBEAT] >= 0 )
        glUniform1f( locs[AL_DOWNBEAT], f.downbeat );
    if ( locs[AL_BEATPH] >= 0 )
        glUniform1f( locs[AL_BEATPH], f.beatPhase );
    if ( locs[AL_STEREO] >= 0 )
        glUniform1f( locs[AL_STEREO], f.stereoWidth );
    if ( locs[AL_DPITCH] >= 0 )
        glUniform1f( locs[AL_DPITCH], f.deltaPitch );
    if ( locs[AL_MUSIC] >= 0 )
        glUniform1f( locs[AL_MUSIC], f.musicPresence );
    if ( locs[AL_STBANDL] >= 0 )
        glUniform3f( locs[AL_STBANDL], f.stereoLowL, f.stereoMidL, f.stereoHighL );
    if ( locs[AL_STBANDR] >= 0 )
        glUniform3f( locs[AL_STBANDR], f.stereoLowR, f.stereoMidR, f.stereoHighR );
    if ( locs[AL_CHROMA] >= 0 )
        glUniform1f( locs[AL_CHROMA], f.chromaHue );
    if ( locs[AL_SWELL] >= 0 )
        glUniform1f( locs[AL_SWELL], f.swell );
    if ( locs[AL_BARPH] >= 0 )
        glUniform1f( locs[AL_BARPH], f.barPhase );
    if ( locs[AL_AMBIENT] >= 0 )
        glUniform1f( locs[AL_AMBIENT], f.ambientFactor );
    if ( locs[AL_SPECTRUM] >= 0 )
        glUniform1fv( locs[AL_SPECTRUM], AudioFeatures::SpectrumBands, f.spectrum );
    if ( locs[AL_WAVE] >= 0 )
        glUniform1fv( locs[AL_WAVE], AudioFeatures::WavePoints, f.wave );
    if ( locs[AL_BASSREL] >= 0 )
        glUniform1f( locs[AL_BASSREL], f.bassRel );
    if ( locs[AL_MIDREL] >= 0 )
        glUniform1f( locs[AL_MIDREL], f.midRel );
    if ( locs[AL_TREBREL] >= 0 )
        glUniform1f( locs[AL_TREBREL], f.trebRel );
    if ( locs[AL_DAYPHASE] >= 0 )
        glUniform1f( locs[AL_DAYPHASE], f.dayPhase );
    if ( locs[AL_CHROMA12] >= 0 )
        glUniform1fv( locs[AL_CHROMA12], 12, f.chroma );
    if ( locs[AL_FADEOUT] >= 0 )
        glUniform1f( locs[AL_FADEOUT], f.fadeOut );
    if ( locs[AL_MELODY] >= 0 )
        glUniform1fv( locs[AL_MELODY], AudioFeatures::MelodyLen, f.melody );
    if ( locs[AL_MELODYHEAD] >= 0 )
        glUniform1f( locs[AL_MELODYHEAD], f.melodyHead );
    if ( locs[AL_MELODYPHASE] >= 0 )
        glUniform1f( locs[AL_MELODYPHASE], f.melodyPhase );
    if ( locs[AL_HARMADVANCE] >= 0 )
        glUniform1f( locs[AL_HARMADVANCE], f.harmAdvance );
    if ( locs[AL_MELODYCONF] >= 0 )
        glUniform1f( locs[AL_MELODYCONF], f.melodyConf );
    if ( locs[AL_FLATNESS] >= 0 )
        glUniform1f( locs[AL_FLATNESS], f.spectralFlatness );
    if ( locs[AL_ZCR] >= 0 )
        glUniform1f( locs[AL_ZCR], f.zeroCrossingRate );

    // ---- FORMULA LAYER: evaluate the preset's <expr> mappings ----
    // Runs AFTER the random <float> params (setUniforms), so a formula on
    // the same uniform name deliberately takes over.
    if ( !m_exprs.empty() )
    {
        float v[ExprVars::V_COUNT];
        fillExprVars( f, m_exprTime, m_exprSeeds, v );
        v[ExprVars::V_PROGRESS] = m_sceneProgress;

        for ( ExprEntry &e : m_exprs )
        {
            if ( e.progId != m_shProgId )
            {
                e.loc = glGetUniformLocation( m_shProgId, e.name.c_str() );
                e.progId = m_shProgId;
            }
            if ( e.loc >= 0 && e.prog.valid() )
                glUniform1f( e.loc, e.prog.eval( v ) );
        }

        // ---- 2D CAMERA RIG: formulas named rig2Roll/rig2Zoom/rig2X/rig2Y
        // (absolute) and rig2…V (rates, HOST-INTEGRATED so audio-varying
        // rates are jump-free) are not shader uniforms — RenderPipeline reads
        // the result via rig2() and runs the Engine/Rig2D.frag transform pass
        // over this scene's finished frame.  Rates integrate once per FRAME
        // (m_exprTime is per-frame; guard against multiple passes).
        m_rig2Active = false;
        float              absv[4] = { 0, 0, 0, 0 }; // roll zoom x y
        float              vel[4] = { 0, 0, 0, 0 };
        static const char *Abs2[4] = { "rig2Roll", "rig2Zoom", "rig2X", "rig2Y" };
        static const char *Vel2[4] = { "rig2RollV", "rig2ZoomV", "rig2XV", "rig2YV" };
        for ( ExprEntry &e : m_exprs )
        {
            if ( !e.prog.valid() )
                continue;
            for ( int i = 0; i < 4; ++i )
            {
                if ( e.name == Abs2[i] )
                {
                    absv[i] = e.prog.eval( v );
                    m_rig2Active = true;
                }
                if ( e.name == Vel2[i] )
                {
                    vel[i] = e.prog.eval( v );
                    m_rig2Active = true;
                }
            }
        }
        if ( m_rig2Active )
        {
            if ( m_exprTime != m_rig2LastT )
            {
                float dt = m_exprTime - m_rig2LastT;
                if ( dt < 0.f || dt > 0.1f )
                    dt = 0.f; // activation / reset
                for ( int i = 0; i < 4; ++i )
                    m_rig2Acc[i] += vel[i] * dt;
                m_rig2LastT = m_exprTime;
            }
            for ( int i = 0; i < 4; ++i )
                m_rig2[i] = absv[i] + m_rig2Acc[i];
        }
    }
    if ( locs[AL_TEXSIM] >= 0 )
        glUniform1i( locs[AL_TEXSIM], 7 ); // RD field (unit 7)
    if ( locs[AL_TEXFLUID] >= 0 )
        glUniform1i( locs[AL_TEXFLUID], 8 ); // fluid dye (unit 8)
    if ( locs[AL_TEXSMOKE3D] >= 0 )
        glUniform1i( locs[AL_TEXSMOKE3D], 9 ); // smoke/fire volume (unit 9)
    if ( locs[AL_TEXSSM] >= 0 )
        glUniform1i( locs[AL_TEXSSM], 10 ); // self-similarity matrix
    if ( locs[AL_TEXPHYS] >= 0 )
        glUniform1i( locs[AL_TEXPHYS], 11 ); // Physarum trail map
    // Unit 28 sits above the ComputeFX block (12..27).  A shader only ever has
    // a handful of these active at once, so the per-stage unit limit is never
    // the binding constraint — the numbering just has to stay collision-free.
    if ( locs[AL_TEXSPECTRO] >= 0 )
        glUniform1i( locs[AL_TEXSPECTRO], 28 ); // spectrogram history
    // Unit 34: last frame's fully composited image (RenderPipeline binds
    // m_texTrail[1-m_trailIdx] there once per frame, before any scene draws,
    // since the trails pass itself hasn't swapped m_trailIdx for this frame
    // yet). Opt-in the same way as texSim/texSpectro -- just declare it.
    if ( locs[AL_TEXPREVFRAME] >= 0 )
        glUniform1i( locs[AL_TEXPREVFRAME], 34 );
    // The two scene depth buffers, as the combine stage sees them.  depthValid
    // says whether each one actually holds a 3D scene's geometry — a 2D effect
    // leaves the far plane there, and a depth-driven combine has to know the
    // difference between "everything is far away" and "there is no depth".
    if ( locs[AL_TEXDEPTH0] >= 0 )
        glUniform1i( locs[AL_TEXDEPTH0], 29 );
    if ( locs[AL_TEXDEPTH1] >= 0 )
        glUniform1i( locs[AL_TEXDEPTH1], 30 );
    if ( locs[AL_DEPTHVALID] >= 0 )
        glUniform2f( locs[AL_DEPTHVALID],
                     M_DepthValid[0], M_DepthValid[1] );
    if ( locs[AL_NEARFAR] >= 0 )
        glUniform2f( locs[AL_NEARFAR],
                     SceneNear, SceneFar );
    if ( locs[AL_TANHALFFOV] >= 0 )
        glUniform1f( locs[AL_TANHALFFOV], SceneTanHalfFovY );
    if ( locs[AL_TEXSHADOW] >= 0 )
        glUniform1i( locs[AL_TEXSHADOW], 31 );
    if ( locs[AL_LIGHTM] >= 0 )
        glUniformMatrix4fv( locs[AL_LIGHTM], 1, GL_FALSE, M_LightM );
    if ( locs[AL_SHADOWPASS] >= 0 )
        glUniform1f( locs[AL_SHADOWPASS], M_ShadowPass );
    if ( locs[AL_LIGHTDIR] >= 0 )
        glUniform3f( locs[AL_LIGHTDIR], M_LightDir[0],
                     M_LightDir[1], M_LightDir[2] );
    if ( locs[AL_SHADOWTEXEL] >= 0 )
        glUniform1f( locs[AL_SHADOWTEXEL], 1.f / 2048.f );
    if ( locs[AL_OITPASS] >= 0 )
        glUniform1f( locs[AL_OITPASS], M_OitPass );
    if ( locs[AL_SHADOWEXTENT] >= 0 )
        glUniform1f( locs[AL_SHADOWEXTENT], M_ShadowExtent );
    // Second, independent shadow-casting light (see usesShadow2()). Shares
    // shadowExtent/shadowTexel with light 1 (same box, same map resolution).
    if ( locs[AL_TEXSHADOW2] >= 0 )
        glUniform1i( locs[AL_TEXSHADOW2], 32 );
    if ( locs[AL_LIGHTM2] >= 0 )
        glUniformMatrix4fv( locs[AL_LIGHTM2], 1, GL_FALSE, M_LightM2 );
    if ( locs[AL_SHADOWPASS2] >= 0 )
        glUniform1f( locs[AL_SHADOWPASS2], M_ShadowPass2 );
    if ( locs[AL_LIGHTDIR2] >= 0 )
        glUniform3f( locs[AL_LIGHTDIR2], M_LightDir2[0],
                     M_LightDir2[1], M_LightDir2[2] );
    if ( locs[AL_SSMHEAD] >= 0 )
        glUniform1f( locs[AL_SSMHEAD], f.ssmHead );
    if ( locs[AL_SSMFILL] >= 0 )
        glUniform1f( locs[AL_SSMFILL], f.ssmFill );
    if ( locs[AL_SPECTROHEAD] >= 0 )
        glUniform1f( locs[AL_SPECTROHEAD], f.spectroHead );
    if ( locs[AL_SPECTROFILL] >= 0 )
        glUniform1f( locs[AL_SPECTROFILL], f.spectroFill );
    if ( locs[AL_BUILDUP] >= 0 )
        glUniform1f( locs[AL_BUILDUP], f.buildUp );
    if ( locs[AL_DROP] >= 0 )
        glUniform1f( locs[AL_DROP], f.dropPulse );
    if ( locs[AL_PHASE] >= 0 )
        glUniform1f( locs[AL_PHASE], f.audioRotPhase );
    if ( locs[AL_ADVANCE] >= 0 )
        glUniform1f( locs[AL_ADVANCE], f.audioAdvance );
    // Remember the zero point at the first frame after the activation, so
    // that sceneAdvance starts at 0.  resetParameters() resets the mark.
    if ( m_advanceAtReset < -0.9e9f )
        m_advanceAtReset = f.audioAdvance;
    if ( locs[AL_MELODYPITCH] >= 0 )
        glUniform1f( locs[AL_MELODYPITCH], f.melodyPitch );
    if ( locs[AL_PHRASEPOS] >= 0 )
        glUniform1f( locs[AL_PHRASEPOS], f.phrasePos );
    if ( locs[AL_PHRASELEFT] >= 0 )
        glUniform1f( locs[AL_PHRASELEFT], f.phraseSecsLeft );
    // Song-structure memory for the shader: the current section's slot id, the
    // one before it, how long ago the change was, and whether the section was
    // RECOGNISED (a returning chorus) or stored as new.  The age lets a scene
    // fly through a door instead of cutting: the section only ever changes
    // ahead of the camera.  The first sight after an activation is not a
    // change (age starts large), so no door opens on scene start.
    {
        const double now = std::chrono::duration<double>( EngineClock::now().time_since_epoch() ).count();
        if ( f.sectionCount != m_secCount )
        {
            const bool first = ( m_secCount < 0 );
            m_secPrev = first ? f.sectionId : m_secCur;
            m_secCur = f.sectionId;
            m_secCount = f.sectionCount;
            m_secKnown = f.sectionKnown ? 1.f : 0.f;
            m_secT0 = first ? now - 1000.0 : now;
        }
        if ( locs[AL_SECTIONID] >= 0 )
            glUniform1f( locs[AL_SECTIONID], static_cast<float>( m_secCur ) );
        if ( locs[AL_SECTIONPREV] >= 0 )
            glUniform1f( locs[AL_SECTIONPREV], static_cast<float>( m_secPrev ) );
        if ( locs[AL_SECTIONAGE] >= 0 )
            glUniform1f( locs[AL_SECTIONAGE], static_cast<float>( now - m_secT0 ) );
        if ( locs[AL_SECTIONKNOWN] >= 0 )
            glUniform1f( locs[AL_SECTIONKNOWN], m_secKnown );
        if ( locs[AL_SECTIONCOUNT] >= 0 )
            glUniform1f( locs[AL_SECTIONCOUNT], static_cast<float>( m_secCount ) );
    }
    if ( locs[AL_SCENEADVANCE] >= 0 )
        glUniform1f( locs[AL_SCENEADVANCE], f.audioAdvance - m_advanceAtReset );
    if ( locs[AL_BEAT] >= 0 )
        glUniform1f( locs[AL_BEAT], f.beatDecay );
    if ( locs[AL_LEVEL] >= 0 )
        glUniform1f( locs[AL_LEVEL], f.overallLevel );
    if ( locs[AL_SIDES] >= 0 )
        glUniform1i( locs[AL_SIDES], static_cast<int>( f.smoothedSides + 0.5f ) );
    if ( locs[AL_FLIP] >= 0 )
        glUniform1f( locs[AL_FLIP], f.audioFlip );
    if ( locs[AL_CENTROID] >= 0 )
        glUniform1f( locs[AL_CENTROID], f.spectralCentroid );
    if ( locs[AL_FLUX] >= 0 )
        glUniform1f( locs[AL_FLUX], f.spectralFlux );
    if ( locs[AL_SUBBASS] >= 0 )
        glUniform1f( locs[AL_SUBBASS], f.subBassLevel );
    if ( locs[AL_BASS] >= 0 )
        glUniform1f( locs[AL_BASS], f.bassLevel );
    if ( locs[AL_LOWMID] >= 0 )
        glUniform1f( locs[AL_LOWMID], f.lowMidLevel );
    if ( locs[AL_MID] >= 0 )
        glUniform1f( locs[AL_MID], f.midLevel );
    if ( locs[AL_UPPERMID] >= 0 )
        glUniform1f( locs[AL_UPPERMID], f.upperMidLevel );
    if ( locs[AL_HIGH] >= 0 )
        glUniform1f( locs[AL_HIGH], f.highLevel );
    if ( locs[AL_ROLLOFF] >= 0 )
        glUniform1f( locs[AL_ROLLOFF], f.spectralRolloff );
    if ( locs[AL_SPREAD] >= 0 )
        glUniform1f( locs[AL_SPREAD], f.spectralSpread );
    if ( locs[AL_MODE] >= 0 )
        glUniform1f( locs[AL_MODE], f.musicalMode );
    if ( locs[AL_PITCH] >= 0 )
        glUniform1f( locs[AL_PITCH], f.dominantPitch );
}


void EffectShader::fillExprVars( const AudioFeatures &f, float timeVal,
                                 const float seeds[3], float *v )
{
    v[ExprVars::V_TIME] = timeVal;
    v[ExprVars::V_BASS] = f.bassLevel;
    v[ExprVars::V_MID] = 0.5f * ( f.lowMidLevel + f.midLevel );
    v[ExprVars::V_TREB] = 0.5f * ( f.upperMidLevel + f.highLevel );
    v[ExprVars::V_BASSREL] = f.bassRel;
    v[ExprVars::V_MIDREL] = f.midRel;
    v[ExprVars::V_TREBREL] = f.trebRel;
    v[ExprVars::V_SUBBASS] = f.subBassLevel;
    v[ExprVars::V_HIGH] = f.highLevel;
    v[ExprVars::V_LEVEL] = f.overallLevel;
    v[ExprVars::V_KICK] = f.onsetKick;
    v[ExprVars::V_SNARE] = f.onsetSnare;
    v[ExprVars::V_HAT] = f.onsetHat;
    v[ExprVars::V_ONSET] = f.onsetStrength;
    v[ExprVars::V_BEAT] = f.beatDecay;
    v[ExprVars::V_BEATPH] = f.beatPhase;
    v[ExprVars::V_BARPH] = f.barPhase;
    v[ExprVars::V_DOWNBEAT] = f.downbeat;
    v[ExprVars::V_SWELL] = f.swell;
    v[ExprVars::V_BUILDUP] = f.buildUp;
    v[ExprVars::V_DROP] = f.dropPulse;
    v[ExprVars::V_CHROMA] = f.chromaHue;
    v[ExprVars::V_CENTROID] = f.spectralCentroid;
    v[ExprVars::V_FLUX] = f.spectralFlux;
    v[ExprVars::V_AROUSAL] = f.arousal;
    v[ExprVars::V_VALENCE] = f.valence;
    v[ExprVars::V_AMBIENT] = f.ambientFactor;
    v[ExprVars::V_RHYTHM] = f.rhythmStrength;
    v[ExprVars::V_MUSIC] = f.musicPresence;
    v[ExprVars::V_ADVANCE] = f.audioAdvance;
    v[ExprVars::V_PHASE] = f.audioRotPhase;
    v[ExprVars::V_DAYPHASE] = f.dayPhase;
    v[ExprVars::V_FLATNESS] = f.spectralFlatness;
    v[ExprVars::V_ZCR] = f.zeroCrossingRate;
    v[ExprVars::V_FADEOUT] = f.fadeOut;
    // `progress` is NOT an audio feature but the scene's own state.
    // fillExprVars is static (the seeds come as parameters), so the caller
    // fills it in afterwards -- here stands only the safe default.
    v[ExprVars::V_PROGRESS] = 0.f;
    v[ExprVars::V_SEED1] = seeds[0];
    v[ExprVars::V_SEED2] = seeds[1];
    v[ExprVars::V_SEED3] = seeds[2];
}


void EffectShader::addExpression( const std::string &name, const std::string &formula )
{
    ExprEntry e;
    e.name = name;
    std::string ctx = std::string( fragmentName() ) + ":" + name;
    if ( e.prog.compile( formula, ctx ) )
    {
        m_exprs.push_back( e );
        if ( formula.find( "progress" ) != std::string::npos )
            m_exprUsesProgress = true;
        // One line per formula was 25,451 of a start log's 25,598 lines (2.1 MB with -l, written unbuffered): only
        // when asked for (KALEIDO_EXPR_LOG, on in the editor), otherwise counted for the preset's summary line.
        // A formula that fails to compile is still reported one by one (ExprEval).
        ++M_ExprCompiled;
        if ( M_ExprLog )
            fprintf( stderr, "Expr OK: %s = %s\n", ctx.c_str(), formula.c_str() );
    }

    for ( int i = 0; i < 3; ++i )
        m_exprSeeds[i] = static_cast<float>( rand() ) / static_cast<float>( RAND_MAX );
}

bool EffectShader::useShader() const
{
    float prob = static_cast<float>( rand() ) / static_cast<float>( RAND_MAX );

    if ( prob <= m_probability )
    {
        return true;
    }
    return false;
}

bool EffectShader::usesSim()
{
    if ( !m_glReady )
        return false; // lazy: not compiled -> can't be on screen yet
    if ( m_usesSim < 0 )
        m_usesSim = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texSim" ) >= 0 ) ? 1 : 0;
    return m_usesSim == 1;
}

bool EffectShader::usesProgress()
{
    // Asked BEFORE the first compile too: the scheduler's build-up rule
    // ("while the tension rises, prefer a staged scene") filters candidates
    // that have mostly never been on screen.  Answering "no" for every
    // uncompiled shader narrowed that pool to the staged scenes that had
    // already played -- so the same handful (DamascusSteelEtch,
    // SundialShadowSweep, KilnGlazeCrystals, ...) came back three and four
    // times in twelve minutes.  The source text says it without GL.
    if ( !m_glReady )
    {
        if ( m_srcUsesProgress < 0 )
            m_srcUsesProgress = ( m_exprUsesProgress || sourceUsesProgress() ) ? 1 : 0;
        return m_srcUsesProgress == 1;
    }
    if ( m_usesProgress < 0 )
        m_usesProgress = ( m_exprUsesProgress
                           || ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "sceneProgress" ) >= 0 ) )
                             ? 1
                             : 0;
    return m_usesProgress == 1;
}

/**  Tells from the shader SOURCE (no GL) whether this scene reads `sceneProgress`.
 *
 * @return
 *   True if any stage uses `sceneProgress` in code.
 *
 * Reads the fragment file and its Scene3D siblings (.vert/.geom/.tesc/.tese,
 * same stem; missing files are skipped), strips comments, and looks for the
 * name outside its `uniform` declaration -- the text-side twin of the
 * active-uniform test usesProgress() makes once the program is compiled.
 **/
bool EffectShader::sourceUsesProgress() const
{
    if ( m_fragmentShaderFilename.empty() )
        return false;
    std::string stem = m_fragmentShaderFilename;
    size_t      dot = stem.rfind( ".frag" );
    if ( dot == std::string::npos )
        return false;
    stem.erase( dot );
    static const char *exts[] = { ".frag", ".vert", ".geom", ".tesc", ".tese" };
    for ( const char *ext : exts )
    {
        const std::string src = textFileRead( ( stem + ext ).c_str() );
        if ( src.empty() )
            continue;
        // Strip /* */ and // comments: the headers name every uniform they
        // read, which would make every documented scene look staged.
        std::string code;
        code.reserve( src.size() );
        for ( size_t i = 0; i < src.size(); )
        {
            if ( src.compare( i, 2, "/*" ) == 0 )
            {
                size_t e = src.find( "*/", i + 2 );
                i = ( e == std::string::npos ) ? src.size() : e + 2;
            }
            else if ( src.compare( i, 2, "//" ) == 0 )
            {
                size_t e = src.find( '\n', i );
                i = ( e == std::string::npos ) ? src.size() : e;
            }
            else
                code += src[i++];
        }
        for ( size_t p = code.find( "sceneProgress" ); p != std::string::npos;
              p = code.find( "sceneProgress", p + 1 ) )
        {
            size_t ls = code.rfind( '\n', p );
            ls = ( ls == std::string::npos ) ? 0 : ls + 1;
            if ( code.compare( ls, 7, "uniform" ) != 0
                 && code.substr( ls, p - ls ).find( "uniform" ) == std::string::npos )
                return true;
        }
    }
    return false;
}

void EffectShader::setClimaxIn( float secs )
{
    // Keep the CURRENT progress and bend the ramp so 0.95 lands in `secs`:
    // p(now) = p0, p(now + secs) = 0.95  =>  span = secs / (0.95 - p0),
    // origin = now - p0 * span.  A plain rescale would have thrown the arc
    // backwards (pieces flying OUT again) the moment the prediction came in.
    if ( m_progressT0 < -0.9e9f || m_soloAtReset <= 0.01f || secs < 1.f )
        return;
    const float p0 = m_sceneProgress;
    if ( p0 >= 0.93f )
        return; // already there; nothing to bend
    const float span = secs / ( 0.95f - p0 );
    m_progressT0 = m_exprTime - p0 * span;
    m_soloAtReset = span;
}

void EffectShader::setStayIn( float secs )
{
    // The same continuous bend as setClimaxIn(), to 1 at the end of the solo the scheduler actually gives (17.10.2026).
    // The ramp ran over the solo time rolled from the config, but the stay is that divided by the music's timing scale
    // (up to 2.6) and times the taste (0.7 .. 1.5): ShipFlyby's pass was cut off at 40 % of the way, or the ship had
    // left long before the scene did.
    // A review bench with a fixed span per scene (KALEIDO_SOLO_SECS) keeps that span: the bench switches the scenes,
    // not the scheduler's solo.
    if ( soloCap() > 0.01f )
        return;
    if ( m_progressT0 < -0.9e9f || m_soloAtReset <= 0.01f || secs < 1.f )
        return;
    const float p0 = m_sceneProgress;
    if ( p0 >= 0.98f )
        return;
    const float span = secs / ( 1.f - p0 );
    m_progressT0 = m_exprTime - p0 * span;
    m_soloAtReset = span;
}

bool EffectShader::usesFluid()
{
    if ( !m_glReady )
        return false;
    if ( m_usesFluid < 0 )
        m_usesFluid = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texFluid" ) >= 0 ) ? 1 : 0;
    return m_usesFluid == 1;
}

bool EffectShader::usesSmoke3D()
{
    if ( !m_glReady )
        return false;
    if ( m_usesSmoke3D < 0 )
        m_usesSmoke3D = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texSmoke3D" ) >= 0 ) ? 1 : 0;
    return m_usesSmoke3D == 1;
}

bool EffectShader::usesSSM()
{
    if ( !m_glReady )
        return false;
    if ( m_usesSSM < 0 )
        m_usesSSM = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texSSM" ) >= 0 ) ? 1 : 0;
    return m_usesSSM == 1;
}

float EffectShader::M_OitPass = 0.f;

bool EffectShader::usesOit()
{
    if ( !m_glReady )
        return false;
    if ( m_usesOit < 0 )
        m_usesOit = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "oitPass" ) >= 0 ) ? 1 : 0;
    return m_usesOit == 1;
}

bool EffectShader::usesBake()
{
    if ( !m_glReady )
        return false;
    if ( m_usesBake < 0 )
        m_usesBake = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texBake" ) >= 0 ) ? 1 : 0;
    return m_usesBake == 1;
}

// ---- Chain walk (host side of the chain labs' walk) ----------------------
// Stage order: A, B, C, D (the chain), S (the look); each has a rolled knob.
// Stages 5..7 (the 3D structure: space, fold core, body) exist in ChainLab3D only.
static const int WalkN = 9; ///< Walk stages: A..D, the look, space, core, body and the stage order (8).
/** The rolled knob of each walk stage. */
static const char *kWalkKnob[9] = { "chainAP", "chainBP", "chainCP", "chainDP", "styleP",
                                    "spaceP", "coreP", "bodyP", "orderP" };
/** The walk uniform of each stage (shown, target, fade). */
static const char *kWalkUni[9] = { "walkA", "walkB", "walkC", "walkD", "walkS",
                                   "walkSpace", "walkCore", "walkBody", "walkO" };
/** Where a lab's roll counts as poor (worldPoorness(), chainPoorness()) and where clearly good: the 3D lab's line
 * set on 48 rolls looked at by eye (0.4: 16 of 19 poor ones caught, 4 of 16 good ones moved -- 0.5 caught 12), the
 * flat labs' line on the 2D probe (Tools/chain2d_probe.py). */
static const float WorldLine = 0.4f, WorldClear = 0.3f, ChainLine = 0.5f, ChainClear = 0.35f;
/** Short stage names for the log. */
static const char *kWalkName[9] = { "A", "B", "C", "D", "look", "space", "core", "body", "order" };
/**  Whether walk stage s is a structure stage (space, core, body) of the 3D labs.
 *
 * @param s  Walk stage index (as kWalkKnob). (in)
 *
 * @return
 *   True for the 3D lab's structure stages (space, fold core, body).
 **/
static bool isStructure( int s )
{
    return s >= 5 && s <= 7;
}

/** What the chain lab on screen showed last (written every frame by stepChainWalk()).
 *
 * A chain lab that comes in while another one fades out starts on the
 * classes that one shows -- matched by class name, sub-variant included -- so
 * the crossfade between two labs keeps the chain and changes the rest (the
 * flat lab hands its chain to the tunnel, the 3D flight its world to the slice).
 **/
struct LastChain
{
    const EffectShader                                  *who = nullptr; ///< The lab that wrote it.
    std::string                                          frag;          ///< Its fragment file.
    std::chrono::steady_clock::time_point                when;          ///< When it was written.
    std::map<std::string, std::pair<std::string, float>> cls; ///< Stage knob -> (class shown, sub-variant 0..1).
};
static LastChain s_lastChain; ///< The chain on screen last (see LastChain).

static std::chrono::steady_clock::time_point s_noCarryAt;          ///< Last noCarryOver() call.
static bool                                  s_noCarrySet = false; ///< s_noCarryAt is valid.

void EffectShader::noCarryOver()
{
    s_noCarryAt = EngineClock::now();
    s_noCarrySet = true;
}

void EffectShader::carryChainOver()
{
    const auto now = EngineClock::now();
    if ( !s_lastChain.who || s_lastChain.who == this || now - s_lastChain.when > std::chrono::milliseconds( 1500 ) )
        return; // no other lab on screen right now
    if ( s_noCarrySet && now - s_noCarryAt < std::chrono::seconds( 5 ) )
    {
        s_noCarrySet = false; // one activation: the skip's
        return;
    }
    // The same lab again (a new roll of it): two of its chain stages carry over, so the new roll still shows itself.
    const bool same = s_lastChain.frag == fragmentName();
    int        keep[2] = { -1, -1 };
    if ( same )
    {
        keep[0] = rand() % 4;
        keep[1] = ( keep[0] + 1 + rand() % 3 ) % 4;
    }
    for ( int s = 0; s < WalkN; ++s )
    {
        if ( same && s != keep[0] && s != keep[1] )
            continue;
        if ( m_chainConsts.count( kWalkKnob[s] ) )
            continue; // a frozen scene keeps its own chain
        auto last = s_lastChain.cls.find( kWalkKnob[s] );
        auto mine = m_chainClasses.find( kWalkKnob[s] );
        if ( last == s_lastChain.cls.end() || mine == m_chainClasses.end() )
            continue;
        const auto &names = mine->second;
        const auto  at = std::find( names.begin(), names.end(), last->second.first );
        if ( at == names.end() )
            continue; // this lab has not got that class
        const float v = ( static_cast<float>( at - names.begin() ) + last->second.second )
                        / static_cast<float>( names.size() );
        for ( Uniform *u : m_uniforms )
            if ( u->getName() == kWalkKnob[s] )
            {
                u->restoreValue( v );
                m_walkCarried[s] = true;
            }
    }
    int n = 0;
    for ( bool b : m_walkCarried )
        n += b;
    if ( n )
        fprintf( stderr, "%s: %d stage(s) carried over from %s\n", fragmentName(), n, s_lastChain.frag.c_str() );
}

static bool sourceHasWalk( const std::string &path );

void EffectShader::resetChainWalk()
{
    // At most one of the stages A..D on a class that streams the picture into
    // an opening (tunnel, Droste zoom, log-polar spiral, pole stream), and that
    // one only every other time: with two or more nearly every roll of the flat
    // labs read as a tunnel.  A stage that gives its opening up moves to the
    // nearest class without one.  The half is decided from the rolled knob
    // itself (no draw from the scene's random stream), and the knobs are
    // constant for the whole activation, so this never shows as a jump.
    parseChainSource();
    for ( bool &b : m_walkCarried )
        b = false;
    carryChainOver();
    // a stage carried over keeps its class, opening or not (the lab going out obeyed the rule)
    bool opening = false;
    for ( int s = 0; s < 4; ++s )
        for ( Uniform *u : m_uniforms )
            if ( m_walkCarried[s] && u->getName() == kWalkKnob[s] && opensAt( s, u->snapshotValue() ) )
                opening = true;
    for ( int s = 0; s < 4; ++s )
        for ( Uniform *u : m_uniforms )
            if ( !m_walkCarried[s] && u->getName() == kWalkKnob[s] && opensAt( s, u->snapshotValue() ) )
            {
                const float h = u->snapshotValue() * 9173.13f;
                if ( opening || h - floorf( h ) < 0.5f )
                {
                    const float v = closedClass( s, u->snapshotValue() );
                    fprintf( stderr, "%s: stage %s %.3f -> %.3f (openings: at most one, half as often)\n",
                             fragmentName(), kWalkName[s], u->snapshotValue(), v );
                    u->restoreValue( v );
                }
                opening = true;
            }
    float morph = -1.f;
    for ( const Uniform *u : m_uniforms )
        if ( u->getName() == "morphP" )
            morph = u->snapshotValue();
    const bool host = m_walkHostLoc >= 0 || ( M_Headless && sourceHasWalk( m_fragmentShaderFilename ) );
    m_walk.active = ( host && morph >= ( !m_compileFile.empty() ? 0.15f : 0.5f ) );
    m_walkMorph = morph;
    // The ranges the preset entry allows (its <float> knob ranges): the walk
    // stays inside them.  The classes are sorted calm .. wild, so a range is a
    // character -- an Ambient lab walks only the calm part, a gallery lab only
    // the photo and the relief look.
    for ( int s = 0; s < WalkN; ++s )
    {
        float lo = 0.f, hi = 1.f;
        for ( const Uniform *u : m_uniforms )
            if ( u->getName() == kWalkKnob[s] && u->floatRange( lo, hi ) )
                break;
        m_walkLo[s] = lo < 0.f ? 0.f : ( lo > 1.f ? 1.f : lo );
        m_walkHi[s] = hi < m_walkLo[s] ? m_walkLo[s] : ( hi > 1.f ? 1.f : hi );
        m_seenPos[s] = -1;
    }
    // The labs keep off their poor rolls (17.10.2026): the 3D lab off worlds that show mostly haze or a fine-grained
    // carpet from its camera (worldPoorness(), structure stages 5..7), the flat labs off chains that turn the photo
    // into mush or a blur (chainPoorness(), stages A..D).  A poor roll moves one stage to another class in the
    // entry's range, tried in an order hashed from the rolled knobs (no draw from the scene's random stream): the
    // first roll clearly good (WorldClear, ChainClear), else the best one tried, if it is not poor.  (The first one
    // just below the line often still read as carpet.)  A chain stage never moves onto an opening (the rule above).
    {
        float    x[9] = {};
        Uniform *k[9] = {};
        for ( int s = 0; s <= 7; ++s )
            for ( Uniform *u : m_uniforms )
                if ( s != 4 && u->getName() == kWalkKnob[s] )
                {
                    k[s] = u;
                    x[s] = u->snapshotValue();
                }
        const float wp = worldPoorness( x ), cp = chainPoorness( x );
        const bool  world = wp > WorldLine; // which stages can help: the world's or the chain's
        if ( world || cp > ChainLine )
        {
            const float before = world ? wp : cp, clear = world ? WorldClear : ChainClear;
            float       rolled[9];
            for ( int s = 0; s < 9; ++s )
                rolled[s] = x[s];
            int   best_s = -1;
            float best_v = 0.f, best_p = world ? WorldLine : ChainLine;
            for ( int i = 1; i <= 120; ++i )
            {
                const int s = world ? 5 + i % 3 : i % 4;
                if ( !k[s] || m_walkCarried[s] || m_walkHi[s] <= m_walkLo[s] )
                    continue;
                const float h = sinf( rolled[0] * 17.3f + rolled[1] * 41.9f + rolled[2] * 23.1f + rolled[3] * 11.7f +
                                      rolled[5] * 127.1f + rolled[6] * 311.7f + rolled[7] * 74.7f +
                                      static_cast<float>( i ) * 12.9898f ) *
                                43758.5453f;
                const float v = m_walkLo[s] + ( m_walkHi[s] - m_walkLo[s] ) * ( h - floorf( h ) );
                x[s] = v < 0.999f ? v : 0.999f;
                const float p = ( s < 4 && opensAt( s, x[s] ) ) ? 1.f : ( world ? worldPoorness( x ) : chainPoorness( x ) );
                if ( p < best_p )
                {
                    best_s = s;
                    best_v = x[s];
                    best_p = p;
                }
                x[s] = rolled[s];
                if ( best_p < clear )
                    break;
            }
            if ( best_s >= 0 )
            {
                fprintf( stderr, "%s: stage %s %.3f -> %.3f (a poor %s, %.2f -> %.2f)\n", fragmentName(),
                         kWalkName[best_s], rolled[best_s], best_v,
                         world ? "world: haze or carpet" : "chain: mush or blur", before, best_p );
                k[best_s]->restoreValue( best_v );
            }
        }
    }
    m_seenValid = false;
    m_specOff = false;
    m_specWait = 0.f;
    for ( int s = 0; s < WalkN; ++s )
    {
        float v = 0.f;
        for ( const Uniform *u : m_uniforms )
            if ( u->getName() == kWalkKnob[s] )
                v = u->snapshotValue();
        v = v < 0.f ? 0.f : ( v > 0.999f ? 0.999f : v );
        m_walk.x0[s] = m_walk.x1[s] = v;
        m_walk.f[s] = 0.f;
        m_walk.fading[s] = false;
        m_walk.hold[s] = 9.f * static_cast<float>( s ); // staggered: the stages come due one after another
    }
    m_walk.lastSection = m_walk.lastDrop = -1;
    m_walk.rest = 0.f;
    m_walk.lastPhrase = -1.f;
    m_walk.phraseN = 0;
    m_walk.energy = 0.5f;
    m_walk.harmCool = 8.f;
    m_walk.sectionLook.clear();
    m_walk.hasLast = false;
    m_walk.rng.seed( static_cast<unsigned>( rand() ) + 1u );
    m_walk.tiltA = m_walk.tiltTarget = 6.2831853f * static_cast<float>( m_walk.rng() % 10000u ) / 10000.f;
    m_walk.sectionTilt.clear();
}

void EffectShader::startWalk( int s, float target, float dur )
{
    if ( m_walk.fading[s] || ( m_walkLoc[s] < 0 && s != 0 ) )
        return;
    // The shader mixes two whole 3D worlds while a structure stage fades: one at a time.
    if ( isStructure( s ) )
        for ( int o = 5; o <= 7; ++o )
            if ( m_walk.fading[o] )
                return;
    m_walk.x1[s] = target < 0.f ? 0.f : ( target > 0.999f ? 0.999f : target );
    // The same on the walk: a stage fades to a class with an opening only every
    // other time, and only while no other stage shows one or is fading to one.
    if ( s < 4 && opensAt( s, m_walk.x1[s] ) )
    {
        bool other = std::uniform_real_distribution<float>( 0.f, 1.f )( m_walk.rng ) < 0.5f;
        for ( int o = 0; o < 4; ++o )
            if ( o != s && ( opensAt( o, m_walk.x0[o] ) || ( m_walk.fading[o] && opensAt( o, m_walk.x1[o] ) ) ) )
                other = true;
        if ( other )
            m_walk.x1[s] = closedClass( s, m_walk.x1[s] );
    }
    m_walk.f[s] = 0.f;
    // dur is given at 120 BPM; with a steady beat it becomes the same number
    // of beats at the real tempo (so a fade spans whole bars of this song).
    const float bpm = 40.f + 160.f * m_lastAudioForBake.estimatedBPM;
    if ( m_lastAudioForBake.estimatedBPM > 0.01f && m_lastAudioForBake.rhythmStrength > 0.35f )
        dur = floorf( dur * 2.f + 0.5f ) * 60.f / bpm; // beats at 120 BPM -> seconds now
    m_walk.fadeDur[s] = dur > 0.3f ? dur : 0.3f;
    m_walk.fading[s] = true;
    fprintf( stderr, "WALK %s stage %s: %.3f -> %.3f, %.1f s at music speed %.2f\n", fragmentName(), kWalkName[s],
             m_walk.x0[s], m_walk.x1[s], m_walk.fadeDur[s], m_walk.rate );
}

static int classPos( float x, int n );

void EffectShader::stepChainWalk( const AudioFeatures &audio )
{
    // With score cues the generator says where the sections and drops are (as it
    // does for the scheduler): the walk counts those.  A cue section has no id.
    AudioFeatures cued;
    if ( M_CueLive )
    {
        cued = audio;
        cued.sectionCount = M_CueSections;
        cued.dropCount = M_CueDrops;
        cued.sectionId = -1;
        cued.sectionKnown = false;
    }
    const AudioFeatures &f = M_CueLive ? cued : audio;
    if ( m_walkProg != m_shProgId )
    {
        m_walkProg = m_shProgId;
        for ( int s = 0; s < WalkN; ++s )
            m_walkLoc[s] = glGetUniformLocation( m_shProgId, kWalkUni[s] );
        m_walkHostLoc = glGetUniformLocation( m_shProgId, "walkHost" );
        m_tiltALoc = glGetUniformLocation( m_shProgId, "tiltA" );
        if ( !m_walkProgSwap ) // a variant switch is not a new activation
            m_walk.pending = true;
        m_walkProgSwap = false;
    }
    if ( m_walkHostLoc < 0 )
        return; // not a chain lab
    if ( m_walk.pending )
    {
        m_walk.pending = false;
        resetChainWalk();
    }
    glUniform1f( m_walkHostLoc, m_walk.active ? 1.f : 0.f );
    // what is on screen now, for a lab coming in after this one (carryChainOver)
    s_lastChain.who = this;
    s_lastChain.frag = fragmentName();
    s_lastChain.when = EngineClock::now();
    s_lastChain.cls.clear();
    // The viewer's memory of the classes (M_ClassSeen, read by classNoveltyAt()):
    // every class on screen is stamped with the wall clock, one that has just
    // come at once and the others every 30 s while they stay.  Only where the
    // host knows what is shown: a walking lab or a fixed chain (the shader's
    // own one-stage walk, morphP 0.15 .. 0.5, shows a class the host does not know).
    const auto   steady_now = EngineClock::now();
    const double wall_now = EngineClock::epochSeconds();
    const bool   seen_known = m_walk.active || m_walkMorph < 0.15f;
    const bool   seen_all = !m_seenValid || steady_now - m_seenAt > std::chrono::seconds( 30 );
    for ( int s = 0; s < WalkN; ++s )
    {
        auto n = m_chainClasses.find( kWalkKnob[s] );
        if ( n == m_chainClasses.end() || n->second.empty() || ( m_walk.active && m_walkLoc[s] < 0 ) )
            continue;
        auto c = m_chainConsts.find( kWalkKnob[s] );
        bool rolled = false; // the lab has this knob at all (the class lists are shared)
        for ( const Uniform *u : m_uniforms )
            if ( u->getName() == kWalkKnob[s] )
                rolled = true;
        if ( !rolled && c == m_chainConsts.end() )
            continue;
        const float x = c != m_chainConsts.end()                     ? c->second
                        : ( m_walk.fading[s] && m_walk.f[s] > 0.5f ) ? m_walk.x1[s]
                                                                     : m_walk.x0[s];
        const int   cnt = static_cast<int>( n->second.size() ), k = classPos( x, cnt );
        const float sub = x * cnt - static_cast<float>( k );
        s_lastChain.cls[kWalkKnob[s]] = { n->second[k], sub < 0.f ? 0.f : ( sub > 0.99f ? 0.99f : sub ) };
        if ( seen_known && ( seen_all || k != m_seenPos[s] ) )
        {
            const std::string key = classTasteKey( kWalkKnob[s], n->second[k] );
            M_ClassSeen[key] = wall_now;
            M_ClassSeenDirty.insert( key );
            m_seenPos[s] = k;
        }
    }
    if ( seen_known && seen_all )
    {
        m_seenAt = steady_now;
        m_seenValid = true;
    }
    if ( !m_walk.active )
        return;

    const auto now = EngineClock::now();
    float      dt = m_walk.hasLast ? std::chrono::duration<float>( now - m_walk.last ).count() : 0.f;
    if ( M_Frozen )
        dt = 0.f; // VJ freeze / comparison run: no walk either
    m_walk.last = now;
    m_walk.hasLast = true;
    if ( dt > 0.25f )
        dt = 0.016f; // back from a pause: no catch-up leap

    // Energy: arousal smoothed over ~8 s -- it picks the region of each class.
    m_walk.energy += ( f.arousal - m_walk.energy ) * ( dt / 8.f < 1.f ? dt / 8.f : 1.f );
    const float E = m_walk.energy;
    // Music time: the short-term energy and the flux set how fast fades and
    // holds run (a quiet passage lets a fade crawl, a burst rushes it).
    m_walk.energyFast += ( f.arousal - m_walk.energyFast ) * ( dt < 1.f ? dt : 1.f );
    m_walk.fluxS += ( f.spectralFlux - m_walk.fluxS ) * ( dt * 2.f < 1.f ? dt * 2.f : 1.f );
    {
        // a build-up hurries the walk toward the drop
        float r = 0.35f + 0.9f * m_walk.energyFast + 1.2f * m_walk.fluxS + 0.8f * f.buildUp;
        m_walk.rate = r < 0.25f ? 0.25f : ( r > 2.5f ? 2.5f : r );
    }
    std::uniform_real_distribution<float> uni( 0.f, 1.f );
    // A target on the calm..energetic scale of the classes, with some spread.
    // (a build-up pulls the targets toward the energetic end)  The spread is
    // wider in calm music, which otherwise kept to a handful of classes for
    // hours, and a target past either end is reflected back: clamped, a drone
    // put a fifth of all its targets on the first class ('none').
    const float Eb = E + 0.3f * f.buildUp < 1.f ? E + 0.3f * f.buildUp : 1.f;
    const float spread = 0.25f + 0.15f * ( 1.f - Eb );
    auto        pick = [&]()
    {
        float v = 0.08f + 0.84f * Eb + ( uni( m_walk.rng ) - 0.5f ) * 2.f * spread;
        v = v < 0.f ? -v : ( v > 1.f ? 2.f - v : v );
        return v < 0.f ? 0.f : ( v > 1.f ? 1.f : v );
    };
    // Taste and novelty: of three such targets for stage s -- mapped into the
    // range the preset entry allows for it (walkTarget) -- one with odds after
    // its class's learnt taste (classTaste) times its novelty (classNoveltyAt:
    // a class seen minutes ago is five times less likely than one not seen for
    // six hours).  With equal weights that is the same as one target.
    auto pick_one = [&]( int s )
    {
        float c[3], w[3], sum = 0.f;
        for ( int i = 0; i < 3; ++i )
        {
            c[i] = walkTarget( pick(), m_walkLo[s], m_walkHi[s] );
            w[i] = classTaste( s, c[i] ) * classNoveltyAt( s, c[i], wall_now );
            sum += w[i];
        }
        float r = uni( m_walk.rng ) * sum;
        for ( int i = 0; i < 2; ++i )
        {
            if ( r < w[i] )
                return c[i];
            r -= w[i];
        }
        return c[2];
    };
    // The labs walk only to good rolls (worldPoorness() up to WorldLine, chainPoorness() up to ChainLine): a
    // structure or chain target that would make a poor one is drawn again, a dozen times at most.
    auto pick_for = [&]( int s )
    {
        float v = pick_one( s );
        if ( s == 4 || s > 7 )
            return v;
        float x[9];
        for ( int o = 0; o < 9; ++o )
            x[o] = m_walk.x0[o];
        for ( int i = 0; i < 12; ++i )
        {
            x[s] = v;
            if ( isStructure( s ) ? worldPoorness( x ) <= WorldLine : chainPoorness( x ) <= ChainLine )
                break;
            v = pick_one( s );
        }
        return v;
    };
    auto lerp = []( float a, float b, float t )
    { return a + ( b - a ) * t; };
    auto any_fading = [&]()
    { for( bool b : m_walk.fading ) if( b ) return true; return false; };

    // adopt the counters at the start, and silently whenever the score cues come
    // or go: the two count apart, and the switch itself is no section
    if ( m_walk.lastSection < 0 || M_CueLive != m_walk.cueLive )
    {
        m_walk.lastSection = f.sectionCount;
        m_walk.lastDrop = f.dropCount;
        m_walk.cueLive = M_CueLive;
    }

    // 1. A new section: a new global map (often a new look too); a RETURNING
    //    section walks every stage back to the look it had the first time.
    if ( f.sectionCount != m_walk.lastSection )
    {
        m_walk.lastSection = f.sectionCount;
        auto it = m_walk.sectionLook.find( f.sectionId );
        if ( f.sectionKnown && f.sectionId >= 0 && it != m_walk.sectionLook.end() )
        {
            for ( int s = 0; s < WalkN; ++s )
                if ( fabsf( it->second[s] - m_walk.x0[s] ) > 1e-4f )
                    startWalk( s, it->second[s], 4.f );
        }
        else
        {
            startWalk( 0, pick_for( 0 ), 4.f );
            if ( uni( m_walk.rng ) < 0.5f )
                startWalk( 4, pick_for( 4 ), 6.f );
            // ... and in the 3D lab often a new space or fold core: the world itself turns.
            if ( uni( m_walk.rng ) < 0.6f )
            {
                const int s = 5 + static_cast<int>( m_walk.rng() % 2u );
                startWalk( s, pick_for( s ), lerp( 14.f, 8.f, E ) );
            }
        }
        if ( f.sectionId >= 0 )
        {
            std::array<float, 9> look;
            for ( int s = 0; s < WalkN; ++s )
                look[s] = m_walk.fading[s] ? m_walk.x1[s] : m_walk.x0[s];
            m_walk.sectionLook[f.sectionId] = look;
            // the time tilt turns to the section's own direction (a new one: a clear turn)
            auto       tl = m_walk.sectionTilt.find( f.sectionId );
            const bool back = f.sectionKnown && tl != m_walk.sectionTilt.end();
            if ( back )
                m_walk.tiltTarget = tl->second;
            else
                m_walk.sectionTilt[f.sectionId] = m_walk.tiltTarget = m_walk.tiltA + 1.2f + 2.5f * uni( m_walk.rng );
            fprintf( stderr, "TILT %s section %d: %.2f rad (%s)\n", fragmentName(), f.sectionId,
                     fmodf( m_walk.tiltTarget, 6.2831853f ), back ? "its own again" : "new" );
        }
        else
        {
            // a section without an id (a score cue: CueReceiver rolls those fresh) turns the tilt too, without memory
            m_walk.tiltTarget = m_walk.tiltA + 1.2f + 2.5f * uni( m_walk.rng );
            fprintf( stderr, "TILT %s section (no id): %.2f rad (new)\n", fragmentName(),
                     fmodf( m_walk.tiltTarget, 6.2831853f ) );
        }
    }
    // The tilt's direction eases toward the section's (shortest way round, ~4 s).
    {
        float d = fmodf( m_walk.tiltTarget - m_walk.tiltA + 3.14159265f, 6.2831853f );
        if ( d < 0.f )
            d += 6.2831853f;
        m_walk.tiltA += ( d - 3.14159265f ) * ( dt / 4.f < 1.f ? dt / 4.f : 1.f );
        if ( m_tiltALoc >= 0 )
            glUniform1f( m_tiltALoc, m_walk.tiltA );
    }
    // 2. A drop: the frame, the warp and the look turn fast (about a bar).
    if ( f.dropCount != m_walk.lastDrop )
    {
        m_walk.lastDrop = f.dropCount;
        startWalk( 0, pick_for( 0 ), 2.f );
        startWalk( 3, pick_for( 3 ), 1.5f );
        startWalk( 4, pick_for( 4 ), 1.5f );
    }
    // The rest after a walk (set where the last fade ends, below): in calm
    // music the chain stands for a while before the next change -- a drone
    // kept a fade running nearly all the time.  Sections and drops do not wait.
    m_walk.rest -= dt;
    const bool resting = m_walk.rest > 0.f;
    // 3. A harmonic change: the symmetry or the second map.
    m_walk.harmCool -= dt;
    if ( !any_fading() && !resting && m_walk.harmCool <= 0.f && f.harmonicChange > 0.55f )
    {
        const int s = 1 + static_cast<int>( m_walk.rng() % 2u );
        startWalk( s, pick_for( s ), lerp( 8.f, 4.f, E ) );
        m_walk.harmCool = 12.f;
    }
    // 4. Phrases (with a steady beat): every 8-bar boundary moves the chain
    //    on -- alternately a new VARIANT of one transform (the same class with
    //    other mirrors, arms, lattice: the transform itself morphs) and a new
    //    transform for the stage held longest.  The fade spans two bars.
    const bool steady = f.estimatedBPM > 0.01f && f.rhythmStrength > 0.35f;
    const bool phrase_turn = steady && m_walk.lastPhrase >= 0.f && f.phrasePos + 0.5f < m_walk.lastPhrase;
    m_walk.lastPhrase = f.phrasePos;
    if ( phrase_turn && getenv( "KALEIDO_SPEC_LOG" ) )
        fprintf( stderr, "PHRASE turn (fading: %s)\n", any_fading() ? "yes" : "no" );
    // When a stage is due: its hold against its share of the music's pace (the
    // look holds longer than the chain, the 3D structure longer still).
    auto due_ratio = [&]( int s )
    {
        return m_walk.hold[s] / ( lerp( 70.f, 30.f, E ) * ( s == 4 ? 1.6f : ( isStructure( s ) ? 1.4f : 1.f ) ) );
    };
    // 3D lab, steady beat: a structure stage that is due waits for the next
    // phrase boundary.  Its target is picked now and its geometry forged
    // meanwhile, so the new program's first draw (25-35 ms when it is new to
    // this session) falls on the boundary, not into a running phrase.
    int struct_due = -1;
    if ( m_chain3D && steady && !any_fading() )
    {
        float best = 1.f;
        for ( int s = 5; s <= 7; ++s )
            if ( m_walkLoc[s] >= 0 && due_ratio( s ) >= best )
            {
                best = due_ratio( s );
                struct_due = s;
            }
    }
    if ( struct_due >= 0 )
    {
        if ( !m_walk.hasNext[struct_due] )
        {
            m_walk.next[struct_due] = pick_for( struct_due );
            m_walk.hasNext[struct_due] = true;
        }
        float x1[9];
        bool  fd[9];
        for ( int o = 0; o < WalkN; ++o )
        {
            x1[o] = m_walk.fading[o] ? m_walk.x1[o] : m_walk.x0[o];
            fd[o] = m_walk.fading[o];
        }
        x1[struct_due] = m_walk.next[struct_due];
        fd[struct_due] = true;
        geomProgram( m_walk.x0, x1, fd ); // queued on the helper; loaded, not yet drawn
    }
    if ( phrase_turn && !any_fading() && !resting && struct_due >= 0 )
    {
        startWalk( struct_due, m_walk.next[struct_due], lerp( 14.f, 8.f, E ) );
        m_walk.hasNext[struct_due] = false;
    }
    else if ( phrase_turn && !any_fading() && !resting )
    {
        ++m_walk.phraseN;
        if ( m_walk.phraseN % 2 == 1 )
        {
            int cand[4], nc = 0; // stages A..D that show a transform (not 'none')
            for ( int s = 0; s < 4; ++s )
            {
                auto it = m_chainClasses.find( kWalkKnob[s] );
                if ( m_walkLoc[s] < 0 || it == m_chainClasses.end() || it->second.empty() )
                    continue;
                if ( it->second[classPos( m_walk.x0[s], static_cast<int>( it->second.size() ) )] != "none" )
                    cand[nc++] = s;
            }
            if ( nc > 0 )
            {
                const int s = cand[m_walk.rng() % static_cast<unsigned>( nc )];
                const int n = static_cast<int>( m_chainClasses[kWalkKnob[s]].size() );
                const int k = classPos( m_walk.x0[s], n );
                startWalk( s, ( static_cast<float>( k ) + 0.05f + 0.9f * uni( m_walk.rng ) ) / static_cast<float>( n ),
                           4.f );
            }
        }
        else
        {
            int   best = -1;
            float bh = -1.f;
            for ( int s = 0; s <= 4; ++s ) // A..D and the look
                if ( m_walkLoc[s] >= 0 && m_walk.hold[s] > bh )
                {
                    bh = m_walk.hold[s];
                    best = s;
                }
            if ( best >= 0 )
                startWalk( best, pick_for( best ), 4.f );
        }
    }
    // 5. Otherwise the stage held longest walks when its time is up (sooner
    //    the more energy; the look holds longer than the chain).
    for ( int s = 0; s < WalkN; ++s )
        if ( !m_walk.fading[s] )
            m_walk.hold[s] += dt * m_walk.rate;
    if ( !any_fading() && !resting )
    {
        int   best = -1;
        float best_r = 1.f;
        for ( int s = 0; s < WalkN; ++s )
        {
            if ( m_walkLoc[s] < 0 )
                continue; // stage absent in this shader
            const float r = due_ratio( s );
            if ( m_chain3D && isStructure( s ) && steady && r < 1.5f )
                continue; // waits for a phrase boundary (above)
            if ( r >= best_r )
            {
                best_r = r;
                best = s;
            }
        }
        if ( best >= 0 )
            startWalk( best, pick_for( best ), isStructure( best ) ? lerp( 14.f, 8.f, E ) : lerp( 10.f, 5.f, E ) );
    }

    // Specialised variant (specDefines): while one is bound, a fade waits at
    // 0 % until the variant with its target is bound, and at 100 % until the
    // one after it is.  The wanted variant is requested after the fades moved
    // on (below the loop) and bound at the start of the next frame.
    // EXPERIMENTAL, off by default (KALEIDO_SPEC=1): a new variant costs a
    // 0.8-1.8 s stall on the NVIDIA driver (its compile blocks the render
    // thread even from a worker context) -- see docs/leistung-2026-10-01.md.
    static const bool SpecEnabled = getenv( "KALEIDO_SPEC" ) != 0;
    const bool spec_on = SpecEnabled && !m_specOff && !m_chainOrd.empty() && typeid( *this ) == typeid( EffectShader )
                         && ( m_walk.active || m_walkMorph < 0.15f );
    const bool        variant_bound = spec_on && !m_specBound.empty() && m_genericProg;
    const std::string want = variant_bound ? specDefines( m_walk.x0, m_walk.x1, m_walk.fading ) : std::string();
    bool              held = false;

    // Advance the fades and upload: (shown, target, progress) per stage.
    for ( int s = 0; s < WalkN; ++s )
    {
        if ( m_walk.fading[s] )
        {
            // 3D lab: a structure fade waits at 0 % for the geometry variant with both worlds
            if ( m_chain3D && isStructure( s ) && m_walk.f[s] <= 0.f && m_geomWait < 8.f
                 && !geomProgram( m_walk.x0, m_walk.x1, m_walk.fading ) )
            {
                m_geomWait += dt;
                goto upload;
            }
            // a bound variant without this fade's target: wait at 0 %
            if ( variant_bound && m_walk.f[s] <= 0.f && want != m_specBound )
            {
                held = true;
                goto upload;
            }
            m_walk.f[s] += dt * m_walk.rate / m_walk.fadeDur[s]; // music time: never backwards, never a jump
            if ( m_chain3D && isStructure( s ) && m_walk.f[s] >= 1.f && steady && !phrase_turn
                 && m_walk.endHold < 24.f )
            {
                // The fade's own geometry already shows the new world (f = 1): it
                // stays until the next phrase boundary, where the world's own
                // program (forged meanwhile) takes over -- its first draw on the beat.
                m_walk.f[s] = 1.f;
                m_walk.endHold += dt;
                float x0[9];
                bool  fd[9];
                for ( int o = 0; o < WalkN; ++o )
                {
                    x0[o] = m_walk.x0[o];
                    fd[o] = m_walk.fading[o];
                }
                x0[s] = m_walk.x1[s];
                fd[s] = false;
                geomProgram( x0, m_walk.x1, fd );
                goto upload;
            }
            if ( m_chain3D && isStructure( s ) && m_walk.f[s] >= 1.f && m_geomWait < 8.f )
            {
                // ... and at 100 % for the variant of the world after it
                float x0[9];
                bool  fd[9];
                for ( int o = 0; o < WalkN; ++o )
                {
                    x0[o] = m_walk.x0[o];
                    fd[o] = m_walk.fading[o];
                }
                x0[s] = m_walk.x1[s];
                fd[s] = false;
                if ( !geomProgram( x0, m_walk.x1, fd ) )
                {
                    m_walk.f[s] = 1.f;
                    m_geomWait += dt;
                    goto upload;
                }
            }
            if ( m_chain3D && isStructure( s ) )
                m_geomWait = 0.f;
            if ( m_walk.f[s] >= 1.f && variant_bound )
            {
                // the state after this fade needs its own variant: wait at 100 %
                float x0[9];
                bool  fd[9];
                for ( int o = 0; o < WalkN; ++o )
                {
                    x0[o] = m_walk.x0[o];
                    fd[o] = m_walk.fading[o];
                }
                x0[s] = m_walk.x1[s];
                fd[s] = false;
                const std::string after = specDefines( x0, m_walk.x1, fd );
                if ( !after.empty() && after != m_specBound )
                {
                    m_walk.f[s] = 1.f;
                    held = true;
                    auto   it = m_specProgs.find( after );
                    GLuint prog = it != m_specProgs.end() ? it->second : 0;
                    if ( !prog && shaderVariantStart( m_fragmentShaderFilename.c_str(), after ) )
                    {
                        prog = shaderVariantTake( m_fragmentShaderFilename.c_str(), after );
                        if ( prog )
                            m_specProgs[after] = prog;
                    }
                    if ( prog && m_specNextKey != after )
                    {
                        m_specNext = prog;
                        m_specNextKey = after;
                    }
                    goto upload;
                }
            }
            if ( m_walk.f[s] >= 1.f )
            {
                m_walk.x0[s] = m_walk.x1[s];
                m_walk.f[s] = 0.f;
                m_walk.fading[s] = false;
                m_walk.hold[s] = 0.f;
                m_walk.endHold = 0.f;
                // the rest before the next walk: ~22 s in a drone, a second at full energy
                m_walk.rest = 24.f * ( 1.f - E ) * ( 1.f - E );
            }
        }
    upload:
        if ( m_walkLoc[s] >= 0 )
            glUniform3f( m_walkLoc[s], m_walk.x0[s], m_walk.fading[s] ? m_walk.x1[s] : m_walk.x0[s],
                         m_walk.fading[s] ? m_walk.f[s] : 0.f );
    }
    // The variant for the state the fades left: start its build, bind it at
    // the start of the next frame (unless a 100 % hold already asked for one).
    if ( spec_on )
    {
        const std::string cur = specDefines( m_walk.x0, m_walk.x1, m_walk.fading );
        if ( !cur.empty() && cur != m_specBound && m_specNextKey.empty() )
        {
            auto              it = m_specProgs.find( cur );
            GLuint            prog = it != m_specProgs.end() ? it->second : 0;
            static const bool SpecLog = getenv( "KALEIDO_SPEC_LOG" ) != 0;
            if ( !prog && SpecLog && m_specProgs.find( cur ) == m_specProgs.end() )
                fprintf( stderr, "SPEC want %zu bytes\n", cur.size() );
            const auto t_s0 = std::chrono::steady_clock::now();
            const bool started = !prog && shaderVariantStart( m_fragmentShaderFilename.c_str(), cur );
            const auto t_s1 = std::chrono::steady_clock::now();
            if ( started )
            {
                prog = shaderVariantTake( m_fragmentShaderFilename.c_str(), cur );
                if ( SpecLog )
                {
                    const auto   t_s2 = std::chrono::steady_clock::now();
                    const double a = std::chrono::duration<double, std::milli>( t_s1 - t_s0 ).count();
                    const double b = std::chrono::duration<double, std::milli>( t_s2 - t_s1 ).count();
                    if ( a > 5.0 || b > 5.0 )
                        fprintf( stderr, "SPEC start %.1f ms  take %.1f ms\n", a, b );
                }
                if ( prog )
                    m_specProgs[cur] = prog;
                else if ( shaderVariantFailed( m_fragmentShaderFilename.c_str(), cur ) )
                {
                    m_specOff = true;
                    m_specRevert = true;
                }
            }
            if ( prog )
            {
                m_specNext = prog;
                m_specNextKey = cur;
            }
        }
        if ( !cur.empty() )
        {
            m_specLru.erase( std::remove( m_specLru.begin(), m_specLru.end(), cur ), m_specLru.end() );
            m_specLru.push_back( cur );
            while ( m_specLru.size() > 12 ) // keep a dozen variants per lab
            {
                const std::string old = m_specLru.front();
                m_specLru.erase( m_specLru.begin() );
                auto it = m_specProgs.find( old );
                if ( it != m_specProgs.end() && old != m_specBound && old != m_specNextKey )
                {
                    shaderProgramRelease( it->second );
                    m_specProgs.erase( it );
                }
            }
        }
    }
    else if ( m_genericProg )
        m_specRevert = true;
    // A variant that keeps a fade waiting for more than 4 s (a slow driver):
    // back to the generic program for the rest of this activation.
    m_specWait = held ? m_specWait + dt : 0.f;
    if ( m_specWait > 4.f )
    {
        fprintf( stderr, "%s: specialised variant too slow, generic program\n", fragmentName() );
        m_specOff = true;
        m_specRevert = true;
        m_specWait = 0.f;
    }
}

// ---- Chain runner ----------------------------------------------------------
extern GLuint fullscreenVAO();
namespace
{
/** One pass shader of the chain runner: its program and the locations of its uniforms. */
struct PassProg
{
    GLuint prog = 0; ///< The linked program.
    /** @name Uniform locations
     *  @{ */
    /** Location of one uniform in prog (passProg() names the uniform of each); -1 where the shader lacks it. */
    GLint texIn = -1, texB = -1, firstPass = -1, subV = -1, mixF = -1, chainOff = -1, bakeSize = -1, texStart = -1,
          useStart = -1, res = -1, sceneTime = -1, adv = -1, phase = -1, spread = -1, speed = -1, tilt = -1, swell = -1,
          scale = -1, tiltA = -1, walkHost = -1;
    /** @} */
};
std::map<std::string, PassProg> s_passProgs;            ///< pass shader file -> program and locations
std::vector<std::string>        s_passWarm;             ///< pass files still to build in the background
bool                            s_passWarmInit = false; ///< Whether s_passWarm was filled (once per session)

/**  The file of one pass shader.
 *
 * @param stage   Walk stage, 'A' to 'D'. (in)
 * @param branch  Branch of that stage. (in)
 *
 * @return
 *   The path, Engine/ChainPass/A3.frag for stage 'A', branch 3 (relative to the run directory, Windows separators).
 **/
std::string passFile( char stage, int branch )
{
    char b[64];
    snprintf( b, sizeof b, "..\\Engine\\ChainPass\\%c%d.frag", stage, branch );
    return b;
}

/**  The program and uniform locations of a pass shader, looked up once and then cached in s_passProgs.
 *
 * @param file  Path of the pass shader. (in)
 *
 * @return
 *   The cached entry.
 *
 * The program comes from setShaders(), a cache hit once warmPasses() had it built in the background.
 *
 * @sideeffects
 *   Changes s_passProgs.
 **/
const PassProg &passProg( const std::string &file )
{
    auto it = s_passProgs.find( file );
    if ( it != s_passProgs.end() )
        return it->second;
    PassProg p;
    p.prog = setShaders( nullptr, file.c_str() ); // a cache hit once the background build is done
    p.texIn = glGetUniformLocation( p.prog, "texIn" );
    p.texB = glGetUniformLocation( p.prog, "texB" );
    p.firstPass = glGetUniformLocation( p.prog, "firstPass" );
    p.subV = glGetUniformLocation( p.prog, "subV" );
    p.mixF = glGetUniformLocation( p.prog, "mixF" );
    p.chainOff = glGetUniformLocation( p.prog, "chainOff" );
    p.bakeSize = glGetUniformLocation( p.prog, "bakeSize" );
    p.texStart = glGetUniformLocation( p.prog, "texStart" );
    p.useStart = glGetUniformLocation( p.prog, "useStart" );
    p.res = glGetUniformLocation( p.prog, "resolution" );
    p.sceneTime = glGetUniformLocation( p.prog, "sceneTime" );
    p.adv = glGetUniformLocation( p.prog, "audioAdvance" );
    p.phase = glGetUniformLocation( p.prog, "audioPhase" );
    p.spread = glGetUniformLocation( p.prog, "audioSpread" );
    p.speed = glGetUniformLocation( p.prog, "speedP" );
    p.tilt = glGetUniformLocation( p.prog, "tiltP" ); // the time tilt (chainTiltZ), 0 in labs without it
    p.swell = glGetUniformLocation( p.prog, "audioSwell" );
    p.scale = glGetUniformLocation( p.prog, "passScale" ); // the pass grid relative to the frame
    p.tiltA = glGetUniformLocation( p.prog, "tiltA" );     // the tilt's direction while walking
    p.walkHost = glGetUniformLocation( p.prog, "walkHost" );
    return s_passProgs[file] = p;
}
/**  Pass shaders built in the background a few at a time, once per session (every chain runner lab, each frame).
 *
 * @param ord     The lab's stage orders ("// @chainord"); their branches are the passes to build. (in,out)
 * @param with3D  Whether the 3D passes are wanted as well. (in)
 *
 * @sideeffects
 *   Changes s_passWarmInit.
 **/
void warmPasses( std::map<std::string, std::vector<int>> &ord, bool with3D )
{
    static const char Stage[4] = { 'A', 'B', 'C', 'D' };
    if ( !s_passWarmInit )
    {
        s_passWarmInit = true;
        for ( int s = 0; s < 4; ++s )
            for ( int b : ord[kWalkKnob[s]] )
                s_passWarm.push_back( passFile( Stage[s], b ) );
        s_passWarm.push_back( "..\\Engine\\ChainPass\\Id.frag" );
        s_passWarm.push_back( "..\\Engine\\ChainPass\\Mix.frag" );
        s_passWarm.push_back( "..\\Engine\\ChainPass\\Fallback.frag" );
    }
    static bool with_3d_done = false;
    if ( with3D && !with_3d_done )
    {
        with_3d_done = true;
        s_passWarm.push_back( "..\\Engine\\ChainPass\\Start3D.frag" ); // popped from the back: first
    }
    // A trickle, not a flood: collecting a finished build still blocks 5-15 ms
    // on NVIDIA (shaderPrebuildPoll), and 120 at once held the lab's first
    // seconds at 17-90 fps.  One every 150 ms costs one slightly long frame in
    // twenty; a class the walk needs before its turn is built on use.
    static auto last_start = std::chrono::steady_clock::time_point();
    const auto  now = std::chrono::steady_clock::now();
    if ( shaderPrebuildPoll() == 0 && !s_passWarm.empty() && now - last_start > std::chrono::milliseconds( 150 ) )
    {
        last_start = now;
        const std::string w = s_passWarm.back();
        s_passWarm.pop_back();
        if ( !shaderPrebuildStart( w.c_str() ) )
            s_passWarm.clear(); // no background compile: build on use
    }
}
/**  Hermite smoothstep from 0 to 1.
 *
 * @param x  The input; clamped to [0, 1] first. (in)
 *
 * @return
 *   3x^2 - 2x^3 of the clamped input.
 **/
float smooth01( float x )
{
    x = x < 0.f ? 0.f : ( x > 1.f ? 1.f : x );
    return x * x * ( 3.f - 2.f * x );
}
} // namespace

void EffectShader::runChainPasses( const AudioFeatures &f )
{
    static const char Stage[4] = { 'A', 'B', 'C', 'D' };
    static const int  Weak[4] = { 0, 2, 1, 2 }; // positions up to which a class barely changes the photo (gIdW in the
                                                // shader)
    parseChainSource();
    for ( int s = 0; s < 4; ++s )
        if ( m_chainOrd.find( kWalkKnob[s] ) == m_chainOrd.end() )
            return;
    const bool fixed_order = m_permCodes.size() != 24; // a lab without an order knob: A -> B -> C -> D

    warmPasses( m_chainOrd, false );
    retireIdleChains();

    // GL state this function changes, restored at the end.
    GLint vp[4], draw_fb = 0, read_fb = 0, active_tex = 0, vao = 0;
    glGetIntegerv( GL_VIEWPORT, vp );
    glGetIntegerv( 0x8CA6 /* GL_DRAW_FRAMEBUFFER_BINDING */, &draw_fb );
    glGetIntegerv( 0x8CAA /* GL_READ_FRAMEBUFFER_BINDING */, &read_fb );
    glGetIntegerv( 0x84E0 /* GL_ACTIVE_TEXTURE */, &active_tex );
    glGetIntegerv( 0x85B5 /* GL_VERTEX_ARRAY_BINDING */, &vao );
    const GLboolean blend = glIsEnabled( GL_BLEND ), depth = glIsEnabled( GL_DEPTH_TEST ),
                    scissor = glIsEnabled( GL_SCISSOR_TEST );

    // A coarser chain (chainScale < 1): the passes on a smaller grid, the last pass reads it bilinearly.
    // A finer one (2) while a class that sparkles is on screen: the last pass averages four photo samples
    // per pixel.  It switches with the walk's fades (on as one heads for such a class, off once none is shown).
    static const bool SsEnv = !( getenv( "KALEIDO_CHAIN_SS" ) && atoi( getenv( "KALEIDO_CHAIN_SS" ) ) == 0 );
    const bool        ss = m_chainBake <= 0 && M_ChainSS && SsEnv && M_ChainScale >= 0.999f && chainWantsSS();
    const float       cs = m_chainBake > 0 ? 1.f
                           : ss ? 2.f
                                : ( M_ChainScale < 0.5f ? 0.5f : ( M_ChainScale > 1.f ? 1.f : M_ChainScale ) );
    const int         W = m_chainBake > 0 ? m_chainBake : ( vp[2] > 0 ? static_cast<int>( ceilf( vp[2] * cs ) ) : 1 );
    const int         H = m_chainBake > 0 ? m_chainBake : ( vp[3] > 0 ? static_cast<int>( ceilf( vp[3] * cs ) ) : 1 );
    if ( W != m_cpW || H != m_cpH || !m_cpTex[0] )
    {
        if ( m_cpTex[0] )
        {
            glDeleteTextures( 5, m_cpTex );
            glDeleteFramebuffers( 5, m_cpFbo );
        }
        glGenTextures( 5, m_cpTex );
        glGenFramebuffers( 5, m_cpFbo );
        for ( int i = 0; i < 5; ++i )
        {
            glBindTexture( GL_TEXTURE_2D, m_cpTex[i] );
            glTexImage2D( GL_TEXTURE_2D, 0, GL_RG32F, W, H, 0, GL_RG, GL_FLOAT, nullptr );
            // baked: read bilinearly at any point of the mirrored square (passes use texelFetch)
            const GLint filt = m_chainBake > 0 ? GL_LINEAR : GL_NEAREST;
            const GLint wrap = m_chainBake > 0 ? 0x8370 /* GL_MIRRORED_REPEAT */ : GL_CLAMP_TO_EDGE;
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filt );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filt );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, wrap );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, wrap );
            glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[i] );
            glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_cpTex[i], 0 );
        }
        m_cpW = W;
        m_cpH = H;
    }
    glDisable( GL_BLEND );
    glDisable( GL_DEPTH_TEST );
    glDisable( GL_SCISSOR_TEST );
    glViewport( 0, 0, W, H );
    glBindVertexArray( fullscreenVAO() );

    float speed_p = 0.5f, tilt_p = 0.f;
    for ( const Uniform *u : m_uniforms )
    {
        if ( u->getName() == "speedP" )
            speed_p = u->snapshotValue();
        if ( u->getName() == "tiltP" )
            tilt_p = u->snapshotValue();
    }

    // One pass: `file` reads texture `in` (-1: start from the screen) [and `inB`], writes `out`.
    auto pass = [&]( const std::string &file, int in, int inB, int out, float subV, float mixF )
    {
        const PassProg &p = passProg( file );
        if ( !p.prog )
            return;
        glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[out] );
        glUseProgram( p.prog );
        glActiveTexture( GL_TEXTURE0 + 41 );
        glBindTexture( GL_TEXTURE_2D, in >= 0 ? m_cpTex[in] : glcoreDummyTex2D() );
        glActiveTexture( GL_TEXTURE0 + 42 );
        glBindTexture( GL_TEXTURE_2D, inB >= 0 ? m_cpTex[inB] : glcoreDummyTex2D() );
        if ( p.texIn >= 0 )
            glUniform1i( p.texIn, 41 );
        if ( p.texB >= 0 )
            glUniform1i( p.texB, 42 );
        if ( p.firstPass >= 0 )
            glUniform1i( p.firstPass, in < 0 ? 1 : 0 );
        if ( p.subV >= 0 )
            glUniform1f( p.subV, subV );
        if ( p.mixF >= 0 )
            glUniform1f( p.mixF, mixF );
        if ( p.chainOff >= 0 )
            glUniform2f( p.chainOff, m_chainBake > 0 ? 0.f : static_cast<float>( vp[0] ),
                         m_chainBake > 0 ? 0.f : static_cast<float>( vp[1] ) );
        if ( p.bakeSize >= 0 )
            glUniform1f( p.bakeSize, static_cast<float>( m_chainBake ) );
        if ( p.res >= 0 )
            glUniform2f( p.res, static_cast<float>( m_width ), static_cast<float>( m_height ) );
        if ( p.sceneTime >= 0 )
            glUniform1f( p.sceneTime, m_lastSceneTime );
        if ( p.adv >= 0 )
            glUniform1f( p.adv, f.audioAdvance );
        if ( p.phase >= 0 )
            glUniform1f( p.phase, f.audioRotPhase );
        if ( p.spread >= 0 )
            glUniform1f( p.spread, f.spectralSpread );
        if ( p.speed >= 0 )
            glUniform1f( p.speed, speed_p );
        if ( p.tilt >= 0 )
            glUniform1f( p.tilt, tilt_p );
        if ( p.swell >= 0 )
            glUniform1f( p.swell, f.swell );
        if ( p.scale >= 0 )
            glUniform1f( p.scale, cs );
        if ( p.tiltA >= 0 )
            glUniform1f( p.tiltA, m_walk.tiltA );
        if ( p.walkHost >= 0 )
            glUniform1f( p.walkHost, m_walk.active ? 1.f : 0.f );
        glDrawArrays( GL_TRIANGLES, 0, 3 );
    };
    unsigned busy = 0; // textures holding a result still needed
    auto     free_tex = [&]( unsigned also )
    { for( int i = 0; i < 5; ++i ) if( !( ( busy | also ) & ( 1u << i ) ) ) return i; return 0; };

    // The chain in one order; returns the texture holding its coordinate.
    auto run_order = [&]( int code ) -> int
    {
        int cur = -1;
        for ( int pos = 0; pos < 4; ++pos )
        {
            const int               s = ( code >> ( 2 * pos ) ) & 3;
            const std::vector<int> &ord = m_chainOrd[kWalkKnob[s]];
            const int               n = static_cast<int>( ord.size() );
            const float             x0 = m_walk.x0[s], x1 = m_walk.x1[s];
            const int               p0 = classPos( x0, n );
            const float v0 = ( x0 < 0.f ? 0.f : ( x0 > 0.9999f ? 0.9999f : x0 ) ) * n - static_cast<float>( p0 );
            const bool              fade = m_walk.active && m_walk.fading[s] && m_walk.f[s] > 0.f;
            const unsigned          keep = cur >= 0 ? ( 1u << cur ) : 0u;
            if ( !fade )
            {
                if ( p0 == 0 )
                    continue; // 'none': the next pass mirrors its input itself
                const int out = free_tex( keep );
                pass( passFile( Stage[s], ord[p0] ), cur, -1, out, v0, 0.f );
                cur = out;
                continue;
            }
            const int   p1 = classPos( x1, n );
            const float v1 = ( x1 < 0.f ? 0.f : ( x1 > 0.9999f ? 0.9999f : x1 ) ) * n - static_cast<float>( p1 );
            const int   ta = free_tex( keep );
            pass( p0 == 0 ? std::string( "..\\Engine\\ChainPass\\Id.frag" ) : passFile( Stage[s], ord[p0] ), cur, -1,
                  ta, v0, 0.f );
            const int tb = free_tex( keep | ( 1u << ta ) );
            pass( p1 == 0 ? std::string( "..\\Engine\\ChainPass\\Id.frag" ) : passFile( Stage[s], ord[p1] ), cur, -1,
                  tb, v1, 0.f );
            const int out = free_tex( ( 1u << ta ) | ( 1u << tb ) );
            pass( "..\\Engine\\ChainPass\\Mix.frag", ta, tb, out, 0.f, smooth01( m_walk.f[s] ) );
            cur = out;
        }
        if ( cur < 0 ) // every stage 'none'
        {
            cur = free_tex( 0 );
            pass( "..\\Engine\\ChainPass\\Id.frag", -1, -1, cur, 0.f, 0.f );
        }
        return cur;
    };

    auto order_code = [&]( float x )
    { return fixed_order ? 228 : m_permCodes[classPos( x, 24 )]; }; // 228: A, B, C, D
    int        res = run_order( order_code( m_walk.x0[8] ) );
    const bool order_fade = !fixed_order && m_walk.active && m_walk.fading[8] && m_walk.f[8] > 0.f
                            && classPos( m_walk.x1[8], 24 ) != classPos( m_walk.x0[8], 24 );
    if ( order_fade )
    {
        busy = 1u << res;
        const int res2 = run_order( order_code( m_walk.x1[8] ) );
        busy = 0;
        const int out = free_tex( ( 1u << res ) | ( 1u << res2 ) );
        pass( "..\\Engine\\ChainPass\\Mix.frag", res, res2, out, 0.f, smooth01( m_walk.f[8] ) );
        res = out;
    }
    // Never an empty chain: where the stages are 'none' or too weak, the calm lattice fades in.
    float w = 1.f;
    for ( int s = 0; s < 4; ++s )
    {
        const int n = static_cast<int>( m_chainOrd[kWalkKnob[s]].size() );
        const int p0 = classPos( m_walk.x0[s], n );
        if ( m_walk.active && m_walk.fading[s] && m_walk.f[s] > 0.f )
        {
            const float fs = smooth01( m_walk.f[s] );
            const int   p1 = classPos( m_walk.x1[s], n );
            w *= ( p0 <= Weak[s] ? 1.f - fs : 0.f ) + ( p1 <= Weak[s] ? fs : 0.f );
        }
        else
            w *= p0 <= Weak[s] ? 1.f : 0.f;
    }
    if ( w > 0.f )
    {
        const int out = free_tex( 1u << res );
        pass( "..\\Engine\\ChainPass\\Fallback.frag", res, -1, out, 0.f, w );
        res = out;
    }
    else if ( m_chainBake > 0 )
    {
        // baked coordinates are interpolated: store them mirrored (continuous)
        const int out = free_tex( 1u << res );
        pass( "..\\Engine\\ChainPass\\Id.frag", res, -1, out, 0.f, 0.f );
        res = out;
    }

    // Restore, and hand the result to the lab.
    glBindFramebuffer( 0x8CA9 /* GL_DRAW_FRAMEBUFFER */, draw_fb );
    glBindFramebuffer( 0x8CA8 /* GL_READ_FRAMEBUFFER */, read_fb );
    glViewport( vp[0], vp[1], vp[2], vp[3] );
    if ( blend )
        glEnable( GL_BLEND );
    if ( depth )
        glEnable( GL_DEPTH_TEST );
    if ( scissor )
        glEnable( GL_SCISSOR_TEST );
    glBindVertexArray( static_cast<GLuint>( vao ) );
    glUseProgram( m_shProgId );
    glActiveTexture( GL_TEXTURE0 + 40 );
    glBindTexture( GL_TEXTURE_2D, m_cpTex[res] );
    const GLint lt = glGetUniformLocation( m_shProgId, "texChain" );
    const GLint lo = glGetUniformLocation( m_shProgId, "chainOff" );
    const GLint ls = glGetUniformLocation( m_shProgId, "chainScale" );
    if ( lt >= 0 )
        glUniform1i( lt, 40 );
    if ( lo >= 0 )
        glUniform2f( lo, static_cast<float>( vp[0] ), static_cast<float>( vp[1] ) );
    if ( ls >= 0 )
        glUniform1f( ls, cs );
    glActiveTexture( static_cast<GLenum>( active_tex ) );
}

// ---- 3D lab ------------------------------------------------------------------
GLuint EffectShader::geomProgram( const float *x0, const float *x1, const bool *fading )
{
    static const int   St[3] = { 5, 6, 7 };
    static const char *Name[3] = { "SP", "CO", "BO" };
    std::string        d;
    char               buf[96];
    for ( int i = 0; i < 3; ++i )
    {
        auto o = m_chainOrd.find( kWalkKnob[St[i]] );
        if ( o == m_chainOrd.end() || o->second.empty() )
            return 0;
        const int n = static_cast<int>( o->second.size() );
        const int p0 = classPos( x0[St[i]], n );
        const int p1 = fading[St[i]] ? classPos( x1[St[i]], n ) : p0;
        snprintf( buf, sizeof buf, "#define SPEC_%s0 %d\n#define SPEC_%s1 %d\n", Name[i], o->second[p0], Name[i],
                  o->second[p1] );
        d += buf;
    }
    std::string  src = m_geomSrc;
    const size_t nl = src.find( '\n' );
    src.insert( nl == std::string::npos ? src.size() : nl + 1, d );
    if ( shaderForgeAvailable() )
    {
        bool         failed = false;
        const GLuint p = shaderForgeGet( src, &failed, 2 ); // the G-buffer: two RGBA32F targets
        if ( p || !failed )
            return p;
    }
    return shaderBuildFromText( src ); // no helper (or it failed): build here, blocking
}

void EffectShader::runChain3D( const AudioFeatures &f )
{
    static const char Stage[4] = { 'A', 'B', 'C', 'D' };
    static const int  Weak[4] = { 0, 2, 1, 2 };
    parseChainSource();
    for ( int s = 0; s < 4; ++s )
        if ( m_chainOrd.find( kWalkKnob[s] ) == m_chainOrd.end() )
            return;
    const bool fixed_order = m_permCodes.size() != 24;
    using ClockT = std::chrono::steady_clock;
    const bool spec_log = getenv( "KALEIDO_SPEC_LOG" ) != nullptr;
    const auto tc0 = ClockT::now();
    auto       ms_since = []( ClockT::time_point t )
    { return std::chrono::duration<double, std::milli>( ClockT::now() - t ).count(); };
    std::string             slow_draws; // first draws of programs that took long (KALEIDO_SPEC_LOG)
    static std::set<GLuint> drawn_once;
    warmPasses( m_chainOrd, true ); // the 3D lab built its passes on first use: 25-80 ms frames at every new class
    retireIdleChains();
    const GLuint geom = geomProgram( m_walk.x0, m_walk.x1, m_walk.fading );
    const double t_sel = ms_since( tc0 );

    GLint vp[4], draw_fb = 0, read_fb = 0, active_tex = 0, vao = 0;
    glGetIntegerv( GL_VIEWPORT, vp );
    glGetIntegerv( 0x8CA6, &draw_fb );
    glGetIntegerv( 0x8CAA, &read_fb );
    glGetIntegerv( 0x84E0, &active_tex );
    glGetIntegerv( 0x85B5, &vao );
    const GLboolean blend = glIsEnabled( GL_BLEND ), depth = glIsEnabled( GL_DEPTH_TEST ),
                    scissor = glIsEnabled( GL_SCISSOR_TEST );
    const int       W = vp[2] > 0 ? vp[2] : 1, H = vp[3] > 0 ? vp[3] : 1;

    // The chain coordinates need two channels (RG32F: 8 of them at 2880x1620
    // were 600 MB as RGBA32F, now 300); the start (uv + time offset) and the
    // G-buffer keep four.
    auto make_tex = [&]( GLuint tex, GLint fmt = GL_RGBA32F, GLenum layout = GL_RGBA )
    {
        glBindTexture( GL_TEXTURE_2D, tex );
        glTexImage2D( GL_TEXTURE_2D, 0, fmt, W, H, 0, layout, GL_FLOAT, nullptr );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    };
    if ( W != m_cpW || H != m_cpH || !m_cpTex[0] )
    {
        if ( m_cpTex[0] )
        {
            glDeleteTextures( 8, m_cpTex );
            glDeleteFramebuffers( 8, m_cpFbo );
        }
        glGenTextures( 8, m_cpTex );
        glGenFramebuffers( 8, m_cpFbo );
        for ( int i = 0; i < 8; ++i )
        {
            make_tex( m_cpTex[i], GL_RG32F, GL_RG );
            glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[i] );
            glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_cpTex[i], 0 );
        }
        if ( m_stTex )
        {
            glDeleteTextures( 1, &m_stTex );
            glDeleteFramebuffers( 1, &m_stFbo );
        }
        glGenTextures( 1, &m_stTex );
        glGenFramebuffers( 1, &m_stFbo );
        make_tex( m_stTex );
        glBindFramebuffer( GL_FRAMEBUFFER, m_stFbo );
        glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_stTex, 0 );
        if ( m_gbTex[0] )
        {
            glDeleteTextures( 2, m_gbTex );
            glDeleteFramebuffers( 1, &m_gbFbo );
        }
        glGenTextures( 2, m_gbTex );
        glGenFramebuffers( 1, &m_gbFbo );
        glBindFramebuffer( GL_FRAMEBUFFER, m_gbFbo );
        for ( int i = 0; i < 2; ++i )
        {
            make_tex( m_gbTex[i] );
            glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_TEXTURE_2D, m_gbTex[i], 0 );
        }
        m_cpW = W;
        m_cpH = H;
    }
    glDisable( GL_BLEND );
    glDisable( GL_DEPTH_TEST );
    glDisable( GL_SCISSOR_TEST );
    glViewport( 0, 0, W, H );
    glBindVertexArray( fullscreenVAO() );

    // 1. Geometry into the G-buffer (no program yet: every pixel misses -- fog).
    glBindFramebuffer( GL_FRAMEBUFFER, m_gbFbo );
    const GLenum bufs[2] = { GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1 };
    glDrawBuffers( 2, bufs );
    if ( geom )
    {
        glUseProgram( geom );
        auto loc = [&]( const char *n )
        { return glGetUniformLocation( geom, n ); };
        for ( const Uniform *u : m_uniforms )
        {
            const std::string &nm = u->getName();
            if ( !nm.empty() && nm.back() == 'P' )
            {
                const GLint l = loc( nm.c_str() );
                if ( l >= 0 )
                    glUniform1f( l, u->snapshotValue() );
            }
        }
        GLint l = loc( "resolution" );
        if ( l >= 0 )
            glUniform2f( l, static_cast<float>( m_width ), static_cast<float>( m_height ) );
        l = loc( "sceneTime" );
        if ( l >= 0 )
            glUniform1f( l, m_lastSceneTime );
        l = loc( "sceneAdvance" );
        if ( l >= 0 )
            glUniform1f( l, f.audioAdvance - m_advanceAtReset );
        l = loc( "audioAdvance" );
        if ( l >= 0 )
            glUniform1f( l, f.audioAdvance );
        l = loc( "audioPhase" );
        if ( l >= 0 )
            glUniform1f( l, f.audioRotPhase );
        l = loc( "audioSpread" );
        if ( l >= 0 )
            glUniform1f( l, f.spectralSpread );
        l = loc( "audioSwell" );
        if ( l >= 0 )
            glUniform1f( l, f.swell );
        l = loc( "audioKick" );
        if ( l >= 0 )
            glUniform1f( l, f.onsetKick );
        l = loc( "audioMode" );
        if ( l >= 0 )
            glUniform1f( l, f.musicalMode );
        l = loc( "audioLevel" );
        if ( l >= 0 )
            glUniform1f( l, f.overallLevel );
        l = loc( "walkHost" );
        if ( l >= 0 )
            glUniform1f( l, m_walk.active ? 1.f : 0.f );
        static const char *WalkNames[3] = { "walkSpace", "walkCore", "walkBody" };
        for ( int i = 0; i < 3; ++i )
        {
            l = loc( WalkNames[i] );
            if ( l >= 0 )
            {
                const int s = 5 + i;
                glUniform3f( l, m_walk.x0[s], m_walk.fading[s] ? m_walk.x1[s] : m_walk.x0[s],
                             m_walk.fading[s] ? m_walk.f[s] : 0.f );
            }
        }
        l = loc( "camHost" );
        if ( l >= 0 )
            glUniform1f( l, m_camHostLoc >= 0 ? 1.f : 0.f );
        l = loc( "camZ" );
        if ( l >= 0 )
            glUniform1f( l, m_cam.z );
        l = loc( "camGaze" );
        if ( l >= 0 )
            glUniform3f( l, static_cast<float>( m_cam.g0 ), static_cast<float>( m_cam.g1 ), m_cam.f );
        static GLuint last_geom = 0;
        const auto    td0 = std::chrono::steady_clock::now();
        glDrawArrays( GL_TRIANGLES, 0, 3 );
        if ( geom != last_geom && getenv( "KALEIDO_SPEC_LOG" ) )
            fprintf( stderr, "GEOM first draw %u: %.1f ms\n", geom,
                     std::chrono::duration<double, std::milli>( std::chrono::steady_clock::now() - td0 ).count() );
        last_geom = geom;
    }
    else
    {
        const GLfloat miss[4] = { 0.f, 0.f, 0.f, -1.f }, up[4] = { 0.f, 0.f, 1.f, 1.f };
        glClearBufferfv( GL_COLOR, 0, miss );
        glClearBufferfv( GL_COLOR, 1, up );
    }
    glDrawBuffers( 1, bufs );

    // 2. The colour chain once per projection plane, from the G-buffer.
    float speed_p = 0.5f, solid_p = 0.f, tilt_p = 0.f;
    for ( const Uniform *u : m_uniforms )
    {
        if ( u->getName() == "speedP" )
            speed_p = u->snapshotValue();
        if ( u->getName() == "solidP" )
            solid_p = u->snapshotValue();
    }
    int  start = -1;
    auto pass = [&]( const std::string &file, int in, int inB, int out, float subV, float mixF )
    {
        const PassProg &p = passProg( file );
        if ( !p.prog )
            return;
        glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[out] );
        glUseProgram( p.prog );
        glActiveTexture( GL_TEXTURE0 + 41 );
        glBindTexture( GL_TEXTURE_2D, in >= 0 ? m_cpTex[in] : glcoreDummyTex2D() );
        glActiveTexture( GL_TEXTURE0 + 42 );
        glBindTexture( GL_TEXTURE_2D, inB >= 0 ? m_cpTex[inB] : glcoreDummyTex2D() );
        glActiveTexture( GL_TEXTURE0 + 47 );
        glBindTexture( GL_TEXTURE_2D, start >= 0 ? m_stTex : glcoreDummyTex2D() );
        if ( p.texIn >= 0 )
            glUniform1i( p.texIn, 41 );
        if ( p.texB >= 0 )
            glUniform1i( p.texB, 42 );
        if ( p.texStart >= 0 )
            glUniform1i( p.texStart, 47 );
        if ( p.useStart >= 0 )
            glUniform1i( p.useStart, start >= 0 ? 1 : 0 );
        if ( p.firstPass >= 0 )
            glUniform1i( p.firstPass, in < 0 ? 1 : 0 );
        if ( p.subV >= 0 )
            glUniform1f( p.subV, subV );
        if ( p.mixF >= 0 )
            glUniform1f( p.mixF, mixF );
        if ( p.chainOff >= 0 )
            glUniform2f( p.chainOff, 0.f, 0.f );
        if ( p.bakeSize >= 0 )
            glUniform1f( p.bakeSize, 0.f );
        if ( p.res >= 0 )
            glUniform2f( p.res, static_cast<float>( m_width ), static_cast<float>( m_height ) );
        if ( p.sceneTime >= 0 )
            glUniform1f( p.sceneTime, m_lastSceneTime );
        if ( p.adv >= 0 )
            glUniform1f( p.adv, f.audioAdvance );
        if ( p.phase >= 0 )
            glUniform1f( p.phase, f.audioRotPhase );
        if ( p.spread >= 0 )
            glUniform1f( p.spread, f.spectralSpread );
        if ( p.speed >= 0 )
            glUniform1f( p.speed, speed_p );
        if ( p.tilt >= 0 )
            glUniform1f( p.tilt, tilt_p );
        if ( p.swell >= 0 )
            glUniform1f( p.swell, f.swell );
        if ( p.scale >= 0 )
            glUniform1f( p.scale, 1.f );
        const auto td = ClockT::now();
        glDrawArrays( GL_TRIANGLES, 0, 3 );
        if ( spec_log && drawn_once.insert( p.prog ).second && ms_since( td ) > 2.0 )
        {
            char b[160];
            snprintf( b, sizeof b, " %s %.1f", file.substr( file.find_last_of( '\\' ) + 1 ).c_str(), ms_since( td ) );
            slow_draws += b;
        }
    };
    unsigned busy = 0;
    auto     free_tex = [&]( unsigned also )
    { for( int i = 0; i < 8; ++i ) if( !( ( busy | also ) & ( 1u << i ) ) ) return i; return 0; };
    auto run_order = [&]( int code ) -> int
    {
        int cur = -1;
        for ( int pos = 0; pos < 4; ++pos )
        {
            const int               s = ( code >> ( 2 * pos ) ) & 3;
            const std::vector<int> &ord = m_chainOrd[kWalkKnob[s]];
            const int               n = static_cast<int>( ord.size() );
            const float             x0 = m_walk.x0[s], x1 = m_walk.x1[s];
            const int               p0 = classPos( x0, n );
            const float v0 = ( x0 < 0.f ? 0.f : ( x0 > 0.9999f ? 0.9999f : x0 ) ) * n - static_cast<float>( p0 );
            const bool              fade = m_walk.active && m_walk.fading[s] && m_walk.f[s] > 0.f;
            const unsigned          keep = cur >= 0 ? ( 1u << cur ) : 0u;
            if ( !fade )
            {
                if ( p0 == 0 )
                    continue;
                const int out = free_tex( keep );
                pass( passFile( Stage[s], ord[p0] ), cur, -1, out, v0, 0.f );
                cur = out;
                continue;
            }
            const int   p1 = classPos( x1, n );
            const float v1 = ( x1 < 0.f ? 0.f : ( x1 > 0.9999f ? 0.9999f : x1 ) ) * n - static_cast<float>( p1 );
            const int   ta = free_tex( keep );
            pass( p0 == 0 ? std::string( "..\\Engine\\ChainPass\\Id.frag" ) : passFile( Stage[s], ord[p0] ), cur, -1,
                  ta, v0, 0.f );
            const int tb = free_tex( keep | ( 1u << ta ) );
            pass( p1 == 0 ? std::string( "..\\Engine\\ChainPass\\Id.frag" ) : passFile( Stage[s], ord[p1] ), cur, -1,
                  tb, v1, 0.f );
            const int out = free_tex( ( 1u << ta ) | ( 1u << tb ) );
            pass( "..\\Engine\\ChainPass\\Mix.frag", ta, tb, out, 0.f, smooth01( m_walk.f[s] ) );
            cur = out;
        }
        if ( cur < 0 )
        {
            cur = free_tex( 0 );
            pass( "..\\Engine\\ChainPass\\Id.frag", -1, -1, cur, 0.f, 0.f );
        }
        return cur;
    };
    float w = 1.f;
    for ( int s = 0; s < 4; ++s )
    {
        const int n = static_cast<int>( m_chainOrd[kWalkKnob[s]].size() );
        const int p0 = classPos( m_walk.x0[s], n );
        if ( m_walk.active && m_walk.fading[s] && m_walk.f[s] > 0.f )
        {
            const float fs = smooth01( m_walk.f[s] );
            const int   p1 = classPos( m_walk.x1[s], n );
            w *= ( p0 <= Weak[s] ? 1.f - fs : 0.f ) + ( p1 <= Weak[s] ? fs : 0.f );
        }
        else
            w *= p0 <= Weak[s] ? 1.f : 0.f;
    }
    const double    t_geom = ms_since( tc0 );
    const PassProg &st = passProg( "..\\Engine\\ChainPass\\Start3D.frag" );
    const GLint     st_g = glGetUniformLocation( st.prog, "texGPos" ), st_pl = glGetUniformLocation( st.prog, "plane" ),
                    st_sd = glGetUniformLocation( st.prog, "solidP" );
    const int       code = fixed_order ? 228 : m_permCodes[classPos( m_walk.x0[8], 24 )];
    int             res[3];
    for ( int pl = 0; pl < 3; ++pl )
    {
        start = -1;
        glBindFramebuffer( GL_FRAMEBUFFER, m_stFbo ); // this plane's start: its own RGBA32F target
        glUseProgram( st.prog );
        glActiveTexture( GL_TEXTURE0 + 45 );
        glBindTexture( GL_TEXTURE_2D, m_gbTex[0] );
        if ( st_g >= 0 )
            glUniform1i( st_g, 45 );
        if ( st_pl >= 0 )
            glUniform1i( st_pl, pl );
        if ( st_sd >= 0 )
            glUniform1f( st_sd, solid_p );
        glDrawArrays( GL_TRIANGLES, 0, 3 );
        start = 0;
        int r = run_order( code );
        if ( w > 0.f )
        {
            const int out = free_tex( 1u << r );
            pass( "..\\Engine\\ChainPass\\Fallback.frag", r, -1, out, 0.f, w );
            r = out;
        }
        busy |= 1u << r;
        res[pl] = r;
    }
    start = -1;

    // 3. Restore, and hand the G-buffer and the three chains to the lab's last pass.
    glBindFramebuffer( 0x8CA9, draw_fb );
    glBindFramebuffer( 0x8CA8, read_fb );
    glViewport( vp[0], vp[1], vp[2], vp[3] );
    if ( blend )
        glEnable( GL_BLEND );
    if ( depth )
        glEnable( GL_DEPTH_TEST );
    if ( scissor )
        glEnable( GL_SCISSOR_TEST );
    glBindVertexArray( static_cast<GLuint>( vao ) );
    glUseProgram( m_shProgId );
    static const int   Unit[5] = { 45, 46, 40, 43, 44 };
    static const char *Sam[5] = { "texGPos", "texGNrm", "texChain0", "texChain1", "texChain2" };
    const GLuint       texs[5] = { m_gbTex[0], m_gbTex[1], m_cpTex[res[0]], m_cpTex[res[1]], m_cpTex[res[2]] };
    for ( int i = 0; i < 5; ++i )
    {
        glActiveTexture( GL_TEXTURE0 + Unit[i] );
        glBindTexture( GL_TEXTURE_2D, texs[i] );
        const GLint l = glGetUniformLocation( m_shProgId, Sam[i] );
        if ( l >= 0 )
            glUniform1i( l, Unit[i] );
    }
    const GLint lo = glGetUniformLocation( m_shProgId, "chainOff" );
    if ( lo >= 0 )
        glUniform2f( lo, static_cast<float>( vp[0] ), static_cast<float>( vp[1] ) );
    glActiveTexture( static_cast<GLenum>( active_tex ) );
    const double t_all = ms_since( tc0 );
    if ( spec_log && t_all > 15.0 )
        fprintf( stderr, "CHAIN3D slow frame: %.1f ms (select %.1f, geom %.1f, passes %.1f)%s%s\n", t_all, t_sel,
                 t_geom - t_sel, t_all - t_geom, slow_draws.empty() ? "" : " first draws:", slow_draws.c_str() );
}

std::string EffectShader::specDefines( const float *x0, const float *x1, const bool *fading ) const
{
    // stage index (kWalkKnob) -> macro stem
    static const int   SpecStage[7] = { 0, 1, 2, 3, 5, 6, 7 };
    static const char *SpecName[7] = { "A", "B", "C", "D", "SP", "CO", "BO" };
    std::string        out;
    char               buf[64];
    for ( int i = 0; i < 7; ++i )
    {
        const int s = SpecStage[i];
        auto      o = m_chainOrd.find( kWalkKnob[s] );
        if ( o == m_chainOrd.end() || o->second.empty() )
            continue;
        const int n = static_cast<int>( o->second.size() );
        const int p0 = classPos( x0[s], n );
        const int p1 = fading[s] ? classPos( x1[s], n ) : p0;
        snprintf( buf, sizeof buf, "#define SPEC_%s0 %d\n#define SPEC_%s1 %d\n", SpecName[i], o->second[p0],
                  SpecName[i], o->second[p1] );
        out += buf;
    }
    return out;
}

/**  Whether a shader source calls a function whose first argument starts with the given text.
 *
 * @param text  The shader source. (in)
 * @param fn    Function name, e.g. "textureLod". (in)
 * @param arg   Start of the first argument, e.g. "tex0". (in)
 *
 * @return
 *   True if such a call occurs anywhere in @p text (comments included, as before).
 *
 * Spaces between the name, the parenthesis and the argument do not matter: the shaders are laid out after
 * the CGVR guidelines (`textureLod( tex0, uv, lod )`), and a search for the characters "textureLod(tex0"
 * would depend on that layout.
 **/
static bool callsWithFirstArg( const std::string &text, const char *fn, const char *arg )
{
    const size_t fn_len = strlen( fn );
    const size_t arg_len = strlen( arg );
    for ( size_t p = text.find( fn ); p != std::string::npos; p = text.find( fn, p + 1 ) )
    {
        size_t q = p + fn_len;
        while ( q < text.size() && isspace( static_cast<unsigned char>( text[q] ) ) )
            ++q;
        if ( q >= text.size() || text[q] != '(' )
            continue;
        ++q;
        while ( q < text.size() && isspace( static_cast<unsigned char>( text[q] ) ) )
            ++q;
        if ( text.compare( q, arg_len, arg ) == 0 )
            return true;
    }
    return false;
}

/**  The values of every `return N` in the body of a shader function, in source order.
 *
 * @param text  The shader source. (in)
 * @param fn    Function name, e.g. "permCode". (in)
 *
 * @return
 *   The returned integers; empty if @p text defines no such function.
 *
 * Reads "int permCode( int i ) { if ( i == 0 ) return 228; ... }" however the definition is wrapped.
 **/
static std::vector<int> returnedValues( const std::string &text, const char *fn )
{
    std::vector<int> values;
    const size_t     fn_len = strlen( fn );
    for ( size_t p = text.find( fn ); p != std::string::npos; p = text.find( fn, p + 1 ) )
    {
        if ( p > 0 && ( isalnum( static_cast<unsigned char>( text[p - 1] ) ) || text[p - 1] == '_' ) )
            continue;
        size_t q = p + fn_len;
        while ( q < text.size() && isspace( static_cast<unsigned char>( text[q] ) ) )
            ++q;
        if ( q >= text.size() || text[q] != '(' )
            continue;
        const size_t close = text.find( ')', q );
        if ( close == std::string::npos )
            return values;
        size_t open = close + 1;
        while ( open < text.size() && isspace( static_cast<unsigned char>( text[open] ) ) )
            ++open;
        if ( open >= text.size() || text[open] != '{' )
            continue; // a call or a prototype, not the definition
        int    depth = 0;
        size_t end = open;
        for ( ; end < text.size(); ++end )
        {
            if ( text[end] == '{' )
                ++depth;
            else if ( text[end] == '}' && --depth == 0 )
                break;
        }
        const std::string body = text.substr( open, end - open );
        for ( size_t c = 0; ( c = body.find( "return ", c ) ) != std::string::npos; c += 7 )
            values.push_back( atoi( body.c_str() + c + 7 ) );
        return values;
    }
    return values;
}

void EffectShader::parseChainSource()
{
    if ( m_chainParsed < 0 )
    {
        m_chainParsed = 0;
        const std::string text = textFileRead( m_fragmentShaderFilename.c_str() );
        if ( !text.empty() )
        {
            size_t a = 0;
            while ( a < text.size() )
            {
                size_t b = text.find( '\n', a );
                if ( b == std::string::npos )
                    b = text.size();
                std::string line = text.substr( a, b - a );
                a = b + 1;
                if ( !line.empty() && line.back() == '\r' )
                    line.pop_back();
                static const std::string Tag = "// @chainclasses ";
                if ( line.compare( 0, Tag.size(), Tag ) == 0 )
                {
                    const std::string rest = line.substr( Tag.size() );
                    const size_t      sp = rest.find( ' ' );
                    if ( sp == std::string::npos )
                        continue;
                    std::vector<std::string> names;
                    size_t                   c = sp + 1;
                    while ( c <= rest.size() )
                    {
                        size_t d = rest.find( '|', c );
                        if ( d == std::string::npos )
                            d = rest.size();
                        names.push_back( rest.substr( c, d - c ) );
                        c = d + 1;
                    }
                    m_chainClasses[rest.substr( 0, sp )] = names;
                    m_chainParsed = 1;
                }
                // "// @chainord chainAP 11|5|20|...": position -> branch (for the specialised variants)
                static const std::string Otag = "// @chainord ";
                if ( line.compare( 0, Otag.size(), Otag ) == 0 )
                {
                    const std::string rest = line.substr( Otag.size() );
                    const size_t      sp = rest.find( ' ' );
                    std::vector<int>  br;
                    if ( sp != std::string::npos )
                        for ( size_t c = sp + 1; c < rest.size(); )
                        {
                            size_t d = rest.find( '|', c );
                            if ( d == std::string::npos )
                                d = rest.size();
                            if ( d > c )
                                br.push_back( atoi( rest.c_str() + c ) );
                            c = d + 1;
                        }
                    m_chainOrd[rest.substr( 0, sp )] = br;
                }
                // "// @chainopening chainAP 9|10|13": the classes streaming into an opening (flat labs only)
                // "// @chainss chainAP 4|17": the classes that sparkle most (supersampled in the runner)
                static const std::string Ztag = "// @chainopening ", Stag = "// @chainss ";
                const bool               is_ss = line.compare( 0, Stag.size(), Stag ) == 0;
                if ( is_ss || line.compare( 0, Ztag.size(), Ztag ) == 0 )
                {
                    const std::string rest = line.substr( is_ss ? Stag.size() : Ztag.size() );
                    const size_t      sp = rest.find( ' ' );
                    std::vector<int>  pos;
                    if ( sp != std::string::npos )
                        for ( size_t c = sp + 1; c < rest.size(); )
                        {
                            size_t d = rest.find( '|', c );
                            if ( d == std::string::npos )
                                d = rest.size();
                            if ( d > c )
                                pos.push_back( atoi( rest.c_str() + c ) );
                            c = d + 1;
                        }
                    ( is_ss ? m_chainSS : m_chainOpening )[rest.substr( 0, sp )] = pos;
                }
                // frozen likes: "const float chainAP = 0.4752;"
                static const std::string Ctag = "const float ";
                if ( line.compare( 0, Ctag.size(), Ctag ) == 0 )
                {
                    const size_t eq = line.find( '=' );
                    if ( eq != std::string::npos )
                    {
                        std::string name = line.substr( Ctag.size(), eq - Ctag.size() );
                        while ( !name.empty() && name.back() == ' ' )
                            name.pop_back();
                        m_chainConsts[name] = static_cast<float>( atof( line.c_str() + eq + 1 ) );
                    }
                }
            }
            // "int permCode( int i ) { if ( i == 0 ) return 228; ... }": the 24 stage orders
            m_permCodes = returnedValues( text, "permCode" );
        }
    }
}

/**  Class position of a knob value, exactly as the shader's pickStage().
 *
 * @param x  Knob value 0..1. (in)
 * @param n  Number of classes of the stage. (in)
 *
 * @return
 *   Position 0..n-1.
 **/
static int classPos( float x, int n )
{
    int k = static_cast<int>( ( x < 0.f ? 0.f : ( x > 1.f ? 1.f : x ) ) * n );
    return k > n - 1 ? n - 1 : k;
}

bool EffectShader::opensAt( int s, float x ) const
{
    auto c = m_chainOpening.find( kWalkKnob[s] );
    auto n = m_chainClasses.find( kWalkKnob[s] );
    if ( c == m_chainOpening.end() || n == m_chainClasses.end() || n->second.empty() )
        return false;
    const int k = classPos( x, static_cast<int>( n->second.size() ) );
    for ( int p : c->second )
        if ( p == k )
            return true;
    return false;
}

/**  The 3D lab's worlds as its camera sees them (Engine/chain3d_worlds.tsv), read once.
 *
 * @return
 *   The poorness -- the larger of the haze and the carpet share -- of the world at (space * 22 + core) * 22 + body
 *   (positions in the energy order); empty without the table.
 **/
static const std::vector<float> &worldPoornessTable()
{
    static std::vector<float> table;
    static std::once_flag    once;
    std::call_once( once, []
    {
        std::ifstream     in( "../Engine/chain3d_worlds.tsv" ); // forward slashes: Windows and Linux
        std::string       line;
        std::vector<float> t( 20 * 22 * 22, 0.f );
        int               n = 0;
        while ( std::getline( in, line ) )
        {
            if ( line.empty() || line[0] == '#' )
                continue;
            std::istringstream ss( line );
            int                sp = 0, co = 0, bo = 0;
            float              poorness = 0.f;
            if ( ss >> sp >> co >> bo >> poorness && sp >= 0 && sp < 20 && co >= 0 && co < 22 && bo >= 0 && bo < 22 )
            {
                t[( sp * 22 + co ) * 22 + bo] = poorness;
                ++n;
            }
        }
        if ( n == 20 * 22 * 22 )
            table = t;
    } );
    return table;
}

float EffectShader::worldPoorness( const float *x ) const
{
    static const bool Off = getenv( "KALEIDO_NO_WORLD_FILTER" ) != nullptr;
    if ( Off || m_fragmentShaderFilename.find( "ChainLab3D" ) == std::string::npos )
        return 0.f;
    const std::vector<float> &t = worldPoornessTable();
    if ( t.empty() )
        return 0.f;
    static const int N[3] = { 20, 22, 22 };
    int              pos[3];
    for ( int i = 0; i < 3; ++i )
    {
        const auto it = m_chainClasses.find( kWalkKnob[5 + i] );
        if ( it == m_chainClasses.end() || static_cast<int>( it->second.size() ) != N[i] )
            return 0.f; // the lab's class lists changed: the table no longer matches them
        pos[i] = classPos( x[5 + i], N[i] );
    }
    return t[( pos[0] * 22 + pos[1] ) * 22 + pos[2]];
}

/**  The flat labs' chain terms (Engine/chain2d_classes.tsv), read once.
 *
 * @return
 *   Per stage A..D (index 0..3) the terms of each class position, mush and blur interleaved, and at index 4 the two
 *   intercepts; empty without the table.
 **/
static const std::vector<std::vector<float>> &chainTermTable()
{
    static std::vector<std::vector<float>> table;
    static std::once_flag                  once;
    std::call_once( once, []
    {
        std::ifstream                   in( "../Engine/chain2d_classes.tsv" ); // forward slashes: Windows and Linux
        std::string                     line;
        std::vector<std::vector<float>> t( 5 );
        static const char              *Knob[4] = { "chainAP", "chainBP", "chainCP", "chainDP" };
        while ( std::getline( in, line ) )
        {
            if ( line.empty() || line[0] == '#' )
                continue;
            std::istringstream ss( line );
            std::string        knob;
            int                pos = 0;
            float              mush = 0.f, blur = 0.f;
            if ( !( ss >> knob >> pos >> mush >> blur ) )
                continue;
            int s = knob == "intercept" ? 4 : -1;
            for ( int i = 0; i < 4; ++i )
                if ( knob == Knob[i] )
                    s = i;
            if ( s < 0 || pos != static_cast<int>( t[s].size() ) / 2 )
                continue; // rows in order, one per class
            t[s].push_back( mush );
            t[s].push_back( blur );
        }
        if ( t[4].size() == 2 && !t[0].empty() && !t[1].empty() && !t[2].empty() && !t[3].empty() )
            table = t;
    } );
    return table;
}

float EffectShader::chainPoorness( const float *x ) const
{
    static const bool Off = getenv( "KALEIDO_NO_CHAIN_FILTER" ) != nullptr;
    if ( Off || ( m_fragmentShaderFilename.find( "ChainLab2D" ) == std::string::npos &&
                  m_fragmentShaderFilename.find( "FxChain" ) == std::string::npos ) )
        return 0.f;
    const std::vector<std::vector<float>> &t = chainTermTable();
    if ( t.empty() )
        return 0.f;
    float mush = t[4][0], blur = t[4][1];
    for ( int s = 0; s < 4; ++s )
    {
        const auto it = m_chainClasses.find( kWalkKnob[s] );
        const int  n = static_cast<int>( t[s].size() ) / 2;
        if ( it == m_chainClasses.end() || static_cast<int>( it->second.size() ) != n )
            return 0.f; // the lab's class lists changed: the table no longer matches them
        const int p = classPos( x[s], n );
        mush += t[s][2 * p];
        blur += t[s][2 * p + 1];
    }
    return mush > blur ? mush : blur;
}

float EffectShader::closedClass( int s, float x ) const
{
    auto n = m_chainClasses.find( kWalkKnob[s] );
    if ( n == m_chainClasses.end() || n->second.empty() )
        return x;
    const int   cnt = static_cast<int>( n->second.size() );
    const int   k = classPos( x, cnt );
    const float sub = x * cnt - static_cast<float>( k ); // the sub-variant (arms, mirrors ...) stays
    for ( int d = 1; d < cnt; ++d )
        for ( int sign = -1; sign <= 1; sign += 2 )
        {
            const int j = k + sign * d;
            if ( j < 0 || j >= cnt )
                continue;
            const float v = ( static_cast<float>( j ) + ( sub < 0.f ? 0.f : ( sub > 0.99f ? 0.99f : sub ) ) )
                            / static_cast<float>( cnt );
            if ( !opensAt( s, v ) )
                return v;
        }
    return x;
}

bool EffectShader::chainWantsSS() const
{
    if ( m_chainSS.empty() )
        return false;
    for ( int s = 0; s < 4; ++s )
    {
        auto ss = m_chainSS.find( kWalkKnob[s] );
        auto n = m_chainClasses.find( kWalkKnob[s] );
        if ( ss == m_chainSS.end() || ss->second.empty() || n == m_chainClasses.end() || n->second.empty() )
            continue;
        const int  cnt = static_cast<int>( n->second.size() );
        const auto has = [&]( float x )
        { return std::find( ss->second.begin(), ss->second.end(), classPos( x, cnt ) ) != ss->second.end(); };
        if ( has( m_walk.x0[s] ) || ( m_walk.fading[s] && has( m_walk.x1[s] ) ) )
            return true;
    }
    return false;
}

// ---- Taste per chain class ---------------------------------------------------
// A like or a skip of a whole scene says little about a chain lab, whose walk
// shows dozens of chains in one activation; what was on screen says more.  The
// classes shown at the moment weigh a little more (like) or less (skip), within
// [0.6, 1.6]: a liked class comes about twice as often as a skipped one, never
// always and never never, and the music still picks the region.

std::string EffectShader::classTasteKey( const char *knob, const std::string &cls )
{
    std::string k = std::string( knob ) + "/" + cls;
    for ( size_t i = std::strlen( knob ) + 1; i < k.size(); ++i )
        if ( k[i] == '/' || k[i] == '\\' )
            k[i] = '_';
    return k;
}

float EffectShader::classTaste( int s, float x ) const
{
    if ( M_ClassTaste.empty() )
        return 1.f;
    auto n = m_chainClasses.find( kWalkKnob[s] );
    if ( n == m_chainClasses.end() || n->second.empty() )
        return 1.f;
    auto t = M_ClassTaste.find(
        classTasteKey( kWalkKnob[s], n->second[classPos( x, static_cast<int>( n->second.size() ) )] ) );
    return t == M_ClassTaste.end() ? 1.f : t->second;
}

float EffectShader::classNoveltyAt( int s, float x, double now ) const
{
    if ( !M_ClassNovelty || M_ClassSeen.empty() )
        return 1.f;
    auto n = m_chainClasses.find( kWalkKnob[s] );
    if ( n == m_chainClasses.end() || n->second.empty() )
        return 1.f;
    auto t = M_ClassSeen.find(
        classTasteKey( kWalkKnob[s], n->second[classPos( x, static_cast<int>( n->second.size() ) )] ) );
    // a stamp from the future (the clock was set back) counts as just seen
    return classNovelty( t == M_ClassSeen.end() ? -1.0 : ( now > t->second ? now - t->second : 0.0 ) );
}

/**  Whether a shader text declares the walk host: "uniform float walkHost", with any spaces between the words (the
 * layout may align a run of declarations).
 *
 * @param t  The shader text. (in)
 *
 * @return
 *   True if the declaration is there.
 **/
static bool declaresWalkHost( const std::string &t )
{
    for ( size_t at = t.find( "walkHost" ); at != std::string::npos; at = t.find( "walkHost", at + 1 ) )
    {
        size_t e = at;
        auto   word_before = [&]( const char *w )
        {
            while ( e > 0 && ( t[e - 1] == ' ' || t[e - 1] == '\t' ) )
                --e;
            const size_t n = strlen( w );
            if ( e == at || e < n || t.compare( e - n, n, w ) != 0 )
                return false;
            e -= n;
            return true;
        };
        if ( word_before( "float" ) && word_before( "uniform" ) )
            return true;
    }
    return false;
}

/**  Whether a fragment file is a chain lab the host can walk: it declares the walk host and lists its classes.
 *
 * @param path  The fragment file, as the entry names it. (in)
 *
 * @return
 *   True if the file declares "uniform float walkHost" and has a "// @chainclasses " line.
 *
 * Read once per file and cached: a preset holds a few lab files and many entries of them (the genre variants).
 **/
static bool sourceHasWalk( const std::string &path )
{
    static std::map<std::string, bool> cache;
    auto                               it = cache.find( path );
    if ( it == cache.end() )
    {
        const std::string t = textFileRead( path.c_str() );
        it = cache.emplace( path, declaresWalkHost( t ) && t.find( "// @chainclasses " ) != std::string::npos ).first;
    }
    return it->second;
}

void EffectShader::simulateWalk()
{
    if ( m_walk.pending )
    {
        m_walk.pending = false;
        resetChainWalk();
    }
}

bool EffectShader::isWalkingLab()
{
    if ( m_walkingLab < 0 )
    {
        m_walkingLab = 0;
        float lo = 0.f, hi = 0.f;
        bool  ranged = false;
        for ( const Uniform *u : m_uniforms )
            if ( u->getName() == "morphP" && u->floatRange( lo, hi ) )
                ranged = true;
        // the same thresholds as resetChainWalk(): every roll of morphP walks
        if ( ranged && lo >= ( m_compileFile.empty() ? 0.5f : 0.15f ) && sourceHasWalk( m_fragmentShaderFilename ) )
            m_walkingLab = 1;
    }
    return m_walkingLab == 1;
}

std::vector<std::pair<std::string, float>> EffectShader::bumpClassTaste( float mul )
{
    std::vector<std::pair<std::string, float>> out;
    // a walking lab or a fixed chain (morphP < 0.15): what is on screen is known; the
    // shader's own one-stage walk (0.15 .. 0.5) shows a class the host does not know
    if ( m_walkHostLoc < 0 || ( !m_walk.active && m_walkMorph >= 0.15f ) )
        return out;
    for ( int s = 0; s < WalkN; ++s )
    {
        auto n = m_chainClasses.find( kWalkKnob[s] );
        if ( m_walkLoc[s] < 0 || n == m_chainClasses.end() || n->second.empty() )
            continue; // stage absent in this lab
        // what is on screen: a fade past its middle shows its target
        const float        x = ( m_walk.fading[s] && m_walk.f[s] > 0.5f ) ? m_walk.x1[s] : m_walk.x0[s];
        const std::string &cls = n->second[classPos( x, static_cast<int>( n->second.size() ) )];
        if ( cls == "none" )
            continue;
        const std::string key = classTasteKey( kWalkKnob[s], cls );
        float             v = ( M_ClassTaste.count( key ) ? M_ClassTaste[key] : 1.f ) * mul;
        v = v < 0.6f ? 0.6f : ( v > 1.6f ? 1.6f : v );
        M_ClassTaste[key] = v;
        out.emplace_back( key, v );
        fprintf( stderr, "Class taste: %s -> %.2f\n", key.c_str(), v );
    }
    return out;
}

// ---- Camera host of the 3D chains --------------------------------------------
// Speed of the flight per gaze -- the order of gazeAngles() in the shader:
// ahead, ahead-right, slanted down, ahead-left, slanted up, floating, ahead-right and up.
static const int GazeN = 7; ///< Number of gazes (the shader's gazeAngles()).
/** Flight speed per gaze, in the order above. */
static const float GazeSpeed[GazeN] = { 1.f, 0.7f, 0.85f, 0.7f, 0.85f, 0.08f, 0.5f };

void EffectShader::stepChainCam( const AudioFeatures &f )
{
    if ( m_camProg != m_shProgId )
    {
        m_camProg = m_shProgId;
        m_camHostLoc = glGetUniformLocation( m_shProgId, "camHost" );
        m_camZLoc = glGetUniformLocation( m_shProgId, "camZ" );
        m_camGazeLoc = glGetUniformLocation( m_shProgId, "camGaze" );
    }
    if ( m_camHostLoc < 0 || m_camZLoc < 0 || m_camGazeLoc < 0 )
        return; // not a 3D chain
    float speed_p = 0.5f, cam_p = 0.f;
    for ( const Uniform *u : m_uniforms )
    {
        if ( u->getName() == "speedP" )
            speed_p = u->snapshotValue();
        if ( u->getName() == "camP" )
            cam_p = u->snapshotValue();
    }
    const auto now = EngineClock::now();
    if ( m_cam.pending )
    {
        m_cam.pending = false;
        // A comparison run flies the same flight every time; otherwise the activation's own seed (resetParameters(),
        // not from the scene's rand() stream: pinned under KALEIDO_SEED, from the clock in the show).
        m_cam.rng.seed( M_FreezeTime >= 0.f ? 12345u : m_cam.seed );
        m_cam.z = std::uniform_real_distribution<float>( 0.f, 500.f )( m_cam.rng ); // a fresh stretch of the world
        m_cam.g0 = m_cam.g1 = static_cast<int>( ( cam_p < 0.f ? 0.f : ( cam_p > 0.999f ? 0.999f : cam_p ) ) * GazeN );
        m_cam.f = 0.f;
        m_cam.hold = 0.f;
        m_cam.holdDur = std::uniform_real_distribution<float>( 120.f, 300.f )( m_cam.rng );
        m_cam.hasLast = false;
    }
    float dt = m_cam.hasLast ? std::chrono::duration<float>( now - m_cam.last ).count() : 0.f;
    if ( M_Frozen )
        dt = 0.f; // VJ freeze / comparison run: the flight stands too
    float d_adv = m_cam.hasLast ? f.audioAdvance - m_cam.lastAdv : 0.f;
    m_cam.last = now;
    m_cam.lastAdv = f.audioAdvance;
    m_cam.hasLast = true;
    if ( dt > 0.25f )
        dt = 0.016f; // back from a pause: no catch-up leap
    if ( d_adv < 0.f || d_adv > 1.f )
        d_adv = 0.f;

    // The gaze: hold, then pan to another one (never the same).
    if ( m_cam.g1 == m_cam.g0 )
    {
        m_cam.hold += dt;
        if ( m_cam.hold >= m_cam.holdDur )
        {
            m_cam.g1 = ( m_cam.g0 + 1 + static_cast<int>( m_cam.rng() % static_cast<unsigned>( GazeN - 1 ) ) ) % GazeN;
            m_cam.f = 0.f;
            m_cam.panDur = std::uniform_real_distribution<float>( 40.f, 60.f )( m_cam.rng );
            fprintf( stderr, "CAM %s gaze %d -> %d, %.0f s pan\n", fragmentName(), m_cam.g0, m_cam.g1, m_cam.panDur );
        }
    }
    else
    {
        m_cam.f += dt / m_cam.panDur;
        if ( m_cam.f >= 1.f )
        {
            m_cam.g0 = m_cam.g1;
            m_cam.f = 0.f;
            m_cam.hold = 0.f;
            m_cam.holdDur = std::uniform_real_distribution<float>( 120.f, 300.f )( m_cam.rng );
        }
    }
    // The flight: the shader's old closed form (0.15 + 0.25 speed_p) * time +
    // 1.5 * audioAdvance, differentiated, times the speed of the gaze.
    const float s = m_cam.f * m_cam.f * ( 3.f - 2.f * m_cam.f ); // smoothstep, as the shader pans
    const float sp = GazeSpeed[m_cam.g0] + ( GazeSpeed[m_cam.g1] - GazeSpeed[m_cam.g0] ) * s;
    const float speed_k = 0.15f + 0.25f * ( speed_p < 0.f ? 0.f : ( speed_p > 1.f ? 1.f : speed_p ) );
    m_cam.z += sp * ( speed_k * dt + 1.5f * d_adv );

    glUniform1f( m_camHostLoc, 1.f );
    glUniform1f( m_camZLoc, m_cam.z );
    glUniform3f( m_camGazeLoc, static_cast<float>( m_cam.g0 ), static_cast<float>( m_cam.g1 ), m_cam.f );
}

std::string EffectShader::chainInfo()
{
    parseChainSource();
    if ( m_chainParsed != 1 )
        return std::string();

    // The rolled value of a knob (or its frozen constant); -1 if the shader has neither.
    auto knob_value = [this]( const char *knob ) -> float
    {
        for ( const Uniform *u : m_uniforms )
            if ( u->getName() == knob )
                return u->snapshotValue();
        auto it = m_chainConsts.find( knob );
        return it != m_chainConsts.end() ? it->second : -1.f;
    };
    auto class_name = [this]( const std::string &knob, float x ) -> std::string
    {
        auto it = m_chainClasses.find( knob );
        if ( it == m_chainClasses.end() || it->second.empty() )
            return "?";
        const int n = static_cast<int>( it->second.size() );
        int       k = static_cast<int>( ( x < 0.f ? 0.f : ( x > 1.f ? 1.f : x ) ) * n );
        if ( k > n - 1 )
            k = n - 1;
        return it->second[k];
    };
    // Display order: the order first, then the stages, the look, the 3D structure.
    static const int   Show[9] = { 8, 0, 1, 2, 3, 4, 5, 6, 7 };
    static const char *Label[9] = { "A", "B", "C", "D", "Look", "Raum", "Kern", "Koerper", "Reihenfolge" };
    std::string        out;
    char               buf[64];
    for ( int i = 0; i < 9; ++i )
    {
        const int   s = Show[i];
        const float rolled = knob_value( kWalkKnob[s] );
        if ( rolled < 0.f || m_chainClasses.find( kWalkKnob[s] ) == m_chainClasses.end() )
            continue;
        const bool  walking = m_walk.active && ( m_walkLoc[s] >= 0 );
        const float x0 = walking ? m_walk.x0[s] : rolled;
        std::string line = std::string( "  " ) + Label[s];
        line.resize( 14, ' ' );
        line += class_name( kWalkKnob[s], x0 );
        if ( walking && m_walk.fading[s] )
        {
            snprintf( buf, sizeof buf, "  (%d%%)", static_cast<int>( m_walk.f[s] * 100.f + 0.5f ) );
            const std::string to = class_name( kWalkKnob[s], m_walk.x1[s] );
            line += " -> " + ( to == class_name( kWalkKnob[s], x0 ) ? std::string( "neue Variante" ) : to ) + buf;
        }
        if ( !out.empty() )
            out += "\n";
        out += line;
    }
    if ( !out.empty() )
    {
        snprintf( buf, sizeof buf, "%.2f", m_walk.rate );
        out = ( m_walk.active ? std::string( "  KETTE (wandert, Musiktempo " ) + buf + ")\n"
                              : std::string( "  KETTE (fest)\n" ) )
              + out;
    }
    return out;
}

void EffectShader::setGradeModes( const std::string &list )
{
    m_gradeModes.clear();
    size_t a = 0;
    while ( a <= list.size() )
    {
        size_t b = list.find( ',', a );
        if ( b == std::string::npos )
            b = list.size();
        std::string w = list.substr( a, b - a );
        w.erase( 0, w.find_first_not_of( " \t" ) );
        w.erase( w.find_last_not_of( " \t" ) + 1 );
        if ( w == "fade" )
            m_gradeModes.push_back( 1 );
        else if ( w == "grey" )
            m_gradeModes.push_back( 2 );
        else if ( w == "sepia" )
            m_gradeModes.push_back( 3 );
        a = b + 1;
    }
    // The very first activation after loading does not pass through
    // resetParameters(), so roll the first grade here.
    m_gradeMode = m_gradeModes.empty() ? 0 : m_gradeModes[rand() % m_gradeModes.size()];
}

bool EffectShader::usesSceneLod()
{
    if ( m_usesSceneLod < 0 )
    {
        m_usesSceneLod = 0;
        if ( !m_fragmentShaderFilename.empty() )
        {
            const std::string src = textFileRead( m_fragmentShaderFilename.c_str() );
            m_usesSceneLod = callsWithFirstArg( src, "textureLod", "tex0" ) ? 1 : 0;
        }
    }
    return m_usesSceneLod == 1;
}

bool EffectShader::usesMandelbrot()
{
    if ( !m_glReady )
        return false;
    if ( m_usesMandelbrot < 0 )
        m_usesMandelbrot = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texMandelbrot" ) >= 0 ) ? 1 : 0;
    return m_usesMandelbrot == 1;
}

void EffectShader::ensureBakeProg()
{
    if ( m_bakeTried )
        return;
    m_bakeTried = true;

    if ( !glcoreHasCompute || !glTexImage3D || m_bakeCompFilename.empty() )
        return;

    m_bakeProg = setComputeShader( m_bakeCompFilename.c_str() ); // 0 on any failure (incl. missing file)
    if ( m_bakeProg == 0 )
        return;

    glGenTextures( 1, &m_bakeTex );
    glBindTexture( GL_TEXTURE_3D, m_bakeTex );
    glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE );
    // RG32F: R = distance estimate, G = whatever per-texel extra scalar the
    // bake shader wants to carry through (e.g. an orbit-trap value for a
    // fractal's aura shading) -- the scene's own .comp decides what G means,
    // this class only owns the format and the texture's lifetime.
    glTexImage3D( GL_TEXTURE_3D, 0, GL_RG32F, BakeRes, BakeRes, BakeRes,
                  0, GL_RGBA, GL_FLOAT, nullptr );
    glBindTexture( GL_TEXTURE_3D, 0 );
    m_bakeFrame = BakeIntervalFrames; // bake on the very first draw, not one interval late
}

void EffectShader::stepBake( float time, const AudioFeatures &audio )
{
    ensureBakeProg();
    if ( m_bakeProg == 0 )
        return;

    // texBake always reads unit 33 -- set on the FRAGMENT program (already
    // current: draw() runs after enableShader()), not the compute one. Cheap
    // enough to just set every frame rather than adding a separate
    // once-per-recompile cache for one uniform.
    GLint l_tex_bake = glGetUniformLocation( m_shProgId, "texBake" );
    if ( l_tex_bake >= 0 )
        glUniform1i( l_tex_bake, 33 );

    // Re-bake only every BakeIntervalFrames frames: the bake shader itself
    // decides how much of its field is actually time-varying (typically a
    // slowly audio-morphed parameter, not the whole shape), so this interval
    // trades a small, usually imperceptible step in that drift for a large
    // reduction in how often the (comparatively expensive) bake pass runs.
    if ( ++m_bakeFrame < BakeIntervalFrames )
    {
        glActiveTexture( GL_TEXTURE0 + 33 );
        glBindTexture( GL_TEXTURE_3D, m_bakeTex );
        glActiveTexture( GL_TEXTURE0 );
        return;
    }
    m_bakeFrame = 0;

    glUseProgram( m_bakeProg );
    GLint lt = glGetUniformLocation( m_bakeProg, "time" );
    if ( lt >= 0 )
        glUniform1f( lt, time );
    GLint lk = glGetUniformLocation( m_bakeProg, "audioKick" );
    if ( lk >= 0 )
        glUniform1f( lk, audio.onsetKick );
    GLint lb = glGetUniformLocation( m_bakeProg, "audioBass" );
    if ( lb >= 0 )
        glUniform1f( lb, audio.bassLevel );
    GLint la = glGetUniformLocation( m_bakeProg, "audioAdvance" );
    if ( la >= 0 )
        glUniform1f( la, audio.audioAdvance );
    // This scene's own per-activation params (e.g. a "speed_p" the fragment
    // shader ALSO reads to build its camera's own time-dependent rotation) --
    // without these, the bake shader's rotation phase can drift out of sync
    // with what the fragment shader's live camera math expects to see, since
    // both derive their own "t" from the same raw time but scaled by params
    // the compute program has no other way to know. Same by-name upload
    // Scene3DShader::runGenerator() uses for its generator.
    for ( unsigned int i = 0; i < m_uniforms.size(); ++i )
    {
        GLint l = glGetUniformLocation( m_bakeProg, m_uniforms[i]->getName().c_str() );
        if ( l >= 0 )
            glUniform1f( l, m_uniforms[i]->snapshotValue() );
    }

    glBindImageTexture( 0, m_bakeTex, 0, GL_TRUE, 0, GL_WRITE_ONLY, GL_RG32F );
    const int groups = ( BakeRes + 3 ) / 4; // matches the bake shaders' local_size 4x4x4
    glDispatchCompute( groups, groups, groups );
    glMemoryBarrier( GL_TEXTURE_FETCH_BARRIER_BIT );

    glActiveTexture( GL_TEXTURE0 + 33 );
    glBindTexture( GL_TEXTURE_3D, m_bakeTex );
    glActiveTexture( GL_TEXTURE0 );
}

bool EffectShader::usesShadow()
{
    if ( !m_glReady )
        return false;
    if ( m_usesShadow < 0 )
        m_usesShadow = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texShadow" ) >= 0 ) ? 1 : 0;
    return m_usesShadow == 1;
}

bool EffectShader::usesShadow2()
{
    if ( !m_glReady )
        return false;
    if ( m_usesShadow2 < 0 )
        m_usesShadow2 = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texShadow2" ) >= 0 ) ? 1 : 0;
    return m_usesShadow2 == 1;
}

bool EffectShader::usesSpectro()
{
    if ( !m_glReady )
        return false;
    if ( m_usesSpectro < 0 )
        m_usesSpectro = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texSpectro" ) >= 0 ) ? 1 : 0;
    return m_usesSpectro == 1;
}

bool EffectShader::usesPhysarum()
{
    if ( !m_glReady )
        return false;
    if ( m_usesPhysarum < 0 )
        m_usesPhysarum = ( m_shProgId != 0 && glGetUniformLocation( m_shProgId, "texPhysarum" ) >= 0 ) ? 1 : 0;
    return m_usesPhysarum == 1;
}

// Which compute-FX sims does this shader want?  One bit per CfxKindE, resolved
// once per program: a shader opts in purely by DECLARING the sampler (same
// convention as texSim/texFluid above).  The sampler's texture unit is bound
// here too — sampler uniforms never change, so once per program is enough.
unsigned int EffectShader::cfxMask()
{
    if ( !m_glReady || m_shProgId == 0 )
        return 0;
    if ( m_cfxProg != m_shProgId )
    {
        m_cfxProg = m_shProgId;
        m_cfxMask = 0;
        // Save/restore GL_CURRENT_PROGRAM: this query can run mid-frame (first time
        // a shader is drawn), so binding this program to read+set its sampler units
        // must not leave some OTHER program active for the caller's next GL call.
        GLint prev = 0;
        glGetIntegerv( GL_CURRENT_PROGRAM, &prev );
        glUseProgram( m_shProgId );
        for ( int k = 0; k < CFX_COUNT; ++k )
        {
            GLint loc = glGetUniformLocation( m_shProgId, CfxInfoTable[k].sampler );
            if ( loc >= 0 )
            {
                m_cfxMask |= ( 1u << k );
                glUniform1i( loc, CfxInfoTable[k].unit );
            }
        }
        glUseProgram( static_cast<GLuint>( prev ) );
    }
    return m_cfxMask;
}
