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

#include "ShaderForge.h"
#include "shader_setup.h"
#include <set>
#include <cstring>
#include <string>
#include "RenderPipeline.h"
#include "PlatformQt.h"
#include "PhotoDepth.h"
#include "SettingsFile.h"
#include "Strings.h"
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
#include <QtCore/QMap>
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
#ifndef GL_R11F_G11F_B10F
#define GL_R11F_G11F_B10F 0x8C3A ///< Packed unsigned-float RGB, 11/11/10 bits (KALEIDO_HDR_FORMAT=r11, measuring only).
#endif

/**  The format of the intermediates with hdrBuffers(): RGBA16F; KALEIDO_HDR_FORMAT=r11 takes R11F_G11F_B10F instead --
 * a measurement of plan P6 (27.11.2026): half the bytes, but no alpha, no sign and 6/6/5 mantissa bits.
 *
 * @return
 *   GL_RGBA16F, or GL_R11F_G11F_B10F with the switch.
 **/
static GLenum hdrFormat()
{
    static const GLenum Format =
        qgetenv( "KALEIDO_HDR_FORMAT" ).trimmed() == "r11" ? GL_R11F_G11F_B10F : GL_RGBA16F;
    return Format;
}

// Live-tunable look parameters (shared across all configs, set by hotkeys).
float RenderPipeline::M_Reactivity = 1.0f;
float RenderPipeline::M_TrailAmount = 0.6f;
bool  RenderPipeline::M_CalmMotion = true;
float RenderPipeline::M_MoodStrength = 1.0f;
float RenderPipeline::M_RenderScale = 1.0f;
float RenderPipeline::M_RenderScaleMax = 1.0f; // no supersampling unless asked for
bool  RenderPipeline::M_RenderScaleFromCli = false;
float RenderPipeline::M_LightShow = 0.0f;      // corner lamps / light-show OFF by default
bool  RenderPipeline::M_StrictLight = false;   // strict light protection (ini lightProtectionStrict)
bool  RenderPipeline::M_SpoutEnabled = false;  // Spout sender (CLI -o)
bool  RenderPipeline::M_SpoutClean = false;    // Spout sends the displayed frame, not the raw render
float RenderPipeline::M_DisplayHz = 60.f;      // the panel rate (glwidget sets it)
float RenderPipeline::M_LatencyLead = 0.05f;   // display-phase lead vs. heard audio
float RenderPipeline::M_FrameStep = 0.f;       // video export: fixed frame step (0 = live, wall clock)
int   RenderPipeline::M_StereoMode = 0;        // stereoscopic output (CLI -3 / 'z')
float RenderPipeline::M_StereoDepth = 1.0f;    // disparity strength
bool  RenderPipeline::M_StereoFromCli = false; // -3 given: an export keeps the stereo format
bool  RenderPipeline::M_Blackout = false;      // VJ blackout ('b')
bool  RenderPipeline::M_RestDim = false;       // the rest mode's blackout (GLwidget)
float RenderPipeline::M_Dim = 1.f;             // the sleep timer's dimming
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
float RenderPipeline::featureDelay()
{
    // An export (M_FrameStep) and the scene plan (EffectShader::M_Headless) analyse a file on their own clock: there
    // is no device between the analysis and an ear.
    if ( M_FrameStep > 0.f || EffectShader::M_Headless || M_LatencyLead >= 0.f )
        return 0.f;
    return -M_LatencyLead;
}

// The two defaults the user switched on on 27.11.2026 (ini hdrBuffers, pictureGuard).
bool RenderPipeline::M_HdrBuffers = DefaultHdrBuffers;
bool RenderPipeline::M_PictureGuard = DefaultPictureGuard;

bool RenderPipeline::hdrBuffers()
{
    // Latched at the first call (the first pipeline's constructor, after loadSettings()): a change of the setting
    // during the session applies at the next start.
    static const bool Hdr = hdrBuffersFor( qgetenv( "KALEIDO_HDR_BUFFERS" ), M_HdrBuffers );
    return Hdr;
}

bool RenderPipeline::hdrBuffersFor( const QByteArray &env, bool setting )
{
    const QByteArray e = env.trimmed();
    if ( e == "0" )
        return false;
    if ( e == "1" )
        return true;
    return setting;
}

/**  Whether this driver gives complete, renderable RGBA16F targets with mipmaps (the intermediates need all three).
 * Probed once with a small texture; a GL 3.3 driver must support them, but Mesa builds and old drivers have been seen
 * without float render targets.  If not, the pipelines fall back to 8 bit (reinit()), with one log line.
 *
 * @return
 *   True if a 16-bit target is complete and drew no GL error.
 **/
static bool hdrTargetsComplete()
{
    static int Result = -1;
    if ( Result >= 0 )
        return Result == 1;
    while ( glGetError() != GL_NO_ERROR )
    {
    }
    GLint prev_fbo = 0, prev_tex = 0;
    glGetIntegerv( GL_FRAMEBUFFER_BINDING, &prev_fbo );
    glGetIntegerv( GL_TEXTURE_BINDING_2D, &prev_tex );
    GLuint tex = 0, fbo = 0;
    glGenTextures( 1, &tex );
    glBindTexture( GL_TEXTURE_2D, tex );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, 64, 64, 0, GL_RGBA, GL_FLOAT, NULL );
    glGenerateMipmap( GL_TEXTURE_2D );
    glGenFramebuffers( 1, &fbo );
    glBindFramebuffer( GL_FRAMEBUFFER, fbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, tex, 0 );
    const GLenum status = glCheckFramebufferStatus( GL_FRAMEBUFFER );
    const GLenum err = glGetError();
    glBindFramebuffer( GL_FRAMEBUFFER, static_cast<GLuint>( prev_fbo ) );
    glBindTexture( GL_TEXTURE_2D, static_cast<GLuint>( prev_tex ) );
    glDeleteFramebuffers( 1, &fbo );
    glDeleteTextures( 1, &tex );
    Result = ( status == GL_FRAMEBUFFER_COMPLETE && err == GL_NO_ERROR ) ? 1 : 0;
    if ( !Result )
        fprintf( stderr, "Intermediate pictures: RGBA16F targets incomplete on this driver (status 0x%x, error 0x%x) "
                         "-- 8 bit (RGBA8) instead\n",
                 status, err );
    return Result == 1;
}
bool                    RenderPipeline::M_Pinned = false;         // VJ pin ('u')
QHash<QString, float>   RenderPipeline::M_Taste;                  // taste learning (skip/favourite)
QSet<QString>           RenderPipeline::M_Banned;                 // "never again"
QHash<QString, QString> RenderPipeline::M_Rated;                  // the rating walk's verdicts
bool                    RenderPipeline::M_SpoutInEnabled = false; // Spout input (CLI -i)
QString                 RenderPipeline::M_SpoutInSender;
QString                 RenderPipeline::M_VideoPath;    // native video input (CLI -v)
QString                 RenderPipeline::M_WarmLabel;    // what the lazy warm-up did this frame (KALEIDO_FRAME_LOG)
QString                 RenderPipeline::M_ImageDirCli;  // photo source override (CLI -f)
QString                 RenderPipeline::M_ImageDirUser; // photo source override (ini)


/**  Whether this is a scripted run (a test tool driving the app): KALEIDO_SEED, KALEIDO_FREEZE_TIME,
 * KALEIDO_SCENE_SWEEP or KALEIDO_FX_SWEEP is set -- or a video export (M_FrameStep).
 *
 * @return
 *   True for a scripted run.
 *
 * Such a run must come out the same every time and must not change what the viewer's show remembers: it neither
 * reads nor writes the scene memory ([history]) and the class memory ([classSeen]).  A video export counts from
 * the moment the command line set it up: after that the scene memory is neither read nor written, while the class
 * memory read before (loadSettings() runs first) only steers the export's choices.
 **/
/**  Whether a comparison run (KALEIDO_FREEZE_TIME) still waits for programs before its fixed steps go on.
 *
 * @return
 *   True while background builds (the driver's, the forge's) are running -- at most 20 s from the first call.
 *
 * Without vsync the 600 fixed steps take well under a second, and a frame integrated while the 3D lab's geometry was
 * still being forged froze half-built; with vsync the steps took 5 s, and the programs had usually arrived.  Waiting
 * for them makes every run integrate the same, at any frame rate.
 **/
static bool comparisonWaitsForPrograms()
{
    static QElapsedTimer waited;
    static bool          said = false;
    if ( !waited.isValid() )
        waited.start();
    const int  pending = shaderPrebuildPoll() + shaderForgePending();
    const bool wait = pending > 0 && waited.elapsed() < 20000;
    if ( !wait && !said && waited.elapsed() > 50 )
    {
        said = true;
        fprintf( stderr, "FREEZE: steps went on after %.1f s waiting for programs%s\n", waited.elapsed() * 0.001,
                 pending > 0 ? " (gave up, some still building)" : "" );
    }
    return wait;
}

/**  Whether this run is scripted (a fixed seed, a frozen clock, a scene or FX sweep, or frame steps): such a run must
 * not depend on the clock or on what earlier sessions remembered, so it neither reads nor writes the scene history,
 * the class memory or the photo memory.
 *
 * @return
 *   True for a scripted run.
 **/
static bool scriptedRun()
{
    static const bool Scripted = qEnvironmentVariableIsSet( "KALEIDO_SEED" )
                                 || qEnvironmentVariableIsSet( "KALEIDO_FREEZE_TIME" )
                                 || qEnvironmentVariableIsSet( "KALEIDO_SCENE_SWEEP" )
                                 || qEnvironmentVariableIsSet( "KALEIDO_FX_SWEEP" );
    return Scripted || RenderPipeline::M_FrameStep > 0.f;
}

/**  The settings key of a preset's scene memory.
 *
 * @param preset  The preset name (ConfigurationName). (in)
 *
 * @return
 *   "history/<preset>", with any slash in the name made '_' (a slash would open a group).
 **/
static QString historyKey( QString preset )
{
    preset.replace( QChar( '/' ), QChar( '_' ) ).replace( QChar( '\\' ), QChar( '_' ) );
    return "history/" + preset;
}

void RenderPipeline::loadSettings()
{
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
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
    // Signed since 26.11.2026: below zero the delay of all audio features (FeatureDelay.h).
    M_LatencyLead = clampParam( s.value( "latencyLead", M_LatencyLead ).toFloat(), LatencyMin, LatencyMax );
    // KALEIDO_LATENCY=<seconds> for a test run, without touching the ini.
    if ( qEnvironmentVariableIsSet( "KALEIDO_LATENCY" ) )
        M_LatencyLead = clampParam( qEnvironmentVariable( "KALEIDO_LATENCY" ).toFloat(), LatencyMin, LatencyMax );
    // The picture guard (PictureGuard.h, docs/PLAN_2026-11-26.md W1).
    M_PictureGuard = s.value( "pictureGuard", M_PictureGuard ).toBool();
    // 16-bit intermediates (docs/engine-internals.md (70)): read here, used from the first pipeline on (hdrBuffers()).
    M_HdrBuffers = s.value( "hdrBuffers", M_HdrBuffers ).toBool();
    setStereoMode( s.value( "stereoMode", M_StereoMode ).toInt() ); // 0..5; anything else is off
    M_SpoutClean = s.value( "spoutSource" ).toString().trimmed().compare( "clean", Qt::CaseInsensitive ) == 0;
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

    // Cue memory: [cues] <track>/<second> = <scene>.  A favourite pressed while
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

    M_Banned.clear();
    s.beginGroup( "banned" );
    for ( const QString &k : s.allKeys() ) // recursive: Preset/File.frag
        if ( s.value( k ).toBool() )
            M_Banned.insert( k );
    s.endGroup();

    // The rating walk's verdicts (web remote, "Rate"): Preset/File.frag = like|next|never.  They do not fade like the
    // taste: a verdict says the scene was judged, which is what keeps it out of the next walk.
    M_Rated.clear();
    s.beginGroup( "rated" );
    for ( const QString &k : s.allKeys() ) // recursive: Preset/File.frag
        M_Rated.insert( k, s.value( k ).toString() );
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
    // When the viewer last saw each chain class (EffectShader::M_ClassSeen):
    // the labs' walk prefers the classes not seen for hours.  Not in a
    // scripted run, which must not depend on the clock or this file.
    EffectShader::M_ClassSeen.clear();
    EffectShader::M_ClassSeenDirty.clear();
    EffectShader::M_ClassNovelty = !scriptedRun();
    if ( EffectShader::M_ClassNovelty )
    {
        s.beginGroup( "classSeen" );
        for ( const QString &k : s.allKeys() ) // recursive: knob/class
            EffectShader::M_ClassSeen[k.toStdString()] = s.value( k, 0.0 ).toDouble();
        s.endGroup();
    }
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
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
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
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    for ( const auto &kv : changed )
        s.setValue( "classTaste/" + QString::fromStdString( kv.first ), kv.second );
    s.sync();
}

void RenderPipeline::saveHistory( const std::vector<std::string> &names ) const
{
    if ( scriptedRun() )
        return;
    QStringList list;
    for ( const std::string &n : names )
        list << QString::fromStdString( n );
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    s.setValue( historyKey( m_presetName ), list.join( QChar( '|' ) ) );
    for ( const std::string &k : EffectShader::M_ClassSeenDirty )
        s.setValue( "classSeen/" + QString::fromStdString( k ), EffectShader::M_ClassSeen[k] );
    EffectShader::M_ClassSeenDirty.clear();
    s.sync();
}

QList<QPair<QString, QVariant>> RenderPipeline::lookSettings()
{
    return {
        { "reactivity", M_Reactivity },
        { "trails", M_TrailAmount },
        { "calmMotion", M_CalmMotion },
        { "mood", M_MoodStrength },
        { "latencyLead", M_LatencyLead },
        { "pictureGuard", M_PictureGuard },
        { "hdrBuffers", M_HdrBuffers },
        { "stereoMode", M_StereoMode },
        { "stereoDepth", M_StereoDepth },
        { "renderScale", M_RenderScale },
        { "renderScaleMax", M_RenderScaleMax },
        { "chainScale", M_ChainScaleIni },
        { "chainSupersample", EffectShader::M_ChainSS },
        // Written back even when empty (by 'k'), so the key is visible in the file for anyone who wants to point
        // the visualizer at their own pictures without hunting through documentation for its name.
        { "imageDirectory", M_ImageDirUser },
    };
}

void RenderPipeline::rememberSettings()
{
    for ( const auto &kv : lookSettings() )
        SettingsFile::remember( kv.first, kv.second );
}

QString RenderPipeline::saveSettings( bool everything )
{
    QSettings   s( SettingsFile::path(), QSettings::IniFormat );
    QStringList written;
    for ( const auto &kv : lookSettings() )
        if ( SettingsFile::store( s, kv.first, kv.second, everything ) )
            written << kv.first;
    s.sync();
    if ( !written.isEmpty() )
        fprintf( stderr, "Saved settings%s: %s\n", everything ? " (all)" : "", qPrintable( written.join( ' ' ) ) );
    return SettingsFile::failure( s );
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
      m_texInternalFormat( hdrBuffers() ? hdrFormat() : GL_RGBA8 ), // setting hdrBuffers / KALEIDO_HDR_BUFFERS
      m_texFormat( GL_RGBA ),
      m_texType( hdrBuffers() ? GL_FLOAT : GL_UNSIGNED_BYTE )
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
      // KALEIDO_TIME_START sets forward the clock every shader computes with.
      // Without it, "does the scene still hold after an hour?" can only be
      // checked by waiting an hour -- and exactly that question hid a whole
      // class of empty scenes: whoever pushes the camera forward with time*k
      // without the geometry keeping up flies out of its own world at some
      // point.
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
    // working directory exactly like the shader paths are (in the user's data folder where the program's folder is
    // not the user's: SettingsFile::userContent()).
    m_imageDirectory = !M_ImageDirCli.isEmpty()    ? M_ImageDirCli
                       : !M_ImageDirUser.isEmpty() ? M_ImageDirUser
                                                   : SettingsFile::userContent( directory );

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
    initPhotoMemory();

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

    addFallbackEntries();

    // Initial effect/combine pick and the scene clocks: SceneScheduler.  The
    // scenes this preset showed last come back from the settings file, so a
    // show that runs every evening does not start on the same few scenes
    // (written back by saveHistory() whenever a scene has come on screen).
    m_scheduler.attach( &m_effectTextures, &m_effectFx, &m_effectTransitions );
    m_scheduler.setTasteCallback( [this]( const char *f )
    { return tasteFor( f ); } );
    m_scheduler.setBannedCallback( [this]( const char *f )
    { return isBanned( f ); } );
    // Ready to be cut to: the program is built, or waits in the cache (a drop picks only those).
    m_scheduler.setReadyCallback( [this]( unsigned int i )
    {
        return i < m_effectTextures.size()
               && ( m_effectTextures[i]->isCompiled() || shaderPrebuildReady( m_effectTextures[i]->fragmentName() ) );
    } );
    if ( !scriptedRun() )
    {
        QSettings                s( SettingsFile::path(), QSettings::IniFormat );
        std::vector<std::string> names;
        for ( const QString &n :
              s.value( historyKey( m_presetName ) ).toString().split( QChar( '|' ), Qt::SkipEmptyParts ) )
            names.push_back( n.toStdString() );
        m_scheduler.setHistory( names );
        m_scheduler.setHistoryCallback( [this]( const std::vector<std::string> &n )
        { saveHistory( n ); } );
    }
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

void RenderPipeline::addFallbackEntries()
{
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
}

void RenderPipeline::simulateBegin()
{
    EffectShader::M_Headless = true;
    addFallbackEntries();
    m_scheduler.attach( &m_effectTextures, &m_effectFx, &m_effectTransitions );
    // Without GL "ready" is what a show would have built by then: the scenes already on screen (simulateFrame()).
    m_simSeen.assign( m_effectTextures.size(), 0 );
    m_scheduler.setReadyCallback( [this]( unsigned int i )
    { return i < m_simSeen.size() && m_simSeen[i] != 0; } );
    m_scheduler.reset();
}

SceneScheduler::Tick RenderPipeline::simulateFrame( const AudioFeatures &audio, float dt )
{
    m_scheduler.setMood( audio.arousal, audio.valence, audio.ambientFactor ); // as beginFrame()
    updateTimingScale( audio );
    m_simDropPulse = conditionAudio( audio, dt ).dropPulse;
    const SceneScheduler::Tick tick = buildSchedulerTick( audio, dt );
    // The scene passes: a chain lab decides at its first frame on screen whether this activation walks -- the scene
    // on screen, and during a fade the incoming one.
    m_effectTextures[m_scheduler.actTexture()]->simulateWalk();
    m_simSeen[m_scheduler.actTexture()] = 1;
    if ( m_scheduler.texState() != 0 )
    {
        m_effectTextures[m_scheduler.nextTexture()]->simulateWalk();
        m_simSeen[m_scheduler.nextTexture()] = 1;
    }
    m_globaltime += dt;
    m_scheduler.tickFx( tick, false );
    return tick;
}

void RenderPipeline::showState( QByteArray &scene, bool &fading, QByteArray &transition, float &fadeSecs,
                                float &blackout, float rgb[3] )
{
    auto stem = []( const char *p ) -> QByteArray
    {
        QByteArray s( p ? p : "" );
        s = s.mid( std::max( s.lastIndexOf( '\\' ), s.lastIndexOf( '/' ) ) + 1 );
        return s.endsWith( ".frag" ) ? s.left( s.size() - 5 ) : s;
    };
    scene = m_effectTextures.empty() ? QByteArray()
                                     : stem( m_effectTextures[m_scheduler.actTexture()]->fragmentName() );
    fading = m_scheduler.texState() != 0;
    transition = ( fading && m_scheduler.actTransition() < m_effectTransitions.size() )
                     ? stem( m_effectTransitions[m_scheduler.actTransition()]->fragmentName() )
                     : QByteArray();
    fadeSecs = m_scheduler.texFadeDur();
    blackout = m_present.blackLevel();
    m_present.setMeanColourWanted( true );
    m_present.meanColour( rgb );
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
        // The learned taste and this track's cues, when there are any (16.10.2026: they were nowhere to be seen).
        const float taste = tasteFor( m_effectTextures[m_scheduler.actTexture()]->fragmentName() );
        if ( std::fabs( taste - 1.f ) > 0.01f )
            out += "   " + QString::fromUtf8( Strings::uiText( S_INFO_TASTE_FMT ) ).arg( taste, 0, 'f', 2 );
        if ( songCueCount() > 0 )
            out += "   " + QString::fromUtf8( Strings::uiText( S_INFO_CUES_FMT ) ).arg( songCueCount() );
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

/**  Ends a photo loader thread before it is deleted.
 *
 * @param loader  The running loader. (in,out)
 *
 * Windows, as always: terminate(), which has ended the thread when it returns -- safe in practice because run()
 * never holds a mutex; the worst case is an image decode aborted partway.  Linux: terminate() is a pthread_cancel
 * there, which only asks; the thread ended at its next cancellation point, wherever that was (inside a decoder's
 * read() as well), and deleting a QThread still running aborts the process ("QThread: Destroyed while thread is still
 * running") -- the first Linux export in the CI ended that way, with exit code 134.  So Linux asks instead
 * (requestInterruption(), which run() checks between photos and between candidates) and waits for the end.
 **/
static void endImageLoader( ImageLoader *loader )
{
#ifdef _WIN32
    loader->terminate();
#else
    loader->requestInterruption();
#endif
    loader->wait();
}

void RenderPipeline::stop()
{
    // NOTE: the global Spout facades are deliberately NOT released here —
    // stop() runs on every preset switch, which made the Spout sender vanish
    // from OBS/Resolume at each switch (and deleted the receiver texture
    // without a current GL context).  GLwidget's destructor releases them
    // once at shutdown.

    endImageLoader( m_imageLoader );

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
        endImageLoader( m_imageLoader );
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
    glDeleteTextures( 2, m_photoBTex );
    glDeleteFramebuffers( 2, m_photoBFbo );
    m_photoBTex[0] = m_photoBTex[1] = m_photoBFbo[0] = m_photoBFbo[1] = 0;
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
    frameSize( width, height, m_width, m_height );
    m_sizedStereo = stereoFull( M_StereoMode ) ? M_StereoMode : 0;

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
    // 16-bit intermediates only where the driver renders into them (probed once): else 8 bit, as before 27.11.2026.
    if ( m_texInternalFormat == GL_RGBA16F && !hdrTargetsComplete() )
    {
        m_texInternalFormat = GL_RGBA8;
        m_texType = GL_UNSIGNED_BYTE;
    }
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


void RenderPipeline::frameSize( int displayW, int displayH, unsigned int &w, unsigned int &h )
{
    // A full stereo format shows the frame twice -- beside or above each other -- so the frame is one eye's share of
    // the display.  The half formats squeeze both eyes into the display; their frame is the display, as without
    // stereo.
    const int eye_w = ( M_StereoMode == 4 ) ? displayW / 2 : displayW;
    const int eye_h = ( M_StereoMode == 5 ) ? displayH / 2 : displayH;
    w = static_cast<unsigned int>( std::max( 16, static_cast<int>( eye_w * M_RenderScale + 0.5f ) ) );
    h = static_cast<unsigned int>( std::max( 16, static_cast<int>( eye_h * M_RenderScale + 0.5f ) ) );
}

void RenderPipeline::ensureStereoTarget( StereoTarget &t, int w, int h )
{
    if ( t.fbo && t.w == w && t.h == h )
        return;
    if ( !t.fbo )
    {
        glGenFramebuffers( 1, &t.fbo );
        glGenTextures( 1, &t.color );
        glGenTextures( 1, &t.depth );
    }
    glBindTexture( GL_TEXTURE_2D, t.color );
    // Mipmapped: the present pass reads coarse mips of its source (bloom, the pseudo-depth, the exposure).
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexImage2D( GL_TEXTURE_2D, 0, m_texInternalFormat, w, h, 0, m_texFormat, m_texType, NULL );
    glGenerateMipmap( GL_TEXTURE_2D );
    glBindTexture( GL_TEXTURE_2D, t.depth );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
    glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
    glTexImage2D( GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, w, h, 0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL );
    glBindTexture( GL_TEXTURE_2D, 0 );
    glBindFramebuffer( GL_FRAMEBUFFER, t.fbo );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, t.color, 0 );
    glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, t.depth, 0 );
    if ( glCheckFramebufferStatus( GL_FRAMEBUFFER ) != GL_FRAMEBUFFER_COMPLETE )
        fprintf( stderr, "STEREO: the %dx%d eye-packed target is incomplete\n", w, h );
    else
        fprintf( stderr, "STEREO: eye-packed target %dx%d (each eye %dx%d)\n", w, h, m_width, m_height );
    glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
    t.w = w;
    t.h = h;
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

    // width/height = display resolution; render at M_RenderScale × that (× one eye's share in a full stereo format).
    m_displayW = width;
    m_displayH = height;
    frameSize( width, height, m_width, m_height );
    m_sizedStereo = stereoFull( M_StereoMode ) ? M_StereoMode : 0;

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

    // The PresentPass resizes the final (present) and bloom textures.
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
    // Final FBO, present program and bloom: all in the PresentPass.
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
        m_trailStepsUni = glGetUniformLocation( m_trailProgId, "decaySteps" );
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
        m_stereoMixMonoAUni = glGetUniformLocation( m_stereoMixProgId, "monoA" );
        m_stereoMixMonoBUni = glGetUniformLocation( m_stereoMixProgId, "monoB" );
        m_stereoMixLayoutUni = glGetUniformLocation( m_stereoMixProgId, "eyeLayout" );
        m_stereoMixDepthUni = glGetUniformLocation( m_stereoMixProgId, "stereoDepth" );
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
    // 2x the resolution of the original 1024x256 (same 4:1 aspect, all
    // dimensions/font sizes scaled along): several fly-in styles enlarge the
    // texture up to ~3.5x during the reveal (e.g. "zoom-through"), and the
    // common ending of all styles ("grows gently towards the viewer")
    // enlarges by up to 1.55x on top - at the old resolution the texel grid
    // became visible (pixelated text, more or less depending on the style,
    // but ALWAYS at the end of every reveal because of the common ending).
    // Costs nothing at run time: rendered only once per track change.
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
// A track change asks for the same cut but is no verdict on the scene: it used
// to teach a malus to whatever had come on screen in the ten seconds before.
int RenderPipeline::requestSceneChange( bool userSkip )
{
    // Tell the user WHY nothing will happen instead of silently ignoring
    // the key (a pinned/frozen show swallowing 'n' looks like a bug) -- the
    // caller says it on screen.
    if ( M_Pinned )
    {
        fprintf( stderr, "n: ignored - PIN is active (press 'u' to unpin)\n" );
        return 1;
    }
    if ( M_Freeze )
    {
        fprintf( stderr, "n: ignored - FREEZE is active (press 'e' to unfreeze)\n" );
        return 2;
    }
    if ( userSkip && m_scheduler.actTexture() < m_effectTextures.size() && m_scheduler.actElapsedSec() < 10.f )
        bumpTaste( m_effectTextures[m_scheduler.actTexture()]->fragmentName(), 0.8f );
    // a chain lab skipped: the classes on screen a little less (a quick skip more)
    if ( userSkip && m_scheduler.actTexture() < m_effectTextures.size() )
        bumpClassTaste( m_effectTextures[m_scheduler.actTexture()],
                        m_scheduler.actElapsedSec() < 10.f ? 0.92f : 0.96f );
    EffectShader::noCarryOver(); // skipped: the next lab must not take this chain over
    m_scheduler.requestChange( true );
    return 0;
}

QString RenderPipeline::activeSceneTaste( float &taste ) const
{
    taste = 1.f;
    if ( m_effectTextures.empty() )
        return QString();
    const char *frag = m_effectTextures[m_scheduler.actTexture()]->fragmentName();
    taste = tasteFor( frag );
    QString s = QString::fromLatin1( frag );
    s = s.mid( std::max( s.lastIndexOf( '\\' ), s.lastIndexOf( '/' ) ) + 1 );
    return s.endsWith( ".frag" ) ? s.left( s.size() - 5 ) : s;
}

void RenderPipeline::newSong()
{
    m_scheduler.newSong();
    for ( EffectShader *e : m_effectTextures )
        if ( e )
            e->forgetSections();
    if ( !M_Freeze )
        m_scheduler.requestNaturalChange();
}

void RenderPipeline::awaitIncomingMesh( int maxMs )
{
    if ( m_scheduler.texState() == 0 || m_scheduler.nextTexture() >= m_effectTextures.size() )
        return;
    EffectShader *nx = m_effectTextures[m_scheduler.nextTexture()];
    if ( !nx->meshWarmupPending() )
        return;
    QElapsedTimer waited;
    waited.start();
    while ( nx->meshWarmupPending() && waited.elapsed() < maxMs )
    {
        nx->requestMeshWarmup(); // repeated: to the front of the worker's queue
        QThread::msleep( 2 );
    }
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

    QSettings  s( SettingsFile::path(), QSettings::IniFormat );
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
    const QString cfg_dir = Platform::presetsDir( SettingsFile::rootDir() );
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

    // Beside the other presets -- or, where the program's folder is not the user's (an AppImage), in the user's
    // presets folder, which the preset list reads too (GLwidget).
    QString out_dir = cfg_dir;
    if ( SettingsFile::userFolders() )
    {
        out_dir = SettingsFile::userDir( SettingsFile::UserDir::Data ) + "/Presets";
        QDir().mkpath( out_dir );
    }
    const QString path = out_dir + "/Marked.xml";
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
    QFile f( QFileInfo( SettingsFile::path() ).absolutePath() + "/liked_rolls.tsv" );
    if ( f.open( QIODevice::Append | QIODevice::Text ) )
    {
        QTextStream ts( &f );
        ts << line << "\n";
    }
}

void RenderPipeline::favoriteCurrentEffect()
{
    if ( m_scheduler.actTexture() < m_effectTextures.size() )
        favoriteScene( static_cast<int>( m_scheduler.actTexture() ) );
}

void RenderPipeline::favoriteScene( int idx )
{
    if ( idx < 0 || idx >= static_cast<int>( m_effectTextures.size() ) )
        return;
    EffectShader *e = m_effectTextures[static_cast<size_t>( idx )];
    bumpTaste( e->fragmentName(), 1.25f );
    bumpClassTaste( e, 1.1f );
    logLikedRoll( e );
}

/**  Reduces a track key ("artist|title") to a QSettings-safe key for the [cues] group.
 *
 * @param trackKey  The identified track as "artist|title" (see GLwidget::cueTrackKey()). (in)
 *
 * @return
 *   Lower-cased key with every non-alphanumeric character replaced by '_', truncated to 96 characters.
 *
 * Settings keys must not carry arbitrary characters: "artist|title" is
 * reduced to [a-z0-9_].  Collisions of two titles are thus possible, but a
 * cue on the wrong song is a wrong picture, not a crash.
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

bool RenderPipeline::isBanned( const char *fragPath ) const
{
    return !M_Banned.isEmpty() && M_Banned.contains( m_presetName + "/" + tasteBase( fragPath ) );
}

bool RenderPipeline::banCurrentScene( QString &scene )
{
    if ( m_effectTextures.empty() || !banScene( static_cast<int>( m_scheduler.actTexture() ), scene ) )
        return false;
    requestSceneChange( false ); // away with it now, without the skip's taste malus
    return true;
}

bool RenderPipeline::banScene( int idx, QString &scene )
{
    if ( idx < 0 || idx >= static_cast<int>( m_effectTextures.size() ) )
        return false;
    const QString base = tasteBase( m_effectTextures[static_cast<size_t>( idx )]->fragmentName() );
    scene = base.endsWith( ".frag" ) ? base.left( base.size() - 5 ) : base;
    // Enough has to be left, or the no-repeat memory and the mood filter run dry.
    QSet<QString> all, open;
    for ( EffectShader *e : m_effectTextures )
    {
        const QString b = tasteBase( e->fragmentName() );
        all.insert( b );
        if ( b != base && !M_Banned.contains( m_presetName + "/" + b ) )
            open.insert( b );
    }
    if ( open.size() < std::max( 12, static_cast<int>( all.size() ) / 20 ) )
        return false;
    M_Banned.insert( m_presetName + "/" + base );
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    s.setValue( "banned/" + m_presetName + "/" + base, true );
    fprintf( stderr, "BANNED: %s/%s\n", qPrintable( m_presetName ), qPrintable( base ) );
    return true;
}

void RenderPipeline::unbanScene( const QString &base )
{
    M_Banned.remove( m_presetName + "/" + base );
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    s.remove( "banned/" + m_presetName + "/" + base );
    fprintf( stderr, "UNBANNED: %s/%s\n", qPrintable( m_presetName ), qPrintable( base ) );
}

QStringList RenderPipeline::bannedScenes() const
{
    QStringList   out;
    const QString prefix = m_presetName + "/";
    for ( const QString &k : M_Banned )
        if ( k.startsWith( prefix ) )
            out << k.mid( prefix.size() );
    out.sort();
    return out;
}

QString RenderPipeline::resetTasteCurrent()
{
    if ( m_effectTextures.empty() )
        return QString();
    const QString base = tasteBase( m_effectTextures[m_scheduler.actTexture()]->fragmentName() );
    M_Taste.remove( m_presetName + "/" + base );
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    s.remove( "taste/" + m_presetName + "/" + base );
    return base.endsWith( ".frag" ) ? base.left( base.size() - 5 ) : base;
}

int RenderPipeline::forgetSongCues()
{
    if ( m_cueTrack.isEmpty() )
        return 0;
    const int n = M_Cues.value( m_cueTrack ).size();
    M_Cues.remove( m_cueTrack );
    m_cuesFired.clear();
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    s.remove( "cues/" + m_cueTrack );
    fprintf( stderr, "CUES forgotten: %s (%d)\n", qPrintable( m_cueTrack ), n );
    return n;
}

int RenderPipeline::songCueCount() const
{
    return m_cueTrack.isEmpty() ? 0 : M_Cues.value( m_cueTrack ).size();
}

QString RenderPipeline::sceneBase( int idx ) const
{
    if ( idx < 0 || idx >= static_cast<int>( m_effectTextures.size() ) )
        return QString();
    return tasteBase( m_effectTextures[static_cast<size_t>( idx )]->fragmentName() );
}

float RenderPipeline::sceneTaste( int idx, bool &banned ) const
{
    banned = false;
    if ( idx < 0 || idx >= static_cast<int>( m_effectTextures.size() ) )
        return 1.f;
    banned = isBanned( m_effectTextures[static_cast<size_t>( idx )]->fragmentName() );
    return tasteFor( m_effectTextures[static_cast<size_t>( idx )]->fragmentName() );
}

// ---------------------------------------------------------------------------
// The rating walk (web remote, "Rate"; 20.11.2026).  2,475 scenes, and nobody
// judges them in passing: the favourite, the skip and the ban all act on
// whatever happens to be on screen.  The walk puts the preset's scenes without
// a verdict on screen one after the other, for a span the viewer sets, and
// takes a verdict on each from three buttons on the phone.  What a verdict
// does is what the keys do today (a favourite, a ban), and it is written down
// as a verdict too ([rated]), so the next walk skips it and
// Tools/apply_taste.py can fold it into the presets.
// ---------------------------------------------------------------------------

/**  A file name without its ".frag".
 *
 * @param base  The file name. (in)
 *
 * @return
 *   The name the remote shows.
 **/
static QString sceneShown( const QString &base )
{
    return base.endsWith( ".frag" ) ? base.left( base.size() - 5 ) : base;
}

int RenderPipeline::rateTargetIndex() const
{
    if ( m_effectTextures.empty() )
        return -1;
    if ( m_rating && m_rateForced >= 0 && m_rateForced < static_cast<int>( m_effectTextures.size() ) )
        return m_rateForced;
    const unsigned int i = m_scheduler.texState() != 0 ? m_scheduler.nextTexture() : m_scheduler.actTexture();
    return i < m_effectTextures.size() ? static_cast<int>( i ) : -1;
}

int RenderPipeline::rateNextPick( unsigned int act )
{
    const QString act_base = act < m_effectTextures.size() ? tasteBase( m_effectTextures[act]->fragmentName() )
                                                           : QString();
    for ( int pass = 0; pass < 2; ++pass )
    {
        // Open files and their entries (the models of a family share one file, and one verdict).
        QStringList                files;
        QHash<QString, QList<int>> entries;
        for ( size_t i = 0; i < m_effectTextures.size(); ++i )
        {
            const QString b = tasteBase( m_effectTextures[i]->fragmentName() );
            const QString full = m_presetName + "/" + b;
            if ( b == act_base || M_Rated.contains( full ) || M_Banned.contains( full )
                 || ( pass == 0 && m_rateShown.contains( b ) ) )
                continue;
            if ( !entries.contains( b ) )
                files << b;
            entries[b] << static_cast<int>( i );
        }
        if ( !files.isEmpty() )
        {
            const QString    &b = files[rand() % files.size()];
            const QList<int> &e = entries[b];
            m_rateShown.insert( b );
            return e[rand() % e.size()];
        }
        // Every open file was shown in this pass: the ones left without a verdict come round again.
        m_rateShown.clear();
    }
    // The scene on screen may be the last one open: it keeps the walk going until it has its verdict (the normal
    // roll fills in after it).  Otherwise nothing is left; trackRating() ends the walk (not from in here).
    const QString act_full = m_presetName + "/" + act_base;
    if ( act_base.isEmpty() || M_Rated.contains( act_full ) || M_Banned.contains( act_full ) )
        m_rateFinished = true;
    return -1;
}

void RenderPipeline::trackRating()
{
    if ( !m_rating )
        return;
    if ( m_rateFinished )
    {
        m_rateFinished = false;
        m_rateDone = true;
        stopRating();
        fprintf( stderr, "RATING: every scene of %s has a verdict\n", qPrintable( m_presetName ) );
        return;
    }
    // The scene the walk cut to is the one being judged as soon as it comes in.
    if ( m_rateForced >= 0 )
    {
        const unsigned int in = m_scheduler.texState() != 0 ? m_scheduler.nextTexture() : m_scheduler.actTexture();
        if ( static_cast<int>( in ) == m_rateForced )
        {
            m_rateForced = -1;
            if ( m_rateOnArrival )
            {
                m_rateOnArrival = false;
                EffectShader::noCarryOver();
                m_scheduler.requestChange( false );
            }
        }
    }
    const int     t = rateTargetIndex();
    const QString key = t >= 0 ? tasteBase( m_effectTextures[static_cast<size_t>( t )]->fragmentName() ) : QString();
    if ( key != m_rateTargetKey )
    {
        m_ratePrevKey = m_rateTargetKey;
        m_ratePrevAt = m_rateClock.elapsed();
        m_rateTargetKey = key;
        m_rateJudgedKey.clear();
    }
}

bool RenderPipeline::startRating( float secs )
{
    m_rateSecs = std::clamp( secs, 3.f, 120.f );
    m_rateDone = false;
    m_rateFinished = false;
    m_rateShown.clear();
    m_rateUndo = RateUndo();
    m_rateLast.clear();
    const int first = rateNextPick( m_scheduler.actTexture() );
    if ( m_rateFinished )
    {
        m_rateFinished = false;
        m_rateDone = true;
        return false;
    }
    // Either would hold the walk on one scene.
    M_Pinned = false;
    M_Freeze = false;
    m_rating = true;
    m_rateClock.start();
    m_rateTargetKey.clear();
    m_ratePrevKey.clear();
    m_rateJudgedKey.clear();
    m_scheduler.setRateWalk( m_rateSecs, [this]( unsigned int act )
    { return rateNextPick( act ); } );
    m_rateForced = first; // -1: the scene on screen is the last one open
    m_rateOnArrival = false;
    if ( first >= 0 )
    {
        EffectShader::noCarryOver();
        m_scheduler.forceScene( first );
    }
    fprintf( stderr, "RATING: started in %s, %.0f s per scene\n", qPrintable( m_presetName ), m_rateSecs );
    return true;
}

void RenderPipeline::stopRating()
{
    if ( !m_rating )
        return;
    m_rating = false;
    m_scheduler.setRateWalk( 0.f, nullptr );
    fprintf( stderr, "RATING: stopped\n" );
}

void RenderPipeline::setRatingSecs( float secs )
{
    m_rateSecs = std::clamp( secs, 3.f, 120.f );
    m_scheduler.setRateSecs( m_rateSecs );
}

void RenderPipeline::applyVerdict( int idx, const QString &verdict )
{
    EffectShader *e = m_effectTextures[static_cast<size_t>( idx )];
    const QString base = tasteBase( e->fragmentName() );
    const QString full = m_presetName + "/" + base;
    RateUndo      u;
    u.valid = true;
    u.idx = idx;
    u.full = full;
    u.verdict = verdict;
    u.before = M_Rated.value( full );
    u.hadTaste = M_Taste.contains( full );
    u.taste = M_Taste.value( full, 1.f );
    QString note;
    if ( verdict == "like" )
        favoriteScene( idx );
    else if ( verdict == "never" )
    {
        QString shown;
        u.banned = !M_Banned.contains( full ) && banScene( idx, shown );
        if ( !M_Banned.contains( full ) )
            note = " (not banned: too few scenes would be left)";
    }
    M_Rated[full] = verdict;
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    s.setValue( "rated/" + full, verdict );
    s.sync();
    m_rateUndo = u;
    m_rateLast = sceneShown( base ) + " " + verdict;
    fprintf( stderr, "RATED: %s %s%s\n", qPrintable( full ), qPrintable( verdict ), qPrintable( note ) );
}

int RenderPipeline::rateScene( const QString &verdict, const QString &key, QString *scene )
{
    if ( verdict != "like" && verdict != "next" && verdict != "never" )
        return -2;
    const int target = rateTargetIndex();
    if ( !m_rating || target < 0 )
        return -1;
    const QString target_key = tasteBase( m_effectTextures[static_cast<size_t>( target )]->fragmentName() );
    if ( !key.isEmpty() && key != target_key )
    {
        // The walk moved on by itself while the verdict was on its way: it is still meant for the scene that left.
        const int prev = sceneIndexByBase( key );
        if ( key == m_ratePrevKey && prev >= 0 && m_rateClock.elapsed() - m_ratePrevAt < 4000
             && !M_Rated.contains( m_presetName + "/" + key ) )
        {
            applyVerdict( prev, verdict );
            if ( scene )
                *scene = sceneShown( key );
            return 1;
        }
        fprintf( stderr, "RATED: refused %s for %s (being judged: %s, left before it: %s %.1f s ago)\n",
                 qPrintable( verdict ), qPrintable( key ), qPrintable( target_key ), qPrintable( m_ratePrevKey ),
                 ( m_rateClock.elapsed() - m_ratePrevAt ) / 1000.0 );
        return -1;
    }
    // Judged a moment ago and still waiting for its cut (the scene's minimum stay): a second tap, not a verdict.
    if ( target_key == m_rateJudgedKey )
    {
        fprintf( stderr, "RATED: refused %s for %s (judged a moment ago)\n", qPrintable( verdict ),
                 qPrintable( target_key ) );
        return -1;
    }
    applyVerdict( target, verdict );
    m_rateJudgedKey = target_key;
    if ( scene )
        *scene = sceneShown( target_key );
    // On to the next one: the walk picked it when this one came (a cut of the remote's kind, no taste malus).  A
    // scene judged before it even came in moves on once it is in.
    if ( m_rateForced >= 0 && target == m_rateForced )
        m_rateOnArrival = true;
    else
    {
        EffectShader::noCarryOver();
        m_scheduler.requestChange( false );
    }
    return 0;
}

bool RenderPipeline::undoRating( QString *scene )
{
    if ( !m_rateUndo.valid || m_rateUndo.idx < 0 || m_rateUndo.idx >= static_cast<int>( m_effectTextures.size() ) )
        return false;
    const RateUndo u = m_rateUndo;
    m_rateUndo = RateUndo();
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    if ( u.before.isEmpty() )
    {
        M_Rated.remove( u.full );
        s.remove( "rated/" + u.full );
    }
    else
    {
        M_Rated[u.full] = u.before;
        s.setValue( "rated/" + u.full, u.before );
    }
    if ( u.verdict == "like" )
    {
        if ( u.hadTaste )
        {
            M_Taste[u.full] = u.taste;
            s.setValue( "taste/" + u.full, u.taste );
        }
        else
        {
            M_Taste.remove( u.full );
            s.remove( "taste/" + u.full );
        }
        bumpClassTaste( m_effectTextures[static_cast<size_t>( u.idx )], 1.f / 1.1f );
    }
    s.sync();
    const QString base = u.full.mid( m_presetName.size() + 1 );
    if ( u.banned )
        unbanScene( base );
    m_rateLast.clear();
    m_rateJudgedKey.clear();
    if ( scene )
        *scene = sceneShown( base );
    fprintf( stderr, "RATED: %s taken back (%s)\n", qPrintable( u.full ), qPrintable( u.verdict ) );
    // Back on screen, to be judged again.
    if ( m_rating )
    {
        m_rateShown.remove( base );
        EffectShader::noCarryOver();
        m_scheduler.forceScene( u.idx );
        m_rateForced = u.idx;
        m_rateOnArrival = false;
    }
    return true;
}

RenderPipeline::RatingState RenderPipeline::ratingState() const
{
    RatingState r;
    r.active = m_rating;
    r.done = m_rateDone;
    r.secs = m_rateSecs;
    r.left = m_rating ? m_scheduler.rateSecsLeft() : 0.f;
    r.last = m_rateLast;
    QSet<QString> files;
    for ( EffectShader *e : m_effectTextures )
    {
        const QString b = tasteBase( e->fragmentName() );
        if ( files.contains( b ) )
            continue;
        files.insert( b );
        const QString full = m_presetName + "/" + b;
        const QString v = M_Rated.value( full );
        if ( !v.isEmpty() || M_Banned.contains( full ) )
            ++r.rated;
        r.likes += ( v == "like" ) ? 1 : 0;
        r.nexts += ( v == "next" ) ? 1 : 0;
        r.nevers += ( v == "never" ) ? 1 : 0;
    }
    r.total = files.size();
    const int t = rateTargetIndex();
    if ( m_rating && t >= 0 )
    {
        r.key = tasteBase( m_effectTextures[static_cast<size_t>( t )]->fragmentName() );
        r.scene = sceneShown( r.key );
    }
    return r;
}

void RenderPipeline::rememberCue( const QString &trackKey, double posSec )
{
    if ( trackKey.isEmpty() || posSec < 0.0 || m_scheduler.actTexture() >= m_effectTextures.size() )
        return;
    const QString key = cueKey( trackKey );
    const QString base = tasteBase( m_effectTextures[m_scheduler.actTexture()]->fragmentName() );
    M_Cues[key].append( qMakePair( posSec, base ) );
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
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
    // Plan 27.11.2026 P1: the photo choice by depth.  The scene that will show the next photo -- the active one, or
    // the incoming one while a fade runs -- wants a photo with relief if it writes the photo's depth (// @depth), a
    // flat texture otherwise (the folding material).  KALEIDO_PHOTO_BY_DEPTH=0 switches the wish off.
    {
        static const bool ByDepth = !qEnvironmentVariableIsSet( "KALEIDO_PHOTO_BY_DEPTH" )
                                    || qEnvironmentVariableIntValue( "KALEIDO_PHOTO_BY_DEPTH" ) != 0;
        int               wish = -1;
        if ( ByDepth && m_liveTex == 0 && !m_effectTextures.empty() )
        {
            const unsigned int i = m_scheduler.texState() != 0 ? m_scheduler.nextTexture() : m_scheduler.actTexture();
            if ( i < m_effectTextures.size() )
                wish = m_effectTextures[i]->writesDepth() ? 1 : 0;
        }
        m_photoWantDepth = wish;
        // KALEIDO_PHOTO_STATS=1: how often a depth scene shows a photo with a map, and another scene a flat photo
        // (frames of the active scene; a line every 1800 frames and the totals so far).
        static const bool Stats = qEnvironmentVariableIntValue( "KALEIDO_PHOTO_STATS" ) != 0;
        if ( Stats && m_liveTex == 0 && m_scheduler.actTexture() < m_effectTextures.size() )
        {
            const bool depth_scene = m_effectTextures[m_scheduler.actTexture()]->writesDepth();
            const bool map = EffectShader::M_PhotoDepthAmt[0] > 0.5f;
            ++m_photoStat[depth_scene ? 0 : 2];
            if ( depth_scene ? map : !map )
                ++m_photoStat[depth_scene ? 1 : 3];
            if ( ( m_photoStat[0] + m_photoStat[2] ) % 1800 == 0 )
                fprintf( stderr,
                         "[photo-stats] depth scenes %lld frames, with a map %lld (%.1f %%); other scenes %lld "
                         "frames, with a flat photo %lld (%.1f %%)\n",
                         m_photoStat[0], m_photoStat[1], m_photoStat[0] ? 100.0 * m_photoStat[1] / m_photoStat[0] : 0.0,
                         m_photoStat[2], m_photoStat[3],
                         m_photoStat[2] ? 100.0 * m_photoStat[3] / m_photoStat[2] : 0.0 );
        }
    }

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
        //
        // Ahead of time only as many plain 2D scenes as the program budget
        // holds (trimProgramResidency()).  The warm-up used to build every
        // scene of the preset and keep it: 2,471 in Allround, about 2.5 MB of
        // driver memory each, and an hour of growth before it was through
        // (Tools/soak.py, F1 of docs/PLAN_2026-11-20.md).  It now goes round
        // the preset from where it stopped, one scene per eviction, so the set
        // that is ready for a cut (the drop takes only those) keeps changing.
        const bool     roomAhead = m_progResident < programBudget();
        const unsigned nextTex = m_scheduler.nextTexture();
        auto           ahead = [&]( size_t i )
        { return roomAhead || i == nextTex || !programBudgeted( m_effectTextures[i] ); };
        auto background = [&]( EffectShader *s ) -> bool
        {
            return s->plainFragment() && s->fragmentFile() && !strstr( s->fragmentFile(), "Scene3D" )
                   && shaderPrebuildAvailable();
        };
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
            if ( nextTex < m_effectTextures.size() && want( m_effectTextures[nextTex] ) )
                ++started;
            if ( m_scheduler.nextFx() < m_effectFx.size() && want( m_effectFx[m_scheduler.nextFx()] ) )
                ++started;
            const size_t n = m_effectTextures.size();
            for ( size_t k = 0; k < n && started < 2; ++k )
            {
                const size_t i = ( m_warmCursor + k ) % n;
                if ( ahead( i ) && want( m_effectTextures[i] ) )
                {
                    ++started;
                    if ( programBudgeted( m_effectTextures[i] ) )
                        m_warmCursor = ( i + 1 ) % n;
                }
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
            for ( size_t i = 0; i < m_effectTextures.size(); ++i )
            {
                EffectShader *s = m_effectTextures[i];
                if ( !s->isCompiled() && background( s ) && ahead( i ) && shaderPrebuildReady( s->fragmentFile() ) )
                {
                    s->ensureCompiled(); // cache hit: instant
                    M_WarmLabel = QStringLiteral( "glsl " ) + QString::fromLocal8Bit( s->fragmentName() );
                    warmed = true;
                    break;
                }
            }
        if ( !warmed )
            for ( size_t i = 0; i < m_effectTextures.size(); ++i )
            {
                EffectShader *s = m_effectTextures[i];
                if ( !s->isCompiled() && !background( s ) && ahead( i ) )
                {
                    s->ensureCompiled(); // GLSL only; a mesh build defers itself
                    M_WarmLabel = QStringLiteral( "glsl " ) + QString::fromLocal8Bit( s->fragmentName() );
                    warmed = true;
                    break;
                }
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
    trimProgramResidency();
}

// ---------------------------------------------------------------------------
// Program residency budget (20.11.2026, F1 of docs/PLAN_2026-11-20.md).
//
// A scene kept its program from its first compile until the preset was unloaded, and the warm-up compiled every
// scene of the preset ahead of time.  Measured with Tools/soak.py (the app live, a scene every 6 s): walking
// Allround the process grew by 6 GB of private memory and 3.3 GB of GPU memory in the first hour, still 1.48 and
// 1.41 GB an hour after minute 10, while 25 scenes shown over and over for half an hour did not grow at all -- what
// a scene once had, it kept: its program (and the background builds were never let go, see progStore()), and a 3D
// scene its geometry (trimMeshResidency()).  On a card with 8 GB a day of Allround would not fit.  With both budgets
// an hour of Allround in a shuffled order stays at 3.3..4.1 GB private and 2.2..2.9 GB GPU once the mesh working set
// is full (616 changes, no GL error).  Now the plain 2D scenes keep a working set: the scene on screen, the one fading
// in, and the most recently used or compiled ahead beyond them; the rest go back to their state before the first use
// (cleanShaderPrograms(), the hot reload's path) and compile again when they are next due -- in the background, as on
// their first appearance.  An eviction trims one below the budget, so the warm-up builds one more scene from where it
// stopped (beginFrame()).  Not for 3D scenes (their own programs and buffers; the mesh budget above covers the big
// part) and not for the walking labs (their programs take seconds to build).
//
// KALEIDO_PROGRAM_BUDGET overrides the count (minimum 16).
// ---------------------------------------------------------------------------
int RenderPipeline::programBudget()
{
    static const int Budget = []
    {
        const int v = qEnvironmentVariableIntValue( "KALEIDO_PROGRAM_BUDGET" );
        return v > 0 ? std::max( 16, v ) : 160;
    }();
    return Budget;
}

bool RenderPipeline::programBudgeted( EffectShader *s )
{
    return s->plainFragment() && s->fragmentFile() && !strstr( s->fragmentFile(), "Scene3D" ) && !s->isWalkingLab();
}

void RenderPipeline::trimProgramResidency()
{
    const int Budget = programBudget();

    ++m_progUseClock;
    const unsigned act = m_scheduler.actTexture();
    const unsigned nxt = m_scheduler.nextTexture();
    if ( static_cast<size_t>( act ) < m_effectTextures.size() )
        m_progLastUse[m_effectTextures[act]] = m_progUseClock;
    if ( static_cast<size_t>( nxt ) < m_effectTextures.size() )
        m_progLastUse[m_effectTextures[nxt]] = m_progUseClock;

    int resident = 0;
    for ( EffectShader *s : m_effectTextures )
        if ( s->isCompiled() && programBudgeted( s ) )
        {
            ++resident;
            if ( !m_progLastUse.contains( s ) )
                m_progLastUse[s] = m_progUseClock; // compiled ahead (the warm-up): fresh, not the oldest
        }
    const int target = resident > Budget ? Budget - 1 : resident; // one below: room for the warm-up's next scene
    while ( resident > target )
    {
        EffectShader *victim = nullptr;
        qint64        oldest = std::numeric_limits<qint64>::max();
        for ( size_t i = 0; i < m_effectTextures.size(); ++i )
        {
            EffectShader *s = m_effectTextures[i];
            if ( !s->isCompiled() || !programBudgeted( s ) || i == static_cast<size_t>( act )
                 || i == static_cast<size_t>( nxt ) )
                continue;
            const qint64 used = m_progLastUse.value( s, 0 );
            if ( used < oldest )
            {
                oldest = used;
                victim = s;
            }
        }
        if ( !victim )
            break;
        victim->cleanShaderPrograms();
        m_progLastUse.remove( victim );
        --resident;
    }
    m_progResident = resident;
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

    // The procedural 3D scenes' geometry the same way, with a budget of its own (KALEIDO_GEOM_BUDGET, default 24):
    // a points cloud is 1.9 MB, an indirect scene's generator output 19.2 MB, all of them built at the warm-up and
    // committed by the driver at a scene's first draw (Scene3DShader::releaseGeometry(), F1 of 20.11.2026).
    static const int GeomBudget = []
    {
        const int v = qEnvironmentVariableIntValue( "KALEIDO_GEOM_BUDGET" );
        return v > 0 ? std::max( 4, v ) : 24;
    }();

    // Cheap common case: nothing to do until the working set is actually full.
    auto trim = [&]( bool ( EffectShader::*resident_of )() const, void ( EffectShader::*release )(), int budget )
    {
        int resident = 0;
        for ( EffectShader *s : m_effectTextures )
            if ( ( s->*resident_of )() )
                ++resident;
        while ( resident > budget )
        {
            EffectShader *victim = nullptr;
            qint64        oldest = std::numeric_limits<qint64>::max();
            for ( size_t i = 0; i < m_effectTextures.size(); ++i )
            {
                EffectShader *s = m_effectTextures[i];
                if ( !( s->*resident_of )() || i == static_cast<size_t>( act ) || i == static_cast<size_t>( nxt ) )
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
            ( victim->*release )();
            m_meshLastUse.remove( victim );
            --resident;
        }
    };
    trim( &EffectShader::meshResident, &EffectShader::releaseMesh, Budget );
    trim( &EffectShader::geometryResident, &EffectShader::releaseGeometry, GeomBudget );
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
    // A video export: every frame is exactly one frame period, whatever it cost to render.  The fps budget below
    // must not see it either -- it would read a 24 fps export as a struggling GPU and halve the cubes for good.
    if ( M_FrameStep > 0.f )
        return { M_FrameStep, M_FrameStep };

    float time_since_last_frame = m_nanotimer.elapsed();
    // if( time_since_last_frame > 20.0 )
    // printf( "%f\n", time_since_last_frame );
    m_nanotimer.start();

    float time_since_last_frame_sec = time_since_last_frame * 0.001;
    // Wall-clock frame time, immune to the freeze below (the blackout fade
    // must keep moving even over a frozen picture).
    const float dt_wall = time_since_last_frame_sec;

    Scene3DShader::M_CubeBudget = stepCubeBudget( Scene3DShader::M_CubeBudget, m_cubeClock, dt_wall, M_DisplayHz );

    return { time_since_last_frame_sec, dt_wall };
}

float RenderPipeline::stepCubeBudget( float budget, CubeBudgetClock &clock, float dtWall, float displayHz )
{
    // A hitch (a shader link, a minimised window) says nothing about the GPU's steady load.
    if ( dtWall <= 1e-4f || dtWall >= 0.5f )
        return budget;
    // What the panel can show, capped at 72 like the adaptive resolution (glwidget updateAdaptiveScale()): fixed
    // 45/57 fps, as before, kept a 50-Hz panel at half detail for good after one slow phase and halved a 30-Hz one
    // from the first frame.
    const float target = displayHz > 20.f ? std::min( displayHz, 72.f ) : 60.f;
    if ( clock.fpsEma <= 0.f )
        clock.fpsEma = target;
    clock.fpsEma += 0.05f * ( 1.f / dtWall - clock.fpsEma );
    if ( clock.fpsEma < 0.75f * target )
        clock.want = 0.5f;
    else if ( clock.fpsEma > 0.95f * target )
        clock.want = 1.f;
    // Half the range per second: the odd cubes shrink away (and grow back) over about a second instead of
    // vanishing in one frame.
    const float step = 0.5f * dtWall;
    return budget + std::clamp( clock.want - budget, -step, step );
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
        timeSinceLastFrameSec = dtWall > 0.f ? 1.f / 120.f : 0.f; // 0: waiting for programs (paint())
        if ( dtWall > 0.f && ++frames > 600 )
        {
            M_Freeze = true;
            m_globaltime = freezeTime();
            fprintf( stderr, "FREEZE engaged (comparison run, scene time %.2f)\n", freezeTime() );
        }
    }
    EffectShader::M_Frozen = M_Freeze || freezeTime() >= 0.f; // the walk and the 3D flight never move in a comparison
                                                              // run
    EffectShader::M_FreezeTime = freezeTime();
    // the fixed frames step the scenes' own fields too (stepState()): 1/120 s each, 0 while waiting for programs
    EffectShader::M_FixedDt = freezeTime() >= 0.f && !M_Freeze ? timeSinceLastFrameSec : -1.f;
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
    // Score cues (CueReceiver.h): drained here, once a frame, before the conditioner -- a cue file (-k) is a sender
    // too, and whatever of it the offline WAV has reached goes in first.  buildSchedulerTick() reads the same frame.
    // A cue arrives on the audio's own timing -- with a feature delay (latency below zero) it waits as long as the
    // analysis does, or the scheduler would cut on a drop the ear has not heard yet (FeatureDelay.h).
    ScoreCueFile::instance().setDelay( featureDelay() );
    ScoreCues::instance().setDelay( featureDelay() );
    ScoreCueFile::instance().feed();
    m_cueFrame = ScoreCues::instance().drain( timeSinceLastFrameSec );
    // THE DROP CHANNEL FOLLOWS THE CUES (22.10.2026).  A cue drop cut the scene but did not hit the picture: the
    // drop pulse (the shaders' audioDrop, the present pass, the echo and the streaks), the drop rewind and the
    // phrase grid's anchor came from the analyser alone -- which missed both drops of the Uplifting demo and took
    // the Goa demo's build-up after its break for one.  While cues are live the generator's drops are the drops; the
    // count goes on from wherever it was, so neither switch-over reads as a drop.
    AudioFeatures in = audio;
    if ( m_cueFrame.live )
    {
        if ( m_cueFrame.drop )
        {
            ++m_condDrops;
            m_cuePulse = 1.f;
        }
        m_condDropOffset = m_condDrops - audio.dropCount;
        in.dropPulse = m_cuePulse;
    }
    else
        m_condDrops = audio.dropCount + m_condDropOffset;
    in.dropCount = m_condDrops;
    m_cuePulse *= expf( -std::max( timeSinceLastFrameSec, 0.f ) / 0.66f );

    AudioConditioner::Context ac_ctx;
    ac_ctx.cueBar = m_cueFrame.live && m_cueFrame.downbeat;
    // The conditioner's day cycle is 280 s; a whole number of them keeps its phase while the float stays exact.
    ac_ctx.globalTime = static_cast<float>( std::fmod( m_globaltime, 280.0 * 1000.0 ) );
    ac_ctx.trailDepth3D = m_trailDepth3D;
    ac_ctx.meshUp = m_meshUp;
    ac_ctx.calm = M_CalmMotion;
    ac_ctx.reactivity = M_Reactivity;
    ac_ctx.latencyLead = std::max( M_LatencyLead, 0.f ); // below zero it is the analyzer's delay, not a lead
    ac_ctx.ssmHead = m_sims.ssmHeadNorm();
    ac_ctx.ssmFill = m_sims.ssmFillNorm();
    ac_ctx.spectroHead = m_sims.spectroHeadNorm();
    ac_ctx.spectroFill = m_sims.spectroFillNorm();
    AudioFeatures out = m_audioConditioner.update( in, timeSinceLastFrameSec, ac_ctx );
    // A NaN in an integrator stays there for good -- and so would a frozen or black picture. Start the conditioner
    // over instead, and say which value it was.
    if ( const char *bad = AudioConditioner::firstNonFinite( out ) )
    {
        fprintf( stderr, "AUDIO: conditioned %s is not finite - conditioner reset\n", bad );
        m_audioConditioner.reset();
        out = m_audioConditioner.update( in, timeSinceLastFrameSec, ac_ctx );
    }
    return out;
}

void RenderPipeline::updateImageState( float timeSinceLastFrameSec )
{
    // The second photo glides to its newest slot over five seconds of the frame clock (an export fades the same).
    if ( m_photoBMix != m_photoBTarget )
    {
        const float step = timeSinceLastFrameSec / 5.f;
        m_photoBMix = m_photoBTarget > m_photoBMix ? std::min( m_photoBMix + step, m_photoBTarget )
                                                   : std::max( m_photoBMix - step, m_photoBTarget );
    }
    EffectShader::M_PhotoBMix = m_photoBMix;

    if ( m_waitForImageToLoad )
    {
        if ( !m_triggerImageload )
        {
            m_waitForImageToLoad = false;

            // NanoTimer timerLT;
            // timerLT.start();

            loadNewTexture( m_nextTex );
            {
                QMutexLocker lock( &m_photoMutex ); // the loader names the photo it loaded (the guard counts it)
                m_photoNextPath = m_lastPhoto;
            }

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
            m_photoActPath = m_photoNextPath;
            std::swap( m_actDepth, m_nextDepth );
            // the photo just faded out becomes the second photo -- copied before the loader overwrites its slot
            takePhotoB( m_nextTex );
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

    // What the shaders know about the two slots' depth (PhotoDepth.h): a live input stands in for both photos and
    // has no map.
    const PhotoDepth::Info  none;
    const PhotoDepth::Info &d0 = m_liveTex ? none : m_actDepth, &d1 = m_liveTex ? none : m_nextDepth;
    EffectShader::M_PhotoDepthAmt[0] = d0.map ? 1.f : 0.f;
    EffectShader::M_PhotoDepthAmt[1] = d1.map ? 1.f : 0.f;
    EffectShader::M_PhotoMask[0] = d0.mask;
    EffectShader::M_PhotoMask[1] = d1.mask;
    const float focus[4] = { d0.focusU, d0.focusV, d1.focusU, d1.focusV };
    const float subject[4] = { d0.thr, d0.conf, d1.thr, d1.conf };
    for ( int i = 0; i < 4; ++i )
    {
        EffectShader::M_PhotoFocus[i] = focus[i];
        EffectShader::M_PhotoSubject[i] = subject[i];
    }
}

// ---------------------------------------------------------------------------
// The picture guard (26.11.2026, docs/PLAN_2026-11-26.md W1; PictureGuard.h).
//
// The present pass reads the frame's tiny mip back every 6th frame without a stall; each new sample goes to the
// guard together with whether it may count now.  It may count only while the show is meant to be seen and the
// music plays: a scene stands alone (no fade, 3 s settled), the photo stands too (no photo fade or load), music is
// detected and audible, no blackout, rest, sleep dimming, DJ stop, freeze or pin, the song is not fading out, no
// live picture replaces the photos, and no bench (review walk, rating walk).  Off in scripted runs -- the snapshots,
// sweeps and exports stay as they were -- unless KALEIDO_GUARD asks for it.
// ---------------------------------------------------------------------------
int RenderPipeline::guardMode()
{
    static const QByteArray Env = qgetenv( "KALEIDO_GUARD" );
    return guardModeFor( Env, M_PictureGuard, scriptedRun() );
}

int RenderPipeline::guardModeFor( const QByteArray &env, bool setting, bool scripted )
{
    const QByteArray e = env.trimmed().toLower();
    if ( e == "0" || e == "off" )
        return 0;
    if ( e == "log" )
        return 2;
    if ( e == "1" || e == "on" )
        return 1;
    return setting && !scripted ? 1 : 0;
}

void RenderPipeline::updateGuard( const AudioFeatures &audio, const AudioFeatures &audioFx, float dtWall )
{
    m_guardWall += dtWall;
    const int mode = guardMode();
    m_present.setGuardWanted( mode != 0 );
    if ( mode == 0 || m_effectTextures.empty() )
        return;
    const bool fading = m_scheduler.texState() != 0;
    if ( fading )
    {
        m_guard.sceneChanged(); // a new scene: everything starts over
        m_guardSolo = 0.f;
    }
    else
        m_guardSolo += dtWall;
    m_guardDt += dtWall;
    int          w = 0, h = 0;
    const float *rgb = m_present.guardSample( w, h );
    if ( !rgb || m_present.guardSeq() == m_guardSeq )
        return;
    m_guardSeq = m_present.guardSeq();
    const float dt = m_guardDt;
    m_guardDt = 0.f;

    const bool bench = m_scheduler.reviewMode() || m_scheduler.rateWalk();
    const bool music = audio.musicPresence > 0.5f && m_audioConditioner.gate() > 0.5f && audio.rawLevel > 0.1f;
    const bool lit = !M_Blackout && !M_RestDim && M_Dim > 0.99f && m_present.blackLevel() < 0.01f;
    const bool held = M_Freeze || M_Pinned || m_breakSmooth > 0.02f || audio.breakHold > 0.f || freezeTime() >= 0.f;
    const bool armed = !fading && m_guardSolo > 3.f && music && lit && !held && audioFx.fadeOut < 0.3f
                       && m_liveTex == 0 && ( mode == 2 || !bench );
    // A photo fading in counts like any other picture -- it may well be the cure -- but the first stage waits for it.
    const PictureGuard::PhotoE  photo = m_imageList.size() < 2 ? PictureGuard::PhotoE::NONE
                                        : ( m_stateTexture == 1 && !m_waitForImageToLoad && !m_pendingImgChange )
                                            ? PictureGuard::PhotoE::READY
                                            : PictureGuard::PhotoE::BUSY;
    const PictureGuard::ActionE a = m_guard.sample( rgb, w * h, dt, armed, photo );

    // KALEIDO_GUARD_LOG=1: a line a second with what the guard sees (the thresholds were set from these).
    static const bool SampleLog = qEnvironmentVariableIsSet( "KALEIDO_GUARD_LOG" );
    m_guardLogT += dt;
    if ( SampleLog && m_guardLogT >= 1.f )
    {
        m_guardLogT = 0.f;
        QByteArray scene( m_effectTextures[m_scheduler.actTexture()]->fragmentName() );
        scene = scene.mid( std::max( scene.lastIndexOf( '\\' ), scene.lastIndexOf( '/' ) ) + 1 );
        fprintf( stderr, "GUARD sample scene=%s mean=%.4f peak=%.4f step=%.4f dark=%.1f still=%.1f armed=%d at=%.1f\n",
                 scene.constData(), m_guard.mean(), m_guard.peak(), m_guard.step(), m_guard.darkFor(),
                 m_guard.stillFor(), armed ? 1 : 0, m_guardWall );
    }
    if ( a != PictureGuard::ActionE::NONE )
        noteGuard( a, mode == 1 );
}

void RenderPipeline::noteGuard( PictureGuard::ActionE a, bool acts )
{
    const bool photo = a == PictureGuard::ActionE::PHOTO;
    const bool dark = m_guard.cause() == PictureGuard::CauseE::DARK;
    QByteArray scene( m_effectTextures[m_scheduler.actTexture()]->fragmentName() );
    scene = scene.mid( std::max( scene.lastIndexOf( '\\' ), scene.lastIndexOf( '/' ) ) + 1 );
    if ( scene.endsWith( ".frag" ) )
        scene.chop( 5 );
    const QString pic = m_photoActPath.isEmpty() ? QStringLiteral( "?" ) : QFileInfo( m_photoActPath ).fileName();
    // One line per action, for Tools/guard_report.py: GUARD <photo|scene> <dark|frozen> key=value ...
    fprintf( stderr, "GUARD %s %s scene=%s photo=%s mean=%.4f peak=%.4f step=%.4f at=%.1f%s\n",
             photo ? "photo" : "scene", dark ? "dark" : "frozen", scene.constData(), qPrintable( pic ), m_guard.mean(),
             m_guard.peak(), m_guard.step(), m_guardWall, acts ? "" : " watching" );
    if ( !acts )
        return;
    if ( photo )
    {
        // The photo cross-fade's own path: on the next downbeat, the photo the loader has waiting -- in at most 4 s
        // (a preset's photo fades take 20-80 s, and the picture is black meanwhile).
        m_pendingImgChange = true;
        m_pendingImgAge = 0.f;
        m_timeTextureInterpolation = std::min( m_timeTextureInterpolation, 4.f );
    }
    else
        m_scheduler.requestGuardChange();

    // The count, per scene and per photo, in a file of its own beside the settings -- whether it ever steers the
    // choice is the user's decision after a week of numbers; the taste (M_Taste) is not touched.
    struct Row
    {
        int     n[4] = {}; // dark, frozen, photo, scene
        QString last;
    };
    static QMap<QString, Row> Rows;
    static bool               Loaded = false;
    const QString             path = QFileInfo( SettingsFile::path() ).absolutePath() + "/kaleidoscope_guard.tsv";
    if ( !Loaded )
    {
        Loaded = true;
        QFile f( path );
        if ( f.open( QIODevice::ReadOnly | QIODevice::Text ) )
            while ( !f.atEnd() )
            {
                const QStringList c = QString::fromUtf8( f.readLine() ).trimmed().split( QChar( '\t' ) );
                if ( c.size() < 6 || c[0].startsWith( QChar( '#' ) ) || c[0] == QLatin1String( "kind" ) )
                    continue;
                Row &r = Rows[c[0] + QChar( '\t' ) + c[1]];
                for ( int i = 0; i < 4; ++i )
                    r.n[i] = c[2 + i].toInt();
                r.last = c.size() > 6 ? c[6] : QString();
            }
    }
    const QString     now = QDateTime::currentDateTime().toString( Qt::ISODate );
    const QStringList keys = { QStringLiteral( "scene\t" ) + QString::fromUtf8( scene ),
                               QStringLiteral( "photo\t" ) + pic };
    for ( const QString &key : keys )
    {
        Row &r = Rows[key];
        ++r.n[dark ? 0 : 1];
        ++r.n[photo ? 2 : 3];
        r.last = now;
    }
    QFile f( path );
    if ( f.open( QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text ) )
    {
        QTextStream out( &f );
        out << "# The picture guard's count (docs/engine-internals-69-guard.md): per scene and per photo, how often\n"
               "# the picture stayed dark or stood still, and whether a new photo or a new scene was asked for.\n"
               "kind\tname\tdark\tfrozen\tphoto\tscene\tlast\n";
        for ( auto it = Rows.cbegin(); it != Rows.cend(); ++it )
            out << it.key() << '\t' << it->n[0] << '\t' << it->n[1] << '\t' << it->n[2] << '\t' << it->n[3] << '\t'
                << it->last << '\n';
    }
}

float RenderPipeline::photoDepthLayer( EffectShader *scene )
{
    if ( !scene || m_liveTex || !scene->writesDepth() )
        return 0.f;
    const float t = std::min( std::max( m_interpolationTexture, 0.f ), 1.f );
    return t * EffectShader::M_PhotoDepthAmt[0] + ( 1.f - t ) * EffectShader::M_PhotoDepthAmt[1];
}

void RenderPipeline::capSceneLight( EffectShader *e, GLuint fbo )
{
    if ( m_texInternalFormat == GL_RGBA8 || !e )
        return;
    const float cap = e->hdrCap();
    if ( cap <= 0.f )
        return;
    if ( m_hdrCapProg == 0 )
    {
        m_hdrCapProg = setShaders( "..\\standard.vert", "..\\Engine\\HdrCap.frag" );
        m_hdrCapUni = m_hdrCapProg ? glGetUniformLocation( m_hdrCapProg, "capLight" ) : -1;
    }
    if ( m_hdrCapProg == 0 || !glBlendEquation )
        return;
    extern GLuint fullscreenVAO();
    // GL_MIN ignores the blend factors: every channel becomes min( the scene's, the cap ); the alpha is far above
    // any value.  No depth test or write, no clear: the frame and its depth stay as the scene left them.
    GLint           prev_fbo = 0, prev_eq = GL_FUNC_ADD;
    const GLboolean blend = glIsEnabled( GL_BLEND ), depth = glIsEnabled( GL_DEPTH_TEST );
    GLboolean       depth_mask = GL_TRUE;
    glGetIntegerv( GL_FRAMEBUFFER_BINDING, &prev_fbo );
    glGetIntegerv( GL_BLEND_EQUATION_RGB, &prev_eq );
    glGetBooleanv( GL_DEPTH_WRITEMASK, &depth_mask );
    glBindFramebuffer( GL_FRAMEBUFFER, fbo );
    glViewport( 0, 0, m_width, m_height );
    glDisable( GL_DEPTH_TEST );
    glDepthMask( GL_FALSE );
    glEnable( GL_BLEND );
    glBlendEquation( GL_MIN );
    glUseProgram( m_hdrCapProg );
    glUniform1f( m_hdrCapUni, cap );
    glBindVertexArray( fullscreenVAO() );
    glDrawArrays( GL_TRIANGLES, 0, 3 );
    glBindVertexArray( 0 );
    glBlendEquation( static_cast<GLenum>( prev_eq ) );
    if ( !blend )
        glDisable( GL_BLEND );
    if ( depth )
        glEnable( GL_DEPTH_TEST );
    glDepthMask( depth_mask );
    glBindFramebuffer( GL_FRAMEBUFFER, static_cast<GLuint>( prev_fbo ) );
    checkGLErrors( "capSceneLight()" );
}

void RenderPipeline::renderDepthViews()
{
    if ( m_depthViewProg == 0 )
    {
        m_depthViewProg = setShaders( "..\\standard.vert", "..\\Engine\\DepthView.frag" );
        glGenFramebuffers( 1, &m_depthViewFbo );
    }
    if ( m_depthViewProg == 0 || m_depthViewFbo == 0 )
        return;
    GLint fbo = 0;
    glGetIntegerv( GL_FRAMEBUFFER_BINDING, &fbo );
    glUseProgram( m_depthViewProg );
    glUniform1i( glGetUniformLocation( m_depthViewProg, "texDepth" ), 29 );
    glUniform2f( glGetUniformLocation( m_depthViewProg, "photoDepthWin" ),
                 EffectShader::windowDepth( EffectShader::M_PhotoDepthDist[0] ),
                 EffectShader::windowDepth( EffectShader::M_PhotoDepthDist[1] ) );
    glUniform2f( glGetUniformLocation( m_depthViewProg, "nearFar" ), EffectShader::SceneNear, EffectShader::SceneFar );
    const GLint kind_uni = glGetUniformLocation( m_depthViewProg, "depthKind" );
    glViewport( 0, 0, m_width, m_height );
    for ( int slot = 0; slot < 2; ++slot )
    {
        if ( slot == 1 && m_scheduler.texState() == 0 )
            break;
        EffectShader *e = m_effectTextures[slot == 0 ? m_scheduler.actTexture() : m_scheduler.nextTexture()];
        if ( e->is3D() && m_trueStereoPacked ) // its depth is in the eye-packed target, not here
            continue;
        glUniform1i( kind_uni, e->is3D() ? 2 : ( EffectShader::M_DepthPhoto[slot] > 0.f ? 1 : 0 ) );
        glActiveTexture( GL_TEXTURE0 + 29 );
        glBindTexture( GL_TEXTURE_2D, slot == 0 ? m_depthTexEffect1 : m_depthTexEffect2 );
        glBindFramebuffer( GL_FRAMEBUFFER, m_depthViewFbo );
        glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D,
                                slot == 0 ? m_texIDFBOEffectTexture1 : m_texIDFBOEffectTexture2, 0 );
        drawWindow();
    }
    glActiveTexture( GL_TEXTURE0 );
    glBindFramebuffer( GL_FRAMEBUFFER, static_cast<GLuint>( fbo ) );
}

SceneScheduler::Tick RenderPipeline::buildSchedulerTick( const AudioFeatures &audio, float timeSinceLastFrameSec )
{
    /*********************** Szenen-Wahl: SceneScheduler ***********************/

    // Triggers (novelty/section/drop, pin) + the effect state machine.  The
    // combine part (tickFx) still runs AFTER the effect passes, because
    // m_trueStereoHold only arises there.
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
    // The cues were drained in conditionAudio(), which runs first every frame.
    applyScoreCues( m_cueFrame, m_cueBridge, sched_tick );
    EffectShader::M_CueLive = m_cueBridge.wasLive; // the chain walk follows the same counters
    EffectShader::M_CueSections = sched_tick.sectionCount;
    EffectShader::M_CueDrops = sched_tick.dropCount;
    m_scheduler.tick( sched_tick );
    trackRating();

    return sched_tick;
}

void RenderPipeline::stepSimulations( const AudioFeatures &audio, float timeSinceLastFrameSec,
                                      const AudioFeatures &audioFx )
{
    // GPU/host simulations (GpuSims): determine the demand (step only what a
    // visible effect really samples - the active one or, during a cross-fade,
    // the incoming one), hand over the frame context, let them run.  GpuSims
    // binds the newest fields to the global units 7-11/28.
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
        sim_frame.globalTime = static_cast<float>( m_globaltime );
        sim_frame.audioAdvance = audioFx.audioAdvance;
        sim_frame.dyeTexA = m_liveTex ? m_liveTex : m_actTex;
        sim_frame.dyeTexB = m_liveTex ? m_liveTex : m_nextTex;
        sim_frame.dyeInterp = m_interpolationTexture;
        // Plan 27.11. P7: the photo's depth as a landscape for the fluid (Engine/FluidSim.frag).  The knob is the
        // rolled fluidDepthP of the scene that samples the fluid -- the incoming one as soon as it does; a scene
        // without the knob: 0, the old step -- and GpuSims slews it.  KALEIDO_FLUID_DEPTH=<0..1> forces it
        // (comparisons).  A live input has no map.
        if ( need.fluid )
        {
            static const float Forced = qEnvironmentVariableIsSet( "KALEIDO_FLUID_DEPTH" )
                                            ? qEnvironmentVariable( "KALEIDO_FLUID_DEPTH" ).toFloat()
                                            : -1.f;
            const auto         knob = []( EffectShader *e )
            {
                float v = 0.f;
                for ( const auto &p : e->namedParameters() )
                    if ( p.first == "fluidDepthP" )
                        v = p.second;
                return v;
            };
            sim_frame.fluidDepth =
                Forced >= 0.f ? Forced : knob( ( fading && nxt_e->usesFluid() ) ? nxt_e : akt_e );
            sim_frame.depthAmtA = ( !m_liveTex && m_actDepth.map ) ? 1.f : 0.f;
            sim_frame.depthAmtB = ( !m_liveTex && m_nextDepth.map ) ? 1.f : 0.f;
        }
        sim_frame.hold = M_Freeze; // a frozen picture: the sims stand too
        // The sims were tuned per frame at LiveRefHz: they step by the frame time, live and in an export.
        sim_frame.liveFrames = liveFrames( timeSinceLastFrameSec );

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
                                 : m_cfx.step( k, audio, timeSinceLastFrameSec, static_cast<float>( m_globaltime ), src,
                                               m_width, m_height );
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
        m_cfx.retireIdle( static_cast<float>( m_globaltime ) );
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
                                                  static_cast<float>( m_globaltime ), m_width, m_height );
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

    // the second photo's slots (a live input stands in for both, as for the photos)
    glActiveTexture( GL_TEXTURE0 + EffectShader::PhotoBUnit );
    glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_photoBTex[0] );
    glActiveTexture( GL_TEXTURE0 + EffectShader::PhotoBUnit + 1 );
    glBindTexture( GL_TEXTURE_2D, m_liveTex ? m_liveTex : m_photoBTex[1] );

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
        const bool stereo_on = stereoSideBySide( M_StereoMode ) || stereoTopBottom( M_StereoMode );
        const bool act_3d = m_effectTextures[m_scheduler.actTexture()]->is3D();
        const bool tex_solo = ( m_scheduler.texState() == 0 );
        const bool next_3d = m_effectTextures[m_scheduler.nextTexture()]->is3D();
        // A fade between a 3D and a 2D scene is packed too (20.11.2026): the 3D side renders per eye, the 2D side
        // mono, and the mix gives it its two eyes (Engine/StereoMix.frag).  Until then such a fade dropped to the
        // mono picture with the depth from its brightness, and the 3D scene's real depth vanished in one frame at its
        // first (or appeared at its last): a card 8 units away jumped from 4.5 % of the eye's width in front of the
        // screen to 0.4 % behind it.
        m_trueStereoHold = stereo_on && ( tex_solo ? act_3d : ( act_3d || next_3d ) );
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
    const bool     full = stereoFull( M_StereoMode );
    glEnable( GL_SCISSOR_TEST );
    for ( int e = 0; e < 2; ++e ) // e 0 = left eye, 1 = right
    {
        if ( full ) // the bound target is twice the frame: each eye gets a whole frame (the projection's aspect --
        {           // the frame's -- is then the eye's own)
            const int x = stereoSideBySide( M_StereoMode ) ? e * m_width : 0;
            const int y = stereoSideBySide( M_StereoMode ) ? 0 : ( e ? 0 : m_height ); // top = left eye
            glViewport( x, y, m_width, m_height );
            glScissor( x, y, m_width, m_height );
        }
        else if ( stereoSideBySide( M_StereoMode ) ) // SBS: left half = left eye
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
    // A full stereo format: the eye-packed frame is twice the frame's size, in a target of its own.
    const bool full_packed = fullPacked() && tex1_is_3d; // the 2D side of a packed fade renders mono
    if ( full_packed )
        ensureStereoTarget( m_stereoTarget[0], stereoSideBySide( M_StereoMode ) ? 2 * m_width : m_width,
                            stereoSideBySide( M_StereoMode ) ? m_height : 2 * m_height );
    const GLuint scene_fbo = full_packed ? m_stereoTarget[0].fbo : ( msaa_tex1 ? m_msaaFbo : m_fboEffectTexture1 );

    // Do the FBO Stuff
    glBindFramebuffer( GL_FRAMEBUFFER, scene_fbo );

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
    updateLightMatrix( static_cast<float>( m_globaltime ) );
    if ( m_effectTextures[m_scheduler.actTexture()]->usesShadow() )
    {
        renderShadowPass( m_effectTextures[m_scheduler.actTexture()] );
        glBindFramebuffer( GL_FRAMEBUFFER, scene_fbo );
    }
    // Second, independent shadow-casting light (studio-style two-light setup);
    // same scope as light 1 -- the active scene only, never the cross-fading
    // "next" one.
    updateLightMatrix2( static_cast<float>( m_globaltime ) );
    if ( m_effectTextures[m_scheduler.actTexture()]->usesShadow2() )
    {
        renderShadowPass2( m_effectTextures[m_scheduler.actTexture()] );
        glBindFramebuffer( GL_FRAMEBUFFER, scene_fbo );
    }

    // A 2D scene that passes the photo's depth on (plan T2): its depth is real as far as the photos have maps.
    const float photo_d1 = tex1_is_3d ? 0.f : photoDepthLayer( m_effectTextures[m_scheduler.actTexture()] );
    EffectShader::M_DepthValid[0] = tex1_is_3d ? 1.f : photo_d1;
    EffectShader::M_DepthPhoto[0] = photo_d1 > 0.f ? 1.f : 0.f;
    if ( !tex1_is_3d ) // a 2D scene with depth writes all of it; one without leaves the far plane
    {
        glClearDepth( 1.0 );
        glClear( GL_DEPTH_BUFFER_BIT );
    }

    glcoreDebugMark( "scene:act" );
    m_effectTextures[m_scheduler.actTexture()]->enableShader();
    m_effectTextures[m_scheduler.actTexture()]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
    m_effectTextures[m_scheduler.actTexture()]->applyAudioFeatures( audioFx );
    if ( m_trueStereoPacked && tex1_is_3d )
        renderSceneStereo( m_effectTextures[m_scheduler.actTexture()] );
    else
        m_effectTextures[m_scheduler.actTexture()]->draw();


    glcoreDebugMark( "scene:resolve+cap" );
    if ( msaa_tex1 )
    {
        resolveMsaa( m_fboEffectTexture1, m_width, m_height );
        checkGLErrors( "resolveMsaa() 1" );
    }
    if ( !( m_trueStereoPacked && tex1_is_3d ) )
        capSceneLight( m_effectTextures[m_scheduler.actTexture()], m_fboEffectTexture1 );

    // Transparent geometry goes in afterwards, over the opaque frame this scene
    // just produced and against the depth it just wrote.
    // (b45cdff pushed the debug marker under a BRACELESS if and thereby made
    // renderOitPass unconditional: the resolve bound oitAccum/oitReveal to the
    // photo units 0/1, and every INCOMING scene sampled the OIT buffers
    // instead of the photos -- the "brightness drop + texture change" at the
    // end of every scene fade.  Braces + a rebind in the resolve, see there.)
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
    EffectShader::M_DepthPhoto[1] = 0.f;
    if ( m_scheduler.texState() != 0 )
    {
        bool tex2_is_3d = m_effectTextures[m_scheduler.nextTexture()]->is3D();
        bool msaa_tex2 = tex2_is_3d && !m_trueStereoPacked;
        if ( msaa_tex2 )
            ensureMsaaTargets( m_width, m_height );
        msaa_tex2 = msaa_tex2 && m_msaaReady;
        const bool full_packed = fullPacked() && tex2_is_3d;
        if ( full_packed )
            ensureStereoTarget( m_stereoTarget[1], stereoSideBySide( M_StereoMode ) ? 2 * m_width : m_width,
                                stereoSideBySide( M_StereoMode ) ? m_height : 2 * m_height );

        // Do the FBO Stuff
        glBindFramebuffer( GL_FRAMEBUFFER,
                           full_packed ? m_stereoTarget[1].fbo : ( msaa_tex2 ? m_msaaFbo : m_fboEffectTexture2 ) );

        const float photo_d2 = tex2_is_3d ? 0.f : photoDepthLayer( m_effectTextures[m_scheduler.nextTexture()] );
        EffectShader::M_DepthValid[1] = tex2_is_3d ? 1.f : photo_d2;
        EffectShader::M_DepthPhoto[1] = photo_d2 > 0.f ? 1.f : 0.f;
        if ( !tex2_is_3d )
        {
            glClearDepth( 1.0 );
            glClear( GL_DEPTH_BUFFER_BIT );
        }
        glcoreDebugMark( "scene:next" );
        m_effectTextures[m_scheduler.nextTexture()]->enableShader();
        m_effectTextures[m_scheduler.nextTexture()]->setUniforms( m_globaltime, m_interpolationTexture, 0, 1 );
        m_effectTextures[m_scheduler.nextTexture()]->applyAudioFeatures( audioFx );
        if ( m_trueStereoPacked && tex2_is_3d )                               // a packed fade: an incoming 3D scene
            renderSceneStereo( m_effectTextures[m_scheduler.nextTexture()] ); // is eye-packed too
        else
            m_effectTextures[m_scheduler.nextTexture()]->draw();


        if ( msaa_tex2 )
        {
            resolveMsaa( m_fboEffectTexture2, m_width, m_height );
            checkGLErrors( "resolveMsaa() 2" );
        }
        if ( !( m_trueStereoPacked && tex2_is_3d ) && !full_packed )
            capSceneLight( m_effectTextures[m_scheduler.nextTexture()], m_fboEffectTexture2 );
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
    // The mono (2D) side of a packed fade is a frame like any other: its rig still moves it.
    const bool packed1 = m_trueStereoPacked && m_effectTextures[m_scheduler.actTexture()]->is3D();
    const bool packed2 = m_trueStereoPacked && m_effectTextures[m_scheduler.nextTexture()]->is3D();
    if ( !packed1 || ( m_scheduler.texState() != 0 && !packed2 ) )
    {
        if ( !packed1 )
            fx_tex1 = rig2Transform( m_effectTextures[m_scheduler.actTexture()],
                                     m_texIDFBOEffectTexture1, 0 );
        if ( m_scheduler.texState() != 0 && !packed2 )
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

void RenderPipeline::renderStereoMixPass( int w, int h )
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
        glUniform2f( m_stereoMixResUni, static_cast<float>( w ), static_cast<float>( h ) );
    if ( m_stereoMixWUni >= 0 )
        glUniform1f( m_stereoMixWUni,
                     m_scheduler.texInterp() );
    if ( m_stereoMixMonoAUni >= 0 )
        glUniform1i( m_stereoMixMonoAUni, m_effectTextures[m_scheduler.actTexture()]->is3D() ? 0 : 1 );
    if ( m_stereoMixMonoBUni >= 0 )
        glUniform1i( m_stereoMixMonoBUni, m_effectTextures[m_scheduler.nextTexture()]->is3D() ? 0 : 1 );
    if ( m_stereoMixLayoutUni >= 0 )
        glUniform1i( m_stereoMixLayoutUni, stereoSideBySide( M_StereoMode ) ? 1 : 2 );
    if ( m_stereoMixDepthUni >= 0 )
        glUniform1f( m_stereoMixDepthUni, M_StereoDepth );
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
    m_stereoPresent = 0;
    if ( fullPacked() )
    {
        // The eye-packed frame of a full format is twice the frame's size and goes straight to the present pass --
        // what the FX stage does to a packed frame of the half formats is a passthrough (solo) or a plain mix (a
        // 3D<->3D fade) anyway.
        const int w = static_cast<int>( m_width ), h = static_cast<int>( m_height );
        const int pw = stereoSideBySide( M_StereoMode ) ? 2 * w : w;
        const int ph = stereoSideBySide( M_StereoMode ) ? h : 2 * h;
        m_stereoPresent = m_stereoTarget[0].color; // solo: always a 3D scene (updateTrueStereoState())
        m_stereoPresentW = m_stereoTarget[0].w;
        m_stereoPresentH = m_stereoTarget[0].h;
        m_fadeInTex = 0;
        if ( m_scheduler.texState() != 0 && m_stereoMixProgId != 0 )
        {
            // A fade: each side packed (a 3D scene, its own target) or mono (a 2D scene, its frame, rig applied).
            const GLuint  fx_tex1 = prepareFxInputs();
            const GLuint  fx_tex2 = m_fadeInTex; // prepareFxInputs() leaves the incoming side there
            const bool    act_3d = m_effectTextures[m_scheduler.actTexture()]->is3D();
            const bool    next_3d = m_effectTextures[m_scheduler.nextTexture()]->is3D();
            const GLuint  ta = act_3d ? m_stereoTarget[0].color : fx_tex1;
            const GLuint  tb = next_3d ? m_stereoTarget[1].color : fx_tex2;
            StereoTarget &mix = m_stereoTarget[2];
            ensureStereoTarget( mix, pw, ph );
            glBindFramebuffer( GL_FRAMEBUFFER, mix.fbo );
            glViewport( 0, 0, pw, ph );
            glActiveTexture( GL_TEXTURE3 );
            glBindTexture( GL_TEXTURE_2D, ta );
            glActiveTexture( GL_TEXTURE4 );
            glBindTexture( GL_TEXTURE_2D, tb );
            glActiveTexture( GL_TEXTURE0 );
            renderStereoMixPass( pw, ph );
            m_stereoPresent = mix.color;
            m_stereoPresentW = pw;
            m_stereoPresentH = ph;
            m_fadeInTex = tb; // the exposure measures the incoming scene, as in every fade
            glViewport( 0, 0, w, h );
        }
        glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
        return;
    }
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
        renderStereoMixPass( m_width, m_height );
    }
    else
    {
        // Order matters: the overlay reads the FINISHED scene, so the
        // transition has to have produced it first.
        glcoreDebugMark( "transition" );
        const GLuint scene_tex = renderTransitionPass( audioFx, fx_tex1 );
        glcoreDebugMark( "overlay" );
        renderOverlayPass( audioFx, scene_tex );
    }

    checkGLErrors( "createFx() 1" );

    glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
    checkFramebufferStatus();

    glBindFramebuffer( GL_FRAMEBUFFER, m_fboEffectFx2 );
    glcoreDebugMark( "overlay:next" );
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


    glUniform1i( m_texPointFxUni1, 5 ); // texture unit 0, not to be confused with texId
    glUniform1i( m_texPointFxUni2, 6 ); // texture unit 0, not to be confused with texId
    glUniform2f( m_texSizeRcpFxUni, static_cast<float>( m_width ), static_cast<float>( m_height ) );
    glUniform1f( m_interpolationFxUni, m_scheduler.fxInterp() );
    glUniform1f( m_timeFxUni, static_cast<float>( m_globaltime ) );



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
        // The packed frame of a full stereo format bypassed the trails (paint()): what they hold is stale, so they
        // start over with the first frame after it rather than fade an old picture in.
        if ( m_trailRestart )
        {
            decay = 0.f;
            m_trailRestart = false;
        }
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
        // The decay was tuned per frame at LiveRefHz: it is applied once per such frame the frame stands for, so a
        // trail lasts as long in seconds on a 60-Hz panel, a 144-Hz one and in a 24 fps export.  In a freeze the
        // scene time stands, but the trails still fade onto the held picture, on the wall clock as they always did
        // (a comparison run's final frame is that held picture, whatever the timing).
        if ( m_trailStepsUni >= 0 )
            glUniform1f( m_trailStepsUni, liveFrames( M_Freeze ? dtWall : timeSinceLastFrameSec ) );
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
            float rot_a = 0.15f * static_cast<float>( std::sin( m_globaltime * 0.02 ) ) * dtf;
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
                float swl = 0.25f * static_cast<float>( std::sin( m_globaltime * 0.013 ) )
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
        // The packed frame of a full stereo format is twice the frame's size.
        const bool full_src = m_stereoPresent != 0 && presentSource == m_stereoPresent;
        pin.renderW = full_src ? m_stereoPresentW : m_width;
        pin.renderH = full_src ? m_stereoPresentH : m_height;
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
        pin.globalTime = static_cast<float>( m_globaltime ); // (titles turn with it: a wrap would jump)
        pin.chasePhase = m_audioConditioner.chasePhase();
        pin.camZoom = m_audioConditioner.camZoom();
        pin.camRot = m_audioConditioner.camRot();
        pin.camOffX = m_audioConditioner.camOffX();
        pin.camOffY = m_audioConditioner.camOffY();
        pin.stereoPacked = m_trueStereoPacked;
        pin.stereoMode = M_StereoMode;
        pin.stereoDepth = M_StereoDepth;
        pin.blackout = M_Blackout || M_RestDim;
        pin.dim = M_Dim;
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
        pin.strictLight = M_StrictLight;
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
        // Time direction: rewind/echo/breath.  The time echo dreams in ambient
        // passages and flashes up as a flashback after a drop; during a
        // rewind it pauses (history on history would be mush).
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
        // Wave 2: letterbox, shockwave, cover palette, line slam, 2.5D
        // parallax (depth of the ACTIVE scene; a 2D scene has its depth
        // cleared to the far plane -> the parallax cancels out).
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
        pin.sceneDepthTex = ( full_src && m_effectTextures[m_scheduler.actTexture()]->is3D() )
                                ? m_stereoTarget[0].depth
                                : m_depthTexEffect1;
        pin.depthPar = m_trailDepth3D;
        pin.nearZ = EffectShader::SceneNear;
        pin.farZ = EffectShader::SceneFar;
        // The photo's depth (plan T3): a 2D scene with `// @depth` on screen, as real as its photos have maps -- eased
        // in and out on the same 2.5/s ramp as the 3D parallax.  Its parallax is small (PhotoParallax) and moves only
        // with the existing camera drift (camOff; none with calmMotion); the stereo takes the real depth instead of
        // the brightness guess.
        {
            static const float PhotoParallax = 0.35f;
            const float        up = full_src ? 0.f : EffectShader::M_DepthPhoto[0] * EffectShader::M_DepthValid[0];
            m_photoDepthUp = slewToward( m_photoDepthUp, up, 2.5f, dtWall );
            pin.depthParPhoto = PhotoParallax * m_photoDepthUp;
            pin.stereoPhoto = m_photoDepthUp;
            pin.photoWin[0] = EffectShader::windowDepth( EffectShader::M_PhotoDepthDist[0] );
            pin.photoWin[1] = EffectShader::windowDepth( EffectShader::M_PhotoDepthDist[1] );
        }
        // ---- rays (27.11.2026): light shafts through the photo's depth (Engine/Present.frag, raysLight()) -- BEGIN
        // ---- The active scene's preset knob `depthRaysP` (0 where its entry has none; not `raysP`, which two older
        // scenes, AnticrepuscularRays and CrepuscularRaysForest, use for their own rays) times "a photo's depth is up",
        // slewed at 1.2/s: neither a scene change nor a photo with or without a map makes the light jump.
        // KALEIDO_RAYS=<x> forces the knob for every scene (to look at it: the presets do not set it).
        {
            static const QByteArray RaysEnv = qgetenv( "KALEIDO_RAYS" );
            const float knob = RaysEnv.isEmpty()
                                   ? m_effectTextures[m_scheduler.actTexture()]->namedParameter( "depthRaysP", 0.f )
                                   : RaysEnv.toFloat();
            const float             up = full_src ? 0.f : EffectShader::M_DepthPhoto[0] * EffectShader::M_DepthValid[0];
            m_raysUp = slewToward( m_raysUp, ( knob > 0.f ? knob : 0.f ) * up, 1.2f, dtWall );
            pin.raysP = m_raysUp;
        }
        // ---- rays -- END ----
        m_present.run( pin );
    }
}

void RenderPipeline::paint( const float *rotMatrix, float tx, float ty, float tz,
                            const AudioFeatures &audio )
{
    // A full stereo format renders the frame at one eye's size: a switch into, out of or between them ('z', the
    // remote) sizes the frame anew before anything is drawn.
    if ( ( stereoFull( M_StereoMode ) ? M_StereoMode : 0 ) != m_sizedStereo && m_displayW > 0 && m_displayH > 0 )
        resize( m_displayW, m_displayH );
    beginFrame( audio );
    updateLiveInput();
    updateTimingScale( audio );

    const FrameTiming ft = readFrameClock();
    float             time_since_last_frame_sec = ft.dt;
    // A comparison run (KALEIDO_FREEZE_TIME): the wall-clock slews too (exposure,
    // title, trails) step 1/120 s per frame and stop with the freeze -- the
    // frame is final the moment it freezes, not ~20 s later.
    // ... and before it, while the programs it asked for are still being built, everything stands (the fixed steps
    // too, applyTransportModifiers()): every run then integrates the same, with vsync or without.
    const bool  program_hold = freezeTime() >= 0.f && !M_Freeze && comparisonWaitsForPrograms();
    const float dt_wall = freezeTime() < 0.f ? ft.dtWall : ( M_Freeze || program_hold ? 0.f : 1.f / 120.f );
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
    m_calibPhase = audio_fx.beatPhase; // the latency calibration ring (calibState())
    m_calibKick = audio_fx.onsetKick;

    // KALEIDO_FEATURE_LOG=<file>: one CSV line per frame with the quantities
    // the direction decisions depend on.  Without it, "does the drop
    // prediction hit?" or "does the pitch follow the bass?" could only be
    // guessed from the picture -- and the picture is the effect, not the
    // cause.
    {
        static FILE *flog = []
        {
            const char *e = getenv( "KALEIDO_FEATURE_LOG" );
            FILE       *f = e ? fopen( e, "w" ) : nullptr;
            if ( f )
                fputs( "t,pitch,dpitch,buildUp,dropPulse,dropCount,barPhase,beatPhase,bpm,"
                       "sectionCount,sectionId,presence,level,swell,flux,hcdf,phrasePos,phraseLeft,melody,hue,"
                       "dropFx,breath,letter\n",
                       f );
            return f;
        }();
        if ( flog )
        {
            static unsigned n = 0;
            fprintf( flog,
                     "%.3f,%.4f,%.4f,%.3f,%.3f,%d,%.3f,%.3f,%.1f,%d,%d,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.2f,%.4f,%.4f,"
                     "%.4f,%.4f,%.4f\n",
                     m_globaltime, audio.dominantPitch, audio.deltaPitch, audio.buildUp, audio.dropPulse,
                     audio.dropCount, audio_fx.barPhase, audio_fx.beatPhase, 40.f + 160.f * audio.estimatedBPM,
                     audio.sectionCount, audio.sectionId, audio.musicPresence, audio.overallLevel, audio_fx.swell,
                     audio.spectralFlux, audio.harmonicChange, audio_fx.phrasePos, audio_fx.phraseSecsLeft,
                     audio.melodyPitch, audio_fx.chromaHue, audio_fx.dropPulse, m_audioConditioner.breath(),
                     m_audioConditioner.letterbox() );
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

    glcoreDebugMark( "sims" );
    stepSimulations( audio, time_since_last_frame_sec, audio_fx );
    bindSceneInputs();
    updateTrueStereoState();

    renderActiveScenePass( audio_fx );
    renderNextScenePass( audio_fx );
    static const bool ShowDepth = qEnvironmentVariableIntValue( "KALEIDO_SHOW_DEPTH" ) != 0; // plan T2: depth as grey
    if ( ShowDepth )
        renderDepthViews();
    glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
    checkFramebufferStatus();

    // The combine half of the scheduler tick, deliberately AFTER both scene
    // passes: it needs m_trueStereoHold, which only exists once they ran.
    m_scheduler.tickFx( sched_tick, m_trueStereoHold );

    glcoreDebugMark( "fx" );
    renderFxStage( audio_fx );
    glcoreDebugMark( "blend" );
    if ( !m_stereoPresent )
        renderFinalBlend();

    glcoreDebugMark( "trails" );
    // The packed frame of a full stereo format (renderFxStage()) is the present pass's source as it is.
    const GLuint present_source = m_stereoPresent
                                      ? m_stereoPresent
                                      : renderTrailsPass( audio, audio_fx, time_since_last_frame_sec, dt_wall );
    if ( m_stereoPresent )
        m_trailRestart = true;

    glcoreDebugMark( "present" );
    runPresentPass( present_source, audio, audio_fx, time_since_last_frame_sec, dt_wall );
    glcoreDebugMark( "guard+spout" );
    updateGuard( audio, audio_fx, dt_wall );

    // Spout output (-o): publish the displayed frame for OBS / Resolume etc. -- the one the present pass just wrote,
    // so the receiver gets what the room sees: the brightness limiter, the blackout, the grade, the stereo packing,
    // titles and lyrics, at the display size.  (Sent before it, as it once was, a projector fed by Spout bypassed the
    // photosensitivity limiter.)  spoutSource=clean in the ini sends the raw render instead, for a mixer that grades
    // and limits on its own.  The window's text overlays and the preset crossfade are painted later by QPainter and
    // stay out either way.  Needs the GL context, which is current here; texture-share via DX interop.
    if ( M_SpoutEnabled )
    {
        if ( !m_spoutStarted )
            m_spoutStarted = spoutOutInit( "Kaleidoscope" );
        if ( M_SpoutClean )
            spoutOutSend( present_source, m_stereoPresent ? m_stereoPresentW : m_width,
                          m_stereoPresent ? m_stereoPresentH : m_height );
        else
        {
            glBindFramebuffer( GL_FRAMEBUFFER, m_defaultFBO );
            spoutOutSendFbo( m_defaultFBO, m_displayW, m_displayH );
        }
    }
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
    m_nextDepth = m_nextImageDepth; // the slot's depth travels with its texture (swapped in updateImageState())
    savePhotoMemory();
    // KALEIDO_FRAME_LOG: photo swaps in the same log as the long frames and gaps (is a stall a swap?)
    static const bool FrameLog = qEnvironmentVariableIsSet( "KALEIDO_FRAME_LOG" );
    if ( FrameLog )
        fprintf( stderr, "[photo] swapped in %.1f ms\n", timer.elapsed() );


    // printf( "%s\n", qPrintable((*m_imageListIterator)) );


    // printf( "Texture: %f\n", timeSetup );
    // printf( "Texture: Del: %f, Gen %f, Set %f\n", timeDelete, timeGen, timeSetup );
}


void RenderPipeline::createPhotoB( const QImage &image )
{
    for ( GLuint &tex : m_photoBTex )
    {
        if ( tex == 0 )
            glGenTextures( 1, &tex );
        glBindTexture( GL_TEXTURE_2D, tex );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_MIRRORED_REPEAT );
        glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_MIRRORED_REPEAT );
        glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, image.width(), image.height(), 0, GL_RGBA, GL_UNSIGNED_BYTE,
                      image.bits() );
        glGenerateMipmap( GL_TEXTURE_2D );
    }
    if ( m_photoBFbo[0] == 0 )
        glGenFramebuffers( 2, m_photoBFbo );
    m_photoBSize = image.width();
    m_photoBMix = m_photoBTarget = 0.f;
}

void RenderPipeline::takePhotoB( GLuint src )
{
    if ( m_photoBTex[0] == 0 || src == 0 || m_photoBSize <= 0 )
        return;
    m_photoBMix = m_photoBTarget; // a fade still running ends here: the slot it left is written now
    const int dst = m_photoBTarget > 0.5f ? 0 : 1;
    GLint     read_fbo = 0, draw_fbo = 0;
    glGetIntegerv( GL_READ_FRAMEBUFFER_BINDING, &read_fbo );
    glGetIntegerv( GL_DRAW_FRAMEBUFFER_BINDING, &draw_fbo );
    glBindFramebuffer( GL_READ_FRAMEBUFFER, m_photoBFbo[0] );
    glFramebufferTexture2D( GL_READ_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, src, 0 );
    glBindFramebuffer( GL_DRAW_FRAMEBUFFER, m_photoBFbo[1] );
    glFramebufferTexture2D( GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_photoBTex[dst], 0 );
    glBlitFramebuffer( 0, 0, m_photoBSize, m_photoBSize, 0, 0, m_photoBSize, m_photoBSize, GL_COLOR_BUFFER_BIT,
                       GL_NEAREST );
    glBindFramebuffer( GL_READ_FRAMEBUFFER, static_cast<GLuint>( read_fbo ) );
    glBindFramebuffer( GL_DRAW_FRAMEBUFFER, static_cast<GLuint>( draw_fbo ) );
    // the copy's mipmaps, on the slot's own unit (bindSceneInputs() binds it there anyway)
    glActiveTexture( GL_TEXTURE0 + EffectShader::PhotoBUnit + dst );
    glBindTexture( GL_TEXTURE_2D, m_photoBTex[dst] );
    glGenerateMipmap( GL_TEXTURE_2D );
    glActiveTexture( GL_TEXTURE0 );
    m_photoBTarget = static_cast<float>( dst );
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

/**  Loads and prepares a photo for its texture slot, its depth map in the alpha channel (PhotoDepth.h).
 *
 * @param path   Image file to load. (in)
 * @param depth  What the slot then knows about the photo's depth; Info::map is false without a map. (out)
 *
 * @return
 *   prepareImage() of the photo (or of the fallback image); alpha = the depth map, stretched the same way, or 255.
 **/
static QImage preparePhoto( const QString &path, PhotoDepth::Info &depth )
{
    QImage img = prepareImage( loadImageOrFallback( path ) );
    depth = PhotoDepth::applyToAlpha( img, path );
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

    m_actDepth = m_nextDepth = PhotoDepth::Info();
    // Robustness: no images configured -> use the procedural fallback for both.
    if ( m_imageList.isEmpty() )
    {
        setupTexture( m_actTex, prepareImage( fallbackImage() ) );
        setupTexture( m_nextTex, prepareImage( fallbackImage() ) );
        createPhotoB( prepareImage( fallbackImage() ) );
        checkGLErrors( "createTextures() 1" );
        return;
    }

    // The start pair: two free photos (the photo memory), not directory neighbours -- those were one family.
    QString first;
    for ( GLuint tex : { m_actTex, m_nextTex } )
    {
        const QString path = pickFreePhoto();
        notePhoto( path );
        setupTexture( tex, preparePhoto( path, tex == m_actTex ? m_actDepth : m_nextDepth ) );
        fprintf( stderr, "PHOTO %s\n", qPrintable( path ) );
        if ( first.isEmpty() )
            first = path;
    }
    // The second photo starts as a third one: half the list away from the first -- no roll of the seeded generator,
    // so a scripted run's later rolls stay where they were.  From the first swap on it is the photo shown before.
    {
        const int        n = static_cast<int>( m_imageList.size() );
        const int        k = static_cast<int>( m_imageList.indexOf( first ) );
        PhotoDepth::Info b_depth; // the second photo's depth rides in its alpha; no shader reads it yet
        createPhotoB( preparePhoto( m_imageList[( ( k < 0 ? 0 : k ) + n / 2 ) % n], b_depth ) );
    }

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
        // The depth maps' folder (PhotoDepth.h) holds PNGs that are no photos.  The test above already skipped it,
        // but only because QFileInfo::baseName( ".depth" ) is empty -- said here in so many words.
        if ( fi.isDir() && PhotoDepth::isDepthFolder( fi.fileName() ) )
            continue;
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

    // Every pending error, not only the first: glGetError() hands them out one per call, and the rest would be
    // blamed on the next checkpoint. gluErrorString() returns null for codes it does not know (newer GL); fputs(null)
    // crashed the program -- exactly in the run started to find a GL error (EffectShader::checkGLErrors() has had
    // the guard for long).
    for ( int i = 0; i < 16; ++i )
    {
        const GLenum err_code = glGetError();
        if ( err_code == GL_NO_ERROR )
            return;
        const char *msg = reinterpret_cast<const char *>( gluErrorString( err_code ) );
        fprintf( stderr, "OpenGL ERROR: %s (0x%04x, noticed at: %s)\n", msg ? msg : "?",
                 static_cast<unsigned>( err_code ), label ? label : "?" );
    }
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
        // stderr: the release build is a Windows-subsystem program, its stdout goes nowhere (and -l only takes
        // stderr into the log).
        case GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
            fprintf( stderr, "Framebuffer incomplete, incomplete attachment\n" );
            return false;
        case GL_FRAMEBUFFER_UNSUPPORTED:
            fprintf( stderr, "Unsupported framebuffer format\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
            fprintf( stderr, "Framebuffer incomplete, missing attachment\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
            fprintf( stderr, "Framebuffer incomplete, attached images must have same dimensions\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_FORMATS:
            fprintf( stderr, "Framebuffer incomplete, attached images must have same format\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_DRAW_BUFFER:
            fprintf( stderr, "Framebuffer incomplete, missing draw buffer\n" );
            return false;
        case GL_FRAMEBUFFER_INCOMPLETE_READ_BUFFER:
            fprintf( stderr, "Framebuffer incomplete, missing read buffer\n" );
            return false;
        default:
            fprintf( stderr, "Framebuffer incomplete, status 0x%x\n", status );
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


/**  A photo's family: its file name up to the first '-' ("achat-rot-2.jpg" -> "achat"), in lower case.
 *
 * @param path  The photo's path. (in)
 *
 * @return
 *   The family (the whole base name when it has no '-').
 **/
static QString photoFamily( const QString &path )
{
    return QFileInfo( path ).completeBaseName().section( QChar( '-' ), 0, 0 ).toLower();
}

void RenderPipeline::initPhotoMemory()
{
    QMutexLocker lock( &m_photoMutex );
    const int    n = static_cast<int>( m_imageList.size() );
    m_photoMemoryOn = n > 2 && !scriptedRun() && !qEnvironmentVariableIsSet( "KALEIDO_FIXED_PHOTO" );
    m_photoMemory.setCapacity( m_photoMemoryOn ? static_cast<size_t>( std::min( n / 2, n - 2 ) ) : 0 );
    m_lastPhoto.clear();
    if ( !m_photoMemoryOn )
        return;
    QSettings                s( SettingsFile::path(), QSettings::IniFormat );
    std::vector<std::string> names;
    for ( const QString &name : s.value( "photoHistory/shown" ).toString().split( QChar( '|' ), Qt::SkipEmptyParts ) )
        names.push_back( name.toStdString() );
    m_photoMemory.assign( names );
}

bool RenderPipeline::photoFree( const QString &path )
{
    QMutexLocker lock( &m_photoMutex );
    if ( !m_photoMemoryOn )
        return true;
    return !m_photoMemory.contains( QFileInfo( path ).fileName().toStdString() )
           && ( m_lastPhoto.isEmpty() || photoFamily( path ) != photoFamily( m_lastPhoto ) );
}

void RenderPipeline::notePhoto( const QString &path )
{
    QMutexLocker lock( &m_photoMutex );
    m_lastPhoto = path;
    if ( !m_photoMemoryOn )
        return;
    m_photoMemory.push( QFileInfo( path ).fileName().toStdString() );
    m_photoMemoryDirty = true;
}

QString RenderPipeline::pickFreePhoto()
{
    const int n = static_cast<int>( m_imageList.size() );
    QString   path = m_imageList[qrand() % n];
    for ( int tries = 0; tries < 50 && !photoFree( path ); ++tries )
        path = m_imageList[qrand() % n];
    return path;
}

void RenderPipeline::savePhotoMemory()
{
    QStringList names;
    {
        QMutexLocker lock( &m_photoMutex );
        if ( !m_photoMemoryDirty )
            return;
        m_photoMemoryDirty = false;
        for ( const std::string &name : m_photoMemory.names() )
            names << QString::fromStdString( name );
    }
    QSettings s( SettingsFile::path(), QSettings::IniFormat );
    s.setValue( "photoHistory/shown", names.join( QChar( '|' ) ) );
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
    // Until asked to stop -- which only Linux does (RenderPipeline::stop()); Windows ends the thread by terminate().
    while ( !isInterruptionRequested() )
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
                m_shader->m_nextImageDepth = PhotoDepth::Info();
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
            // Plan 27.11.2026 P1: the scene that will show this photo wants relief (1) or a flat texture (0), or has
            // no wish (-1).  A candidate that matches gets PhotoDepthBonus; the mood terms span about 0..1.7, so a
            // matching photo wins unless it fits the mood clearly worse.  With a wish, ten candidates instead of
            // five, so a match is almost always among them (707 of 1,266 photos have relief).  Measured on 18
            // exports: a bonus of 0.12 with eight candidates raised the depth scenes' share of photos with a map only
            // from 62 to 73 % (docs/engine-internals.md (71)).
            const int   want = m_shader->m_photoWantDepth.load();
            const int   cands = want >= 0 ? 10 : 5;
            const float PhotoDepthBonus = 0.3f;
            // Five (ten) free candidates (the photo memory); the last ten of sixty tries take any, so a small
            // folder or a memory that blocks too much never stalls the loader.
            for ( int tries = 0, k = 0; k < cands && tries < 60; ++tries )
            {
                if ( isInterruptionRequested() ) // stopping (Linux; see RenderPipeline::stop())
                    return;
                int            idx = qrand() % n;
                const QString &path = m_shader->m_imageList[idx];
                if ( tries < 50 && !m_shader->photoFree( path ) )
                    continue;
                ++k;
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
                if ( want >= 0 )
                {
                    auto rel = m_relief.find( path );
                    if ( rel == m_relief.end() )
                        rel = m_relief.insert( path, PhotoDepth::hasRelief( path ) );
                    if ( rel.value() == ( want == 1 ) )
                        score += PhotoDepthBonus;
                }
                if ( score > best_score )
                {
                    best_score = score;
                    best_idx = idx;
                }
            }
            m_shader->m_imageListIterator = m_shader->m_imageList.begin() + best_idx;
            m_shader->notePhoto( *m_shader->m_imageListIterator );

            NanoTimer load_timer;
            load_timer.start();
            m_shader->m_nextImage = preparePhoto( *m_shader->m_imageListIterator, m_shader->m_nextImageDepth );
            fprintf( stderr, "PHOTO %s\n", qPrintable( ( *m_shader->m_imageListIterator ) ) );
            // KALEIDO_FRAME_LOG: the load in the loader thread, with or without a depth map (plan T1: load time)
            static const bool FrameLog = qEnvironmentVariableIsSet( "KALEIDO_FRAME_LOG" );
            if ( FrameLog )
                fprintf( stderr, "[photo] loaded in %.1f ms (depth map: %s)\n", load_timer.elapsed(),
                         m_shader->m_nextImageDepth.map ? "yes" : "no" );
            m_shader->m_triggerImageload = false;

            // float loadingtime = timer.elapsed();
            // printf( "Time to load: %f\n", loadingtime );//rwrwdebug
        }
        else
            msleep( 50 );
    }
}
