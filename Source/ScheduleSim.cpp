/*****************************************************************************\
 *                              ScheduleSim.cpp
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Kaleidoscope.exe --schedule: the scene plan of a long run, computed by the real scheduler (see ScheduleSim.h).
 *
 *  @author René Weller
 */
#include "ScheduleSim.h"

#include "AudioAnalyzer.h"
#include "AudioFeatures.h"
#include "Configuration.h"
#include "EffectShader.h"
#include "PlatformQt.h"
#include "RenderPipeline.h"
#include "SceneScheduler.h"
#include "coreclock.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>

namespace
{

/**  The file name of a shader path, without its folders.
 *
 * @param path  "../Scene2D/Foo.frag" or the like (either separator); may be null. (in)
 *
 * @return
 *   "Foo.frag"; "-" for a null path.
 **/
std::string fileOf( const char *path )
{
    if ( !path )
        return "-";
    const char *s = path;
    for ( const char *c = path; *c; ++c )
        if ( *c == '\\' || *c == '/' )
            s = c + 1;
    return s;
}

/**  The preset file a name stands for: Presets/NAME.xml, else the file whose ConfigurationName it is.
 *
 * @param name  A preset name or file stem (case-insensitive). (in)
 *
 * @return
 *   The file's path; empty if there is none.
 **/
QString findPreset( const QString &name )
{
    const QDir    dir( Platform::presetsDir( ".." ) );
    const QString direct = dir.filePath( name + ".xml" );
    if ( QFileInfo::exists( direct ) )
        return direct;
    for ( const QFileInfo &fi : dir.entryInfoList( { QStringLiteral( "*.xml" ) }, QDir::Files ) )
    {
        QFile f( fi.filePath() );
        if ( !f.open( QIODevice::ReadOnly ) )
            continue;
        const QByteArray head = f.read( 8192 );
        const int        at = head.indexOf( "ConfigurationName=\"" );
        if ( at < 0 )
            continue;
        const int from = at + 19, to = head.indexOf( '"', from );
        if ( to > from && QString::fromUtf8( head.mid( from, to - from ) ).compare( name, Qt::CaseInsensitive ) == 0 )
            return fi.filePath();
    }
    return QString();
}

/**  The analysis at a moment of the looped audio.
 *
 * @param blocks     One AudioFeatures per analysis block. (in)
 * @param blockSecs  Length of a block in seconds. (in)
 * @param song       True for a song (its counters go on counting over the loop, every loop is a new track); false
 *                   for silence (one steady block). (in)
 * @param secs       The moment, seconds from the start of the run. (in)
 *
 * @return
 *   The block's features, the counters carried over the loops.
 *
 * The scheduler and the conditioner react to a counter's STEP (a new section, a drop); the song starting over
 * must not step them back.
 **/
AudioFeatures audioAt( const std::vector<AudioFeatures> &blocks, double blockSecs, bool song, double secs )
{
    const long long n = static_cast<long long>( blocks.size() );
    const long long b = static_cast<long long>( secs / blockSecs );
    const long long loop = b / n;
    AudioFeatures   f = blocks[static_cast<size_t>( b % n )];
    if ( song && loop > 0 )
    {
        const AudioFeatures &last = blocks.back();
        f.beatCount += static_cast<int>( loop * last.beatCount );
        f.onsetCount += static_cast<int>( loop * last.onsetCount );
        f.sectionCount += static_cast<int>( loop * last.sectionCount );
        f.dropCount += static_cast<int>( loop * last.dropCount );
        f.trackChangeCount += static_cast<int>( loop * ( last.trackChangeCount + 1 ) );
    }
    return f;
}

/** A scene or combine fade under way, as it began. */
struct Fade
{
    double      start = -1.0;     ///< Virtual seconds when it started; < 0 = none running.
    unsigned    out = 0;          ///< Entry going out.
    unsigned    in = 0;           ///< Entry coming in.
    double      solo = 0.0;       ///< How long the outgoing entry stood alone before it.
    const char *why = "-";        ///< SceneScheduler::changeWhy() (scenes only).
    bool        phrase = false;   ///< SceneScheduler::changeOnPhrase() (scenes only).
    float       hold = 0.f;       ///< SceneScheduler::changeHold() (scenes only).
    float       phraseLeft = 0.f; ///< Seconds to the 8-bar boundary when it started.
    const char *how = "-";        ///< SceneScheduler::nextHow() (scenes only).
    float       planned = 0.f;    ///< The fade's length as planned when it started.
    unsigned    transition = 0;   ///< SceneScheduler::actTransition() (scenes only).
    float       bpm = 0.f;        ///< Tempo when it started (0 without a confident beat).
    float       rhythm = 0.f;     ///< Beat confidence when it started.
};

/** What stands on screen since the last fade ended. */
struct Solo
{
    double since = 0.0;   ///< Virtual seconds when it began.
    float  planned = 0.f; ///< The solo time the scheduler set (SceneScheduler::texFadeDur() in Solo).
    float  timing = 1.f;  ///< The timing scale it was divided by.
    bool   walk = false;  ///< A walking chain lab (its solo is not divided by the timing scale).
};

} // namespace

int runScheduleSim( int argc, char **argv )
{
    double fps = 60.0;
    for ( int i = 4; i + 1 < argc; ++i )
        if ( strcmp( argv[i], "--fps" ) == 0 )
            fps = atof( argv[i + 1] );
    const double hours = argc >= 4 ? atof( argv[2] ) : 0.0;
    if ( argc < 4 || hours <= 0.0 || fps < 10.0 )
    {
        fprintf( stderr, "usage: Kaleidoscope.exe --schedule <preset> <audio.wav|silence> <hours> <out.tsv> "
                         "[--fps N]\n" );
        return 2;
    }
    const QString preset = QString::fromLocal8Bit( argv[0] );
    const QString audio = QString::fromLocal8Bit( argv[1] );
    // The presets and their shaders are found relative to the folder the app is started from (Release on Windows,
    // one below the assets); started from elsewhere, the executable's folder is tried.
    if ( !QDir( Platform::presetsDir( ".." ) ).exists() )
        QDir::setCurrent( QCoreApplication::applicationDirPath() );
    const char    *seed_env = getenv( "KALEIDO_SEED" );
    const unsigned seed = seed_env ? static_cast<unsigned>( strtoul( seed_env, nullptr, 10 ) ) : 1u;
    srand( seed );

    // ---- the audio: a WAV's analysis, or the steady state of silence
    std::vector<AudioFeatures> blocks;
    double                     block_secs = 0.01;
    const bool                 song = audio.compare( QStringLiteral( "silence" ), Qt::CaseInsensitive ) != 0;
    if ( song )
    {
        unsigned rate = 0;
        blocks = AudioAnalyzer::analyzeWavToTimeline( audio, &rate );
        block_secs = rate > 0 ? 480.0 / rate : 0.01;
    }
    else
    {
        const int                        rate = 48000;
        std::vector<float>               zeros( static_cast<size_t>( rate ) * 2 * 30, 0.f );
        const std::vector<AudioFeatures> tl = AudioAnalyzer::analyzeSamples( zeros.data(), rate * 30, 2, rate );
        if ( !tl.empty() )
            blocks.push_back( tl.back() );
    }
    if ( blocks.empty() )
    {
        fprintf( stderr, "schedule: no audio from %s (a 16-bit PCM WAV, or \"silence\")\n", qPrintable( audio ) );
        return 2;
    }

    // ---- the preset, on the virtual clock from the first moment
    EngineClock::startVirtual();
    EngineClock::setVirtualSeconds( 0.0 );
    const QString file = findPreset( preset );
    if ( file.isEmpty() )
    {
        fprintf( stderr, "schedule: no preset %s in %s\n", qPrintable( preset ),
                 qPrintable( Platform::presetsDir( ".." ) ) );
        return 2;
    }
    // Never deleted: the entries' destructors free GL objects, and there is no GL context.
    Configuration  *cfg = new Configuration( file );
    RenderPipeline *rp = cfg->renderPipeline();
    rp->simulateBegin();
    const SceneScheduler              &s = rp->scheduler();
    const std::vector<EffectShader *> &tex = rp->sceneEntries();
    const std::vector<EffectShader *> &fx = rp->fxEntries();
    const std::vector<EffectShader *> &tr = rp->transitionEntries();

    FILE *out = fopen( argv[3], "w" );
    if ( !out )
    {
        fprintf( stderr, "schedule: cannot write %s\n", argv[3] );
        return 2;
    }
    fprintf( out, "# schedule\tpreset=%s\tfile=%s\taudio=%s\thours=%g\tfps=%g\tseed=%u\tsceneFadeMin=%g\tlabShare=%g\n",
             qPrintable( cfg->getConfigurationName() ), qPrintable( QFileInfo( file ).fileName() ),
             song ? qPrintable( QFileInfo( audio ).fileName() ) : "silence", hours, fps, seed, s.sceneFadeMin(),
             s.labShare() );
    for ( unsigned i = 0; i < tex.size(); ++i )
        fprintf( out, "# entry\t%u\t%s\t%u\t%u\t%d\t%d\n", i, fileOf( tex[i]->fragmentName() ).c_str(),
                 tex[i]->minTimeSolo(), tex[i]->maxTimeSolo(), s.isLab( i ) ? 1 : 0, tex[i]->interest() );
    for ( unsigned i = 0; i < tr.size(); ++i )
        fprintf( out, "# transition\t%u\t%s\t%g\n", i, fileOf( tr[i]->fragmentName() ).c_str(), tr[i]->minFade() );
    fputs( "kind\tstart\tscene\tnext\twhy\tphrase\thow\tsolo_planned\tsolo\ttiming\twalk\tfade_planned\tfade\t"
           "transition\tbpm\trhythm\thold\tphrase_left\n",
           out );

    // ---- the run
    const float     dt = static_cast<float>( 1.0 / fps );
    const long long frames = static_cast<long long>( std::llround( hours * 3600.0 * fps ) );
    Solo            solo, fx_solo;
    solo.planned = s.texFadeDur();
    Fade                       fade, fx_fade;
    int                        tex_state = s.texState(), fx_state = s.fxState();
    long long                  scenes = 0, combines = 0;
    std::map<std::string, int> whys;
    for ( long long k = 1; k <= frames; ++k )
    {
        const double t = static_cast<double>( k ) / fps;
        EngineClock::setVirtualSeconds( t );
        const SceneScheduler::Tick tick = rp->simulateFrame( audioAt( blocks, block_secs, song, t ), dt );
        const float bpm = tick.rhythmStrength > 0.55f && tick.estimatedBPM > 0.004f ? 40.f + 160.f * tick.estimatedBPM
                                                                                    : 0.f;
        if ( k == 1 )
            solo.walk = tex[s.actTexture()]->walksWithMusic(); // the first scene decided it in its first frame
        if ( tex_state == 0 && s.texState() != 0 )
        {
            fade.start = t;
            fade.out = s.actTexture();
            fade.in = s.nextTexture();
            fade.solo = t - solo.since;
            fade.why = s.changeWhy();
            fade.phrase = s.changeOnPhrase();
            fade.hold = s.changeHold();
            fade.phraseLeft = tick.phraseSecsLeft;
            fade.how = s.nextHow();
            fade.planned = s.texFadeDur();
            fade.transition = s.actTransition();
            fade.bpm = bpm;
            fade.rhythm = tick.rhythmStrength;
        }
        else if ( tex_state != 0 && s.texState() == 0 && fade.start >= 0.0 )
        {
            fprintf( out,
                     "scene\t%.3f\t%s\t%s\t%s\t%d\t%s\t%.3f\t%.3f\t%.4f\t%d\t%.3f\t%.3f\t%s\t%.1f\t%.2f\t%.2f\t%.2f\n",
                     fade.start, fileOf( tex[fade.out]->fragmentName() ).c_str(),
                     fileOf( tex[fade.in]->fragmentName() ).c_str(), fade.why, fade.phrase ? 1 : 0, fade.how,
                     solo.planned, fade.solo, solo.timing, solo.walk ? 1 : 0, fade.planned, t - fade.start,
                     fade.transition < tr.size() ? fileOf( tr[fade.transition]->fragmentName() ).c_str() : "-",
                     fade.bpm, fade.rhythm, fade.hold, fade.phraseLeft );
            ++scenes;
            ++whys[fade.why];
            fade.start = -1.0;
            solo.since = t;
            solo.planned = s.texFadeDur();
            solo.timing = tick.timingScale;
            solo.walk = tex[s.actTexture()]->walksWithMusic();
        }
        if ( fx_state == 0 && s.fxState() != 0 )
        {
            fx_fade.start = t;
            fx_fade.out = s.actFx();
            fx_fade.in = s.nextFx();
            fx_fade.solo = t - fx_solo.since;
        }
        else if ( fx_state != 0 && s.fxState() == 0 && fx_fade.start >= 0.0 )
        {
            fprintf( out, "fx\t%.3f\t%s\t%s\t-\t0\t-\t-\t%.3f\t-\t0\t-\t%.3f\t-\t%.1f\t%.2f\t-\t-\n", fx_fade.start,
                     fileOf( fx[fx_fade.out]->fragmentName() ).c_str(),
                     fileOf( fx[fx_fade.in]->fragmentName() ).c_str(), fx_fade.solo, t - fx_fade.start, bpm,
                     tick.rhythmStrength );
            ++combines;
            fx_fade.start = -1.0;
            fx_solo.since = t;
        }
        tex_state = s.texState();
        fx_state = s.fxState();
        if ( k % static_cast<long long>( 3600.0 * fps ) == 0 )
        {
            fprintf( stderr, "schedule: %.0f h of %g, %lld scene changes\n", t / 3600.0, hours, scenes );
            fflush( out );
        }
    }
    fclose( out );

    std::string why_list;
    for ( const auto &w : whys )
        why_list += " " + w.first + "=" + std::to_string( w.second );
    printf( "schedule %s, %s, %g h: %lld scene changes (%.1f an hour;%s), %lld combine changes -> %s\n",
            qPrintable( cfg->getConfigurationName() ), song ? qPrintable( QFileInfo( audio ).fileName() ) : "silence",
            hours, scenes, scenes / hours, why_list.c_str(), combines, argv[3] );
    return 0;
}
