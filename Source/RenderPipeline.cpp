/*****************************************************************************\
 *                              RenderPipeline
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implements RenderPipeline: the per-frame render/present pipeline (see paint()) — texture-effect and
 *  combine-effect rendering, the SceneScheduler-driven cross-fade state machines, feedback/trails, shadow and
 *  order-independent-transparency passes, the 2D camera rig, true-stereo per-eye rendering, and the background
 *  ImageLoader thread that streams new photos in without stalling the render thread.
 *
 *  @author René Weller
 */

#include <float.h>
#include <math.h>
#include <algorithm>
#include <limits>

#include "shader_setup.h"
#include <set>
#include <cstring>
#include <string>
#include "RenderPipeline.h"
#include "PlatformQt.h"
#include "SpoutOut.h"
#include "SpoutIn.h"
#include "VideoIn.h"
#include "Scene3DShader.h"
#include "Utils.h"

#include <QtXml/QDomDocument>
#include <QtCore/QTextStream>
#include <QtCore/QFileInfo>
#include <QtGui/QImageReader>
#include <QtGui/QPainter>
#include <QtGui/QFontMetrics>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>
#include <QtCore/QSettings>
#include <QtCore/QDateTime>
#include <QtCore/QFile>
#include <cmath>
#include <GL/GLU.h>


static float minSides = 2.0; ///< Legacy lower bound of the kaleidoscope mirror-segment count; unused here (the effects
                             ///< keep their own m_minSides).
static unsigned int maxSides = 14; ///< Legacy range width of the kaleidoscope mirror-segment count; unused here (the
                                   ///< effects keep their own m_maxSides).

// Half-float colour format for the reaction-diffusion state buffers (Gray-Scott
// needs more precision than 8-bit or the pattern decays).  GLee may not define
// the core token, so provide it if missing.
#ifndef GL_RGBA16F
#define GL_RGBA16F \
    0x881A ///< Half-float RGBA internal format token (see above), provided in case the GL header set lacks it.
#endif

// Live-tunable look parameters (shared across all configs, set by hotkeys).
float RenderPipeline::M_Reactivity = 1.0f;
float RenderPipeline::M_TrailAmount = 0.6f;
bool  RenderPipeline::M_CalmMotion = true;
float RenderPipeline::M_MoodStrength = 1.0f;
float RenderPipeline::M_RenderScale = 1.0f;
float RenderPipeline::M_RenderScaleMax = 1.0f; // no supersampling unless asked for
bool  RenderPipeline::M_RenderScaleFromCli = false;
float RenderPipeline::M_LightShow = 0.0f;     // corner lamps / light-show OFF by default
bool  RenderPipeline::M_SpoutEnabled = false; // Spout sender (CLI -o)
float RenderPipeline::M_LatencyLead = 0.05f;  // display-phase lead vs. heard audio
int   RenderPipeline::M_StereoMode = 0;       // stereoscopic output (CLI -3 / 'z')
float RenderPipeline::M_StereoDepth = 1.0f;   // disparity strength
bool  RenderPipeline::M_Blackout = false;     // VJ blackout ('b')
float RenderPipeline::M_ChainScaleIni = 1.f;
bool  RenderPipeline::M_Freeze = false; // VJ freeze ('e'); a comparison run (KALEIDO_FREEZE_TIME) engages it after the
                                        // fade-in
float RenderPipeline::freezeTime()
{
    static const float FreezeTime = qEnvironmentVariableIsSet( "KALEIDO_FREEZE_TIME" )
                                        ? qEnvironmentVariable( "KALEIDO_FREEZE_TIME" ).toFloat()
                                        : -1.f;
    return FreezeTime;
}
bool                  RenderPipeline::M_Pinned = false;         // VJ pin ('u')
QHash<QString, float> RenderPipeline::M_Taste;                  // taste learning (skip/favourite)
bool                  RenderPipeline::M_SpoutInEnabled = false; // Spout input (CLI -i)
QString               RenderPipeline::M_SpoutInSender;
QString               RenderPipeline::M_VideoPath;    // native video input (CLI -v)
QString               RenderPipeline::M_WarmLabel;    // what the lazy warm-up did this frame (KALEIDO_FRAME_LOG)
QString               RenderPipeline::M_ImageDirCli;  // photo source override (CLI -f)
QString               RenderPipeline::M_ImageDirUser; // photo source override (ini)

/**  Path of the shared settings INI (kaleidoscope_settings.ini).
 *
 * @return
 *   Absolute path resolved through Platform::assetPath(); the file need not exist yet.
 *
 * Settings file lives next to the Presets folder (parent of Debug/Release),
 * matching how shaders and configs are loaded ("..\\...").
 **/
static QString settingsFilePath()
{
    return Platform::assetPath( QString( "..\\kaleidoscope_settings.ini" ) );
}

void RenderPipeline::loadSettings()
{
    QSettings s( settingsFilePath(), QSettings::IniFormat );
    M_Reactivity = clampParam( s.value( "reactivity", M_Reactivity ).toFloat(), 0.f, 3.0f );
    M_TrailAmount = clampParam( s.value( "trails", M_TrailAmount ).toFloat(), 0.f, 0.95f );
    // calmMotion (default ON): no beat-driven motion of the whole frame in
    // the host -- the virtual camera (punch/shake/sway/gate-weave/drift), the
    // drop rewind and break scrub, the bass shockwave and the trail layer's
    // beat warp are all off.  Set calmMotion=false in the ini for the old look.
    M_CalmMotion = s.value( "calmMotion", M_CalmMotion ).toBool();
    M_MoodStrength = clampParam( s.value( "mood", M_MoodStrength ).toFloat(), 0.f, 2.5f );
    // Probing hook: the mood grade rotates the WHOLE frame by the key the
    // music is in, so a probe of one scene or one transition is judged
    // through a constant tint -- a blueprint came back wine-red.  The
    // review walk already pins this to neutral for the same reason;
    // KALEIDO_MOOD does it for a scripted probe, WITHOUT touching the
    // user's ini.  Unset, nothing changes.
    if ( qEnvironmentVariableIsSet( "KALEIDO_MOOD" ) )
        M_MoodStrength = clampParam( qEnvironmentVariable( "KALEIDO_MOOD" ).toFloat(), 0.f, 2.5f );
    M_LatencyLead = clampParam( s.value( "latencyLead", M_LatencyLead ).toFloat(), 0.f, 0.25f );
    M_StereoMode = s.value( "stereoMode", M_StereoMode ).toInt() & 3;
    // Photo source. Empty (the shipped default) means "whatever the preset
    // says", which is the bundled Images/ folder -- see init().
    M_ImageDirUser = s.value( "imageDirectory", M_ImageDirUser ).toString().trimmed();
    M_StereoDepth = clampParam( s.value( "stereoDepth", M_StereoDepth ).toFloat(), 0.f, 2.f );
    setRenderScale( s.value( "renderScale", M_RenderScale ).toFloat() ); // clamps internally
    setRenderScaleMax( s.value( "renderScaleMax", M_RenderScaleMax ).toFloat() );
    // The chain labs' coordinate grid relative to the frame: 0.5 computes a
    // quarter of the chain (for weak GPUs), read back bilinearly.
    EffectShader::M_ChainScale = clampParam( s.value( "chainScale", EffectShader::M_ChainScale ).toFloat(), 0.5f, 1.f );
    M_ChainScaleIni = EffectShader::M_ChainScale; // the quality profile may lower the session's value
    EffectShader::M_ChainSS = s.value( "chainSupersample", true ).toBool();
    if ( qEnvironmentVariableIsSet( "KALEIDO_CHAIN_SCALE" ) )
        EffectShader::M_ChainScale = clampParam( qEnvironmentVariable( "KALEIDO_CHAIN_SCALE" ).toFloat(), 0.5f, 1.f );

    // Taste learning: PER-PRESET per-shader selection-weight factors (keys
    // "<Preset>/<file>"), decayed toward 1.0 a little on every start so old
    // skips/favourites slowly lose their grip.
    M_Marked.clear();
    s.beginGroup( "marked" );
    for ( const QString &k : s.allKeys() )
        if ( s.value( k, false ).toBool() )
            M_Marked.insert( k );
    s.endGroup();

    // Cue memory: [cues] <track>/<sekunde> = <Szene>.  A favourite pressed while
    // a track is identified remembers WHERE it was pressed; the next time the
    // same track reaches that point, that scene comes back.  The visualiser
    // learns a favourite picture per song, one press at a time.
    M_Cues.clear();
    s.beginGroup( "cues" );
    for ( const QString &k : s.allKeys() )
    {
        const int slash = k.lastIndexOf( QChar( '/' ) );
        if ( slash <= 0 )
            continue;
        M_Cues[k.left( slash )].append( qMakePair( k.mid( slash + 1 ).toDouble(), s.value( k ).toString() ) );
    }
    s.endGroup();

    s.beginGroup( "taste" );
    for ( const QString &k : s.allKeys() ) // recursive: Preset/File.frag
    {
        float v = clampParam( s.value( k, 1.f ).toFloat(), 0.3f, 2.5f );
        v = 1.f + ( v - 1.f ) * 0.97f;
        if ( fabsf( v - 1.f ) > 0.01f )
            M_Taste[k] = v;
    }
    s.endGroup();
    // The chain labs' taste per class (EffectShader::M_ClassTaste), fading
    // toward neutral by the same 3 % per start: an old like slowly wears off.
    EffectShader::M_ClassTaste.clear();
    s.beginGroup( "classTaste" );
    for ( const QString &k : s.allKeys() ) // recursive: knob/class
    {
        float v = clampParam( s.value( k, 1.f ).toFloat(), 0.6f, 1.6f );
        v = 1.f + ( v - 1.f ) * 0.97f;
        if ( fabsf( v - 1.f ) > 0.01f )
            EffectShader::M_ClassTaste[k.toStdString()] = v;
    }
    s.endGroup();
}

/**  Basename of a fragment path ("..\\Scene2D\\Voyager.frag" -> "Voyager.frag"), the per-scene part of a taste/cue
 * key.
 *
 * @param fragPath  Fragment shader path with either slash kind; nullptr yields "?". (in)
 *
 * @return
 *   Everything after the last path separator (the whole string if there is none).
 **/
static QString tasteBase( const char *fragPath )
{
    QString f = QString::fromLocal8Bit( fragPath ? fragPath : "?" );
    int     cut = std::max( f.lastIndexOf( QChar( '\\' ) ), f.lastIndexOf( QChar( '/' ) ) );
    return f.mid( cut + 1 );
}

float RenderPipeline::tasteFor( const char *fragPath ) const
{
    auto it = M_Taste.constFind( m_presetName + "/" + tasteBase( fragPath ) );
    return ( it == M_Taste.constEnd() ) ? 1.f : it.value();
}

void RenderPipeline::bumpTaste( const char *fragPath, float mul )
{
    QString key = m_presetName + "/" + tasteBase( fragPath );
    float   v = clampParam( ( M_Taste.value( key, 1.f ) ) * mul, 0.3f, 2.5f );
    M_Taste[key] = v;
    // Persist immediately (rare events; losing them to a crash would defeat
    // the learning).
    QSettings s( settingsFilePath(), QSettings::IniFormat );
    s.setValue( "taste/" + key, v );
    s.sync();
    fprintf( stderr, "Taste: %s -> %.2f\n", key.toLocal8Bit().constData(), v );
}

/**  Weights the classes a walking chain lab shows now (EffectShader::bumpClassTaste) and persists them at once.
 *
 * @param e    The effect on screen (anything but a walking chain lab: nothing happens). (in)
 * @param mul  Factor per class (a like > 1, a skip < 1). (in)
 **/
static void bumpClassTaste( EffectShader *e, float mul )
{
    const auto changed = e->bumpClassTaste( mul );
    if ( changed.empty() )
        return;
    QSettings s( settingsFilePath(), QSettings::IniFormat );
    for ( const auto &kv : changed )
        s.setValue( "classTaste/" + QString::fromStdString( kv.first ), kv.second );
    s.sync();
}

void RenderPipeline::saveSettings()
{
    QSettings s( settingsFilePath(), QSettings::IniFormat );
    s.setValue( "reactivity", M_Reactivity );
    s.setValue( "trails", M_TrailAmount );
    s.setValue( "calmMotion", M_CalmMotion );
    s.setValue( "mood", M_MoodStrength );
    s.setValue( "latencyLead", M_LatencyLead );
    s.setValue( "stereoMode", M_StereoMode );
    s.setValue( "stereoDepth", M_StereoDepth );
    s.setValue( "renderScale", M_RenderScale );
    s.setValue( "renderScaleMax", M_RenderScaleMax );
    s.setValue( "chainScale", M_ChainScaleIni );
    s.setValue( "chainSupersample", EffectShader::M_ChainSS );
    // Written back even when empty, so the key is visible in the file for
    // anyone who wants to point the visualizer at their own pictures without
    // hunting through documentation for its name.
    s.setValue( "imageDirectory", M_ImageDirUser );
    s.sync();
    fprintf( stderr, "Saved settings: react=%.2f trails=%.2f mood=%.2f lead=%.0fms scale=%.2f\n",
             M_Reactivity, M_TrailAmount, M_MoodStrength, M_LatencyLead * 1000.f, M_RenderScale );
}


/**  Rounds to the nearest integer, halves up (used for the power-of-two texture-size check in resize()).
 *
 * @param f  Value to round. (in)
 *
 * @return
 *   floor(f) if the fractional part is below 0.5, else ceil(f).
 **/
float roundHalfUp( float f )
{
    if ( f - floor( f ) < 0.5 )
        return floor( f );
    else
        return ceil( f );
}


/**  Slew-rate limiter: moves @p cur toward @p target by at most rate*dt this frame.
 *
 * @param cur     Current value. (in)
 * @param target  Value being approached. (in)
 * @param rate    Maximum change per second (units of the value per second). (in)
 * @param dt      Frame time in seconds. (in)
 *
 * @return
 *   The new value: @p target if it is within reach, else @p cur stepped by rate*dt toward it.
 *
 * Used to keep audio-driven brightness from changing fast enough to strobe.
 **/
static float slewToward( float cur, float target, float rate, float dt )
{
    float max_step = rate * dt;
    if ( target > cur )
        return ( target - cur < max_step ) ? target : cur + max_step;
    else
        return ( cur - target < max_step ) ? target : cur - max_step;
}



// Constructor
RenderPipeline::RenderPipeline()
    : m_mesh( 0 ),
      m_npotSupported( false ),
      m_width( 100 ),
      m_height( 100 ),
      m_texInternalFormat( GL_RGBA8 ),
      m_texFormat( GL_RGBA ),
      m_texType( GL_UNSIGNED_BYTE )
      // GL object ids MUST start at 0 ("not created yet"): creation code reuses an
      // existing id and only calls glGen* when the id is still 0.  The old dummy
      // values (1/2) made those guards skip creation -> invalid FBOs -> black frames.
      ,
      m_fboEffectTexture1( 0 ),
      m_fboEffectTexture2( 0 ),
      m_fboEffectFx1( 0 ),
      m_fboEffectFx2( 0 ),
      m_attachmentpoint( GL_COLOR_ATTACHMENT0 ),
      m_texID1( 0 ),
      m_texID2( 0 ),
      m_texIDFBOEffectTexture1( 0 ),
      m_texIDFBOEffectTexture2( 0 ),
      m_texIDFBOEffectFx1( 0 ),
      m_texIDFBOEffectFx2( 0 ),
      m_imageList(),
      m_imageListIterator(),
      m_time(),
      m_interpolationTexture( 1.0 ),
      m_timeTexture(),
      m_timeTextureSolo( 15.0 ) // rwrw 30
      ,
      m_timeTextureInterpolation( 20.0 ) // rwrw 50
      ,
      m_actTex( 0 ),
      m_nextTex( 0 ),
      m_stateTexture( 1 ) // State == 1 => Solo
      ,
      m_triggerImageload( false ),
      m_waitForImageToLoad( false )
      // KALEIDO_TIME_START setzt die Uhr vor, mit der jeder Shader rechnet.
      // Ohne das laesst sich "haelt die Szene nach einer Stunde noch?" nur
      // pruefen, indem man eine Stunde wartet -- und genau diese Frage hat
      // eine ganze Klasse leerer Szenen versteckt: wer die Kamera mit
      // time*k vorwaerts schiebt, ohne dass die Geometrie das mitmacht,
      // fliegt irgendwann aus seiner eigenen Welt heraus.
      ,
      m_globaltime( static_cast<double>( qEnvironmentVariableIntValue( "KALEIDO_TIME_START" ) ) ),
      m_nanotimer(),
      m_nrTextureUploads( 0 )
{
    m_effectTextures.clear();
    m_effectFx.clear();
    m_effectTransitions.clear();
}




void RenderPipeline::init( const QString &directory, unsigned int timeTextureSoloMin, unsigned int timeTextureSoloMax,
                           unsigned int timeTextureInterpolationMin, unsigned int timeTextureInterpolationMax )
{
    // Photo source, most specific layer first: an explicit -f on the command
    // line, then the user's persistent ini setting, then the preset's own
    // ImageDirectory attribute -- which ships as "..\\Images", the folder the
    // bundled photo library unpacks into, resolved against the executable's
    // working directory exactly like the shader paths are.
    m_imageDirectory = !M_ImageDirCli.isEmpty()    ? M_ImageDirCli
                       : !M_ImageDirUser.isEmpty() ? M_ImageDirUser
                                                   : directory;

    m_timeTextureSoloMin = timeTextureSoloMin;
    m_timeTextureSoloMax = timeTextureSoloMax;
    m_timeTextureInterpolationMin = timeTextureInterpolationMin;
    m_timeTextureInterpolationMax = timeTextureInterpolationMax;
}

void RenderPipeline::start( int width, int height )
{
    // Revisiting an already-built configuration: keep the GL resources and just
    // resize. Rebuilding here would leak them -- reinit() generates new names
    // for the colour and depth attachments without freeing the old ones.
    //
    // The photo loader is the exception, and is the one thing that has to come
    // back: stop() ends that thread, and this early return used to walk past
    // the pointer to it, which stop() had deleted and left dangling. A revisited
    // preset was then prefetching nothing -- and any use of that pointer was
    // undefined, which is the more serious half.
    if ( m_started )
    {
        if ( !m_imageLoader )
        {
            m_imageLoader = new ImageLoader( this );
            m_imageLoader->start();
        }
        resize( width, height );
        return;
    }
    m_started = true;

    m_nanotimer.start();

    m_imageList.clear();
    traverse( m_imageDirectory, m_imageList );
    // KALEIDO_FIXED_PHOTO=<file>: every photo slot shows this one picture (a
    // path, or a name in the image directory).  For comparisons between two
    // runs -- with KALEIDO_SEED the same rolls on the same photo, pixel for
    // pixel; without it every start draws other photos.
    if ( qEnvironmentVariableIsSet( "KALEIDO_FIXED_PHOTO" ) )
    {
        QString fixed = qEnvironmentVariable( "KALEIDO_FIXED_PHOTO" );
        if ( !QFileInfo::exists( fixed ) )
            fixed = QDir( m_imageDirectory ).filePath( fixed );
        if ( QFileInfo::exists( fixed ) )
        {
            m_imageList = QStringList{ fixed };
            fprintf( stderr, "Photo source: KALEIDO_FIXED_PHOTO %s\n", qPrintable( fixed ) );
        }
        else
            fprintf( stderr, "WARNING: KALEIDO_FIXED_PHOTO '%s' not found -- the photos stay random\n",
                     qPrintable( fixed ) );
    }
    m_imageListIterator = m_imageList.begin();

    // Name the LAYER the directory came from, not just the path: with three
    // possible sources a bare path leaves the reader guessing which one won,
    // and a typo in the ini looks exactly like a missing photo pack.
    const char *src = !M_ImageDirCli.isEmpty()    ? "command line -f"
                      : !M_ImageDirUser.isEmpty() ? "imageDirectory in kaleidoscope_settings.ini"
                                                  : "preset default";
    printf( "Nr of images: %d\n", static_cast<int>( m_imageList.size() ) );
    if ( m_imageList.isEmpty() )
        fprintf( stderr, "WARNING: image directory '%s' (%s) missing or empty - "
                         "using a procedural fallback texture. The photo pack is an "
                         "optional download; unpack it into the Images folder.\n",
                 m_imageDirectory.toLocal8Bit().constData(), src );
    else
        fprintf( stderr, "Photo source: %s (%s)\n",
                 m_imageDirectory.toLocal8Bit().constData(), src );

    // The honest catalogue size. An entry is a SCENE -- a model, a camera, a
    // background, a set of parameters -- but several entries can be the same
    // shader wearing different clothes. Reporting only the entry count inflates
    // what the program is; reporting only the shader count undersells what it
    // shows. Both, side by side.
    {
        std::set<std::string>              distinct;
        int                                entries = 0;
        const std::vector<EffectShader *> *lists[3] =
            { &m_effectTextures, &m_effectFx, &m_effectTransitions };
        for ( int l = 0; l < 3; ++l )
            for ( EffectShader *e : *lists[l] )
            {
                ++entries;
                if ( e->fragmentName() )
                    distinct.insert( e->fragmentName() );
            }
        fprintf( stderr, "Catalogue: %d scenes from %d shaders (%d entries reuse one)\n",
                 entries, static_cast<int>( distinct.size() ), entries - static_cast<int>( distinct.size() ) );
    }
    qsrand( 0 ); // no-op: QRandomGenerator is auto-seeded
    unsigned int start = qrand() % ( m_imageList.size() + 1 );
    for ( unsigned int i = 0; i < start; ++i )
        ++m_imageListIterator;

    // A malformed configuration (wrong attribute names, missing type="normal")
    // used to yield ZERO valid entries here — and every qrand() % size() below
    // then crashed with a silent integer division by zero (0xC0000094).  Fall
    // back to a plain pass-through with a clear message instead.
    if ( m_effectTextures.empty() )
    {
        fprintf( stderr, "WARNING: configuration has no valid <TextureShader> "
                         "entries (check attribute names + type) - using a "
                         "plain fallback.\n" );
        EffectShader *fb = new EffectShader( "..\\FX\\FxPlain.frag", 30, 60, 20, 40 );
        fb->setProbability( 1.f );
        fb->setComplexity( 1 );
        m_effectTextures.push_back( fb );
    }
    if ( m_effectFx.empty() )
    {
        fprintf( stderr, "WARNING: configuration has no valid <CombineShader> "
                         "entries (they need the SAME attribute names as "
                         "TextureShader + type=\"normal\") - using FxPlain.\n" );
        EffectShader *fb = new EffectShader( "..\\FX\\FxPlain.frag", 30, 60, 20, 40 );
        fb->setProbability( 1.f );
        fb->setComplexity( 1 );
        m_effectFx.push_back( fb );
    }
    // Presets from before the Transitions/ split (or with a typo'd element
    // name) carry no <TransitionShader> entries; scene fades then fall back
    // to the classic linear crossfade so old configs keep working unchanged.
    if ( m_effectTransitions.empty() )
    {
        fprintf( stderr, "WARNING: configuration has no <TransitionShader> "
                         "entries - scene fades use the plain Crossfade.\n" );
        EffectShader *fb = new EffectShader( "..\\Transitions\\Crossfade.frag", 30, 60, 20, 40 );
        fb->setProbability( 1.f );
        fb->setComplexity( 1 );
        m_effectTransitions.push_back( fb );
    }

    // Initiale Effekt-/Combine-Wahl + Szenen-Uhren: SceneScheduler.
    m_scheduler.attach( &m_effectTextures, &m_effectFx, &m_effectTransitions );
    m_scheduler.setTasteCallback( [this]( const char *f )
    { return tasteFor( f ); } );
    m_scheduler.reset();

    // Start the timers
    m_time.start();
    m_timeTexture.start();


    // m_renderPipeline = new RenderPipeline(100,100, directory);
    m_imageLoader = new ImageLoader( this );
    m_imageLoader->start();

    loadShader();
    reinit( width, height );
}

QString RenderPipeline::activeShaderInfo() const
{
    auto base = []( const char *p ) -> QString
    {
        QString s = QString::fromLatin1( p ? p : "?" );
        int     i = s.lastIndexOf( '\\' );
        if ( i < 0 )
            i = s.lastIndexOf( '/' );
        return ( i >= 0 ) ? s.mid( i + 1 ) : s;
    };
    QString out;
    if ( !m_effectTextures.empty() )
    {
        out += "TEX   " + base( m_effectTextures[m_scheduler.actTexture()]->fragmentName() );
        if ( currentSceneMarked() )
            out += QString( "   [MARKIERT %1]" ).arg( markedCount() );
        if ( m_scheduler.texState() != 0 )
            out += QString( "   → %1  (%2%)" )
                       .arg( base( m_effectTextures[m_scheduler.nextTexture()]->fragmentName() ) )
                       .arg( static_cast<int>( ( 1.0f - m_scheduler.texInterp() ) * 100.0f + 0.5f ) );
        // Chain labs: the chain in words, stage by stage (to spot weak transforms).
        const std::string chain = m_effectTextures[m_scheduler.actTexture()]->chainInfo();
        if ( !chain.empty() )
            out += "\n" + QString::fromUtf8( chain.c_str() );
    }
    out += "\n";
    if ( !m_effectFx.empty() )
    {
        out += "COMB  " + base( m_effectFx[m_scheduler.actFx()]->fragmentName() );
        if ( m_scheduler.fxState() != 0 )
            out += QString( "   → %1  (%2%)" )
                       .arg( base( m_effectFx[m_scheduler.nextFx()]->fragmentName() ) )
                       .arg( static_cast<int>( ( 1.0f - m_scheduler.fxInterp() ) * 100.0f + 0.5f ) );
        const std::string chain = m_effectFx[m_scheduler.actFx()]->chainInfo(); // FxChain
        if ( !chain.empty() )
            out += "\n" + QString::fromUtf8( chain.c_str() );
    }
    // The transition only ACTS during a scene fade; showing it outside one
    // would just name the stale last roll.
    if ( !m_effectTransitions.empty() && m_scheduler.texState() != 0 )
        out += "\nTRANS " + base( m_effectTransitions[m_scheduler.actTransition()]->fragmentName() );
    return out;
}

void RenderPipeline::stop()
{
    // NOTE: the global Spout facades are deliberately NOT released here —
    // stop() runs on every preset switch, which made the Spout sender vanish
    // from OBS/Resolume at each switch (and deleted the receiver texture
    // without a current GL context).  GLwidget's destructor releases them
    // once at shutdown.

    // NOTE: terminate() hard-kills the loader thread immediately rather than
    // asking it to exit its poll loop cooperatively — there is no cooperative
    // stop flag (ImageLoader::run() only checks m_triggerImageload). Safe in
    // practice because run() never holds a mutex; the worst case is an image
    // decode aborted partway, and the ImageLoader object itself is deleted
    // right below anyway.
    m_imageLoader->terminate();

    delete m_imageLoader;
    m_imageLoader = nullptr; // start() checks this; a stale one was a dangling delete

    // GL is deliberately NOT torn down here any more.
    //
    // It used to be, and start() then refused to rebuild it -- its early return
    // on m_started was added to stop a rebuild from leaking. The two together
    // meant that switching BACK to a preset resumed drawing with framebuffer,
    // texture and program names that had been deleted. That is the whole of the
    // GL error storm seen on rapid preset switching: bind a deleted FBO, sample
    // a deleted texture, use a released program, then read uniform locations
    // off it -- four distinct driver complaints, one cause.
    //
    // Freeing them here bought remarkably little: the two photo textures and
    // five framebuffer objects, while the five colour attachments, the two
    // depth textures and the safety pass -- everything that actually costs
    // memory -- stayed allocated regardless, because cleanTextures() never
    // covered them. Roughly 8 MB per preset, against a class of errors.
    //
    // The GL resources now live as long as the pipeline does and ~RenderPipeline
    // is their single owner. Reclaiming them on a preset switch is a real
    // feature, but it needs a complete release/rebuild pair, not half of one.
}




// Destructor
RenderPipeline::~RenderPipeline()
{
    // Sole owner of this pipeline's GL objects since stop() gave that up, and
    // of the loader thread when the app exits without a stop() (the ACTIVE
    // preset never gets one). Guarded, because stop() may already have run.
    if ( m_imageLoader )
    {
        m_imageLoader->terminate();
        delete m_imageLoader;
        m_imageLoader = nullptr;
    }
    cleanTextures();
    cleanShaderPrograms();
    delete m_mesh;
}

void RenderPipeline::cleanTextures()
{
    glDeleteFramebuffers( 1, &m_fboEffectTexture1 ); // clean up framebuffer object
    glDeleteFramebuffers( 1, &m_fboEffectTexture2 ); // clean up framebuffer object
    glDeleteFramebuffers( 1, &m_fboEffectFx1 );      // clean up framebuffer object
    glDeleteFramebuffers( 1, &m_fboEffectFx2 );      // clean up framebuffer object
    glDeleteFramebuffers( 1, &m_fboTransition );     // clean up framebuffer object
    glDeleteTextures( 1, &m_actTex );                // clean up textures
    glDeleteTextures( 1, &m_nextTex );
    // Zeroed so this is idempotent. A name that has been deleted can be
    // REISSUED by the driver to the next glGen*, and deleting it a second
    // time would then destroy a live object belonging to someone else.
    m_fboEffectTexture1 = m_fboEffectTexture2 = 0;
    m_fboEffectFx1 = m_fboEffectFx2 = m_fboTransition = 0;
    m_actTex = m_nextTex = 0;
    // glDeleteTextures( 1, &m_texID3 );
}

void RenderPipeline::cleanShaderPrograms()
{
    // Shared: every configuration builds the same OverlayBlend program.
    shaderProgramRelease( m_shProgIdFx );


    for ( unsigned int i = 0; i < m_effectTextures.size(); ++i )
    {
        m_effectTextures[i]->cleanShaderPrograms();
    }


    for ( unsigned int i = 0; i < m_effectFx.size(); ++i )
    {
        m_effectFx[i]->cleanShaderPrograms();
    }

    for ( unsigned int i = 0; i < m_effectTransitions.size(); ++i )
    {
        m_effectTransitions[i]->cleanShaderPrograms();
    }
}



void RenderPipeline::loadShader()
{
    // checkGLErrors("loadShader 0");
    // cleanShaderPrograms();
    // checkGLErrors("loadShader 1");
    initGLSL(); // init shader runtime
    checkGLErrors( "loadShader 2" );
}

bool RenderPipeline::loadObj( const char *filename )
{
    delete m_mesh;
    m_mesh = new Mesh( filename );
    if ( !m_mesh->success() )
    {
        std::cerr << "Failed reading model\n";
        return false;
    }
    return true;
}

void RenderPipeline::reinit( int width, int height )
{
    fprintf( stderr, "\nreinit start\n" );
    checkGLErrors( "reinit() 0" );
    // cleanTextures();

    // width/height arrive as the DISPLAY (window) resolution.  Render the pipeline
    // at M_RenderScale × that; only the final present pass upscales to the display.
    m_displayW = width;
    m_displayH = height;
    m_width = static_cast<int>( width * M_RenderScale + 0.5f );
    if ( m_width < 16 )
        m_width = 16;
    m_height = static_cast<int>( height * M_RenderScale + 0.5f );
    if ( m_height < 16 )
        m_height = 16;

    m_nrTextureUploads = 0;
    /*	const GLubyte *extstr = glGetString(GL_EXTENSIONS);
        m_npotSupported = (NULL != strstr(reinterpret_cast<const char *>(extstr),"GL_ARB_texture_non_power_of_two"));

        // check whether we can actually load textures of that size on the GPU
        glTexImage2D( GL_PROXY_TEXTURE_2D, 0, m_texInternalFormat,
            m_width, m_height, 0, m_texFormat, m_texType, NULL );
        GLint realwidth;
        glGetTexLevelParameteriv( GL_PROXY_TEXTURE_2D, 0, GL_TEXTURE_WIDTH, &realwidth );
        if ( realwidth == 0 )
        {
            fprintf( stderr, "Can't load textures of size %u x %u on the graphics card!\n", m_width, m_height );
            exit(1);
        }

        // check whether NPOT textures are supported (if any)
        if ( m_width != ( 1 << static_cast<int> ( ROUND( log(static_cast<float>(m_width))/log(2.0f) ) ) ) ||
            m_height != ( 1 << static_cast<int> ( ROUND( log(static_cast<float>(m_height))/log(2.0f) ) ) ) )
        {
            fprintf( stderr, "texture size is  %u x %u x RGBA\n", m_width, m_height );

            if ( m_npotSupported )
                fputs( "NPOT textures are OK.\n", stderr );
            else
            {
                fputs( "NPOT textures are NOT supported!\n", stderr );
                exit(1);
            }
        }*/


    for ( unsigned int i = 0; i < m_effectTextures.size(); ++i )
    {
        m_effectTextures[i]->prepare( m_width, m_height ); // lazy compile
    }


    for ( unsigned int i = 0; i < m_effectFx.size(); ++i )
    {
        m_effectFx[i]->prepare( m_width, m_height ); // lazy compile
    }

    for ( unsigned int i = 0; i < m_effectTransitions.size(); ++i )
    {
        m_effectTransitions[i]->prepare( m_width, m_height ); // lazy compile
    }

    checkGLErrors( "reinit() 0" );
    createTexture(); // create texture

    createFBOTexture( m_texIDFBOEffectTexture1 );
    createFBOTexture( m_texIDFBOEffectTexture2 );
    createFBOTexture( m_texIDFBOEffectFx1 );
    createFBOTexture( m_texIDFBOEffectFx2 );
    createFBOTexture( m_texIDFBOTransition );
    initFBO( m_fboEffectTexture1, m_texIDFBOEffectTexture1, &m_depthTexEffect1 );
    initFBO( m_fboEffectTexture2, m_texIDFBOEffectTexture2, &m_depthTexEffect2 );
    initFBO( m_fboEffectFx1, m_texIDFBOEffectFx1 );
    initFBO( m_fboEffectFx2, m_texIDFBOEffectFx2 );
    initFBO( m_fboTransition, m_texIDFBOTransition );

    //	initFBO();
    // Photosensitivity-safety: final present FBO + brightness-limiting shader.
    setupSafety();

    fprintf( stderr, "reinit end\n" );
}


// Lightweight resize – see header.  Only the off-screen FBO colour textures
// depend on the window size; everything else (image textures, shader programs,
// the FBOs themselves) is independent and is kept as-is.  setupFBOTexture()
// re-allocates the storage of an EXISTING texture ID via glTexImage2D, so the
// FBOs that already reference these IDs simply render at the new size.  No
// glGen*/glCreate* is issued, hence no leak and no image reload.
void RenderPipeline::resize( int width, int height )
{
    if ( width <= 0 || height <= 0 )
        return;

    // width/height = display resolution; render at M_RenderScale × that.
    m_displayW = width;
    m_displayH = height;
    m_width = static_cast<int>( width * M_RenderScale + 0.5f );
    if ( m_width < 16 )
        m_width = 16;
    m_height = static_cast<int>( height * M_RenderScale + 0.5f );
    if ( m_height < 16 )
        m_height = 16;

    // Effect shaders only need their reported resolution updated (no recompile).
    for ( unsigned int i = 0; i < m_effectTextures.size(); ++i )
        m_effectTextures[i]->setSize( m_width, m_height );
    for ( unsigned int i = 0; i < m_effectFx.size(); ++i )
        m_effectFx[i]->setSize( m_width, m_height );
    for ( unsigned int i = 0; i < m_effectTransitions.size(); ++i )
        m_effectTransitions[i]->setSize( m_width, m_height );

    // Re-allocate the off-screen colour buffers to the new size, reusing IDs.
    setupFBOTexture( m_texIDFBOEffectTexture1 );
    setupFBOTexture( m_texIDFBOEffectTexture2 );
    setupFBOTexture( m_texIDFBOEffectFx1 );
    setupFBOTexture( m_texIDFBOEffectFx2 );
    setupFBOTexture( m_texIDFBOTransition );

    // The 3D-scene DEPTH textures must track the colour size, or the effect
    // FBOs go INCOMPLETE_DIMENSIONS after any resize.
    for ( GLuint dt : { m_depthTexEffect1, m_depthTexEffect2 } )
    {
        if ( !dt )
            continue;
        glBindTexture( GL_TEXTURE_2D, dt );
        glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, m_width, m_height,
                      0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL );
    }
    glBindTexture( GL_TEXTURE_2D, 0 );

    // Final-(Present)- und Bloom-Texturen zieht der PresentPass nach.
    m_present.resize( m_width, m_height, m_texInternalFormat, m_texFormat, m_texType );

    // Resize the feedback/trail ping-pong textures.
    for ( int i = 0; i < 2; ++i )
        if ( m_texTrail[i] != 0 )
        {
            glBindTexture( GL_TEXTURE_2D, m_texTrail[i] );
            glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height, 0,
                          m_texFormat, m_texType, NULL );
            glGenerateMipmap( GL_TEXTURE_2D );
        }


    glBindTexture( GL_TEXTURE_2D, 0 );
    checkGLErrors( "resize()" );
}



// Create the final FBO + present shader.  If anything fails, m_safetyReady stays
// false and paint() falls back to drawing the combine result straight to screen.
void RenderPipeline::setupSafety()
{
    // Finaler FBO, Present-Programm und Bloom: alles im PresentPass.
    m_present.setup( m_width, m_height, m_texInternalFormat, m_texFormat, m_texType );

    // ---- Feedback / trails ping-pong buffers (mipmapped: present reads them) ----
    bool trail_ok = true;
    for ( int i = 0; i < 2; ++i )
    {
        if ( m_texTrail[i] == 0 )
            glGenTextures( 1, &m_texTrail[i] );
        glBindTexture( GL_TEXTURE_2D, m_texTrail[i] );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
        glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height, 0,
                      m_texFormat, m_texType, NULL );
        glGenerateMipmap( GL_TEXTURE_2D );
        if ( m_fboTrail[i] == 0 )
            glGenFramebuffers( 1, &m_fboTrail[i] );
        glBindFramebuffer( GL_FRAMEBUFFER, m_fboTrail[i] );
        glFramebufferTexture2D( GL_FRAMEBUFFER, m_attachmentpoint,
                                GL_TEXTURE_2D, m_texTrail[i], 0 );
        if ( !checkFramebufferStatus() )
            trail_ok = false;
    }
    glBindFramebuffer( GL_FRAMEBUFFER, 0 );
    glBindTexture( GL_TEXTURE_2D, 0 );

    if ( m_trailProgId == 0 )
    {
        m_trailProgId = setShaders( "..\\standard.vert", "..\\Engine\\Feedback.frag" );
        m_trailCurUni = glGetUniformLocation( m_trailProgId, "texCur" );
        m_trailPrevUni = glGetUniformLocation( m_trailProgId, "texPrev" );
        m_trailResUni = glGetUniformLocation( m_trailProgId, "resolution" );
        m_trailDecayUni = glGetUniformLocation( m_trailProgId, "decay" );
        m_trailZoomUni = glGetUniformLocation( m_trailProgId, "warpZoom" );
        m_trailRotUni = glGetUniformLocation( m_trailProgId, "warpRot" );
        m_trailHueUni = glGetUniformLocation( m_trailProgId, "hueDrift" );
        m_trailDepthUni = glGetUniformLocation( m_trailProgId, "depth3D" );
        m_trailRipAmpUni = glGetUniformLocation( m_trailProgId, "rippleAmp" );
        m_trailRipPhUni = glGetUniformLocation( m_trailProgId, "ripplePhase" );
        m_trailSwirlUni = glGetUniformLocation( m_trailProgId, "swirlAmp" );
        m_trailFlowAmpUni = glGetUniformLocation( m_trailProgId, "flowAmp" );
        m_trailFlowPhUni = glGetUniformLocation( m_trailProgId, "flowPhase" );
    }
    if ( m_stereoMixProgId == 0 )
    {
        // Plain per-pixel cross-mix for eye-packed true-stereo frames (the
        // styled combines would warp content across the eye boundary).
        m_stereoMixProgId = setShaders( "..\\standard.vert", "..\\Engine\\StereoMix.frag" );
        m_stereoMixTexAUni = glGetUniformLocation( m_stereoMixProgId, "texA" );
        m_stereoMixTexBUni = glGetUniformLocation( m_stereoMixProgId, "texB" );
        m_stereoMixResUni = glGetUniformLocation( m_stereoMixProgId, "resolution" );
        m_stereoMixWUni = glGetUniformLocation( m_stereoMixProgId, "interpolation" );
    }
    m_feedbackReady = m_present.ready() && trail_ok && ( m_trailProgId != 0 )
                      && ( m_trailCurUni >= 0 ) && ( m_trailPrevUni >= 0 );

    checkGLErrors( "setupSafety()" );

    // GPU-/Host-Simulationen (RD, Fluid, Smoke3D, Physarum) - siehe GpuSims.
    m_sims.setupAll();
}


// Mood-based selection bias — see header.  Two components:
//   1. Busyness: shader complexity should roughly match the arousal.
//   2. Mood TAGS (config attribute mood="dark,bright,calm,aggressive"): a
//      tagged shader is preferred when the music's mood agrees (dark valence →
//      dark shaders, high arousal → aggressive, ambient → calm) and penalised
//      when it clearly disagrees.  Untagged shaders stay neutral, so sparsely
//      tagged configs keep working.  The result stays probabilistic — a bias,
//      not a hard filter, so variety survives.
// Track-title reveal: render "title / artist" into a transparent image; the
// GL upload happens at the next paint() (context current there).  A soft dark
// halo keeps the text readable over any content.
void RenderPipeline::showTitle( const QString &title, const QString &artist )
{
    // 2x Auflösung ggü. dem ursprünglichen 1024x256 (gleiches Seitenverhältnis
    // 4:1, alle Maße/Schriftgrade proportional mitskaliert): mehrere Einflug-
    // Stile vergrößern die Textur beim Reveal bis auf das ~3.5-fache (z.B.
    // "zoom-through"), und der gemeinsame Ausklang aller Stile ("wächst sanft
    // dem Betrachter entgegen") vergrößert zusätzlich bis 1.55x - bei der alten
    // Auflösung wurde dabei das Texel-Raster sichtbar (verpixelter Text, je
    // nach Stil unterschiedlich stark, wegen des gemeinsamen Ausklangs aber
    // IMMER auch am Ende jedes Reveals). Kostet nichts an Laufzeit: wird nur
    // einmal pro Trackwechsel gerendert.
    const float S = 2.0f;
    const int   W = static_cast<int>( 1024 * S ), H = static_cast<int>( 256 * S );
    QImage      img( W, H, QImage::Format_ARGB32 );
    img.fill( Qt::transparent );
    QPainter p( &img );
    p.setRenderHint( QPainter::Antialiasing );
    p.setRenderHint( QPainter::TextAntialiasing );

    // Auto-shrink instead of eliding with "...": most real track/artist names
    // fit once the font gives a little, and a slightly smaller-but-complete
    // title reads better than a truncated one on a reveal that's only on
    // screen for ~8s anyway. Floors at ~55% of the nominal size (still
    // legible); eliding stays as the last resort for the rare title that
    // doesn't fit even there.
    const int max_w = W - static_cast<int>( 80 * S );
    auto      fit_font = [&]( const char *family, int nominalPt, bool bold, const QString &text ) -> QFont
    {
        const int min_pt = static_cast<int>( nominalPt * 0.55f );
        QFont     f( family, nominalPt, bold ? QFont::Bold : QFont::Normal );
        while ( f.pointSize() > min_pt && QFontMetrics( f ).horizontalAdvance( text ) > max_w )
            f.setPointSize( f.pointSize() - 1 );
        return f;
    };
    QFont   ft = fit_font( "Segoe UI", static_cast<int>( 52 * S ), true, title );
    QFont   fa = fit_font( "Segoe UI", static_cast<int>( 26 * S ), false, artist );
    QString t = title, a = artist;
    if ( QFontMetrics( ft ).horizontalAdvance( t ) > max_w )
        t = QFontMetrics( ft ).elidedText( t, Qt::ElideRight, max_w );
    if ( QFontMetrics( fa ).horizontalAdvance( a ) > max_w )
        a = QFontMetrics( fa ).elidedText( a, Qt::ElideRight, max_w );

    const QRect r_t( static_cast<int>( 40 * S ), static_cast<int>( 24 * S ), W - static_cast<int>( 80 * S ),
                     static_cast<int>( 132 * S ) );
    const QRect r_a( static_cast<int>( 40 * S ), static_cast<int>( 156 * S ), W - static_cast<int>( 80 * S ),
                     static_cast<int>( 68 * S ) );
    p.setFont( ft );
    p.setPen( QColor( 0, 0, 0, 150 ) );
    for ( int dy = -2; dy <= 2; ++dy )
        for ( int dx = -2; dx <= 2; ++dx )
            if ( dx != 0 || dy != 0 )
                p.drawText( r_t.translated( static_cast<int>( dx * S ), static_cast<int>( dy * S ) ),
                            Qt::AlignHCenter | Qt::AlignVCenter, t );
    p.setPen( QColor( 255, 255, 255, 235 ) );
    p.drawText( r_t, Qt::AlignHCenter | Qt::AlignVCenter, t );
    if ( !a.isEmpty() )
    {
        p.setFont( fa );
        p.setPen( QColor( 0, 0, 0, 140 ) );
        for ( int dy = -1; dy <= 1; ++dy )
            for ( int dx = -1; dx <= 1; ++dx )
                if ( dx != 0 || dy != 0 )
                    p.drawText( r_a.translated( static_cast<int>( dx * S ), static_cast<int>( dy * S ) ),
                                Qt::AlignHCenter | Qt::AlignVCenter, a );
        p.setPen( QColor( 205, 218, 238, 225 ) );
        p.drawText( r_a, Qt::AlignHCenter | Qt::AlignVCenter, a );
    }
    p.end();
    m_titlePending = img;
}

// Manual "next" (key 'n', MIDI pad, web remote): skipping an effect that has
// only just come on screen reads as a dislike — remember it (soft, decaying).
void RenderPipeline::requestSceneChange()
{
    // Tell the user WHY nothing will happen instead of silently ignoring
    // the key (a pinned/frozen show swallowing 'n' looks like a bug).
    if ( M_Pinned )
    {
        fprintf( stderr, "n: ignored - PIN is active (press 'u' to unpin)\n" );
        return;
    }
    if ( M_Freeze )
    {
        fprintf( stderr, "n: ignored - FREEZE is active (press 'e' to unfreeze)\n" );
        return;
    }
    if ( m_scheduler.actTexture() < m_effectTextures.size() && m_scheduler.actElapsedSec() < 10.f )
        bumpTaste( m_effectTextures[m_scheduler.actTexture()]->fragmentName(), 0.8f );
    // a chain lab skipped: the classes on screen a little less (a quick skip more)
    if ( m_scheduler.actTexture() < m_effectTextures.size() )
        bumpClassTaste( m_effectTextures[m_scheduler.actTexture()],
                        m_scheduler.actElapsedSec() < 10.f ? 0.92f : 0.96f );
    EffectShader::noCarryOver(); // skipped: the next lab must not take this chain over
    m_scheduler.requestChange( true );
}

// Validation aid: compile EVERYTHING now (lazy compilation would otherwise
// only exercise shaders that actually come on screen).
void RenderPipeline::compileAllShaders()
{
    // Timed separately from the rest of startup on purpose: the eager compile
    // shares this run with 977 photo loads and 238 mesh imports, and the total
    // says nothing about which of them costs what.
    QElapsedTimer compile_clock;
    compile_clock.start();
    for ( EffectShader *s : m_effectTextures )
    {
        fprintf( stderr, "COMPILEALL %s\n", s->fragmentName() );
        s->ensureCompiled();
    }
    for ( EffectShader *s : m_effectFx )
    {
        fprintf( stderr, "COMPILEALL %s\n", s->fragmentName() );
        s->ensureCompiled();
    }
    for ( EffectShader *s : m_effectTransitions )
    {
        fprintf( stderr, "COMPILEALL %s\n", s->fragmentName() );
        s->ensureCompiled();
    }
    fprintf( stderr, "COMPILEALL done (%d textures, %d combines, %d transitions)\n",
             static_cast<int>( m_effectTextures.size() ), static_cast<int>( m_effectFx.size() ),
             static_cast<int>( m_effectTransitions.size() ) );
    // The honest count: how many DISTINCT shader programs the catalogue
    // actually is, next to how many entries name one. The two differ by
    // the 3D-model families, where one shader carries up to 29 scenes.
    int    progs = 0, reuses = 0;
    double build_ms = 0.0;
    shaderCacheStats( &progs, &reuses, &build_ms );
    const double avg = progs ? build_ms / progs : 0.0;
    fprintf( stderr, "SHADERS: %d distinct programs, %d builds served from the cache\n",
             progs, reuses );
    fprintf( stderr, "SHADERS: %.0f ms compiling+linking (%.0f ms each), so the cache saved about %.0f ms\n",
             build_ms, avg, avg * reuses );
    // The eager-build total for contrast: for a 3D-model scene it also imports
    // the .glb, which is the larger half. Naming it compile time would be wrong.
    fprintf( stderr, "SHADERS: eager build incl. mesh import took %lld ms\n",
             static_cast<long long>( compile_clock.elapsed() ) );
}

// Remote scene browser: list the preset's texture shaders (file basenames).
QStringList RenderPipeline::sceneNames() const
{
    QStringList out;
    for ( EffectShader *s : m_effectTextures )
    {
        QString n = QString::fromLocal8Bit( s->fragmentName() );
        int     cut = std::max( n.lastIndexOf( QChar( '\\' ) ), n.lastIndexOf( QChar( '/' ) ) );
        n = n.mid( cut + 1 );
        if ( n.endsWith( ".frag" ) )
            n.chop( 5 );
        out << n;
    }
    return out;
}

// Remote scene browser: jump DIRECTLY to scene idx (same instant path as a
// manual 'n' cut, but with a chosen target instead of a random roll).
float RenderPipeline::activeCoverage() const
{
    if ( m_effectTextures.empty() )
        return -1.f;
    const unsigned int i = m_scheduler.actTexture();
    if ( i >= m_effectTextures.size() )
        return -1.f;
    Scene3DShader *s3 = dynamic_cast<Scene3DShader *>( m_effectTextures[i] );
    return s3 ? s3->coverage() : -1.f;
}

QStringList RenderPipeline::fxNames() const
{
    QStringList out;
    for ( EffectShader *s : m_effectFx )
    {
        QString n = QString::fromLocal8Bit( s->fragmentName() );
        int     cut = std::max( n.lastIndexOf( QChar( '\\' ) ), n.lastIndexOf( QChar( '/' ) ) );
        n = n.mid( cut + 1 );
        if ( n.endsWith( ".frag" ) )
            n.chop( 5 );
        out << n;
    }
    return out;
}

void RenderPipeline::forceFx( int idx )
{
    if ( idx < 0 || idx >= static_cast<int>( m_effectFx.size() ) )
        return;
    if ( M_Pinned || M_Freeze )
        return; // same handbrakes as forceScene
    m_scheduler.forceFx( idx );
}

void RenderPipeline::forceScene( int idx )
{
    if ( idx < 0 || idx >= static_cast<int>( m_effectTextures.size() ) )
        return;
    if ( M_Pinned || M_Freeze )
        return;                  // same handbrakes as requestSceneChange
    EffectShader::noCarryOver(); // a scene picked by hand comes as it was rolled
    m_scheduler.forceScene( idx );
}

// Key 'f': the user LIKES what is on screen — persistent selection bonus.
QSet<QString>                                 RenderPipeline::M_Marked;
QHash<QString, QList<QPair<double, QString>>> RenderPipeline::M_Cues;

/**  The settings-ini key for one marked scene.
 *
 * @param fragPath  The scene's fragment shader path. (in)
 *
 * @return
 *   "marked/<file name>".
 *
 * Deliberately the bare filename, NOT the preset-qualified key taste uses: a
 * mark says "this SHADER needs another look", which is true no matter which
 * preset it happened to appear in.
 **/
static QString markKey( const char *fragPath )
{
    return QString( "marked/" ) + tasteBase( fragPath );
}

bool RenderPipeline::currentSceneMarked() const
{
    if ( m_scheduler.actTexture() >= m_effectTextures.size() )
        return false;
    return M_Marked.contains( tasteBase( m_effectTextures[m_scheduler.actTexture()]->fragmentName() ) );
}

bool RenderPipeline::toggleMarkCurrentScene()
{
    if ( m_scheduler.actTexture() >= m_effectTextures.size() )
        return false;
    const char   *frag = m_effectTextures[m_scheduler.actTexture()]->fragmentName();
    const QString base = tasteBase( frag );

    QSettings  s( settingsFilePath(), QSettings::IniFormat );
    const bool now_marked = !M_Marked.contains( base );
    if ( now_marked )
    {
        M_Marked.insert( base );
        s.setValue( markKey( frag ), true );
    }
    else
    {
        M_Marked.remove( base );
        s.remove( markKey( frag ) );
    }
    // Persist immediately: an inspection pass is exactly the situation where
    // the app gets closed abruptly, and losing the shortlist defeats the point.
    s.sync();
    fprintf( stderr, "Mark: %s %s (%d marked)\n",
             base.toLocal8Bit().constData(),
             now_marked ? "SET" : "cleared", static_cast<int>( M_Marked.size() ) );
    return now_marked;
}

bool RenderPipeline::saveMarkedPreset( QString *outPath )
{
    if ( M_Marked.isEmpty() )
    {
        fprintf( stderr, "Marked preset: nothing marked\n" );
        return false;
    }

    // Take the scenes' real nodes from the master catalogue. Synthesising tags
    // here would drop geom and every preset parameter -- the exact failure that
    // made a whole measurement campaign's probes meaningless earlier.
    const QString cfg_dir = Platform::presetsDir( QFileInfo( settingsFilePath() ).absolutePath() );
    QDomDocument  master;
    QFile         mf( cfg_dir + "/Komplett.xml" );
    QString       parse_err;
    int           err_line = 0;
    if ( !mf.open( QIODevice::ReadOnly ) || !master.setContent( &mf, &parse_err, &err_line ) )
    {
        fprintf( stderr, "Marked preset: cannot read Komplett.xml (%s, line %d)\n",
                 parse_err.toLocal8Bit().constData(), err_line );
        return false;
    }
    mf.close();

    QDomDocument out;
    QDomElement  root = out.createElement( "configuration" );
    root.setAttribute( "ImageDirectory", master.documentElement().attribute( "ImageDirectory" ) );
    root.setAttribute( "ConfigurationName", "Marked" );
    out.appendChild( root );
    root.appendChild( out.createComment(
        " Scenes marked at runtime with SPACE, written with SHIFT+SPACE. "
        "Regenerated wholesale on every save. " ) );

    QDomNodeList  texs = master.documentElement().elementsByTagName( "TextureShader" );
    QSet<QString> written;
    for ( int i = 0; i < texs.count(); ++i )
    {
        QDomElement   el = texs.at( i ).toElement();
        const QString base = tasteBase( el.attribute( "file" ).toLocal8Bit().constData() );
        if ( !M_Marked.contains( base ) || written.contains( base ) )
            continue;
        written.insert( base );
        QDomElement copy = out.importNode( el, true ).toElement();
        // Every marked scene should actually appear, and long enough to judge.
        copy.setAttribute( "probability", "1.0" );
        copy.setAttribute( "minTimeSolo", "12" );
        copy.setAttribute( "maxTimeSolo", "18" );
        copy.setAttribute( "minTimeInterpolation", "2" );
        copy.setAttribute( "maxTimeInterpolation", "3" );
        root.appendChild( copy );
    }
    if ( written.isEmpty() )
    {
        fprintf( stderr, "Marked preset: none of the %d marked scenes are in Komplett.xml\n",
                 static_cast<int>( M_Marked.size() ) );
        return false;
    }

    // Plain overlay + a neutral fade, so what you see is the scene itself.
    QDomElement comb = out.createElement( "CombineShader" );
    comb.setAttribute( "file", "..\\FX\\FxPlain.frag" );
    comb.setAttribute( "type", "normal" );
    comb.setAttribute( "probability", "1.0" );
    comb.setAttribute( "complexity", "1" );
    root.appendChild( comb );
    QDomElement tr = out.createElement( "TransitionShader" );
    tr.setAttribute( "file", "..\\Transitions\\Crossfade.frag" );
    tr.setAttribute( "type", "normal" );
    tr.setAttribute( "probability", "1" );
    tr.setAttribute( "complexity", "1" );
    root.appendChild( tr );

    const QString path = cfg_dir + "/Marked.xml";
    QFile         f( path );
    if ( !f.open( QIODevice::WriteOnly | QIODevice::Text ) )
    {
        fprintf( stderr, "Marked preset: cannot write %s\n", path.toLocal8Bit().constData() );
        return false;
    }
    QTextStream ts( &f );
    ts << "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n"
       << out.toString( 2 );
    f.close();

    if ( outPath )
        *outPath = path;
    fprintf( stderr, "Marked preset: %d scene(s) -> %s\n", static_cast<int>( written.size() ),
             path.toLocal8Bit().constData() );
    return true;
}

/**  Appends the current scene's rolled parameter values to liked_rolls.tsv (next to the settings ini).
 *
 * @param e  The effect on screen; its values are read, not changed. (in)
 *
 * One line per like: local time, the scene's file base, then name=value for
 * every rolled Uniform.  For the chain-lab scenes (ChainLab2D/3D) the rolled
 * knobs select the transforms themselves, so a liked roll is a whole new
 * scene; Tools/scenegen/promote_likes.py freezes each such line into a named
 * scene of its own (the lab's source with those knobs made constants).
 **/
static void logLikedRoll( const EffectShader *e )
{
    const QString base = tasteBase( e->fragmentName() );
    QString       line = QDateTime::currentDateTime().toString( Qt::ISODate ) + "\t" + base + "\t";
    for ( const auto &nv : e->namedParameters() )
        line += QString( "%1=%2 " ).arg( QString::fromStdString( nv.first ) ).arg( nv.second, 0, 'f', 4 );
    line = line.trimmed();
    fprintf( stderr, "Like: %s\n", line.toLocal8Bit().constData() );
    QFile f( QFileInfo( settingsFilePath() ).absolutePath() + "/liked_rolls.tsv" );
    if ( f.open( QIODevice::Append | QIODevice::Text ) )
    {
        QTextStream ts( &f );
        ts << line << "\n";
    }
}

void RenderPipeline::favoriteCurrentEffect()
{
    if ( m_scheduler.actTexture() < m_effectTextures.size() )
    {
        bumpTaste( m_effectTextures[m_scheduler.actTexture()]->fragmentName(), 1.25f );
        bumpClassTaste( m_effectTextures[m_scheduler.actTexture()], 1.1f );
        logLikedRoll( m_effectTextures[m_scheduler.actTexture()] );
    }
}

/**  Reduces a track key ("artist|title") to a QSettings-safe key for the [cues] group.
 *
 * @param trackKey  The identified track as "artist|title" (see GLwidget::cueTrackKey()). (in)
 *
 * @return
 *   Lower-cased key with every non-alphanumeric character replaced by '_', truncated to 96 characters.
 *
 * Settings-Schluessel duerfen keine beliebigen Zeichen tragen: "artist|title"
 * wird auf [a-z0-9_] reduziert.  Kollisionen zweier Titel sind damit denkbar,
 * aber ein Cue am falschen Song ist ein falsches Bild, kein Absturz.
 **/
static QString cueKey( const QString &trackKey )
{
    QString k = trackKey.toLower();
    for ( QChar &ch : k )
        if ( !ch.isLetterOrNumber() )
            ch = QChar( '_' );
    return k.left( 96 );
}

int RenderPipeline::sceneIndexByBase( const QString &base ) const
{
    for ( size_t i = 0; i < m_effectTextures.size(); ++i )
        if ( tasteBase( m_effectTextures[i]->fragmentName() ) == base )
            return static_cast<int>( i );
    return -1;
}

void RenderPipeline::rememberCue( const QString &trackKey, double posSec )
{
    if ( trackKey.isEmpty() || posSec < 0.0 || m_scheduler.actTexture() >= m_effectTextures.size() )
        return;
    const QString key = cueKey( trackKey );
    const QString base = tasteBase( m_effectTextures[m_scheduler.actTexture()]->fragmentName() );
    M_Cues[key].append( qMakePair( posSec, base ) );
    QSettings s( Platform::assetPath( "..\\kaleidoscope_settings.ini" ), QSettings::IniFormat );
    s.setValue( QString( "cues/%1/%2" ).arg( key ).arg( static_cast<int>( posSec ) ), base );
    fprintf( stderr, "CUE gemerkt: %s @ %.0f s -> %s\n", key.toUtf8().constData(), posSec, base.toUtf8().constData() );
}

void RenderPipeline::tickCues( const QString &trackKey, double posSec )
{
    if ( trackKey.isEmpty() || posSec < 0.0 )
        return;
    const QString key = cueKey( trackKey );
    if ( key != m_cueTrack )
    {
        m_cueTrack = key;
        m_cuesFired.clear();
    }
    auto it = M_Cues.constFind( key );
    if ( it == M_Cues.constEnd() )
        return;
    for ( int k = 0; k < it->size(); ++k )
    {
        if ( m_cuesFired.contains( k ) || std::fabs( it->at( k ).first - posSec ) > 2.5 )
            continue;
        m_cuesFired.insert( k );
        const int idx = sceneIndexByBase( it->at( k ).second );
        if ( idx >= 0 )
        {
            forceScene( idx );
            fprintf( stderr, "CUE: %s @ %.0f s -> %s\n", key.toUtf8().constData(),
                     it->at( k ).first, it->at( k ).second.toUtf8().constData() );
        }
    }
}


// ---------------------------------------------------------------------------
// paint(): the whole per-frame pipeline.  Rough order (see the section
// comments below for each): (1) live Spout/video input + timing-scale smoothing;
// (2) VJ freeze/pin + DJ-stop dt manipulation; (3) title-reveal upload/advance;
// (4) the big audio-reactive block that turns raw AudioFeatures into continuous,
// slew-limited phases/envelopes (audioFx) — beat PLL, bar phase, onset/kick/
// snare/hat envelopes, swell, fade-out, melody ring, virtual-camera "Regie",
// Zeit-Regie rewind/echo/breath, chroma-hue slew; (5) the image cross-fade state
// machine and the SceneScheduler tick (effect selection); (6) GpuSims/ComputeFX
// stepping, gated to only what the active/incoming effects actually sample;
// (7) shadow pass, the two texture-effect passes (optional true-stereo/OIT) and
// the two combine passes, with the SceneScheduler combine tick running in
// between (it needs m_trueStereoHold, computed just before the texture passes);
// (8) the legacy outer "combine of combines" (FxPlain) cross-fade; (9) the
// phosphor feedback/trails pass; (10) PresentPass::run() for tone-mapping,
// bloom, camera transform, stereo packing, overlays and final display.
// ---------------------------------------------------------------------------
void RenderPipeline::beginFrame( const AudioFeatures &audio )
{
    m_scheduler.setMood( audio.arousal, audio.valence, audio.ambientFactor );
    // Snapshot for the ImageLoader's mood-matched image choice (its thread).
    m_moodValence = audio.valence;
    m_moodArousal = audio.arousal;
    m_moodAmbient = audio.ambientFactor;

    // Lazy-compile warm-up: ONE step per frame, and only ever cheap work.
    //
    // Two generations of this warmer were the app's own stutter engine. The
    // first ran ensureCompiled() on a mesh scene, which loaded the model
    // SYNCHRONOUSLY (200-700 ms) on this thread. The second handed the load
    // to a worker but still marched through EVERY mesh scene of the preset,
    // uploading each one as it arrived: measured on the full preset, 245
    // uploads of 35-55 ms each in the first 51 seconds -- 245 visible hitches
    // -- and 21 GB of vertex buffers, because each mesh scene keeps its own.
    //
    // So the warmer no longer touches models at all. It compiles GLSL (a few
    // ms, and the one thing that genuinely pays off up front) and finishes
    // uploads that were ASKED for: the fade's incoming scene requests its
    // model (see the meshWarmupPending() block in beginFrame's caller) and
    // the host holds the fade until the worker publishes it. A model is
    // loaded when it is about to be seen, not because it exists.
    {
        bool warmed = false;
        M_WarmLabel.clear();
        for ( EffectShader *s : m_effectTextures )
            if ( s->finishMeshWarmup() )
            {
                M_WarmLabel = QStringLiteral( "mesh " ) + QString::fromLocal8Bit( s->fragmentName() );
                warmed = true;
                break;
            }
        // Background compile: the driver builds on its own threads; a shader
        // is only "compiled" here once its program waits in the cache (then
        // ensureCompiled() is a cache hit and costs nothing).  The scene and
        // FX that come NEXT go first -- they are known one fade in advance.
        // Up to four builds run at a time.  Without the driver extension the
        // old one-per-frame blocking path below runs unchanged.
        if ( !warmed && shaderPrebuildPoll() < 4 )
        {
            auto want = [&]( EffectShader *s ) -> bool
            {
                if ( !s || s->isCompiled() || !s->plainFragment() || !s->fragmentFile() )
                    return false;
                if ( strstr( s->fragmentFile(), "Scene3D" ) )
                    return false;
                return shaderPrebuildStart( s->fragmentFile() );
            };
            int started = 0;
            if ( m_scheduler.nextTexture() < m_effectTextures.size()
                 && want( m_effectTextures[m_scheduler.nextTexture()] ) )
                ++started;
            if ( m_scheduler.nextFx() < m_effectFx.size() && want( m_effectFx[m_scheduler.nextFx()] ) )
                ++started;
            for ( EffectShader *s : m_effectTextures )
            {
                if ( started >= 2 )
                    break;
                if ( want( s ) )
                    ++started;
            }
            for ( EffectShader *s : m_effectFx )
            {
                if ( started >= 2 )
                    break;
                if ( want( s ) )
                    ++started;
            }
        }
        if ( !warmed )
            for ( EffectShader *s : m_effectTextures )
                if ( !s->isCompiled() && s->plainFragment() && s->fragmentFile()
                     && !strstr( s->fragmentFile(), "Scene3D" ) && shaderPrebuildStart( s->fragmentFile() ) )
                {
                    if ( !shaderPrebuildReady( s->fragmentFile() ) )
                        continue;        // still building in the background
                    s->ensureCompiled(); // cache hit: instant
                    M_WarmLabel = QStringLiteral( "glsl " ) + QString::fromLocal8Bit( s->fragmentName() );
                    warmed = true;
                    break;
                }
        if ( !warmed )
            for ( EffectShader *s : m_effectTextures )
                if ( !s->isCompiled()
                     && !( s->plainFragment() && s->fragmentFile() && !strstr( s->fragmentFile(), "Scene3D" )
                           && shaderPrebuildStart( s->fragmentFile() ) ) )
                {
                    s->ensureCompiled(); // GLSL only; a mesh build defers itself
                    M_WarmLabel = QStringLiteral( "glsl " ) + QString::fromLocal8Bit( s->fragmentName() );
                    warmed = true;
                    break;
                }
        if ( !warmed )
            for ( EffectShader *s : m_effectFx )
                if ( !s->isCompiled() )
                {
                    // a background build in flight: wait for it instead of blocking
                    if ( s->plainFragment() && s->fragmentFile() && shaderPrebuildStart( s->fragmentFile() )
                         && !shaderPrebuildReady( s->fragmentFile() ) )
                        continue;
                    s->ensureCompiled();
                    M_WarmLabel = QStringLiteral( "fx " ) + QString::fromLocal8Bit( s->fragmentName() );
                    break;
                }
    }

    trimMeshResidency();
}

// ---------------------------------------------------------------------------
// Mesh residency budget.
//
// A mesh scene's vertex buffer is around 27 MB and every scene has its own, so
// a long session that eventually visits all 245 mesh scenes of the full preset
// would hold over 20 GB. Keep a small working set instead: the scene on
// screen, the one fading in, and the most recently seen few. Everything beyond
// the budget is handed back to the driver and reloads asynchronously when it
// is next due -- which costs one worker load the host already knows how to
// wait out, and nothing at all on the render thread.
//
// KALEIDO_MESH_BUDGET overrides the count (minimum 4: active, incoming and a
// little slack so a quick A-B-A does not reload every time).
// ---------------------------------------------------------------------------
void RenderPipeline::trimMeshResidency()
{
    static const int Budget = []
    {
        const int v = qEnvironmentVariableIntValue( "KALEIDO_MESH_BUDGET" );
        return v > 0 ? std::max( 4, v ) : 16;
    }();

    ++m_meshUseClock;
    const unsigned act = m_scheduler.actTexture();
    const unsigned nxt = m_scheduler.nextTexture();
    if ( static_cast<size_t>( act ) < m_effectTextures.size() )
        m_meshLastUse[m_effectTextures[act]] = m_meshUseClock;
    if ( static_cast<size_t>( nxt ) < m_effectTextures.size() )
        m_meshLastUse[m_effectTextures[nxt]] = m_meshUseClock;

    // Cheap common case: nothing to do until the working set is actually full.
    int resident = 0;
    for ( EffectShader *s : m_effectTextures )
        if ( s->meshResident() )
            ++resident;
    while ( resident > Budget )
    {
        EffectShader *victim = nullptr;
        qint64        oldest = std::numeric_limits<qint64>::max();
        for ( size_t i = 0; i < m_effectTextures.size(); ++i )
        {
            EffectShader *s = m_effectTextures[i];
            if ( !s->meshResident() || i == static_cast<size_t>( act ) || i == static_cast<size_t>( nxt ) )
                continue;
            const qint64 used = m_meshLastUse.value( s, 0 );
            if ( used < oldest )
            {
                oldest = used;
                victim = s;
            }
        }
        if ( !victim )
            break; // only active/incoming left: nothing to give back
        victim->releaseMesh();
        m_meshLastUse.remove( victim );
        --resident;
    }
}

void RenderPipeline::updateLiveInput()
{
    // Live input (-i): receive the Spout sender's frame; while a sender runs
    // its texture replaces BOTH image slots below (crossfades collapse to a
    // no-op on the image, every effect folds the LIVE picture).  No sender ->
    // m_liveTex stays 0 and the photos work as usual.
    if ( M_SpoutInEnabled )
    {
        spoutInInit( M_SpoutInSender.toLocal8Bit().constData() ); // idempotent
        unsigned int lw = 0, lh = 0;
        m_liveTex = spoutInReceive( &lw, &lh );
    }
    else if ( !M_VideoPath.isEmpty() )
    {
        // Same slot, same consequences: while a frame is available it replaces
        // both photo slots, so cross-fades collapse on the image and every
        // effect folds the moving picture instead of a still.
        videoInInit( M_VideoPath.toLocal8Bit().constData() ); // idempotent
        unsigned int lw = 0, lh = 0;
        m_liveTex = videoInFrame( &lw, &lh );
    }
}

void RenderPipeline::updateTimingScale( const AudioFeatures &audio )
{
    // Update adaptive timing scale from audio analysis.
    // Smooth slowly so a sudden genre change doesn't cause a jarring jump.
    // The new scale only takes effect the next time a duration is randomised,
    // so existing running timers complete at their original length.
    // When the audio is NOT music (speech / video / silence), musicPresence
    // pulls the scale back to the neutral 1.0 so scene timing behaves normally.
    float eff_timing_scale = 1.0f + ( audio.timingScale - 1.0f ) * audio.musicPresence;
    m_timingScale = 0.999f * m_timingScale + 0.001f * eff_timing_scale;
    // Guard against zero to avoid division-by-zero below.
    if ( m_timingScale < 0.05f )
        m_timingScale = 0.05f;
}

RenderPipeline::FrameTiming RenderPipeline::readFrameClock()
{
    float time_since_last_frame = m_nanotimer.elapsed();
    // if( time_since_last_frame > 20.0 )
    // printf( "%f\n", time_since_last_frame );
    m_nanotimer.start();

    float time_since_last_frame_sec = time_since_last_frame * 0.001;
    // Wall-clock frame time, immune to the freeze below (the blackout fade
    // must keep moving even over a frozen picture).
    const float dt_wall = time_since_last_frame_sec;

    // FPS-driven detail budget for the heavy cube scenes: below ~45 fps every
    // 2nd cube is dropped (uniform `cubeBudget`, hysteresis so it never
    // oscillates); above ~57 fps full detail returns.
    if ( dt_wall > 1e-4f && dt_wall < 0.5f )
    {
        float fps = 1.f / dt_wall;
        m_cubeFpsEma += 0.05f * ( fps - m_cubeFpsEma );
        if ( m_cubeFpsEma < 45.f && Scene3DShader::M_CubeBudget > 0.75f )
            Scene3DShader::M_CubeBudget = 0.5f;
        else if ( m_cubeFpsEma > 57.f && Scene3DShader::M_CubeBudget < 0.75f )
            Scene3DShader::M_CubeBudget = 1.f;
    }

    return { time_since_last_frame_sec, dt_wall };
}

void RenderPipeline::applyTransportModifiers( const AudioFeatures &audio, float &timeSinceLastFrameSec, float dtWall )
{
    // VJ FREEZE ('e'): hold the picture.  Frame time 0 stops every phase
    // integration and envelope slew; re-arming the activation clocks each
    // frozen frame keeps scheduled switches from falling "due" behind the
    // frozen image (they simply start their solo fresh on unfreeze).
    // A comparison run (KALEIDO_FREEZE_TIME): the scene fades in on the wall
    // clock (frozen from the first frame it stayed at the dark start of its
    // fade), then everything stands -- the global clock set to the given time.
    // The first 600 frames run on a fixed step of 1/120 s instead of the wall
    // clock, so every run integrates exactly the same (exposure, fades, slews).
    if ( freezeTime() >= 0.f && !M_Freeze )
    {
        static int frames = 0;
        timeSinceLastFrameSec = 1.f / 120.f;
        if ( ++frames > 600 )
        {
            M_Freeze = true;
            m_globaltime = freezeTime();
            fprintf( stderr, "FREEZE engaged (comparison run, scene time %.2f)\n", freezeTime() );
        }
    }
    EffectShader::M_Frozen = M_Freeze || freezeTime() >= 0.f; // the walk and the 3D flight never move in a comparison
                                                              // run
    EffectShader::M_FreezeTime = freezeTime();
    if ( M_Freeze )
    {
        timeSinceLastFrameSec = 0.f;
        m_scheduler.rearmEffectClocks();
        m_timeTexture.restart();
    }
    // VJ PIN ('u'): keep the current effect/combine — re-arm only their
    // clocks (images keep rotating); forced cuts are suppressed below.
    else if ( M_Pinned )
        m_scheduler.rearmEffectClocks();

    // DJ-STOP dramaturgy: while the music holds its breath the PICTURE holds
    // too — motion freezes within ~0.1 s (95 % dt cut, slewed so it eases in
    // rather than snapping) and releases just as fast on the slam-back, which
    // additionally hits the camera below (breakSlam -> dropPulse).
    m_breakSmooth = slewToward( m_breakSmooth, audio.breakHold, 9.f, dtWall );
    timeSinceLastFrameSec *= 1.f - 0.95f * m_breakSmooth;
}

void RenderPipeline::updateTitleReveal( const AudioFeatures &audio, float dtWall )
{
    // Track-title reveal: upload a freshly rendered title (GL context is
    // current here) and advance the reveal clock on the WALL time (the
    // reveal keeps playing over a frozen/stopped picture).
    if ( !m_titlePending.isNull() )
    {
        QImage gl = m_titlePending.convertToFormat( QImage::Format_RGBA8888 );
        m_present.setTitleImage( gl.constBits(), gl.width(), gl.height() );
        m_titlePending = QImage();

        // Roll a reveal STYLE that fits the music playing right now.  Each
        // mood category has its own pool of matching styles (calm -> soft
        // dissolves and drifts, aggressive -> glitch/slam/stutter, bright ->
        // light sweeps and sparkle, dark -> smoke/shadow), and the pick
        // within the pool is random so repeats stay varied.
        // KALEIDO_TITLE_STYLE=<n> forces one style (tuning aid).
        {
            static const int CalmPool[] = { 0, 1, 2, 4, 5, 9, 17, 20, 23, 24, 26 };
            static const int AggroPool[] = { 7, 10, 11, 12, 13, 14, 21, 22, 25, 27, 29 };
            static const int BrightPool[] = { 3, 6, 8, 15, 18, 19, 24, 25, 28, 29 };
            static const int DarkPool[] = { 0, 2, 5, 16, 17, 20, 26, 27, 28 };
            const int       *pool;
            int              n;
            if ( audio.ambientFactor > 0.55f || audio.arousal < 0.35f )
            {
                pool = CalmPool;
                n = 11;
            }
            else if ( audio.arousal > 0.62f && audio.valence < 0.58f )
            {
                pool = AggroPool;
                n = 11;
            }
            else if ( audio.valence > 0.55f )
            {
                pool = BrightPool;
                n = 10;
            }
            else
            {
                pool = DarkPool;
                n = 9;
            }
            int        style = pool[qrand() % n];
            QByteArray forced = qgetenv( "KALEIDO_TITLE_STYLE" );
            if ( !forced.isEmpty() )
                style = forced.toInt();
            m_present.setTitleStyle( style, static_cast<float>( qrand() ) / static_cast<float>( RAND_MAX ) );
            fprintf( stderr, "Title reveal: style %d\n", style );
        }
    }
    else
        m_present.advanceTitle( dtWall );
}

AudioFeatures RenderPipeline::conditionAudio( const AudioFeatures &audio, float timeSinceLastFrameSec )
{
    // Audio-reactive motion, envelopes, the beat PLL and the colour-chase
    // phase: all delegated to AudioConditioner (moved out of paint() to keep
    // this function to the scheduling/render pipeline). update() must be
    // called exactly once per frame, in frame order -- every signal in there
    // is an integrator or a slew limiter.
    AudioConditioner::Context ac_ctx;
    ac_ctx.globalTime = m_globaltime;
    ac_ctx.trailDepth3D = m_trailDepth3D;
    ac_ctx.meshUp = m_meshUp;
    ac_ctx.calm = M_CalmMotion;
    ac_ctx.reactivity = M_Reactivity;
    ac_ctx.latencyLead = M_LatencyLead;
    ac_ctx.ssmHead = m_sims.ssmHeadNorm();
    ac_ctx.ssmFill = m_sims.ssmFillNorm();
    ac_ctx.spectroHead = m_sims.spectroHeadNorm();
    ac_ctx.spectroFill = m_sims.spectroFillNorm();
    return m_audioConditioner.update( audio, timeSinceLastFrameSec, ac_ctx );
}

void RenderPipeline::updateImageState( float timeSinceLastFrameSec )
{
    if ( m_waitForImageToLoad )
    {
        if ( !m_triggerImageload )
        {
            m_waitForImageToLoad = false;

            // NanoTimer timerLT;
            // timerLT.start();

            loadNewTexture( m_nextTex );

            // float timeTexture = timerLT.elapsed();
            // printf( "Time Texture: %f\n", timeTexture );
        }
    }



    // No Interpolation, solo texture 1:
    if ( m_stateTexture == 1 )
    {

        m_interpolationTexture = 1.0;

        // time is up => switch to modus blending.  Like the shader changes, the
        // IMAGE cross-fade start is quantised onto the next downbeat (with the
        // same timeout / no-music escape), so picture changes land on the "1".
        float ts = static_cast<float>( m_timeTexture.elapsed() ) * 0.001;
        if ( ts > m_timeTextureSolo )
            m_pendingImgChange = true;
        if ( m_pendingImgChange )
        {
            m_pendingImgAge += timeSinceLastFrameSec;
            if ( m_audioConditioner.downbeatTick() || m_pendingImgAge > 2.5f || m_audioConditioner.gate() < 0.25f )
            {
                m_pendingImgChange = false;
                m_pendingImgAge = 0.f;
                m_stateTexture = 0;
                m_timeTexture.start();

                m_timeTextureSolo = static_cast<float>(
                                        ( m_timeTextureSoloMax > m_timeTextureSoloMin )
                                            ? m_timeTextureSoloMin
                                                  + ( qrand() % ( m_timeTextureSoloMax - m_timeTextureSoloMin ) )
                                            : m_timeTextureSoloMin )
                                    / m_timingScale; // min==max would be % 0
            }
        }
    }
    else
    {
        float ts = static_cast<float>( m_timeTexture.elapsed() ) * 0.001;

        m_interpolationTexture = 1.0 - ts / m_timeTextureInterpolation; // 0.5*(cos( ts/m_timeInterpolation * M_PI )
                                                                        // + 1.0);

        if ( ts > m_timeTextureInterpolation )
        {
            m_stateTexture = 1;
            m_timeTexture.start();

            GLuint temp = m_actTex;
            m_actTex = m_nextTex;
            m_nextTex = temp;
            // loadNewTexture( temp );
            m_waitForImageToLoad = true;
            m_triggerImageload = true;


            m_interpolationTexture = 1.0;

            m_timeTextureInterpolation = static_cast<float>(
                                             ( m_timeTextureInterpolationMax > m_timeTextureInterpolationMin )
                                                 ? m_timeTextureInterpolationMin
                                                       + ( qrand()
                                                           % ( m_timeTextureInterpolationMax
                                                               - m_timeTextureInterpolationMin ) )
                                                 : m_timeTextureInterpolationMin )
                                         / m_timingScale; // min==max would be % 0
        }
    }
}

SceneScheduler::Tick RenderPipeline::buildSchedulerTick( const AudioFeatures &audio, float timeSinceLastFrameSec )
{
    /*********************** Szenen-Wahl: SceneScheduler ***********************/

    // Trigger (Novelty/Section/Drop, Pin) + Effekt-Zustandsmaschine.  Der
    // Combine-Teil (tickFx) laeuft weiter NACH den Effekt-Passes, weil
    // erst dort m_trueStereoHold entsteht.
    SceneScheduler::Tick sched_tick;
    sched_tick.dt = timeSinceLastFrameSec;
    sched_tick.downbeatTick = m_audioConditioner.downbeatTick();
    sched_tick.gateSmooth = m_audioConditioner.gate();
    sched_tick.timingScale = m_timingScale;
    sched_tick.pinned = M_Pinned;
    sched_tick.harmonicChange = audio.harmonicChange;
    sched_tick.musicPresence = audio.musicPresence;
    sched_tick.sectionCount = audio.sectionCount;
    sched_tick.sectionId = audio.sectionId;
    sched_tick.sectionKnown = audio.sectionKnown;
    sched_tick.dropCount = audio.dropCount + m_audioConditioner.fakeDropCount();
    sched_tick.rhythmStrength = audio.rhythmStrength;
    sched_tick.estimatedBPM = audio.estimatedBPM;
    sched_tick.logAttackTime = audio.logAttackTime;
    sched_tick.buildUp = audio.buildUp;
    sched_tick.phraseSecsLeft = m_audioConditioner.phraseSecsLeft();
    // Score cues (CueReceiver.h): when a generator is telling us where the bars, the sections and
    // the drops ARE, the scheduler stops guessing them from the loudspeaker output. With no sender
    // -- the normal case -- this call leaves sched_tick byte for byte as it is above; the four fields
    // it touches when cues are live, and why it touches exactly those four, are in the header.
    // A cue file (-k) is a sender too: whatever of it the offline WAV has reached goes in first.
    ScoreCueFile::instance().feed();
    applyScoreCues( ScoreCues::instance().drain( timeSinceLastFrameSec ), m_cueBridge, sched_tick );
    EffectShader::M_CueLive = m_cueBridge.wasLive; // the chain walk follows the same counters
    EffectShader::M_CueSections = sched_tick.sectionCount;
    EffectShader::M_CueDrops = sched_tick.dropCount;
    m_scheduler.tick( sched_tick );


    return sched_tick;
}

void RenderPipeline::stepSimulations( const AudioFeatures &audio, float timeSinceLastFrameSec,
                                      const AudioFeatures &audioFx )
{
    // GPU-/Host-Simulationen (GpuSims): Bedarf ermitteln (nur steppen, was
    // ein sichtbarer Effekt wirklich sampelt - der aktive oder, während einer
    // Überblendung, der einblendende), Frame-Kontext übergeben, laufen lassen.
    // GpuSims bindet die neuesten Felder auf die globalen Units 7-11/28.
    {
        EffectShader   *akt_e = m_effectTextures[m_scheduler.actTexture()];
        EffectShader   *nxt_e = m_effectTextures[m_scheduler.nextTexture()];
        const bool      fading = ( m_scheduler.texState() != 0 );
        GpuSims::Demand need;
        need.rd = akt_e->usesSim() || ( fading && nxt_e->usesSim() );
        need.fluid = akt_e->usesFluid() || ( fading && nxt_e->usesFluid() );
        need.smoke3D = akt_e->usesSmoke3D() || ( fading && nxt_e->usesSmoke3D() );
        need.physarum = akt_e->usesPhysarum() || ( fading && nxt_e->usesPhysarum() );
        need.ssm = akt_e->usesSSM() || ( fading && nxt_e->usesSSM() );
        need.spectro = akt_e->usesSpectro() || ( fading && nxt_e->usesSpectro() );

        GpuSims::Frame sim_frame;
        sim_frame.globalTime = m_globaltime;
        sim_frame.audioAdvance = audioFx.audioAdvance;
        sim_frame.dyeTexA = m_liveTex ? m_liveTex : m_actTex;
        sim_frame.dyeTexB = m_liveTex ? m_liveTex : m_nextTex;
        sim_frame.dyeInterp = m_interpolationTexture;
        sim_frame.hold = M_Freeze; // a frozen picture: the sims stand too

        m_sims.run( audio, timeSinceLastFrameSec, need, sim_frame );
    }


    // ---- GL 4.3 compute-shader sims (ComputeFX) ----
    // Same demand gating as the older sims, but generic: an effect opts in by
    // declaring the sampler, which sets one bit of cfxMask().  Only the kinds
    // actually on screen are stepped, and each publishes on its own unit.
    {
        static bool cfx_init = false;
        if ( !cfx_init )
        {
            m_cfx.init();
            cfx_init = true;
        }

        unsigned int need = m_effectTextures[m_scheduler.actTexture()]->cfxMask();
        if ( m_scheduler.texState() != 0 )
            need |= m_effectTextures[m_scheduler.nextTexture()]->cfxMask();
        if ( !need )
            for ( GLuint &t : m_cfxLast )
                t = 0;

        if ( need )
        {
            GLuint src = m_liveTex ? m_liveTex : m_actTex;
            for ( int k = 0; k < CFX_COUNT; ++k )
            {
                if ( !( need & ( 1u << k ) ) )
                {
                    m_cfxLast[k] = 0;
                    continue;
                } // retireIdle may free it later
                // Unit 0 while the sim steps. A sim's alloc/seed frames make raw
                // glBindTexture calls on whatever unit is ACTIVE -- and after the
                // previous iteration that was the previous sim's publication unit,
                // so a newly starting sim wiped an already-published texture off
                // its unit for exactly its seed frames. On unit 0 the collateral
                // lands on the photo binding, which setUniforms restores every
                // frame anyway.
                glActiveTexture( GL_TEXTURE0 );
                // Frozen (VJ freeze, comparison run): no step -- ComputeFX would take
                // dt 0 for 1/60 s and run on -- the last published state is bound again.
                GLuint tex = ( M_Freeze && m_cfxLast[k] )
                                 ? m_cfxLast[k]
                                 : m_cfx.step( k, audio, timeSinceLastFrameSec, m_globaltime, src, m_width, m_height );
                m_cfxLast[k] = tex;
                // The stand-in when the sim has no output yet -- its first frames of
                // seeding, or right after retireIdle() deleted the previous tenant's
                // textures, which auto-unbinds them from the unit. The scene's
                // sampler points here regardless, and a draw validates every
                // declared sampler, so the unit must never be left empty.
                glActiveTexture( GL_TEXTURE0 + CfxInfoTable[k].unit );
                glBindTexture( GL_TEXTURE_2D, tex ? tex : glcoreDummyTex2D() );
            }
            glActiveTexture( GL_TEXTURE0 );
        }
        m_cfx.retireIdle( m_globaltime );
        EffectShader::retireIdleChainTextures(); // chain labs not shown for 25 s give their coordinate textures back
    }

    // ---- Previous-frame feedback (opt-in via texPrevFrame) ----
    // m_texTrail[] is otherwise an internal detail of the global echo-warp
    // trails pass below (Engine/Feedback.frag); a scene can additionally
    // sample LAST frame's fully composited image directly by declaring
    // texPrevFrame. m_trailIdx has not been swapped for THIS frame yet at
    // this point in paint(), so m_texTrail[1-m_trailIdx] still holds exactly
    // that (the trails pass swaps it further down, after drawWindow()).
    glActiveTexture( GL_TEXTURE0 + 34 );
    glBindTexture( GL_TEXTURE_2D, m_texTrail[1 - m_trailIdx] );
    glActiveTexture( GL_TEXTURE0 );

    // ---- Deep-zoom Mandelbrot (opt-in via texMandelbrot) ----
    // Bound directly here rather than through the generic ComputeFX kind
    // table (see ComputeFX::stepMandelbrot()'s comment): units 0-31 are
    // already fully claimed on a 32-texture-unit GPU, so this sim gets its
    // own dedicated unit the same way texBake/texPrevFrame already do.
    {
        bool want_mandelbrot = m_effectTextures[m_scheduler.actTexture()]->usesMandelbrot();
        if ( m_scheduler.texState() != 0 )
            want_mandelbrot |= m_effectTextures[m_scheduler.nextTexture()]->usesMandelbrot();
        if ( want_mandelbrot )
        {
            GLuint mb_tex = m_cfx.stepMandelbrot( audio, timeSinceLastFrameSec,
                                                  m_globaltime, m_width, m_height );
            if ( mb_tex )
            {
                glActiveTexture( GL_TEXTURE0 + 35 );
                glBindTexture( GL_TEXTURE_2D, mb_tex );
                glActiveTexture( GL_TEXTURE0 );
            }
        }
    }
}

void RenderPipeline::bindSceneInputs()
{
    // restore render destination to regular frame buffer
    glViewport( 0, 0, m_width, m_height );

    glActiveTexture( GL_TEXTURE0 );
    glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_actTex );


    glActiveTexture( GL_TEXTURE1 );
    glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_nextTex );
}

void RenderPipeline::updateTrueStereoState()
{
    // TRUE STEREO: a solo 3D scene in SBS/TB renders once per eye below — and
    // since a 3D<->3D texture cross-fade can be blended per-pixel, the PACKED
    // state now also covers that: both scenes render per-eye and a plain mix
    // replaces the styled combine (no warp may cross the eye boundary).
    // While packed content is up, no combine cross-fade may start.
    {
        const bool stereo_on = ( M_StereoMode == 1 || M_StereoMode == 2 );
        const bool act_3d = m_effectTextures[m_scheduler.actTexture()]->is3D();
        const bool tex_solo = ( m_scheduler.texState() == 0 );
        const bool next_3d = m_effectTextures[m_scheduler.nextTexture()]->is3D();
        m_trueStereoHold = stereo_on && act_3d && ( tex_solo || next_3d );
        m_trueStereoPacked = m_trueStereoHold
                             && m_scheduler.fxState() == 0;
        m_trueStereoNow = m_trueStereoPacked && tex_solo;
    }
}

// Per-eye scene render into the SBS/TB halves of the bound FBO
// (scissored, so each eye's clear stays inside its half).  Eye
// separation scales with the stereo-depth knob (keys c/m).

void RenderPipeline::renderSceneStereo( EffectShader *fx ) const
{
    Scene3DShader *s3 = static_cast<Scene3DShader *>( fx );
    glEnable( GL_SCISSOR_TEST );
    for ( int e = 0; e < 2; ++e ) // e 0 = left eye, 1 = right
    {
        if ( M_StereoMode == 1 ) // SBS: left half = left eye
        {
            int hw = m_width / 2;
            glViewport( e * hw, 0, hw, m_height );
            glScissor( e * hw, 0, hw, m_height );
        }
        else // TB: top half = left eye
        {
            int hh = m_height / 2;
            glViewport( 0, e ? 0 : hh, m_width, hh );
            glScissor( 0, e ? 0 : hh, m_width, hh );
        }
        s3->setEyeOffset( ( e ? 1.f : -1.f ) * 0.5f * M_StereoDepth );
        s3->draw();
    }
    s3->setEyeOffset( 0.f );
    glDisable( GL_SCISSOR_TEST );
    glViewport( 0, 0, m_width, m_height );
}

void RenderPipeline::renderActiveScenePass( const AudioFeatures &audioFx )
{
    // MSAA: 3D scenes draw into the shared multisample scratch target instead
    // of the regular FBO, then resolve (blit) into it once opaque drawing is
    // done -- OIT/rig2/combine/depth-post all keep reading the same regular
    // textures as always, unaware AA ever happened. 2D effects never touch
    // this at all (no geometric edges to smooth). True-stereo eye-packed
    // frames are excluded too: the scissored halves would each need their own
    // resolve, and the packed frame already halves the sampling rate per eye.
    bool tex1_is_3d = m_effectTextures[m_scheduler.actTexture()]->is3D();
    bool msaa_tex1 = tex1_is_3d && !m_trueStereoPacked;
    if ( msaa_tex1 )
        ensureMsaaTargets( m_width, m_height );
    msaa_tex1 = msaa_tex1 && m_msaaReady;

    // Do the FBO Stuff
    glBindFramebuffer( GL_FRAMEBUFFER, msaa_tex1 ? m_msaaFbo : m_fboEffectTexture1 );

    // glFramebufferTexture2D( GL_FRAMEBUFFER, m_attachmentpoint, GL_TEXTURE_2D, m_texIDFBOEffectTexture1, 0);

    // A 2D effect never touches the depth attachment, so whatever the last 3D
    // scene left there would still be sitting in it — and the combine stage now
    // READS that texture.  Clearing here means "no geometry" always reads as the
    // far plane instead of as a stale silhouette.
    // Shadow map first: the depth pass has to be complete before the scene that
    // samples it is drawn.  It renders into its own framebuffer, so it happens
    // before the texture FBO is bound below.
    m_lastAudioFx = audioFx;
    // The box is sized by the SCENE, because only it knows its own scale, and
    // the map's 2048 texels are spent across whatever this says.
    EffectShader::M_ShadowExtent =
        m_effectTextures[m_scheduler.actTexture()]->shadowExtent();
    updateLightMatrix( m_globaltime );
    if ( m_effectTextures[m_scheduler.actTexture()]->usesShadow() )
    {
        renderShadowPass( m_effectTextures[m_scheduler.actTexture()] );
        glBindFramebuffer( GL_FRAMEBUFFER, msaa_tex1 ? m_msaaFbo : m_fboEffectTexture1 );
    }
    // Second, independent shadow-casting light (studio-style two-light setup);
    // same scope as light 1 -- the active scene only, never the cross-fading
    // "next" one.
    updateLightMatrix2( m_globaltime );
    if ( m_effectTextures[m_scheduler.actTexture()]->usesShadow2() )
    {
        renderShadowPass2( m_effectTextures[m_scheduler.actTexture()] );
        glBindFramebuffer( GL_FRAMEBUFFER, msaa_tex1 ? m_msaaFbo : m_fboEffectTexture1 );
    }

    EffectShader::M_DepthValid[0] = tex1_is_3d ? 1.f : 0.f;
    if ( EffectShader::M_DepthValid[0] == 0.f )
    {
        glClearDepth( 1.0 );
        glClear( GL_DEPTH_BUFFER_BIT );
    }

    glcoreDebugMark( "scene:act" );
    m_effectTextures[m_scheduler.actTexture()]->enableShader();
    m_effectTextures[m_scheduler.actTexture()]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
    m_effectTextures[m_scheduler.actTexture()]->applyAudioFeatures( audioFx );
    if ( m_trueStereoPacked )
        renderSceneStereo( m_effectTextures[m_scheduler.actTexture()] );
    else
        m_effectTextures[m_scheduler.actTexture()]->draw();


    if ( msaa_tex1 )
    {
        resolveMsaa( m_fboEffectTexture1, m_width, m_height );
        checkGLErrors( "resolveMsaa() 1" );
    }

    // Transparent geometry goes in afterwards, over the opaque frame this scene
    // just produced and against the depth it just wrote.
    // (b45cdff schob die Debug-Marke unter ein KLAMMERLOSES if und machte
    // renderOitPass damit unbedingt: der Resolve band oitAccum/oitReveal auf
    // die Foto-Units 0/1, und jede EINBLENDENDE Szene sampelte die OIT-Puffer
    // statt der Fotos -- der "Helligkeitsabfall + Textur-Wechsel" am Ende
    // jeder Szenen-Blende. Klammern + Rebind im Resolve, siehe dort.)
    if ( !m_trueStereoPacked && m_effectTextures[m_scheduler.actTexture()]->usesOit() )
    {
        glcoreDebugMark( "oit" );
        renderOitPass( m_effectTextures[m_scheduler.actTexture()],
                       m_depthTexEffect1, m_fboEffectTexture1 );
    }

    checkGLErrors( "createTextures() 1" );

    // Now Use Final Rendering
    glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
    checkFramebufferStatus();
}

void RenderPipeline::renderNextScenePass( const AudioFeatures &audioFx )
{
    // Skip the "next" texture effect while NOT cross-fading: every combine weights
    // this output (tex1) by (1-interpolation), which is 0 at interpolation==1.0, so
    // it is invisible.  Saves a whole effect pass during the common solo periods.
    EffectShader::M_DepthValid[1] = 0.f;
    if ( m_scheduler.texState() != 0 )
    {
        bool tex2_is_3d = m_effectTextures[m_scheduler.nextTexture()]->is3D();
        bool msaa_tex2 = tex2_is_3d && !m_trueStereoPacked;
        if ( msaa_tex2 )
            ensureMsaaTargets( m_width, m_height );
        msaa_tex2 = msaa_tex2 && m_msaaReady;

        // Do the FBO Stuff
        glBindFramebuffer( GL_FRAMEBUFFER, msaa_tex2 ? m_msaaFbo : m_fboEffectTexture2 );

        EffectShader::M_DepthValid[1] = tex2_is_3d ? 1.f : 0.f;
        if ( EffectShader::M_DepthValid[1] == 0.f )
        {
            glClearDepth( 1.0 );
            glClear( GL_DEPTH_BUFFER_BIT );
        }
        glcoreDebugMark( "scene:next" );
        m_effectTextures[m_scheduler.nextTexture()]->enableShader();
        m_effectTextures[m_scheduler.nextTexture()]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
        m_effectTextures[m_scheduler.nextTexture()]->applyAudioFeatures( audioFx );
        if ( m_trueStereoPacked )                                             // 3D<->3D fade: the incoming scene is
            renderSceneStereo( m_effectTextures[m_scheduler.nextTexture()] ); // eye-packed too
        else
            m_effectTextures[m_scheduler.nextTexture()]->draw();


        if ( msaa_tex2 )
        {
            resolveMsaa( m_fboEffectTexture2, m_width, m_height );
            checkGLErrors( "resolveMsaa() 2" );
        }
    }
}

GLuint RenderPipeline::prepareFxInputs()
{
    // restore render destination to regular frame buffer
    glViewport( 0, 0, m_width, m_height );

    // 2D CAMERA RIG: if a scene carries rig2* formulas, the FX pass gets the
    // TRANSFORMED frame instead.  Never on eye-packed frames (warping a
    // packed stereo frame shears the two eyes against each other), and the
    // "next" slot only when its pass actually rendered this frame.
    GLuint fx_tex1 = m_texIDFBOEffectTexture1;
    GLuint fx_tex2 = m_texIDFBOEffectTexture2;
    if ( !m_trueStereoPacked )
    {
        fx_tex1 = rig2Transform( m_effectTextures[m_scheduler.actTexture()],
                                 m_texIDFBOEffectTexture1, 0 );
        if ( m_scheduler.texState() != 0 )
            fx_tex2 = rig2Transform( m_effectTextures[m_scheduler.nextTexture()],
                                     m_texIDFBOEffectTexture2, 1 );
        glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
        glViewport( 0, 0, m_width, m_height );
    }

    // The exposure measures the INCOMING scene during fades (see
    // PresentPass::Inputs::fadeMeasureTex for why the mix cannot work).
    m_fadeInTex = ( m_scheduler.texState() != 0 ) ? fx_tex2 : 0;

    glActiveTexture( GL_TEXTURE3 );
    glBindTexture( GL_TEXTURE_2D, fx_tex1 );

    glActiveTexture( GL_TEXTURE4 );
    glBindTexture( GL_TEXTURE_2D, fx_tex2 );

    // The matching depth buffers.  Bound unconditionally: they are two texture
    // binds, and a shader that ignores them never declares the samplers.
    glActiveTexture( GL_TEXTURE0 + 29 );
    glBindTexture( GL_TEXTURE_2D, m_depthTexEffect1 );
    glActiveTexture( GL_TEXTURE0 + 30 );
    glBindTexture( GL_TEXTURE_2D, m_depthTexEffect2 );
    glActiveTexture( GL_TEXTURE0 );

    return fx_tex1;
}

void RenderPipeline::renderStereoMixPass()
{
    // Packed 3D<->3D cross-fade: plain per-pixel mix of the two
    // eye-packed frames — same endpoint weighting as the Crossfade
    // transition, but guaranteed warp-free.
    glUseProgram( m_stereoMixProgId );
    if ( m_stereoMixTexAUni >= 0 )
        glUniform1i( m_stereoMixTexAUni, 3 );
    if ( m_stereoMixTexBUni >= 0 )
        glUniform1i( m_stereoMixTexBUni, 4 );
    if ( m_stereoMixResUni >= 0 )
        glUniform2f( m_stereoMixResUni,
                     static_cast<float>( m_width ), static_cast<float>( m_height ) );
    if ( m_stereoMixWUni >= 0 )
        glUniform1f( m_stereoMixWUni,
                     m_scheduler.texInterp() );
    drawWindow();
}

GLuint RenderPipeline::renderTransitionPass( const AudioFeatures &audioFx, GLuint fxTex1 )
{
    // TRANSITION pass (only during a scene fade): the rolled Transitions/
    // shader blends outgoing (tex0, unit 3) and incoming (tex1, unit 4)
    // scene into its own FBO.  While a scene plays solo the pass is
    // skipped entirely and the overlays read the scene frame directly.
    GLuint scene_tex = fxTex1;
    if ( m_scheduler.texState() != 0 && !m_effectTransitions.empty() )
    {
        glBindFramebuffer( GL_FRAMEBUFFER, m_fboTransition );
        EffectShader *tr = m_effectTransitions[m_scheduler.actTransition()];
        tr->enableShader();
        tr->setUniforms( m_globaltime, m_scheduler.texInterp(), 3, 4 );
        tr->applyAudioFeatures( audioFx );
        tr->draw();
        scene_tex = m_texIDFBOTransition;
        glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectFx1 );
    }

    return scene_tex;
}

void RenderPipeline::renderOverlayPass( const AudioFeatures &audioFx, GLuint sceneTex )
{
    // OVERLAY pass: the combine/FX shader reads the FINISHED scene.  Both
    // units carry the same texture and interpolation is pinned to 1.0
    // ("old scene fully visible"), so overlays never see a half-blended
    // pair — scene mixing is entirely the transition pass's job now.
    glActiveTexture( GL_TEXTURE3 );
    glBindTexture( GL_TEXTURE_2D, sceneTex );
    // An FX that samples the scene at explicit mip levels (FxChain: a transform
    // chain squeezes the frame) gets a fresh mip chain of the finished frame --
    // one glGenerateMipmap, the same the present pass already does every frame
    // for bloom.  Only while such an FX is on screen; afterwards the textures go
    // back to plain linear filtering, so no stale level is ever read.
    const bool want_mips = m_effectFx[m_scheduler.actFx()]->usesSceneLod()
                           || ( m_scheduler.fxState() != 0 && m_effectFx[m_scheduler.nextFx()]->usesSceneLod() );
    if ( want_mips )
    {
        glGenerateMipmap( GL_TEXTURE_2D );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
        m_sceneMipTex.insert( sceneTex );
    }
    else if ( !m_sceneMipTex.empty() )
    {
        for ( GLuint t : m_sceneMipTex )
        {
            glBindTexture( GL_TEXTURE_2D, t );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
        }
        m_sceneMipTex.clear();
        glBindTexture( GL_TEXTURE_2D, sceneTex );
    }
    glActiveTexture( GL_TEXTURE4 );
    glBindTexture( GL_TEXTURE_2D, sceneTex );
    glActiveTexture( GL_TEXTURE0 );

    m_effectFx[m_scheduler.actFx()]->enableShader();
    m_effectFx[m_scheduler.actFx()]->setUniforms( m_globaltime, 1.0f, 3, 4 );
    m_effectFx[m_scheduler.actFx()]->applyAudioFeatures( audioFx );
    m_effectFx[m_scheduler.actFx()]->draw();
}

void RenderPipeline::renderNextOverlayPass( const AudioFeatures &audioFx )
{
    // Skip the "next" combine while NOT cross-fading combines: the final blend
    // pass (Engine/OverlayBlend.frag) weights this output by (1-interpolation),
    // which is 0 at interpolation==1.0, so it is invisible.  Saves the second
    // combine pass.  Units 3/4 still hold the finished scene from the pass
    // above; interpolation stays pinned at 1.0 like for the active overlay.
    if ( m_scheduler.fxState() != 0 )
    {
        m_effectFx[m_scheduler.nextFx()]->enableShader();
        m_effectFx[m_scheduler.nextFx()]->setUniforms( m_globaltime, 1.0f, 3, 4 );
        m_effectFx[m_scheduler.nextFx()]->applyAudioFeatures( audioFx );
        m_effectFx[m_scheduler.nextFx()]->draw();
    }
}

void RenderPipeline::renderFxStage( const AudioFeatures &audioFx )
{
    const GLuint fx_tex1 = prepareFxInputs();

    glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectFx1 );

    if ( m_trueStereoNow )
    {
        // True stereo: the eye-packed 3D frame passes through UNTOUCHED (any
        // transition/overlay warp would fold content across the eye boundary).
        blitTexture( m_texIDFBOEffectTexture1 );
    }
    else if ( m_trueStereoPacked && m_stereoMixProgId != 0 )
    {
        renderStereoMixPass();
    }
    else
    {
        // Order matters: the overlay reads the FINISHED scene, so the
        // transition has to have produced it first.
        glcoreDebugMark( "transition" );
        const GLuint scene_tex = renderTransitionPass( audioFx, fx_tex1 );
        renderOverlayPass( audioFx, scene_tex );
    }

    checkGLErrors( "createFx() 1" );

    glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
    checkFramebufferStatus();

    glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectFx2 );
    renderNextOverlayPass( audioFx );
}


void RenderPipeline::renderFinalBlend()
{
    // Now Use Final Rendering — into the safety FBO if active, else to the screen.
    GLuint fx_target = m_present.ready() ? m_present.targetFbo() : m_defaultFBO;
    glBindFramebuffer( GL_FRAMEBUFFER, fx_target );
    checkFramebufferStatus();

    /*******************************************************************************/

    glUseProgram( m_shProgIdFx );
    // restore render destination to regular frame buffer
    glViewport( 0, 0, m_width, m_height );


    glUniform1i( m_texPointFxUni1, 5 ); // texture Unit 0, nicht mit texId verwechseln
    glUniform1i( m_texPointFxUni2, 6 ); // texture Unit 0, nicht mit texId verwechseln
    glUniform2f( m_texSizeRcpFxUni, static_cast<float>( m_width ), static_cast<float>( m_height ) );
    glUniform1f( m_interpolationFxUni, m_scheduler.fxInterp() );
    glUniform1f( m_timeFxUni, m_globaltime );



    glActiveTexture( GL_TEXTURE5 );
    glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectFx1 );

    glActiveTexture( GL_TEXTURE6 );
    glBindTexture( GL_TEXTURE_2D, m_texIDFBOEffectFx2 );

    drawWindow();
}

GLuint RenderPipeline::renderTrailsPass( const AudioFeatures &audio, const AudioFeatures &audioFx,
                                         float timeSinceLastFrameSec, float dtWall )
{
    // -------------------------------------------------------------------------
    // Feedback / trails pass: blend the previous displayed frame back in so bright
    // moving structures leave glowing, fading trails.  Ping-pong of two buffers;
    // the result becomes the present source.  decay (→0 in non-music) controls the
    // trail length, longer in ambient passages.
    // -------------------------------------------------------------------------
    GLuint present_source = m_present.finalTex();
    if ( m_feedbackReady )
    {
        int   cur = m_trailIdx;
        int   prev = 1 - m_trailIdx;
        float decay = M_TrailAmount * ( 0.90f + 0.08f * audio.ambientFactor )
                      * audio.musicPresence;
        // A loaded model gets almost no feedback trail. The trail layer's warp
        // field deliberately rides the beat (ripple below), which on abstract
        // material is the liquid MilkDrop look -- but on a solid object it
        // drags beat-synced after-images across the hull, and that reads as
        // the OBJECT twitching (reported three times before the cause was
        // found). Slewed via m_meshUp, so cross-fades ease it in and out.
        decay *= 1.f - 0.85f * m_meshUp;
        // Build-up tension: trails tighten as the music climbs toward the drop
        // (crisper, more nervous picture), then the drop's release lets them
        // bloom back to full length.
        decay *= 1.f - 0.45f * audioFx.buildUp * ( 1.f - audioFx.dropPulse );
        // ARTICULATION (the performance-cues mapping): staccato material
        // (sharp attacks, logAttackTime -> 1) crisps the picture with shorter
        // trails; legato swells keep the full flowing length.  The feature is
        // slow-moving, so this reads as an interpretation trait, not a pulse.
        decay *= 1.f - 0.30f * audio.logAttackTime;
        // SONG-END outro: as the track fades out the trails BLOOM — the last
        // notes linger visibly before the picture settles.
        decay = std::min( decay * ( 1.f + 0.40f * audioFx.fadeOut ), 0.96f );

        glBindFramebuffer( GL_FRAMEBUFFER, m_fboTrail[cur] );
        glViewport( 0, 0, m_width, m_height );
        glUseProgram( m_trailProgId );
        glActiveTexture( GL_TEXTURE0 );
        glBindTexture( GL_TEXTURE_2D, m_present.finalTex() );
        glActiveTexture( GL_TEXTURE1 );
        glBindTexture( GL_TEXTURE_2D, m_texTrail[prev] );
        glUniform1i( m_trailCurUni, 0 );
        glUniform1i( m_trailPrevUni, 1 );
        if ( m_trailResUni >= 0 )
            glUniform2f( m_trailResUni, static_cast<float>( m_width ), static_cast<float>( m_height ) );
        if ( m_trailDecayUni >= 0 )
            glUniform1f( m_trailDecayUni, decay );
        // Echo-warp: the beat pumps the outward zoom, the rotation direction
        // swings slowly (sin of slow time -> smooth reversals, no snapping)
        // and echoes drift gently in hue.  All rates scaled by frame time.
        {
            float dtf = timeSinceLastFrameSec;
            // calmMotion: the echo zoom keeps its steady drift but no beat pump.
            float zoom = 1.0f
                         + ( 0.05f + ( M_CalmMotion ? 0.f : 0.22f * m_audioConditioner.beatSmooth() )
                             + 0.08f * audio.ambientFactor )
                               * dtf;
            float rot_a = 0.15f * sinf( m_globaltime * 0.02f ) * dtf;
            float hue_d = 0.10f * dtf;
            // True stereo: the echo-warp would drag content across the eye
            // boundary of the packed frame — keep only the plain decay.
            if ( m_trueStereoPacked )
            {
                zoom = 1.f;
                rot_a = 0.f;
                hue_d = 0.f;
            }
            if ( m_trailZoomUni >= 0 )
                glUniform1f( m_trailZoomUni, zoom );
            if ( m_trailRotUni >= 0 )
                glUniform1f( m_trailRotUni, rot_a );
            if ( m_trailHueUni >= 0 )
                glUniform1f( m_trailHueUni, hue_d );
            // Depth-aware trails while a 3D scene is on screen (slewed so
            // cross-fades from/to 2D effects ease the behaviour in and out).
            {
                bool scene_up = m_effectTextures[m_scheduler.actTexture()]->is3D()
                                || ( m_scheduler.texState() != 0
                                     && m_effectTextures[m_scheduler.nextTexture()]->is3D() );
                m_trailDepth3D = slewToward( m_trailDepth3D,
                                             scene_up ? 1.f : 0.f, 2.5f, dtWall );
                // Same shape, but for loaded-model scenes only: drives the
                // time-echo damping in the present pass (see EffectShader::
                // isMeshScene). Slewed on the same ramp so a cross-fade eases
                // it rather than switching it.
                bool mesh_up = m_effectTextures[m_scheduler.actTexture()]->isMeshScene()
                               || ( m_scheduler.texState() != 0
                                    && m_effectTextures[m_scheduler.nextTexture()]->isMeshScene() );
                m_meshUp = slewToward( m_meshUp, mesh_up ? 1.f : 0.f, 2.5f, dtWall );
                // Dev hook: KALEIDO_CALM=1 pins the damping to full on EVERY
                // scene -- one switch that silences all beat-driven full-frame
                // motion (camera punch/shake/sway, trail warp, time echo). Used
                // for A/B-proving which channel a residual twitch comes from.
                {
                    static int s_calm = -1;
                    if ( s_calm < 0 )
                        s_calm = getenv( "KALEIDO_CALM" ) ? 1 : 0;
                    if ( s_calm == 1 )
                        m_meshUp = 1.f;
                }
                if ( m_trailDepthUni >= 0 )
                    glUniform1f( m_trailDepthUni, m_trailDepth3D );
            }
            // MilkDrop-style spatial warp field: the liquid feedback look.
            // Ripple rides the beat, the swirl direction swings very slowly,
            // the flow field breathes with the music; all phases are
            // integrated (no flicker), all amplitudes are per-frame (x dt).
            {
                m_warpRipplePhase += dtf * ( 2.0f + 5.0f * m_audioConditioner.beatSmooth() );
                m_warpFlowPhase += dtf * 0.55f;
                // Displacement VELOCITIES (uv/s resp. rad/s), applied per
                // frame; they accumulate through the feedback loop.
                float rip = M_CalmMotion
                                ? 0.f
                                : ( 0.05f * m_audioConditioner.beatSmooth() + 0.10f * audioFx.dropPulse ) * dtf;
                float swl = 0.25f * sinf( m_globaltime * 0.013f )
                            * ( 0.4f + 0.6f * audio.ambientFactor ) * dtf;
                float flw = ( 0.02f + 0.05f * audio.ambientFactor
                              + 0.04f * audioFx.swell )
                            * dtf;
                // Scale with the trails knob (no trails -> no warp) and gate
                // out of the packed true-stereo frames entirely.
                float g = M_TrailAmount * audio.musicPresence;
                // Same damping as the trail decay above: no beat-warp field over
                // a loaded model (see the m_meshUp comment there).
                g *= 1.f - 0.85f * m_meshUp;
                if ( m_trueStereoPacked )
                    g = 0.f;
                if ( m_trailRipAmpUni >= 0 )
                    glUniform1f( m_trailRipAmpUni, rip * g );
                if ( m_trailRipPhUni >= 0 )
                    glUniform1f( m_trailRipPhUni, m_warpRipplePhase );
                if ( m_trailSwirlUni >= 0 )
                    glUniform1f( m_trailSwirlUni, swl * g );
                if ( m_trailFlowAmpUni >= 0 )
                    glUniform1f( m_trailFlowAmpUni, flw * g );
                if ( m_trailFlowPhUni >= 0 )
                    glUniform1f( m_trailFlowPhUni, m_warpFlowPhase );
            }
        }
        drawWindow();

        present_source = m_texTrail[cur];
        m_trailIdx = prev; // swap for next frame
    }

    return present_source;
}

void RenderPipeline::runPresentPass( GLuint presentSource, const AudioFeatures &audio, const AudioFeatures &audioFx,
                                     float timeSinceLastFrameSec, float dtWall )
{
    // -------------------------------------------------------------------------
    // Photosensitivity-safety present pass.
    // The frame to display now lives in presentSource.  We read its whole-frame avg
    // luminance (via a coarse mip level) and choose a single brightness scale so
    // that the average can never RISE faster than a safe limit per second — this
    // reins in large full-screen flashes while leaving local pattern motion (a
    // uniform scale) completely untouched.  scale is clamped to <=1 so the pass
    // can only ever darken, never brighten.  On any failure we already rendered
    // straight to screen (m_safetyReady == false), so nothing is lost.
    // -------------------------------------------------------------------------
    if ( m_present.ready() )
    {
        PresentPass::Inputs pin;
        pin.source = presentSource;
        pin.targetFbo = m_defaultFBO;
        pin.renderW = m_width;
        pin.renderH = m_height;
        pin.displayW = m_displayW;
        pin.displayH = m_displayH;
        pin.fx = &audioFx;
        pin.dtFrame = timeSinceLastFrameSec;
        // Fast exposure during the fade AND for a short tail after it. The tail
        // exists for a dark scene arriving over a bright one: the MIX stays
        // bright until the old scene is nearly gone, so the correct exposure
        // only becomes reachable in the fade's last moments -- measured, the
        // gain was still 0.57 short at fade end and then crept at the slow rate
        // for a visible second. Half a second of grace closes that at the fast
        // rate while everything on screen is still settling from the change.
        if ( m_scheduler.texState() != 0 )
            m_expoFadeTail = 0.5f;
        else if ( m_expoFadeTail > 0.f )
            m_expoFadeTail -= timeSinceLastFrameSec;
        pin.sceneFade = ( m_scheduler.texState() != 0 || m_expoFadeTail > 0.f );
        pin.sceneFadeStrict = ( m_scheduler.texState() != 0 );
        pin.expoSnap = ( m_expoWasFading && !pin.sceneFadeStrict );
        pin.fadeMeasureTex = m_fadeInTex;
        m_expoWasFading = pin.sceneFadeStrict;
        pin.dtWall = dtWall;
        pin.globalTime = m_globaltime;
        pin.chasePhase = m_audioConditioner.chasePhase();
        pin.camZoom = m_audioConditioner.camZoom();
        pin.camRot = m_audioConditioner.camRot();
        pin.camOffX = m_audioConditioner.camOffX();
        pin.camOffY = m_audioConditioner.camOffY();
        pin.stereoPacked = m_trueStereoPacked;
        pin.stereoMode = M_StereoMode;
        pin.stereoDepth = M_StereoDepth;
        pin.blackout = M_Blackout;
        pin.breakSmooth = m_breakSmooth;
        pin.fadeOutEnv = audioFx.fadeOut;
        // REVIEW BENCH: neutral colour. The presets' key-following hue shift
        // (Present.frag rotates the whole frame by audioChromaHue) painted the
        // entire walk in ONE tint, because the bench song holds a single key
        // for its whole loop -- the user-reported "everything stayed green".
        // A scene's colours cannot be judged through a constant grade, so the
        // review walk pins the mood grade to neutral.
        pin.moodStrength = m_scheduler.reviewMode() ? 0.f : M_MoodStrength;
        pin.lightShow = M_LightShow;
        pin.renderScale = M_RenderScale;
        pin.lyricsAlpha = m_overlay.lyricsAlpha;
        pin.lyricsScrollV = m_overlay.lyricsScrollV;
        pin.lyricsAspect = m_overlay.lyricsAspect;
        pin.lyricsHlV0 = m_overlay.lyricsHlV0;
        pin.lyricsHlV1 = m_overlay.lyricsHlV1;
        pin.lyricsHlProg = m_overlay.lyricsHlProg;
        pin.lyricsUScale = m_overlay.lyricsUScale;
        pin.lyricsFocusV0 = m_overlay.lyricsFocusV0;
        pin.lyricsFocusV1 = m_overlay.lyricsFocusV1;
        pin.lyricsScrollU = m_overlay.lyricsScrollU;
        pin.artistAlpha = m_overlay.artistAlpha;
        pin.artistAspect = m_overlay.artistAspect;
        // Zeit-Regie: Rewind/Echo/Breath.  Das Zeitecho traeumt in Ambient-
        // Passagen und blitzt nach einem Drop als Flashback auf; waehrend
        // eines Rewinds pausiert es (History auf History waere Matsch).
        pin.rewindSecs = m_audioConditioner.rewindBack();
        pin.rewindMix = m_audioConditioner.rewindMix();
        pin.echoAmt = std::max( 0.50f * audioFx.dropPulse,
                                0.20f * audio.ambientFactor * audio.musicPresence )
                      * ( 1.f - m_audioConditioner.rewindMix() );
        // ...but barely, while a loaded model is on screen. The echo blends the
        // frame from 1.4 s ago at 4.5 % larger scale, which on an abstract
        // scene is a dreamy after-image and on a solid object is a bigger,
        // half-transparent twin -- a thing no physical object has, so it reads
        // as a rendering fault rather than as an effect. Slewed on the same
        // 2.5/s ramp as m_trailDepth3D so a cross-fade into or out of a mesh
        // scene eases the damping in rather than switching it.
        pin.echoAmt *= ( 1.f - 0.85f * m_meshUp );
        if ( m_audioConditioner.echoOverride() >= 0.f )
            pin.echoAmt = m_audioConditioner.echoOverride();
        pin.echoDelay = 1.4f;
        pin.breath = m_audioConditioner.breath();
        // Scene grade: the outgoing scene weighs texInterp (1 while solo), the
        // incoming one the rest -- the grade fades with the scene, never jumps.
        if ( m_scheduler.actTexture() < m_effectTextures.size() )
        {
            const float w = m_scheduler.texState() != 0 ? m_scheduler.texInterp() : 1.f;
            pin.gradeModeA = static_cast<float>( m_effectTextures[m_scheduler.actTexture()]->gradeMode() );
            pin.gradeAmtA = pin.gradeModeA > 0.f ? w : 0.f;
            if ( m_scheduler.texState() != 0 && m_scheduler.nextTexture() < m_effectTextures.size() )
            {
                pin.gradeModeB = static_cast<float>( m_effectTextures[m_scheduler.nextTexture()]->gradeMode() );
                pin.gradeAmtB = pin.gradeModeB > 0.f ? 1.f - w : 0.f;
            }
        }
        // Welle 2: Letterbox, Schockwelle, Cover-Palette, Zeilen-Slam,
        // 2.5D-Parallaxe (Tiefe der AKTIVEN Szene; eine 2D-Szene hat auf
        // die Fernebene geloeschte Tiefe -> Parallaxe neutralisiert sich).
        pin.letterbox = m_audioConditioner.letterbox();
        pin.shockR = m_audioConditioner.shockR();
        pin.shockAmp = m_audioConditioner.shockAmp();
        pin.lyricsLineAge = m_overlay.lyricsLineAge;
        pin.paletteAmt = m_overlay.paletteAmt;
        for ( int pi = 0; pi < 3; ++pi )
        {
            pin.paletteA[pi] = m_overlay.paletteA[pi];
            pin.paletteB[pi] = m_overlay.paletteB[pi];
        }
        pin.sceneDepthTex = m_depthTexEffect1;
        pin.depthPar = m_trailDepth3D;
        pin.nearZ = EffectShader::SceneNear;
        pin.farZ = EffectShader::SceneFar;
        m_present.run( pin );
    }
}

void RenderPipeline::paint( const float *rotMatrix, float tx, float ty, float tz,
                            const AudioFeatures &audio )
{
    beginFrame( audio );
    updateLiveInput();
    updateTimingScale( audio );

    const FrameTiming ft = readFrameClock();
    float             time_since_last_frame_sec = ft.dt;
    // A comparison run (KALEIDO_FREEZE_TIME): the wall-clock slews too (exposure,
    // title, trails) step 1/120 s per frame and stop with the freeze -- the
    // frame is final the moment it freezes, not ~20 s later.
    const float dt_wall = freezeTime() < 0.f ? ft.dtWall : ( M_Freeze ? 0.f : 1.f / 120.f );
    // A frame far beyond any real frame rate is a STALL (first-activation
    // shader compile + mesh load, a driver recompile, a suspend), not time the
    // viewer spent watching. Subtract it from the scheduler's wall clocks, or
    // the fade completes inside the frozen frame and the minimum solo is
    // already used up when the picture returns. 0.16 s stays on the books --
    // a legitimately slow frame's worth.
    if ( dt_wall > 0.4f )
        m_scheduler.absorbHitch( dt_wall - 0.16f );
    applyTransportModifiers( audio, time_since_last_frame_sec, dt_wall );
    updateTitleReveal( audio, dt_wall );

    const AudioFeatures audio_fx = conditionAudio( audio, time_since_last_frame_sec );

    // KALEIDO_FEATURE_LOG=<datei>: eine CSV-Zeile je Frame mit den Groessen,
    // an denen Regie-Entscheidungen haengen.  Ohne das liess sich "trifft die
    // Drop-Vorhersage?" oder "folgt die Tonhoehe dem Bass?" nur aus dem Bild
    // raten -- und das Bild ist die Wirkung, nicht die Ursache.
    {
        static FILE *flog = []
        {
            const char *e = getenv( "KALEIDO_FEATURE_LOG" );
            FILE       *f = e ? fopen( e, "w" ) : nullptr;
            if ( f )
                fputs( "t,pitch,dpitch,buildUp,dropPulse,dropCount,barPhase,beatPhase,bpm,"
                       "sectionCount,sectionId,presence,level,swell,flux,hcdf,phrasePos,phraseLeft,melody,hue\n",
                       f );
            return f;
        }();
        if ( flog )
        {
            static unsigned n = 0;
            fprintf( flog,
                     "%.3f,%.4f,%.4f,%.3f,%.3f,%d,%.3f,%.3f,%.1f,%d,%d,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.2f,%.4f,%.4f\n",
                     m_globaltime, audio.dominantPitch, audio.deltaPitch, audio.buildUp, audio.dropPulse,
                     audio.dropCount, audio_fx.barPhase, audio_fx.beatPhase, 40.f + 160.f * audio.estimatedBPM,
                     audio.sectionCount, audio.sectionId, audio.musicPresence, audio.overallLevel, audio_fx.swell,
                     audio.spectralFlux, audio.harmonicChange, audio_fx.phrasePos, audio_fx.phraseSecsLeft,
                     audio.melodyPitch, audio_fx.chromaHue );
            if ( ( ++n & 63u ) == 0 )
                fflush( flog );
        }
    }
    updateImageState( time_since_last_frame_sec );

    const SceneScheduler::Tick sched_tick = buildSchedulerTick( audio, time_since_last_frame_sec );

    // Asynchronous mesh warm-up: while the fade's INCOMING scene is still
    // waiting for its model (worker thread, see Scene3DShader), hold the
    // scheduler clocks so the fade stays parked at its start -- the
    // outgoing scene keeps playing, nothing freezes, and the fade then
    // runs in full once the model is in. Past the timeout the fade is
    // released regardless; draw() keeps skipping the unbuilt mesh, so at
    // worst the object appears late, but the show never wedges on a
    // stuck load.
    if ( m_scheduler.texState() != 0 )
    {
        EffectShader *nx = m_effectTextures[m_scheduler.nextTexture()];
        if ( nx->meshWarmupPending() )
        {
            nx->requestMeshWarmup();
            m_meshHoldSecs += dt_wall;
            if ( m_meshHoldSecs < 5.f )
                m_scheduler.absorbHitch( dt_wall );
        }
        else
            m_meshHoldSecs = 0.f;
    }
    else
        m_meshHoldSecs = 0.f;

    // The one clock every shader reads. It advances AFTER the transport
    // modifiers above, so a freeze ('e') or a DJ-stop really does stop it.
    m_globaltime += time_since_last_frame_sec;

    stepSimulations( audio, time_since_last_frame_sec, audio_fx );
    bindSceneInputs();
    updateTrueStereoState();

    renderActiveScenePass( audio_fx );
    renderNextScenePass( audio_fx );
    glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
    checkFramebufferStatus();

    // The combine half of the scheduler tick, deliberately AFTER both scene
    // passes: it needs m_trueStereoHold, which only exists once they ran.
    m_scheduler.tickFx( sched_tick, m_trueStereoHold );

    renderFxStage( audio_fx );
    renderFinalBlend();

    const GLuint present_source =
        renderTrailsPass( audio, audio_fx, time_since_last_frame_sec, dt_wall );

    // Spout output (-o): publish the displayed frame for OBS / Resolume etc.
    // (Needs the GL context, which is current here; texture-share via DX interop.)
    if ( M_SpoutEnabled )
    {
        if ( !m_spoutStarted )
            m_spoutStarted = spoutOutInit( "Kaleidoscope" );
        spoutOutSend( present_source, m_width, m_height );
    }

    glcoreDebugMark( "present" );
    runPresentPass( present_source, audio, audio_fx, time_since_last_frame_sec, dt_wall );
    checkGLErrors( "paint() 2" );
}

void RenderPipeline::drawScene( const float *rotMatrix, float tx, float ty, float tz )
{
    glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );

    glMatrixMode( GL_PROJECTION );
    glLoadIdentity();
    gluPerspective( 60, m_width / static_cast<float>( m_height ), 0.1, 50 );
    // glFrustum(-1.0, 1.0, -1.0, 1.0, 10, 400);
    glMatrixMode( GL_MODELVIEW );
    glLoadIdentity();
    glTranslatef( tx, ty, tz );
    glMultMatrixf( rotMatrix ); //

    if ( 0 != m_mesh )
    {
        float scale = ( m_mesh->bmax - m_mesh->bmin ).length() / 3;
        glScalef( 1 / scale, 1 / scale, 1 / scale );
        Vector3D center = ( m_mesh->bmax + m_mesh->bmin ) / 2;
        glTranslatef( -center[0], -center[1], -center[2] );
        m_mesh->draw();
    }
}

/**  Shared empty VAO for every fullscreen-triangle draw.
 *
 * @return
 *   The VAO name, generated on first call (a GL context must be current); never deleted.
 *
 * Core profile needs a VAO bound even without vertex attributes; the shared
 * Fullscreen.vert generates the triangle from gl_VertexID.
 **/
GLuint fullscreenVAO()
{
    static GLuint vao = 0;
    if ( vao == 0 )
        glGenVertexArrays( 1, &vao );
    return vao;
}

void RenderPipeline::drawWindow()
{
    glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
    glBindVertexArray( fullscreenVAO() );
    glDrawArrays( GL_TRIANGLES, 0, 3 );
    glBindVertexArray( 0 );
}


/**
 * Create framebuffer object, bind it to reroute rendering operations
 * from the traditional framebuffer to the off-screen buffer
 */
// Fixed-function copy of a texture into the currently bound FBO.  Used by the
// true-stereo path: the eye-packed 3D frame replaces the combine output 1:1.
// 2D CAMERA RIG: rotate/zoom/pan a finished 2D scene frame before the
// combine consumes it, driven by the scene's rig2* formulas (evaluated in
// EffectShader::applyAudioFeatures).  Renders src into a per-slot scratch
// texture through Engine/Rig2D.frag and returns THAT; the caller simply
// binds the returned id, so nothing is copied back and no other consumer
// of the original texture is affected.  Off (returns src) when the scene
// has no rig2 formulas — zero extra cost for the whole existing catalogue.
GLuint RenderPipeline::rig2Transform( EffectShader *fx, GLuint srcTex, int slot )
{
    float rig[4];
    if ( !fx || !fx->rig2( rig ) )
        return srcTex;

    static GLuint prog = 0;
    static GLint  u_tex = -1, u_roll = -1, u_zoom = -1, u_pan = -1, u_res = -1;
    if ( prog == 0 )
    {
        prog = setShaders( "..\\standard.vert", "..\\Engine\\Rig2D.frag" );
        u_tex = glGetUniformLocation( prog, "tex" );
        u_roll = glGetUniformLocation( prog, "rigRoll" );
        u_zoom = glGetUniformLocation( prog, "rigZoom" );
        u_pan = glGetUniformLocation( prog, "rigPan" );
        u_res = glGetUniformLocation( prog, "resolution" );
    }
    if ( prog == 0 )
        return srcTex; // compile failed: fail open

    // Lazy scratch targets, size-checked every use (render scale / DPI
    // changes re-allocate here instead of needing a resize() case).
    if ( m_rig2W != m_width || m_rig2H != m_height )
    {
        for ( int i = 0; i < 2; ++i )
        {
            if ( m_rig2Tex[i] == 0 )
                glGenTextures( 1, &m_rig2Tex[i] );
            glBindTexture( GL_TEXTURE_2D, m_rig2Tex[i] );
            glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height,
                          0, m_texFormat, m_texType, NULL );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
            glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
            if ( m_rig2Fbo[i] == 0 )
                glGenFramebuffers( 1, &m_rig2Fbo[i] );
            glBindFramebuffer( GL_FRAMEBUFFER, m_rig2Fbo[i] );
            glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
                                    GL_TEXTURE_2D, m_rig2Tex[i], 0 );
        }
        glBindTexture( GL_TEXTURE_2D, 0 );
        m_rig2W = m_width;
        m_rig2H = m_height;
    }

    glBindFramebuffer( GL_FRAMEBUFFER, m_rig2Fbo[slot] );
    glViewport( 0, 0, m_width, m_height );
    glDisable( GL_DEPTH_TEST );
    glDisable( GL_BLEND );
    glUseProgram( prog );
    glActiveTexture( GL_TEXTURE0 );
    glBindTexture( GL_TEXTURE_2D, srcTex );
    if ( u_tex >= 0 )
        glUniform1i( u_tex, 0 );
    if ( u_res >= 0 )
        glUniform2f( u_res, static_cast<float>( m_width ), static_cast<float>( m_height ) );
    if ( u_roll >= 0 )
        glUniform1f( u_roll, rig[0] );
    if ( u_zoom >= 0 )
        glUniform1f( u_zoom, rig[1] );
    if ( u_pan >= 0 )
        glUniform2f( u_pan, rig[2], rig[3] );
    glBindVertexArray( fullscreenVAO() );
    glDrawArrays( GL_TRIANGLES, 0, 3 );
    glBindVertexArray( 0 );
    checkGLErrors( "RenderPipeline::rig2Transform" );
    return m_rig2Tex[slot];
}

void RenderPipeline::blitTexture( GLuint tex )
{
    // Tiny dedicated blit program (fixed-function texturing is gone in core).
    static GLuint blit_prog = 0;
    static GLint  blit_tex_uni = -1;
    if ( blit_prog == 0 )
    {
        blit_prog = setShaders( "..\\standard.vert", "..\\Engine\\Blit.frag" );
        blit_tex_uni = glGetUniformLocation( blit_prog, "tex" );
    }
    glUseProgram( blit_prog );
    glActiveTexture( GL_TEXTURE0 );
    glBindTexture( GL_TEXTURE_2D, tex );
    if ( blit_tex_uni >= 0 )
        glUniform1i( blit_tex_uni, 0 );
    glBindVertexArray( fullscreenVAO() );
    glDrawArrays( GL_TRIANGLES, 0, 3 );
    glBindVertexArray( 0 );
}

// Create the shadow map's depth-only framebuffer.  Lazy: only a scene that
// declares "texShadow" ever triggers it, and most never do.
bool RenderPipeline::ensureShadowMapGeneric( GLuint &fbo, GLuint &tex )
{
    if ( fbo != 0 )
        return true;

    glGenTextures( 1, &tex );
    glBindTexture( GL_TEXTURE_2D, tex );
    // LINEAR is deliberate: with GL_TEXTURE_COMPARE_MODE set, the hardware
    // filters the RESULT of four depth comparisons rather than the depths
    // themselves — free 2x2 percentage-closer filtering, which is what turns a
    // staircased shadow edge into a soft one.
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    // Outside the light's box there is no occluder, so the border must read as
    // "fully lit" — CLAMP_TO_EDGE would smear the nearest shadow outward across
    // everything beyond the map.
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_BORDER );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_BORDER );
    const float border[4] = { 1.f, 1.f, 1.f, 1.f };
    glTexParameterfv( GL_TEXTURE_2D, GL_TEXTURE_BORDER_COLOR, border );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_COMPARE_MODE, GL_COMPARE_REF_TO_TEXTURE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_COMPARE_FUNC, GL_LEQUAL );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, ShadowSize, ShadowSize,
                  0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL );

    glGenFramebuffers( 1, &fbo );
    glBindFramebuffer( GL_FRAMEBUFFER, fbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
                            GL_TEXTURE_2D, tex, 0 );
    // No colour attachment at all; without telling GL that, the framebuffer is
    // incomplete.
    glDrawBuffer( GL_NONE );
    glReadBuffer( GL_NONE );
    bool ok = checkFramebufferStatus();
    glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
    glBindTexture( GL_TEXTURE_2D, 0 );

    if ( !ok )
    {
        fputs( "shadow map FBO incomplete - shadows disabled\n", stderr );
        glDeleteFramebuffers( 1, &fbo );
        glDeleteTextures( 1, &tex );
        fbo = tex = 0;
    }
    return ok;
}

// Orthographic projection along a slowly turning light direction, covering a
// fixed cube at the origin.  Orthographic and not perspective because this is a
// SUN: its rays are parallel, and a perspective shadow frustum would give the
// shadows a vanishing point that the shading does not have.
//
// Shared by both lights: angleOffset phase-shifts the orbit so light 2 never
// moves in lockstep with light 1, and tiltY lowers the base elevation (0 for
// the overhead "sun", >0 for a cooler, more side-on second light) -- see the
// updateLightMatrix()/updateLightMatrix2() wrappers in the header for the
// actual per-light parameters.
void RenderPipeline::updateLightMatrixGeneric( float t, float angleOffset, float tiltY, float *outM, float *outDir )
{
    // The ACTIVE scene's box, not the default: the map's resolution is spent
    // across it, so a small scene must get a small box or its shadows come out
    // in blocks a texel wide.
    const float E = EffectShader::M_ShadowExtent;

    // Kept fairly high on purpose.  A low sun is more dramatic per shadow, but
    // shadow length goes as 1/tan(elevation) — at 37 degrees a tall object
    // throws a shadow longer than itself, and in any scene with repeated
    // geometry the ground ends up entirely dark.  (tiltY pulls this down for a
    // second light on purpose -- a lower, cooler fill reads as a second
    // distinct source rather than a copy of the sun.)
    float a = t * 0.06f + angleOffset;
    float lx = 0.42f * sinf( a );
    float ly = ( 1.15f - tiltY ) + 0.16f * sinf( a * 0.43f );
    float lz = -0.42f * cosf( a ) - 0.18f;
    float ln = sqrtf( lx * lx + ly * ly + lz * lz );
    lx /= ln;
    ly /= ln;
    lz /= ln;
    outDir[0] = lx;
    outDir[1] = ly;
    outDir[2] = lz;

    // Look-at from the light toward the origin.  f points from the eye into the
    // scene, so it is the NEGATED light direction.
    float fx = -lx, fy = -ly, fz = -lz;
    // Any up vector not parallel to f; y is parallel when the light is overhead.
    float ux = 0.f, uy = 1.f, uz = 0.f;
    if ( fabsf( fy ) > 0.98f )
    {
        ux = 1.f;
        uy = 0.f;
    }
    // s = f x up, then u = s x f  (both normalised).
    float sx = fy * uz - fz * uy;
    float sy = fz * ux - fx * uz;
    float sz = fx * uy - fy * ux;
    float sn = sqrtf( sx * sx + sy * sy + sz * sz );
    sx /= sn;
    sy /= sn;
    sz /= sn;
    float tx = sy * fz - sz * fy;
    float ty = sz * fx - sx * fz;
    float tz = sx * fy - sy * fx;

    // Eye far enough back that the whole box lies in front of it.
    const float dist = E * 2.f;
    float       ex = lx * dist, ey = ly * dist, ez = lz * dist;

    // View matrix (column-major), rows s / t / -f, translated by -eye.
    float view_matrix[16] = {
        sx, tx, -fx, 0.f,
        sy, ty, -fy, 0.f,
        sz, tz, -fz, 0.f,
        -( sx * ex + sy * ey + sz * ez ),
        -( tx * ex + ty * ey + tz * ez ),
        ( fx * ex + fy * ey + fz * ez ), 1.f };

    // Orthographic box: +-E across, and deep enough to hold the box from the
    // eye's distance.
    const float zn = 0.1f, zf = dist + E * 2.f;
    float       proj_matrix[16] = {
        1.f / E, 0.f, 0.f, 0.f,
        0.f, 1.f / E, 0.f, 0.f,
        0.f, 0.f, -2.f / ( zf - zn ), 0.f,
        0.f, 0.f, -( zf + zn ) / ( zf - zn ), 1.f };

    // outM = P * V, column-major.
    for ( int c = 0; c < 4; ++c )
        for ( int r = 0; r < 4; ++r )
        {
            float sum = 0.f;
            for ( int k = 0; k < 4; ++k )
                sum += proj_matrix[k * 4 + r] * view_matrix[c * 4 + k];
            outM[c * 4 + r] = sum;
        }
}

// Draw one 3D scene into a shadow map, depth only. Shared by both lights --
// see renderShadowPass()/renderShadowPass2() in the header for which FBO/
// texture/unit/pass-flag each one binds.
void RenderPipeline::renderShadowPassGeneric( EffectShader *fx, GLuint &fbo, GLuint &tex, int texUnit, float &passFlag )
{
    if ( !ensureShadowMapGeneric( fbo, tex ) )
        return;

    glBindFramebuffer( GL_FRAMEBUFFER, fbo );
    glViewport( 0, 0, ShadowSize, ShadowSize );
    glClearDepth( 1.0 );
    glClear( GL_DEPTH_BUFFER_BIT );

    // Deliberately NO face culling.  The usual trick is to cull front faces so
    // the map records each object's far side, which moves self-shadowing out of
    // the lit surface — but it only works if the geometry's winding is known,
    // and it is not: the cube buffer winds its outward faces clockwise, so
    // culling GL_FRONT there records the NEAREST surfaces and every face
    // shadows itself.  The receivers offset their lookup along the surface
    // normal instead, which needs no assumption about winding at all.
    glDisable( GL_CULL_FACE );

    // The map is the depth attachment of the framebuffer we just bound, and
    // the PREVIOUS frame left it bound for reading on this very unit -- a
    // texture that is both render target and sampler source at once is a
    // feedback loop, undefined by the spec and reported as an incomplete
    // sampler on every shadow-pass draw. The scene's texShadow uniform still
    // points here (applyAudioFeatures sets it just below), so the unit needs
    // something valid: a 1x1 depth texture at the far plane, which reads as
    // fully lit -- the right answer for a pass that is only measuring depth.
    glActiveTexture( GL_TEXTURE0 + texUnit );
    glBindTexture( GL_TEXTURE_2D, glcoreDummyShadow() );
    glActiveTexture( GL_TEXTURE0 );

    glcoreDebugMark( ( texUnit == 31 ) ? "shadowPass1" : "shadowPass2" );
    passFlag = 1.f;
    fx->enableShader();
    fx->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
    fx->applyAudioFeatures( m_lastAudioFx );
    fx->draw();
    passFlag = 0.f;

    glActiveTexture( GL_TEXTURE0 + texUnit );
    glBindTexture( GL_TEXTURE_2D, tex );
    glActiveTexture( GL_TEXTURE0 );

    glViewport( 0, 0, m_width, m_height );
}

// Allocate the two accumulation targets weighted-blended OIT needs.
bool RenderPipeline::ensureOitTargets()
{
    if ( m_oitFbo != 0 )
        return true;
    if ( !glBlendFunci || !glDrawBuffers || !glClearBufferfv )
        return false;

    // Accumulation must be FLOATING POINT and cannot be 8-bit: it sums
    // premultiplied colour over every transparent layer with no clamping in
    // between, so an 8-bit target saturates after two or three panes and the
    // stack turns into a flat white card.
    glGenTextures( 1, &m_oitAccum );
    glBindTexture( GL_TEXTURE_2D, m_oitAccum );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, m_width, m_height, 0,
                  GL_RGBA, GL_FLOAT, NULL );

    glGenTextures( 1, &m_oitReveal );
    glBindTexture( GL_TEXTURE_2D, m_oitReveal );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_R16F, m_width, m_height, 0,
                  GL_RED, GL_FLOAT, NULL );

    glGenFramebuffers( 1, &m_oitFbo );
    glBindFramebuffer( GL_FRAMEBUFFER, m_oitFbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
                            GL_TEXTURE_2D, m_oitAccum, 0 );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1,
                            GL_TEXTURE_2D, m_oitReveal, 0 );
    const GLenum bufs[2] = { GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1 };
    glDrawBuffers( 2, bufs );
    bool ok = checkFramebufferStatus();
    glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
    glBindTexture( GL_TEXTURE_2D, 0 );

    if ( ok && m_oitResolveProg == 0 )
        m_oitResolveProg = setShaders( "..\\standard.vert", "..\\Engine\\OitResolve.frag" );

    if ( !ok )
    {
        fputs( "OIT targets incomplete - transparent pass disabled\n", stderr );
        glDeleteFramebuffers( 1, &m_oitFbo );
        glDeleteTextures( 1, &m_oitAccum );
        glDeleteTextures( 1, &m_oitReveal );
        m_oitFbo = m_oitAccum = m_oitReveal = 0;
    }
    return ok;
}

// Draw the scene's transparent geometry into the accumulation targets, then
// composite the result back over the already-rendered opaque frame.
void RenderPipeline::renderOitPass( EffectShader *fx, GLuint depthTex, GLuint targetFbo )
{
    if ( !ensureOitTargets() )
        return;

    glBindFramebuffer( GL_FRAMEBUFFER, m_oitFbo );
    // The SCENE'S depth buffer, not one of our own: transparent surfaces must
    // still be hidden by the opaque geometry that was drawn before them, and
    // that information only exists in the depth the scene just wrote.
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
                            GL_TEXTURE_2D, depthTex, 0 );

    // Accumulation starts empty; revealage starts at 1 (nothing covered yet).
    const GLfloat zero[4] = { 0.f, 0.f, 0.f, 0.f };
    const GLfloat one[4] = { 1.f, 1.f, 1.f, 1.f };
    glClearBufferfv( GL_COLOR, 0, zero );
    glClearBufferfv( GL_COLOR, 1, one );

    glEnable( GL_DEPTH_TEST );
    // Depth WRITES off.  The whole point is that transparent surfaces do not
    // occlude each other — writing depth would make the first one drawn hide
    // the ones behind it, which is exactly the order dependence being removed.
    glDepthMask( GL_FALSE );
    glEnable( GL_BLEND );
    // The two targets blend DIFFERENTLY: colour adds up, revealage multiplies
    // down.  One glBlendFunc could not express both.
    glBlendFunci( 0, GL_ONE, GL_ONE );
    glBlendFunci( 1, GL_ZERO, GL_ONE_MINUS_SRC_COLOR );

    EffectShader::M_OitPass = 1.f;
    fx->enableShader();
    fx->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
    fx->applyAudioFeatures( m_lastAudioFx );
    fx->draw();
    EffectShader::M_OitPass = 0.f;

    glDepthMask( GL_TRUE );
    glDisable( GL_BLEND );
    glDisable( GL_DEPTH_TEST );

    // ---- resolve: composite the accumulated transparency over the frame ----
    glBindFramebuffer( GL_FRAMEBUFFER, targetFbo );
    glViewport( 0, 0, m_width, m_height );
    if ( m_oitResolveProg == 0 )
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
    if ( l0 >= 0 )
        glUniform1i( l0, 0 );
    if ( l1 >= 0 )
        glUniform1i( l1, 1 );
    if ( lr >= 0 )
        glUniform2f( lr, static_cast<float>( m_width ), static_cast<float>( m_height ) );

    // Standard "over" compositing of the resolved layer onto the opaque frame.
    glEnable( GL_BLEND );
    glBlendFunc( GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA );
    glBindVertexArray( fullscreenVAO() );
    glDrawArrays( GL_TRIANGLES, 0, 3 );
    glBindVertexArray( 0 );
    glDisable( GL_BLEND );

    // The resolve borrowed the PHOTO units (0/1) for accum/reveal.  Put the
    // photos back: the "next" scene pass runs after this and samples 0/1 as
    // tex0/tex1 -- without the rebind an incoming scene cross-fades with the
    // OIT buffers as its background and snaps to the real photos at fade end.
    glActiveTexture( GL_TEXTURE0 );
    glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_actTex );
    glActiveTexture( GL_TEXTURE1 );
    glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_nextTex );
    glActiveTexture( GL_TEXTURE0 );
}

void RenderPipeline::initFBO( GLuint &fboEffect, GLuint &texIDEffectTexture, GLuint *depthRb )
{
    // create FBO (off-screen framebuffer) — reuse the id if it already exists
    // (re-entering this path must re-attach, not leak a fresh FBO)
    if ( fboEffect == 0 )
        glGenFramebuffers( 1, &fboEffect );

    // bind offscreen framebuffer (that is, skip the window-specific render target)
    glBindFramebuffer( GL_FRAMEBUFFER, fboEffect );

    // check if something went completely wrong
    checkGLErrors( "initFBO()" );
    // attach texture to FBO
    glFramebufferTexture2D( GL_FRAMEBUFFER, m_attachmentpoint,
                            GL_TEXTURE_2D, texIDEffectTexture, 0 );
    checkGLErrors( "initFBO()" );

    // Optional depth buffer (the 3D scene effects need depth testing; the plain
    // fullscreen-quad effects ignore it).  (Re)created at the current size on
    // every (re)init, so window resizes stay correct.
    //
    // A TEXTURE, not a renderbuffer: a renderbuffer is write-only from the
    // shader's side, and everything interesting downstream — depth of field,
    // ambient occlusion, light shafts, fog — needs to READ the depth the scene
    // just wrote.  The attachment costs the same either way.
    if ( depthRb )
    {
        if ( *depthRb == 0 )
            glGenTextures( 1, depthRb );
        glBindTexture( GL_TEXTURE_2D, *depthRb );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
        glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, m_width, m_height,
                      0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL );
        glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
                                GL_TEXTURE_2D, *depthRb, 0 );
        glBindTexture( GL_TEXTURE_2D, 0 );
    }

    // check if that worked
    if ( !checkFramebufferStatus() )
    {
        fputs( "glFramebufferTexture2D() FAILED!\n", stderr );
        exit( 1 );
    }
}


void RenderPipeline::ensureMsaaTargets( int w, int h )
{
    if ( m_msaaReady && m_msaaW == w && m_msaaH == h )
        return;

    if ( !m_msaaTried )
    {
        m_msaaTried = true;
        if ( !glTexImage2DMultisample )
        {
            fputs( "MSAA: glTexImage2DMultisample unavailable -- 3D scenes render unaliased\n", stderr );
            return;
        }
        GLint max_samples = 0;
        glGetIntegerv( GL_MAX_SAMPLES, &max_samples );
        m_msaaActualSamples = std::min( MsaaSamples, max_samples );
        if ( m_msaaActualSamples < 2 )
        {
            fputs( "MSAA: GL_MAX_SAMPLES < 2 -- 3D scenes render unaliased\n", stderr );
            m_msaaActualSamples = 0;
            return;
        }
    }
    if ( m_msaaActualSamples == 0 ) // permanent soft-fail from the first attempt
        return;

    m_msaaW = w;
    m_msaaH = h;

    if ( m_msaaColorTex == 0 )
        glGenTextures( 1, &m_msaaColorTex );
    glBindTexture( GL_TEXTURE_2D_MULTISAMPLE, m_msaaColorTex );
    glTexImage2DMultisample( GL_TEXTURE_2D_MULTISAMPLE, m_msaaActualSamples,
                             m_texInternalFormat, w, h, GL_TRUE );

    if ( m_msaaDepthTex == 0 )
        glGenTextures( 1, &m_msaaDepthTex );
    glBindTexture( GL_TEXTURE_2D_MULTISAMPLE, m_msaaDepthTex );
    glTexImage2DMultisample( GL_TEXTURE_2D_MULTISAMPLE, m_msaaActualSamples,
                             GL_DEPTH_COMPONENT24, w, h, GL_TRUE );
    glBindTexture( GL_TEXTURE_2D_MULTISAMPLE, 0 );

    if ( m_msaaFbo == 0 )
        glGenFramebuffers( 1, &m_msaaFbo );
    glBindFramebuffer( GL_FRAMEBUFFER, m_msaaFbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, m_attachmentpoint,
                            GL_TEXTURE_2D_MULTISAMPLE, m_msaaColorTex, 0 );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT,
                            GL_TEXTURE_2D_MULTISAMPLE, m_msaaDepthTex, 0 );
    m_msaaReady = checkFramebufferStatus();
    glBindFramebuffer( GL_FRAMEBUFFER, 0 );

    if ( !m_msaaReady )
        fputs( "MSAA: scratch FBO incomplete -- 3D scenes render unaliased\n", stderr );
}


void RenderPipeline::resolveMsaa( GLuint dstFbo, int w, int h ) const
{
    glBindFramebuffer( GL_READ_FRAMEBUFFER, m_msaaFbo );
    glBindFramebuffer( GL_DRAW_FRAMEBUFFER, dstFbo );
    // Straight 1:1 pixel resolve (source and destination are the same size),
    // so the filter argument never actually interpolates anything -- GL_NEAREST
    // because glBlitFramebuffer requires it for the depth bits regardless, and
    // blitting colour and depth together needs one shared filter.
    glBlitFramebuffer( 0, 0, w, h, 0, 0, w, h,
                       GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT, GL_NEAREST );
    glBindFramebuffer( GL_FRAMEBUFFER, dstFbo );
}


void RenderPipeline::loadNewTexture( GLuint &texID )
{
    NanoTimer timer;
    timer.start();

    // glDeleteTextures( 1, &texID );

    // float timeDelete = timer.elapsed();
    // timer.start();

    // glGenTextures( 1, &texID );

    // float timeGen = timer.elapsed();
    // timer.start();


    // set up texture
    setupTexture( texID, m_nextImage );
    // KALEIDO_FRAME_LOG: photo swaps in the same log as the long frames and gaps (is a stall a swap?)
    static const bool FrameLog = qEnvironmentVariableIsSet( "KALEIDO_FRAME_LOG" );
    if ( FrameLog )
        fprintf( stderr, "[photo] swapped in %.1f ms\n", timer.elapsed() );


    // printf( "%s\n", qPrintable((*m_imageListIterator)) );


    // printf( "Texture: %f\n", timeSetup );
    // printf( "Texture: Del: %f, Gen %f, Set %f\n", timeDelete, timeGen, timeSetup );
}


void RenderPipeline::createFBOTexture( GLuint &texID )
{
    checkGLErrors( "createTextures() 0" );

    if ( texID == 0 ) // reuse on re-entry (no leak)
        glGenTextures( 1, &texID );

    // set up texture
    setupFBOTexture( texID );

    // set texenv mode from modulate (the default) to replace)
    // (glTexEnvi removed: fixed-function texturing is gone in core)

    // check if something went completely wrong
    checkGLErrors( "createTextures() 1" );
}


// Procedural texture used when the configured image directory is missing or empty,
// so the visualizer still produces colourful kaleidoscope content instead of
// crashing on an empty image list (former end()-deref / div-by-zero).
QImage RenderPipeline::fallbackImage()
{
    const int N = 256;
    QImage    img( N, N, QImage::Format_ARGB32 );
    for ( int y = 0; y < N; ++y )
    {
        const float v = y / static_cast<float>( N );
        for ( int x = 0; x < N; ++x )
        {
            const float u = x / static_cast<float>( N );
            const int   r = static_cast<int>( 127.5f * ( 1.0f + sinf( u * 12.0f ) ) );
            const int   g = static_cast<int>( 127.5f * ( 1.0f + sinf( ( u + v ) * 9.0f ) ) );
            const int   b = static_cast<int>( 127.5f * ( 1.0f + cosf( v * 15.0f ) ) );
            img.setPixel( x, y, qRgb( r, g, b ) );
        }
    }
    return img;
}

/**  Loads a photo, substituting the procedural fallback image when the file is unreadable.
 *
 * @param path  Image file to load. (in)
 *
 * @return
 *   The loaded image, or RenderPipeline::fallbackImage() (with a stderr warning) if it is null.
 *
 * Robustness: a corrupt/unreadable photo (bad JPEG, a file caught mid-copy,
 * a dropped network share) makes QImage's load fail and return a null 0x0
 * image. prepareImage() would then hand back a null image too (scaled() on
 * null stays null), and setupTexture() relies on ALWAYS getting a real
 * 1024x1024 image on the first two uploads to size the GL texture storage
 * correctly for every later glTexSubImage2D reuse -- a null image there
 * permanently breaks the photo texture (0x0 storage, GL_INVALID_VALUE from
 * then on). Load through here instead of a bare QImage(path) wherever the
 * result feeds setupTexture()/prepareImage().
 **/
static QImage loadImageOrFallback( const QString &path )
{
    QImage img( path );
    if ( img.isNull() )
    {
        fprintf( stderr, "WARNING: unreadable image '%s' - using the "
                         "procedural fallback for this slot.\n",
                 qPrintable( path ) );
        img = RenderPipeline::fallbackImage();
    }
    return img;
}

void RenderPipeline::createTexture()
{
    checkGLErrors( "createTextures() 0" );

    if ( m_actTex == 0 )
        glGenTextures( 1, &m_actTex ); // reuse on re-entry
    if ( m_nextTex == 0 )
        glGenTextures( 1, &m_nextTex );
    // glGenTextures( 1, &m_texID3 );
    // set up texture

    // Robustness: no images configured -> use the procedural fallback for both.
    if ( m_imageList.isEmpty() )
    {
        setupTexture( m_actTex, prepareImage( fallbackImage() ) );
        setupTexture( m_nextTex, prepareImage( fallbackImage() ) );
        checkGLErrors( "createTextures() 1" );
        return;
    }

    // m_imageListIterator++;
    if ( m_imageListIterator == m_imageList.end() )
        m_imageListIterator = m_imageList.begin();
    setupTexture( m_actTex, prepareImage( loadImageOrFallback( *m_imageListIterator ) ) );
    fprintf( stderr, "PHOTO %s\n", qPrintable( ( *m_imageListIterator ) ) );

    ++m_imageListIterator;
    if ( m_imageListIterator == m_imageList.end() )
        m_imageListIterator = m_imageList.begin();
    setupTexture( m_nextTex, prepareImage( loadImageOrFallback( *m_imageListIterator ) ) );
    fprintf( stderr, "PHOTO %s\n", qPrintable( ( *m_imageListIterator ) ) );

    /*m_imageListIterator++;
    if(m_imageListIterator == m_imageList.end() )
        m_imageListIterator = m_imageList.begin();
    setupTexture( m_texID3, QImage( (*m_imageListIterator) ) );*/

    // set texenv mode from modulate (the default) to replace)
    // rwrw glTexEnvi( GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE );

    // check if something went completely wrong
    checkGLErrors( "createTextures() 1" );
}

void RenderPipeline::traverse( const QString &dirname, QStringList &imageList )
{
    // Every photo folder reaches the walk here, including the preset's own
    // "..\\Images". On POSIX a backslash is not a separator, so an unnormalised
    // path silently walks an EMPTY directory rather than failing loudly.
    QDir dir( Platform::assetPath( dirname ) );
    dir.setFilter( QDir::Dirs | QDir::Files | QDir::NoSymLinks );

    const QFileInfoList fileinfolist = dir.entryInfoList();
    foreach ( const QFileInfo &fi, fileinfolist )
    {
        if ( fi.baseName() == "." || fi.baseName() == ".." || fi.baseName() == "" )
        {
            continue;
        }
        if ( fi.isDir() && fi.isReadable() )
        {
            // This is the conditional for recursion
            traverse( fi.absoluteFilePath(), imageList );
        }
        else
        {
            /*if( fi.QImageReader::canRead(  ) )*/
            // Case-INSENSITIVE, and .jpeg too. The comparison used to be exact,
            // so a library holding IMG_0001.JPG or anything saved as .jpeg was
            // silently half-empty with nothing to say why.
            const QString ext = fi.suffix().toLower();
            if ( ext == "png" || ext == "jpg" || ext == "jpeg" )
            {

                // do something;
                imageList.push_back( fi.filePath() );
            }

            // This is where you might call your encrypting function
            // qDebug() << "Encrypting file: " << fi.absoluteFilePath();
            // encrypt( fi.absoluteFilePath() );
        }
    }
}


void RenderPipeline::setupFBOTexture( const GLuint texID ) const
{

    // make active and bind
    glBindTexture( GL_TEXTURE_2D, texID );

    // turn off filtering and wrap modes!
    // glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    // glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    // glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP);
    // glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP);

    // turn off filtering and wrap modes!
    // glTexParameteri( GL_TEXTURE_2D, GL_GENERATE_MIPMAP, GL_TRUE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    // glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_MIRRORED_REPEAT );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_MIRRORED_REPEAT );


    // define texture with floating point format
    glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, m_width, m_height, 0, m_texFormat, m_texType, NULL );
}



void RenderPipeline::setupTexture( const GLuint texID, const QImage &image )
{
    // NanoTimer timer;
    // timer.start();

    // make active and bind

    glBindTexture( GL_TEXTURE_2D, texID );
    // turn off filtering and wrap modes!
    // glTexParameteri( GL_TEXTURE_2D, GL_GENERATE_MIPMAP, GL_TRUE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
    // glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_MIRRORED_REPEAT );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_MIRRORED_REPEAT );



    // rescale to power of 2
    // -> this is necessary due to hardware limits!!
    // -> some drivers report GL2.0 but do not support NPOT textures.



    /*
        GLint w,h, maxSize = 64;
        glGetIntegerv( GL_MAX_TEXTURE_SIZE, &maxSize );
        const char* extensions = (const char*)glGetString( GL_EXTENSIONS );
        //if( NULL == strstr( extensions, "GL_ARB_texture_non_power_of_two" ) )
        {
            for( w = 1 ; w < image.width()  ; w *= 2 ) ;
            for( h = 1 ; h < image.height() ; h *= 2 ) ;
        }
        else
        {
            w = image.width();
            h = image.height();
        }*/
    /*	w = qMin( w, maxSize );
        h = qMin( h, maxSize );

        // convert image into a useful format
        QImage fixedImage = image.
            convertToFormat( QImage::Format_ARGB32 ).
            rgbSwapped().
            scaled( w,h );*/



    // upload image data
    // WHY glTexImage2D only the first two times: m_actTex and m_nextTex are the
    // only two textures this ever writes, and prepareImage() (Utils.cpp) always
    // hands back a fixed 1024x1024 ARGB32 image regardless of the source photo's
    // size — so the storage glTexImage2D allocates on those first two calls is
    // guaranteed to fit every later photo too, and glTexSubImage2D can safely
    // reuse it (cheaper: no reallocation) for every subsequent load.
    if ( m_nrTextureUploads < 2 )
    {
        glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8,
                      image.width(), image.height(), 0,
                      GL_RGBA, GL_UNSIGNED_BYTE, image.bits() );
        ++m_nrTextureUploads;
    }
    else
    {
        glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0,
                         image.width(), image.height(),
                         GL_RGBA, GL_UNSIGNED_BYTE, image.bits() );
    }


    // float convertingtime = timer.elapsed();
    // timer.start();

    glGenerateMipmap( GL_TEXTURE_2D );

    // float uploadtime = timer.elapsed();
    // printf( "Time to texture: Uploading %f  Mipmap: %f\n", convertingtime, uploadtime );//rwrwdebug
}


/** Sets up the GLSL runtime and creates shader. */
void RenderPipeline::initGLSL()
{
    // ---- texture-unit budget diagnostic -------------------------------------
    // The pipeline hands out fixed unit numbers well above 31 (shadow map 2 on
    // 32, texPrevFrame on 34, the deep-zoom Mandelbrot on 35, geom="mesh"'s
    // material array on 36). Whether that is legal depends on
    // GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS, NOT on the much smaller
    // GL_MAX_TEXTURE_IMAGE_UNITS that ComputeFX prints -- the latter
    // only caps how many samplers a single fragment stage may use at once.
    // Confusing the two led to a "shadow light 2 is out of range" report that
    // the numbers below disprove. Log both, and say plainly whether the highest
    // unit we hand out actually fits, so nobody has to guess again.
    {
        GLint max_combined = 0, max_fragment = 0;
        glGetIntegerv( GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS, &max_combined );
        glGetIntegerv( GL_MAX_TEXTURE_IMAGE_UNITS, &max_fragment );
        const int HighestUnitUsed = 36; // Scene3DShader::MeshMaterialTexUnit; see paint()
        fprintf( stderr,
                 "GL texture units: %d combined (legal indices 0..%d), "
                 "%d per fragment stage; pipeline uses up to %d -> %s\n",
                 max_combined, max_combined - 1, max_fragment, HighestUnitUsed,
                 ( HighestUnitUsed < max_combined ) ? "fits"
                                                    : "OUT OF RANGE, bindings will be dropped" );
        if ( HighestUnitUsed >= max_combined )
            fprintf( stderr,
                     "  WARNING: shadow map 2 (unit 32), texPrevFrame (34), the "
                     "Mandelbrot sim (35) and geom=\"mesh\"'s material array (36) "
                     "cannot bind on this GPU; those features will silently read "
                     "black. Re-map them below %d.\n",
                     max_combined );
    }

    // load and compile shader — the final pass that blends the outgoing and
    // incoming OVERLAY outputs during a combine switch (a plain linear mix;
    // the styled variety lives in Transitions/ and fires on SCENE fades).
    m_shProgIdFx = setShaders( "standard.vert", "..\\Engine\\OverlayBlend.frag" );
    // Get location of the texture samplers and point vector for future use
    m_texPointFxUni1 = glGetUniformLocation( m_shProgIdFx, "tex0" );
    m_texPointFxUni2 = glGetUniformLocation( m_shProgIdFx, "tex1" );
    m_texSizeRcpFxUni = glGetUniformLocation( m_shProgIdFx, "resolution" );
    m_timeFxUni = glGetUniformLocation( m_shProgIdFx, "time" );
    m_interpolationFxUni = glGetUniformLocation( m_shProgIdFx, "interpolation" );


    glUseProgram( m_shProgIdFx );
}


/**  Checks for OpenGL errors.
 *
 * Extremely useful debugging function: When developing, make sure to call this after almost every GL call.
 **/
void RenderPipeline::checkGLErrors( const char *label )
{
    // glGetError() can force a GPU/driver sync, and this is called from
    // dozens of sites every frame, so it is a no-op unless explicitly asked
    // for (KALEIDO_GL_DEBUG=1) -- e.g. while chasing exactly the kind of
    // silent failure a disabled check would otherwise hide (a null texture
    // upload, an unlinked shader program bound anyway, ...).
    static const bool Enabled = qEnvironmentVariableIsSet( "KALEIDO_GL_DEBUG" );
    if ( !Enabled )
        return;

    GLenum err_code = glGetError();
    if ( err_code == GL_NO_ERROR )
        return;

    fputs( "OpenGL ERROR: ", stderr );
    fputs( reinterpret_cast<const char *>( gluErrorString( err_code ) ), stderr );
    fputs( " (label: ", stderr );
    fputs( label, stderr );
    fputs( ")\n", stderr );
}

/**  Checks framebuffer status.
 *
 * Copied directly out of the spec, modified to deliver a return value.
 **/
bool RenderPipeline::checkFramebufferStatus( void )
{
    // Same KALEIDO_GL_DEBUG gate as checkGLErrors() -- see there for why.
    static const bool Enabled = qEnvironmentVariableIsSet( "KALEIDO_GL_DEBUG" );
    if ( !Enabled )
        return true;

    GLenum status;
    status = glCheckFramebufferStatus( GL_FRAMEBUFFER );
    switch ( status )
    {
        case GL_FRAMEBUFFER_COMPLETE:
            return true;
        case GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
            printf( "Framebuffer incomplete, incomplete attachment\n" );
            return false;
        case GL_FRAMEBUFFER_UNSUPPORTED:
            printf( "Unsupported framebuffer format\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
            printf( "Framebuffer incomplete, missing attachment\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
            printf( "Framebuffer incomplete, attached images must have same dimensions\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_FORMATS:
            printf( "Framebuffer incomplete, attached images must have same format\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_DRAW_BUFFER:
            printf( "Framebuffer incomplete, missing draw buffer\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_READ_BUFFER:
            printf( "Framebuffer incomplete, missing read buffer\n" );
            return false;
        default:
            printf( "Framebuffer incomplete, status 0x%x\n", status );
            return false;
    }
}


// Hot-reload (dev aid): recompile every program using the given fragment file.
void RenderPipeline::reloadFragment( const QString &bareName )
{
    auto matches = [&bareName]( EffectShader *s )
    {
        QString f = QString::fromLocal8Bit( s->fragmentName() );
        f.replace( '\\', '/' );
        int i = f.lastIndexOf( '/' );
        return ( ( i >= 0 ) ? f.mid( i + 1 ) : f )
                   .compare( bareName, Qt::CaseInsensitive )
               == 0;
    };
    // Forget the cached program FIRST, or every reloadShader() below would be
    // handed back the very program it is trying to replace.
    shaderCacheDrop( qPrintable( bareName ) );

    int n = 0;
    for ( EffectShader *s : m_effectTextures )
        if ( matches( s ) )
        {
            s->reloadShader();
            ++n;
        }
    for ( EffectShader *s : m_effectFx )
        if ( matches( s ) )
        {
            s->reloadShader();
            ++n;
        }
    if ( n )
        fprintf( stderr, "HOT-RELOAD: %s (%d program%s)\n",
                 qPrintable( bareName ), n, ( n == 1 ) ? "" : "s" );
}

void RenderPipeline::addTextureShader( EffectShader *shader )
{
    m_effectTextures.push_back( shader );
}


void RenderPipeline::addFxShader( EffectShader *shader )
{
    m_effectFx.push_back( shader );
}

void RenderPipeline::addTransitionShader( EffectShader *shader )
{
    m_effectTransitions.push_back( shader );
}


ImageLoader::ImageLoader( RenderPipeline *shader )
{
    m_shader = shader;
}

// Tiny-thumbnail stats for the mood-matched image choice: mean brightness and
// mean colourfulness (saturation x value), from a fast 32x32 scaled decode.
QPair<float, float> ImageLoader::imageStats( const QString &path )
{
    QImageReader r( path );
    r.setScaledSize( QSize( 32, 32 ) );
    QImage im = r.read();
    if ( im.isNull() )
        return qMakePair( 0.5f, 0.5f );
    double b = 0.0, c = 0.0;
    int    n = 0;
    for ( int y = 0; y < im.height(); y += 2 )
        for ( int x = 0; x < im.width(); x += 2 )
        {
            QColor col = im.pixelColor( x, y );
            b += col.valueF();
            c += col.saturationF() * col.valueF();
            ++n;
        }
    if ( n == 0 )
        return qMakePair( 0.5f, 0.5f );
    return qMakePair( static_cast<float>( b / n ), static_cast<float>( c / n ) );
}

void ImageLoader::run()
{
    while ( true )
    {
        if ( m_shader->m_triggerImageload == true )
        {
            // NanoTimer timer;
            // timer.start();

            // Robustness: empty image list -> serve the procedural fallback
            // instead of dividing by zero / dereferencing end().
            if ( m_shader->m_imageList.isEmpty() )
            {
                m_shader->m_nextImage = prepareImage( RenderPipeline::fallbackImage() );
                m_shader->m_triggerImageload = false;
                continue;
            }

            // MOOD-MATCHED image choice: probe a few random candidates and take
            // the one whose brightness/colourfulness best fits the live mood
            // (dark valence -> darker photos, energetic music -> more colourful,
            // ambient pulls slightly darker).  Stats come from a tiny fast-
            // scaled decode (JPEG DCT downscale) and are cached per path.
            const int n = m_shader->m_imageList.size();
            float     tb = 0.25f + 0.50f * m_shader->m_moodValence.load();
            tb *= 1.f - 0.25f * m_shader->m_moodAmbient.load();
            float ts = 0.20f + 0.50f * m_shader->m_moodArousal.load();

            int   best_idx = qrand() % n;
            float best_score = -1e9f;
            for ( int k = 0; k < 5; ++k )
            {
                int                 idx = qrand() % n;
                const QString      &path = m_shader->m_imageList[idx];
                QPair<float, float> st;
                auto                found = m_stats.find( path );
                if ( found != m_stats.end() )
                    st = found.value();
                else
                {
                    st = imageStats( path );
                    m_stats.insert( path, st );
                }
                float score = -( fabsf( st.first - tb ) + 0.7f * fabsf( st.second - ts ) );
                if ( score > best_score )
                {
                    best_score = score;
                    best_idx = idx;
                }
            }
            m_shader->m_imageListIterator = m_shader->m_imageList.begin() + best_idx;

            m_shader->m_nextImage = prepareImage( loadImageOrFallback( *m_shader->m_imageListIterator ) );
            fprintf( stderr, "PHOTO %s\n", qPrintable( ( *m_shader->m_imageListIterator ) ) );
            m_shader->m_triggerImageload = false;

            // float loadingtime = timer.elapsed();
            // printf( "Time to load: %f\n", loadingtime );//rwrwdebug
        }
        else
            msleep( 50 );
    }
}
