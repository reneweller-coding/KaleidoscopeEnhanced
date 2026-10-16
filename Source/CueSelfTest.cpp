/*****************************************************************************\
 *                              CueSelfTest
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  `Kaleidoscope.exe -q`: the score-cue receiver checked without a window, a sound card or a generator -- and the
 *  building blocks of a show that runs for days (LongRunVariety.h: scene memory, lab clock, class novelty), the
 *  harmonic change end to end (a synthetic chord change through the analyzer and the app's conditioning) and the
 *  video export's frame clock and command line (coreclock.h, VideoExport.h).
 *
 *  The datagrams below are written out byte by byte from the OSC 1.0 specification -- address string
 *  terminated and padded with nulls to a multiple of four, then the type tag string beginning with a
 *  comma, then big-endian arguments -- and not copied from anything Phosphene produced. That is what
 *  makes them an oracle: if the decoder agrees with a hand-built message, the two programs agree
 *  about the format, whereas a round trip through one encoder and its own decoder would prove only
 *  that they are consistently wrong. The malformed cases matter just as much: a receiver that
 *  shrugs at bad padding is how two programs drift apart for a year without noticing.
 *
 *  @author René Weller
 */

#include "CueReceiver.h"
#include "LongRunVariety.h"
#include "MidiInput.h"
#include "AudioAnalyzer.h"
#include "AudioConditioner.h"
#include "RenderPipeline.h"
#include "SettingsFile.h"
#include "VideoExport.h"
#include "coreclock.h"

#include <QtCore/QCoreApplication>
#include <QtCore/QDir>
#include <QtCore/QElapsedTimer>
#include <QtCore/QFile>
#include <QtCore/QSettings>
#include <QtCore/QTemporaryDir>
#include <QtNetwork/QHostAddress>
#include <QtNetwork/QUdpSocket>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <string>
#include <thread>
#include <vector>

namespace
{

int g_passed = 0; ///< Checks that passed.
int g_failed = 0; ///< Checks that failed.

/**  Records one check; failures always print, passes print too (there are few of them).
 *
 * @param ok      Whether the check passed. (in)
 * @param what    What was checked, as printed. (in)
 * @param detail  Optional extra text printed after the description. (in)
 **/
void check( bool ok, const char *what, const std::string &detail = std::string() )
{
    if ( ok )
        ++g_passed;
    else
        ++g_failed;
    printf( "  [%s] %s%s%s\n", ok ? " ok " : "FAIL", what,
            detail.empty() ? "" : "  -- ", detail.c_str() );
}

/**  An OSC string: the text, its terminator, then nulls up to the next multiple of four.
 *
 * @param b  The message being built; receives the string. (out)
 * @param s  The text. (in)
 **/
void putString( std::vector<char> &b, const char *s )
{
    const size_t n = strlen( s ) + 1;
    b.insert( b.end(), s, s + n );
    while ( b.size() & 3 )
        b.push_back( 0 );
}

/**  A big-endian int32.
 *
 * @param b  The message being built; receives the four bytes. (out)
 * @param v  The value. (in)
 **/
void putInt( std::vector<char> &b, int v )
{
    const unsigned u = static_cast<unsigned>( v );
    b.push_back( static_cast<char>( ( u >> 24 ) & 0xFF ) );
    b.push_back( static_cast<char>( ( u >> 16 ) & 0xFF ) );
    b.push_back( static_cast<char>( ( u >> 8 ) & 0xFF ) );
    b.push_back( static_cast<char>( u & 0xFF ) );
}

/**  A big-endian float32.
 *
 * @param b  The message being built; receives the four bytes. (out)
 * @param v  The value. (in)
 **/
void putFloat( std::vector<char> &b, float v )
{
    int bits;
    memcpy( &bits, &v, 4 );
    putInt( b, bits );
}

/**  `/phos/bar i` and `/phos/beat i`.
 *
 * @param address  The OSC address, e.g. "/phos/bar". (in)
 * @param value    The integer argument. (in)
 *
 * @return
 *   The encoded datagram.
 **/
std::vector<char> intMessage( const char *address, int value )
{
    std::vector<char> b;
    putString( b, address );
    putString( b, ",i" );
    putInt( b, value );
    return b;
}

/**  `/phos/section s f`.
 *
 * @param type    The section name. (in)
 * @param energy  The section's energy, 0..1. (in)
 *
 * @return
 *   The encoded datagram.
 **/
std::vector<char> sectionMessage( const char *type, float energy )
{
    std::vector<char> b;
    putString( b, "/phos/section" );
    putString( b, ",sf" );
    putString( b, type );
    putFloat( b, energy );
    return b;
}

/**  `/phos/key s`.
 *
 * @param key  The key name, e.g. "F# Phrygian". (in)
 *
 * @return
 *   The encoded datagram.
 **/
std::vector<char> keyMessage( const char *key )
{
    std::vector<char> b;
    putString( b, "/phos/key" );
    putString( b, ",s" );
    putString( b, key );
    return b;
}

/**  `/phos/drop` -- no arguments, but still a type tag string.
 *
 * @return
 *   `/phos/drop` -- no arguments, but still a type tag string.
 **/
std::vector<char> dropMessage()
{
    std::vector<char> b;
    putString( b, "/phos/drop" );
    putString( b, "," );
    return b;
}

/**  A message of any shape the dialects use: the tags, then one string (if 's' is among them) and the numbers in
 * order.
 *
 * @param address  The OSC address. (in)
 * @param tags     The type tag string, starting with ','. (in)
 * @param text     The string argument, used for every 's'. (in)
 * @param i        The integer argument, used for every 'i'. (in)
 * @param f        The float argument, used for every 'f'. (in)
 *
 * @return
 *   The encoded datagram.
 **/
std::vector<char> dialectMessage( const char *address, const char *tags, const char *text, int i, float f )
{
    std::vector<char> b;
    putString( b, address );
    putString( b, tags );
    for ( const char *t = tags + 1; *t != 0; ++t )
    {
        if ( *t == 's' )
            putString( b, text );
        else if ( *t == 'i' )
            putInt( b, i );
        else if ( *t == 'f' )
            putFloat( b, f );
    }
    return b;
}

/**  Runs a built datagram through the real decoder.
 *
 * @param b    The datagram. (in)
 * @param out  Receives the decoded cue. (out)
 *
 * @return
 *   What decodeScoreCue() returns.
 **/
bool decodes( const std::vector<char> &b, ScoreCue &out )
{
    return decodeScoreCue( b.data(), static_cast<int>( b.size() ), out );
}

/**  A tick with values that are all distinct, so a field that is silently overwritten shows up.
 *
 * @return
 *   A tick with values that are all distinct, so a field that is silently overwritten shows up.
 **/
SceneScheduler::Tick sampleTick()
{
    SceneScheduler::Tick t{};
    t.dt = 0.0166f;
    t.downbeatTick = true;
    t.gateSmooth = 0.81f;
    t.timingScale = 1.23f;
    t.pinned = false;
    t.harmonicChange = 0.42f;
    t.musicPresence = 0.93f;
    t.sectionCount = 17;
    t.sectionId = 5;
    t.sectionKnown = true;
    t.dropCount = 4;
    t.rhythmStrength = 0.66f;
    t.estimatedBPM = 0.55f;
    t.logAttackTime = 0.31f;
    t.buildUp = 0.22f;
    t.phraseSecsLeft = 7.5f;
    return t;
}

/**  Decodes a capture file and prints one line per message, then stops.
 *
 * @param path  The capture file. (in)
 *
 * @return
 *   0 when every record decoded, 1 otherwise.
 *
 * `KALEIDO_CUE_DECODE=<file>` turns `-q` into exactly that and nothing else. The file is a sequence
 * of records, each a big-endian 32-bit length followed by that many bytes -- datagrams as they came
 * off the wire. It exists so that THE BYTES THE GENERATOR REALLY SENT can be put through THIS
 * decoder, rather than through a hand-built imitation of them: the checker on the Phosphene side
 * (Tools/cue_check.py) captures a run, decodes it with its own Python decoder, and compares that
 * with what this prints. Three decoders, one set of bytes, no shared code between any of them.
 **/
int decodeCapture( const char *path )
{
    FILE *f = fopen( path, "rb" );
    if ( f == nullptr )
    {
        fprintf( stderr, "cue capture: cannot open %s\n", path );
        return 1;
    }
    int bad = 0, good = 0;
    for ( ;; )
    {
        unsigned char header[4];
        if ( fread( header, 1, 4, f ) != 4 )
            break;
        const int size = ( header[0] << 24 ) | ( header[1] << 16 ) | ( header[2] << 8 ) | header[3];
        if ( size <= 0 || size > 4096 )
            break;
        std::vector<char> buf( static_cast<size_t>( size ) );
        if ( fread( buf.data(), 1, static_cast<size_t>( size ), f ) != static_cast<size_t>( size ) )
            break;
        ScoreCue c;
        if ( !decodeScoreCue( buf.data(), size, c ) )
        {
            printf( "bad\n" );
            ++bad;
            continue;
        }
        ++good;
        switch ( c.kind )
        {
            case ScoreCue::KindE::BEAT: printf( "beat %d\n", c.index ); break;
            case ScoreCue::KindE::BAR: printf( "bar %d\n", c.index ); break;
            case ScoreCue::KindE::SECTION: printf( "section %s %.4f\n", c.text, c.energy ); break;
            case ScoreCue::KindE::KEY: printf( "key %s %d\n", c.text, c.keyPc ); break;
            default: printf( "drop\n" ); break;
        }
    }
    fclose( f );
    fprintf( stderr, "cue capture: %d decoded, %d refused\n", good, bad );
    return bad == 0 && good > 0 ? 0 : 1;
}

/**  The building blocks of a show that runs for days (LongRunVariety.h): the scene memory, the lab clock, the novelty
 * of a class and the walk's range.
 *
 * The lab clock is run over two simulated days with hand-made scenes of 50..110 s and lab stays of ten minutes:
 * the share it keeps must land on the share asked for, and two labs must never follow each other.
 **/
void longRunChecks()
{
    printf( "\nlong runs (LongRunVariety.h)\n" );

    RecentScenes r;
    r.setCapacity( 3 );
    for ( const char *n : { "a", "b", "c", "d" } )
        r.push( n );
    check( r.size() == 3 && !r.contains( "a" ) && r.contains( "b" ) && r.contains( "d" ),
           "the scene memory holds its capacity and lets the oldest go" );
    r.assign( { "a", "b", "a" } );
    r.push( "c" );
    const std::vector<std::string> kept = r.names();
    check( kept == std::vector<std::string>( { "b", "a", "c" } ) && r.contains( "a" ),
           "a scene shown twice stays in while its newer showing does" );
    r.setCapacity( 2 );
    r.assign( { "x", "", "y", "z" } );
    check( r.names() == std::vector<std::string>( { "y", "z" } ) && !r.contains( "x" ),
           "a stored memory is trimmed from its old end, empty names skipped" );
    r.setCapacity( 0 );
    r.push( "q" );
    check( r.size() == 0 && !r.contains( "q" ), "a memory of capacity 0 holds nothing" );

    LabShareClock clock;
    check( !clock.wantLab( false, 0.f ), "without a share the labs are never called for" );
    clock.setTarget( 1.f );
    check( clock.wantLab( true, 0.9f ), "at a share of 1 always a lab, even after one" );
    clock.setTarget( 0.35f );
    check( clock.wantLab( false, 0.2f ) && !clock.wantLab( false, 0.5f ),
           "before any time is booked the dice decide, at the share asked for" );
    check( !clock.wantLab( true, 0.f ), "never two labs in a row" );

    // Two days: a lab stays ten minutes, a hand-made scene 50..110 s (a fixed LCG, so the run is the same every time).
    unsigned int lcg = 12345u;
    auto         uni = [&lcg]()
    {
        lcg = lcg * 1664525u + 1013904223u;
        return static_cast<float>( lcg >> 8 ) / 16777216.f;
    };
    bool  lab = false, twice = false;
    float lab_secs = 0.f, all_secs = 0.f;
    while ( all_secs < 48.f * 3600.f )
    {
        const bool next = clock.wantLab( lab, uni() );
        twice = twice || ( lab && next );
        lab = next;
        const float secs = lab ? 600.f : 50.f + 60.f * uni();
        clock.add( secs, lab );
        all_secs += secs;
        lab_secs += lab ? secs : 0.f;
    }
    const float share = lab_secs / all_secs;
    check( share > 0.33f && share < 0.37f && !twice, "over two days the labs get the share asked for (35 %)",
           std::to_string( static_cast<int>( share * 1000.f + 0.5f ) / 10.f ).substr( 0, 4 ) + " %" );

    LabShareClock decay;
    decay.add( 3.f * 3600.f, true );
    decay.add( 3.f * 3600.f, false );
    check( decay.share() > 0.26f && decay.share() < 0.28f,
           "the clock follows the last hours: three hours of labs, then three without, read as 27 %" );

    check( classNovelty( -1.0 ) == 1.f && classNovelty( 0.0 ) == 0.2f
               && classNovelty( 3.0 * 3600.0 ) > 0.59f && classNovelty( 3.0 * 3600.0 ) < 0.61f
               && classNovelty( 6.0 * 3600.0 ) == 1.f && classNovelty( 30.0 * 3600.0 ) == 1.f,
           "a class seen just now weighs 0.2, after three hours 0.6, after six (or never seen) 1" );

    check( walkTarget( 0.5f, 0.f, 0.6f ) > 0.29f && walkTarget( 0.5f, 0.f, 0.6f ) < 0.31f
               && walkTarget( -1.f, 0.2f, 0.4f ) == 0.2f && walkTarget( 2.f, 0.f, 1.f ) == 0.999f
               && walkTarget( 0.5f, 0.4f, 0.4f ) == 0.4f,
           "a walk target lands in the entry's range, never past the last class" );
}

/**  The harmonic change, end to end: a held chord must stay quiet, a chord change must swell and advance the harmony.
 *
 * From 16.10.2026 until it was found, the detector measured 10-ms steps of a smoothed chroma and never passed 0.17,
 * so no scene and no lab reacted to harmony -- silently.  A synthetic pad (C major held for 12 s, then F# major) goes
 * through the analyzer and the app's conditioning; the numbers are the ones Tools/make_chord_wav.py calibrated.
 **/
void harmonyChecks()
{
    printf( "\nharmony (AudioAnalyzer HCDF, AudioConditioner)\n" );
    const int          rate = 48000;
    const int          frames = rate * 18;
    std::vector<float> pcm( static_cast<size_t>( frames ), 0.f );
    const int          am[5] = { 48, 52, 55, 60, 64 }; // C major: C3 E3 G3 C4 E4
    const int          fm[5] = { 42, 49, 54, 58, 61 }; // F# major, not one tone shared: F#2 C#3 F#3 A#3 C#4
    for ( int i = 0; i < frames; ++i )
    {
        const double t = static_cast<double>( i ) / rate;
        const int   *ch = t < 12.0 ? am : fm;
        double       v = 0.0;
        for ( int k = 0; k < 5; ++k )
        {
            const double f = 440.0 * std::pow( 2.0, ( ch[k] - 69 ) / 12.0 );
            for ( int h = 1; h <= 3; ++h )
                v += 0.05 / h * std::sin( 6.283185307 * f * h * t );
        }
        pcm[static_cast<size_t>( i )] = static_cast<float>( v );
    }
    const std::vector<AudioFeatures> tl = AudioAnalyzer::analyzeSamples( pcm.data(), frames, 1, rate );
    AudioConditioner                 cond;
    AudioConditioner::Context        ctx;
    float held_raw = 0.f, change_raw = 0.f, change_env = 0.f, adv_held = 0.f, adv_change = 0.f;
    float                            adv_at_held = 0.f, adv_at_change = 0.f;
    for ( size_t i = 0; i < tl.size(); ++i )
    {
        const float         t = static_cast<float>( i ) * 0.01f;
        const AudioFeatures c = cond.update( tl[i], 0.01f, ctx );
        if ( t > 3.f && t < 11.8f )
            held_raw = std::max( held_raw, tl[i].harmonicChange );
        if ( t > 12.f && t < 14.f )
        {
            change_raw = std::max( change_raw, tl[i].harmonicChange );
            change_env = std::max( change_env, c.harmonicChange );
        }
        if ( t <= 3.f )
            adv_at_held = c.harmAdvance;
        if ( t <= 11.8f )
        {
            adv_held = c.harmAdvance - adv_at_held;
            adv_at_change = c.harmAdvance;
        }
        if ( t <= 16.f )
            adv_change = c.harmAdvance - adv_at_change;
    }
    check( held_raw < 0.3f, "a held chord stays under the floor of the harmonic change",
           "peak " + std::to_string( held_raw ).substr( 0, 5 ) );
    check( change_raw > 0.5f && change_env > 0.4f, "a chord change (C -> F#) swells the harmonic change",
           "raw " + std::to_string( change_raw ).substr( 0, 5 ) + ", envelope "
               + std::to_string( change_env ).substr( 0, 5 ) );
    check( adv_held < 0.1f && adv_change > 0.5f && adv_change < 2.f,
           "the harmony's advance stands while the chord holds and steps on by about 1 at the change",
           std::to_string( adv_held ).substr( 0, 5 ) + " / " + std::to_string( adv_change ).substr( 0, 5 ) );
}

/**  A synthetic drum track: a kick (decaying 55 Hz thump plus a click) every half second, over a 1320-Hz tone.
 *
 * @param rate     Sample rate in Hz. (in)
 * @param seconds  Length in seconds. (in)
 *
 * @return
 *   Mono samples.
 **/
std::vector<float> drumTrack( int rate, double seconds )
{
    std::vector<float> pcm( static_cast<size_t>( rate * seconds ), 0.f );
    for ( size_t i = 0; i < pcm.size(); ++i )
    {
        const double t = static_cast<double>( i ) / rate;
        const double k = std::fmod( t, 0.5 );
        double       v = 0.15 * std::sin( 6.283185307 * 1320.0 * t );
        v += 0.8 * std::exp( -k * 18.0 ) * std::sin( 6.283185307 * 55.0 * k );
        if ( k < 0.004 )
            v += 0.5 * ( ( ( i * 2654435761u ) >> 16 ) % 2000 / 1000.0 - 1.0 );
        pcm[i] = static_cast<float>( v );
    }
    return pcm;
}

/**  The input stage and the events (16.10.2026): one-block events that a frame reader missed, silence that never
 * reached the analysis, 5.1 read with the stride of stereo, 96 kHz, broken samples, a conditioner gone NaN.
 *
 * Each check shows the old way failing beside the new one passing, where the old way can still be run.
 **/
void inputChecks()
{
    printf( "\ninput stage and events (AudioAnalyzer::ingest, AudioEventLatch)\n" );
    const int                rate = 48000, block = 480;
    const std::vector<float> drums = drumTrack( rate, 8.0 );

    // 1. A reader that looks every second block (blocks come in bursts) against every event the analyzer saw.
    {
        AudioAnalyzer   az;
        AudioEventLatch latch;
        int             truth = 0, raw_seen = 0, latched = 0, nblocks = 0;
        for ( size_t at = 0; at + block <= drums.size(); at += block, ++nblocks )
        {
            az.feedBlock( drums.data() + at, block, 1, rate );
            AudioFeatures f = az.getFeatures();
            if ( f.onsetStrength > 0.f && nblocks > 1 ) // after the reader's first look (the latch's start)
                ++truth;
            if ( nblocks % 2 == 1 ) // the reader's turn
            {
                if ( f.onsetStrength > 0.f )
                    ++raw_seen;
                latch.apply( f );
                if ( f.onsetStrength > 0.f )
                    ++latched;
            }
        }
        check( truth >= 6 && latched == truth && raw_seen < truth,
               "a reader every second block sees every onset through the counters (the one-block flag lost some)",
               std::to_string( latched ) + " of " + std::to_string( truth ) + ", the flag alone "
                   + std::to_string( raw_seen ) );
    }

    // 2. Music, a 4-s pause, music: fed as silence the pause arms the track-change detector; skipped (as the
    //    capture loop did with SILENT packets) it never does. (Up to 3 s it is a DJ stop by design, not a new track.)
    for ( int skip = 0; skip < 2; ++skip )
    {
        AudioAnalyzer            az;
        AudioEventLatch          latch;
        const std::vector<float> zeros( block, 0.f );
        int                      changes = 0;
        auto                     feed = [&]( const float *d )
        {
            az.feedBlock( d, block, 1, rate );
            AudioFeatures f = az.getFeatures();
            latch.apply( f );
            if ( f.trackChange )
                ++changes;
        };
        for ( size_t at = 0; at + block <= drums.size() / 2; at += block )
            feed( drums.data() + at );
        if ( !skip )
            for ( int b = 0; b < 400; ++b ) // 4 s pause
                feed( zeros.data() );
        for ( size_t at = drums.size() / 2; at + block <= drums.size(); at += block )
            feed( drums.data() + at );
        if ( skip )
            check( changes == 0, "a pause that never reaches the analysis is no track change (the old capture loop)",
                   std::to_string( changes ) + " change(s)" );
        else
            check( changes == 1, "a pause fed as silence makes the restart a new track", std::to_string( changes ) );
    }

    // 3. 5.1: the music on front left/right, the rest silent -- the same as stereo once mixed down; read with
    //    the stride of stereo (the old capture loop) it was the music three times slower among zeros.
    {
        const int          frames = block;
        std::vector<float> st( static_cast<size_t>( frames ) * 2 ), six( static_cast<size_t>( frames ) * 6 );
        AudioAnalyzer      a_st, a_six, a_old;
        for ( size_t at = 0; at + frames <= drums.size(); at += frames )
        {
            for ( int i = 0; i < frames; ++i )
            {
                const float v = drums[at + i];
                st[i * 2] = st[i * 2 + 1] = v;
                for ( int c = 0; c < 6; ++c )
                    six[i * 6 + c] = c < 2 ? v : 0.f;
            }
            a_st.feedBlock( st.data(), frames, 2, rate );
            a_six.feedBlock( six.data(), frames, 6, rate );
            a_old.feedBlock( six.data(), frames, 2, rate ); // what processBlock( src, frames, min( 6, 2 ) ) read
        }
        const AudioFeatures fr = a_st.getFeatures(), fn = a_six.getFeatures(), fo = a_old.getFeatures();
        auto                bpm = []( const AudioFeatures &f )
        { return 40.f + 160.f * f.estimatedBPM; };
        check( std::fabs( fn.spectralCentroid - fr.spectralCentroid ) < 0.01f
                   && std::fabs( bpm( fn ) - bpm( fr ) ) < 1.f
                   && ( std::fabs( fo.spectralCentroid - fr.spectralCentroid ) > 0.02f
                        || std::fabs( bpm( fo ) - bpm( fr ) ) > 5.f ),
               "5.1 is mixed down to the stereo picture (read as stereo it was not)",
               "centroid/tempo stereo " + std::to_string( fr.spectralCentroid ).substr( 0, 5 ) + "/"
                   + std::to_string( bpm( fr ) ).substr( 0, 5 ) + ", 5.1 "
                   + std::to_string( fn.spectralCentroid ).substr( 0, 5 ) + "/"
                   + std::to_string( bpm( fn ) ).substr( 0, 5 ) + ", 5.1 read as stereo "
                   + std::to_string( fo.spectralCentroid ).substr( 0, 5 ) + "/"
                   + std::to_string( bpm( fo ) ).substr( 0, 5 ) );
    }

    // 4. 96 kHz: decimated to 48 kHz, the analysis sees what it sees at 48 kHz.
    {
        const std::vector<float> d96 = drumTrack( 96000, 8.0 );
        AudioAnalyzer            a48, a96;
        for ( size_t at = 0; at + block <= drums.size(); at += block )
            a48.feedBlock( drums.data() + at, block, 1, rate );
        for ( size_t at = 0; at + 2 * block <= d96.size(); at += 2 * block )
            a96.feedBlock( d96.data() + at, 2 * block, 1, 96000 );
        const AudioFeatures f48 = a48.getFeatures(), f96 = a96.getFeatures();
        check( std::fabs( f48.spectralCentroid - f96.spectralCentroid ) < 0.03f
                   && std::fabs( f48.estimatedBPM - f96.estimatedBPM ) < 0.02f,
               "96 kHz is analysed like 48 kHz (decimated)",
               "centroid " + std::to_string( f48.spectralCentroid ).substr( 0, 5 ) + " / "
                   + std::to_string( f96.spectralCentroid ).substr( 0, 5 ) + ", tempo "
                   + std::to_string( 40.f + 160.f * f48.estimatedBPM ).substr( 0, 5 ) + " / "
                   + std::to_string( 40.f + 160.f * f96.estimatedBPM ).substr( 0, 5 ) );
    }

    // 5. Broken samples: NaN and infinity in the stream leave every feature finite.
    {
        AudioAnalyzer      az;
        std::vector<float> bad( drums.begin(), drums.begin() + rate * 2 );
        for ( size_t i = 0; i < bad.size(); i += 97 )
            bad[i] = ( i / 97 ) % 2 ? std::numeric_limits<float>::quiet_NaN() : std::numeric_limits<float>::infinity();
        for ( size_t at = 0; at + block <= bad.size(); at += block )
            az.feedBlock( bad.data() + at, block, 1, rate );
        const AudioFeatures f = az.getFeatures();
        check( std::isfinite( f.overallLevel ) && std::isfinite( f.spectralCentroid ) && std::isfinite( f.bassLevel )
                   && std::isfinite( f.harmonicChange ) && std::isfinite( f.spectralFlux ),
               "NaN and infinity in the input leave the features finite" );
    }

    // 6. The conditioner: odd frame times keep it finite and its advances monotonic; a NaN fed in is noticed, and a
    //    reset brings it back.
    {
        AudioConditioner          cond;
        AudioConditioner::Context ctx;
        AudioAnalyzer             az;
        bool                      finite = true, monotonic = true;
        float                     adv = -1.f, harm = -1.f;
        const float               dts[] = { 0.f, 0.1f, 5.f, 0.0083f, 0.f, 0.042f };
        int                       step = 0;
        for ( size_t at = 0; at + block <= drums.size(); at += block, ++step )
        {
            az.feedBlock( drums.data() + at, block, 1, rate );
            ctx.globalTime += 0.01f;
            const AudioFeatures c = cond.update( az.getFeatures(), dts[step % 6], ctx );
            finite = finite && !AudioConditioner::firstNonFinite( c );
            monotonic = monotonic && c.audioAdvance >= adv && c.harmAdvance >= harm;
            adv = c.audioAdvance;
            harm = c.harmAdvance;
        }
        check( finite && monotonic,
               "frame times of 0, 0.1 and 5 s keep the conditioner finite and its advances monotonic" );
        AudioFeatures poison = az.getFeatures();
        poison.overallLevel = std::numeric_limits<float>::quiet_NaN();
        poison.harmonicChange = std::numeric_limits<float>::quiet_NaN();
        const AudioFeatures p1 = cond.update( poison, 0.01f, ctx );
        const char         *bad = AudioConditioner::firstNonFinite( p1 );
        cond.reset();
        const AudioFeatures p2 = cond.update( az.getFeatures(), 0.01f, ctx );
        check( bad && !AudioConditioner::firstNonFinite( p2 ),
               "a NaN that reaches the conditioner is caught, and a reset brings it back",
               std::string( "caught in " ) + ( bad ? bad : "nothing" ) );
    }
}

/**  Circular distance of two hues.
 *
 * @param a  A hue in turns. (in)
 * @param b  Another hue in turns. (in)
 *
 * @return
 *   Their distance on the circle, 0..0.5 turns.
 **/
float hueDistance( float a, float b )
{
    const float d = std::fabs( a - b ) - std::floor( std::fabs( a - b ) );
    return std::min( d, 1.f - d );
}

/**  The picture's continuity (16.10.2026): the cube budget against the panel's rate and gliding, the stage lamps'
 * chase gliding, the key's hue on the circle of fifths.
 **/
void outputChecks()
{
    printf( "\noutput and continuity (RenderPipeline::stepCubeBudget, AudioConditioner chase, chroma hue)\n" );

    // 1. The cube budget on a 50-Hz panel: 5 s at 50 fps, 3 s of a struggling GPU at 20 fps, 6 s at 50 fps again.
    //    The old fixed thresholds (45/57 fps, a jump) are run beside it.
    {
        RenderPipeline::CubeBudgetClock clk;
        float                           budget = 1.f, low = 1.f, max_step = 0.f, old_budget = 1.f, old_ema = 60.f;
        auto                            run = [&]( float fps, float seconds )
        {
            for ( float t = 0.f; t < seconds; t += 1.f / fps )
            {
                const float next = RenderPipeline::stepCubeBudget( budget, clk, 1.f / fps, 50.f );
                max_step = std::max( max_step, std::fabs( next - budget ) * fps );
                budget = next;
                low = std::min( low, budget );
                old_ema += 0.05f * ( fps - old_ema );
                if ( old_ema < 45.f && old_budget > 0.75f )
                    old_budget = 0.5f;
                else if ( old_ema > 57.f && old_budget < 0.75f )
                    old_budget = 1.f;
            }
        };
        run( 50.f, 5.f );
        const float before = budget;
        run( 20.f, 3.f );
        run( 50.f, 6.f );
        check( before == 1.f && low <= 0.5f && budget == 1.f && old_budget == 0.5f,
               "on a 50-Hz panel the cube budget drops under load and comes back (the fixed 57 fps never did)",
               "low " + std::to_string( low ).substr( 0, 4 ) + ", after " + std::to_string( budget ).substr( 0, 4 )
                   + ", the old way after " + std::to_string( old_budget ).substr( 0, 4 ) );
        check( max_step <= 0.5001f, "the cube budget glides, half its range per second at most",
               std::to_string( max_step ).substr( 0, 5 ) + " per second" );

        RenderPipeline::CubeBudgetClock clk30;
        float                           b30 = 1.f;
        for ( int i = 0; i < 300; ++i )
            b30 = RenderPipeline::stepCubeBudget( b30, clk30, 1.f / 30.f, 30.f );
        check( b30 == 1.f, "a 30-Hz panel running at its 30 fps keeps all cubes (45 fps fixed halved them)" );
    }

    // The trails and the simulations step by the frame time, in frames at 120 Hz (their tuning).
    check( std::fabs( RenderPipeline::liveFrames( 1.f / 120.f ) - 1.f ) < 1e-5f
               && std::fabs( RenderPipeline::liveFrames( 1.f / 60.f ) - 2.f ) < 1e-5f
               && std::fabs( RenderPipeline::liveFrames( 1.f / 144.f ) - 0.8333f ) < 1e-3f
               && RenderPipeline::liveFrames( 0.f ) == 0.f && RenderPipeline::liveFrames( 1.f ) == 8.f,
           "trails and simulations step by the frame time: 1 at 120 Hz, 2 at 60, 5/6 at 144, none frozen, 8 at most" );

    // 2. The lamps' chase over a drum track: it moves on by a quarter per onset, but never by more than
    //    1.25 turns/s -- stepped, it jumped a quarter turn in one frame.
    {
        const int                        rate = 48000;
        const std::vector<float>         drums = drumTrack( rate, 8.0 );
        const std::vector<AudioFeatures> tl =
            AudioAnalyzer::analyzeSamples( drums.data(), static_cast<int>( drums.size() ), 1, rate );
        AudioConditioner          cond;
        AudioConditioner::Context ctx;
        float                     prev = cond.chasePhase(), max_step = 0.f, travel = 0.f;
        for ( size_t i = 0; i < tl.size(); ++i )
        {
            ctx.globalTime += 0.01f;
            cond.update( tl[i], 0.01f, ctx );
            const float d = hueDistance( cond.chasePhase(), prev );
            max_step = std::max( max_step, d );
            travel += d;
            prev = cond.chasePhase();
        }
        check( travel > 0.5f && max_step <= 0.0126f, "the lamps' chase glides from corner to corner",
               "travelled " + std::to_string( travel ).substr( 0, 4 ) + " turns, at most "
                   + std::to_string( max_step ).substr( 0, 6 ) + " per 10 ms" );
    }

    // 3. I-IV-V (C, F, G major in octave 3, three harmonics each): on the circle of fifths the three hues lie close; on
    // the
    //    chromatic circle (the old mapping, worked out from the same chroma) they spread over half the wheel.
    {
        const int          rate = 48000, frames = rate * 12;
        std::vector<float> pcm( static_cast<size_t>( frames ), 0.f );
        // Octave 3, the bass: there a 2048-point FFT's bin (23 Hz) is wider than a semitone, and the chroma filed
        // the C major triad as C#, F#, A# -- until it got its own 8192-point FFT with interpolated peaks.
        const int chords[3][3] = { { 48, 52, 55 }, { 53, 57, 60 }, { 55, 59, 62 } }; // C, F, G
        for ( int i = 0; i < frames; ++i )
        {
            const double t = static_cast<double>( i ) / rate;
            const int   *ch = chords[std::min( 2, static_cast<int>( t / 4.0 ) )];
            double       v = 0.0;
            for ( int k = 0; k < 3; ++k )
            {
                const double f = 440.0 * std::pow( 2.0, ( ch[k] - 69 ) / 12.0 );
                for ( int h = 1; h <= 3; ++h )
                    v += 0.06 / h * std::sin( 6.283185307 * f * h * t );
            }
            pcm[static_cast<size_t>( i )] = static_cast<float>( v );
        }
        const std::vector<AudioFeatures> tl = AudioAnalyzer::analyzeSamples( pcm.data(), frames, 1, rate );
        float                            hue[3], chromatic[3];
        for ( int c = 0; c < 3; ++c )
        {
            const AudioFeatures &f = tl[std::min( tl.size() - 1, static_cast<size_t>( 390 + 400 * c ) )];
            hue[c] = f.chromaHue;
            float s = 0.f, co = 0.f;
            for ( int i = 0; i < 12; ++i )
            {
                s += f.chroma[i] * std::sin( 6.2831853f * i / 12.f );
                co += f.chroma[i] * std::cos( 6.2831853f * i / 12.f );
            }
            chromatic[c] = std::atan2( s, co ) / 6.2831853f;
        }
        float spread = 0.f, old_spread = 0.f;
        for ( int a = 0; a < 3; ++a )
            for ( int b = a + 1; b < 3; ++b )
            {
                spread = std::max( spread, hueDistance( hue[a], hue[b] ) );
                old_spread = std::max( old_spread, hueDistance( chromatic[a], chromatic[b] ) );
            }
        auto deg = []( float turns )
        { return std::to_string( static_cast<int>( std::lround( turns * 360.f ) ) ); };
        check( spread < 0.21f && old_spread > 0.33f, "I-IV-V keeps the key's hue together (circle of fifths)",
               "C/F/G at " + deg( hue[0] ) + "/" + deg( hue[1] ) + "/" + deg( hue[2] ) + " degrees, spread "
                   + deg( spread ) + "; on the chromatic circle " + deg( old_spread ) );

        // The C major triad in octave 3: its three strongest pitch classes are C, E and G.
        const AudioFeatures &fc = tl[std::min( tl.size() - 1, static_cast<size_t>( 390 ) )];
        int                  top[3] = { -1, -1, -1 };
        for ( int r = 0; r < 3; ++r )
            for ( int i = 0; i < 12; ++i )
                if ( ( r == 0 || i != top[0] ) && ( r < 2 || i != top[1] )
                     && ( top[r] < 0 || fc.chroma[i] > fc.chroma[top[r]] ) )
                    top[r] = i;
        const char      *names[12] = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
        std::vector<int> got( top, top + 3 );
        std::sort( got.begin(), got.end() );
        check( got == std::vector<int>{ 0, 4, 7 }, "a C major triad in octave 3 reads C, E, G (was C#, F#, A#)",
               std::string( names[top[0]] ) + ", " + names[top[1]] + ", " + names[top[2]] );
    }
}

/**  The settings file (16.10.2026): an exit writes back only what the session changed, so an edit in the Setup
 * tool made meanwhile survives; "save as default" writes everything; a file that cannot be written is noticed.
 **/
void settingsChecks()
{
    printf( "\nsettings (SettingsFile.h)\n" );
    QTemporaryDir dir;
    const QString path = dir.path() + "/settings.ini";
    {
        QSettings s( path, QSettings::IniFormat );
        s.setValue( "selftest/trails", 0.75 );
        s.setValue( "selftest/lyricsMode", 2 );
    }
    // The session starts: what it found.
    SettingsFile::remember( "selftest/trails", 0.75 );
    SettingsFile::remember( "selftest/lyricsMode", 2 );
    // While it runs, the Setup tool changes the lyrics mode in the file.
    QSettings( path, QSettings::IniFormat ).setValue( "selftest/lyricsMode", 0 );
    // The session changed the trails; at the exit it writes what it has.
    bool wrote_trails = false, wrote_lyrics = false;
    {
        QSettings s( path, QSettings::IniFormat );
        wrote_trails = SettingsFile::store( s, "selftest/trails", 0.5, false );
        wrote_lyrics = SettingsFile::store( s, "selftest/lyricsMode", 2, false );
    }
    QSettings   after( path, QSettings::IniFormat );
    const int   lyrics = after.value( "selftest/lyricsMode" ).toInt();
    const float trails = after.value( "selftest/trails" ).toFloat();
    check( wrote_trails && !wrote_lyrics && lyrics == 0 && std::fabs( trails - 0.5f ) < 1e-6f,
           "an exit writes what the session changed and keeps the Setup tool's edit",
           "lyricsMode " + std::to_string( lyrics ) + ", trails " + std::to_string( trails ).substr( 0, 4 ) );
    {
        QSettings s( path, QSettings::IniFormat );
        SettingsFile::store( s, "selftest/lyricsMode", 2, true );
    }
    check( QSettings( path, QSettings::IniFormat ).value( "selftest/lyricsMode" ).toInt() == 2,
           "'save as default' writes every key" );

    QFile::setPermissions( path, QFileDevice::ReadOwner );
    QSettings ro( path, QSettings::IniFormat );
    ro.setValue( "selftest/trails", 0.25 );
    ro.sync();
    const QString why = SettingsFile::failure( ro );
    QFile::setPermissions( path, QFileDevice::ReadOwner | QFileDevice::WriteOwner );
    check( !why.isEmpty(), "a settings file that cannot be written is noticed", why.toStdString() );
}

/**  A kick pattern: kicks (the drum track's thump) at the given beat positions of every 4-beat bar, over a tone.
 *
 * @param rate     Sample rate in Hz. (in)
 * @param bpm      Tempo. (in)
 * @param beats    Kick positions in beats within the bar. (in)
 * @param seconds  Length in seconds. (in)
 *
 * @return
 *   Mono samples.
 **/
std::vector<float> kickPattern( int rate, double bpm, const std::vector<double> &beats, double seconds )
{
    std::vector<float> pcm( static_cast<size_t>( rate * seconds ), 0.f );
    const double       spb = 60.0 / bpm;
    for ( size_t i = 0; i < pcm.size(); ++i )
        pcm[i] = static_cast<float>( 0.12 * std::sin( 6.283185307 * 660.0 * static_cast<double>( i ) / rate ) );
    for ( double bar = 0.0; bar * 4.0 * spb < seconds; bar += 1.0 )
        for ( double b : beats )
        {
            const size_t at = static_cast<size_t>( ( bar * 4.0 + b ) * spb * rate );
            for ( size_t k = 0; k < static_cast<size_t>( 0.25 * rate ) && at + k < pcm.size(); ++k )
            {
                const double t = static_cast<double>( k ) / rate;
                double       v = 0.8 * std::exp( -t * 18.0 ) * std::sin( 6.283185307 * 55.0 * t );
                if ( t < 0.004 )
                    v += 0.5 * ( ( ( ( at + k ) * 2654435761u ) >> 16 ) % 2000 / 1000.0 - 1.0 );
                pcm[at + k] += static_cast<float>( v );
            }
        }
    return pcm;
}

/**  The kick tempo (16.10.2026): the period that explains the kick intervals as multiples, not the mean of
 * per-interval BPMs folded into 70-180 -- which read a boom-bap 90 as 110 and a two-step 174 as about 128.
 **/
void rhythmChecks()
{
    printf( "\nkick tempo (AudioAnalyzer::ioiPeriod)\n" );
    const int rate = 48000;
    struct Case
    {
        const char         *name;
        double              bpm;
        std::vector<double> beats;
    };
    const Case cases[] = { { "boom-bap", 90.0, { 0.0, 1.5, 2.5 } },
                           { "two-step", 174.0, { 0.0, 2.5 } },
                           { "four to the floor", 128.0, { 0.0, 1.0, 2.0, 3.0 } } };
    for ( const Case &c : cases )
    {
        const std::vector<float>         pcm = kickPattern( rate, c.bpm, c.beats, 20.0 );
        const std::vector<AudioFeatures> tl =
            AudioAnalyzer::analyzeSamples( pcm.data(), static_cast<int>( pcm.size() ), 1, rate );
        const AudioFeatures &f = tl.back();
        const float          bpm = 40.f + 160.f * f.estimatedBPM;
        check( std::fabs( bpm - static_cast<float>( c.bpm ) ) < 2.f && f.rhythmStrength > 0.5f,
               ( std::string( c.name ) + " " + std::to_string( static_cast<int>( c.bpm ) )
                 + " BPM is read as its tempo, and as a rhythm" )
                   .c_str(),
               std::to_string( bpm ).substr( 0, 5 ) + " BPM, rhythm "
                   + std::to_string( f.rhythmStrength ).substr( 0, 4 ) );
    }
}

/**  The melody's voicing (16.10.2026): drums alone are no melody, a tone is one -- the old pitch was always
 * "there", so the melody ring drew a glissando through every drum break.
 **/
void melodyChecks()
{
    printf( "\nmelody voicing (AudioAnalyzer: melodyConf, melodyNote)\n" );
    const int          rate = 48000, n = rate * 8;
    std::vector<float> drums( static_cast<size_t>( n ), 0.f ), tune( static_cast<size_t>( n ), 0.f );
    unsigned           rng = 2463534242u; // xorshift32: noise (a multiplicative hash of i is a sawtooth -- a tone)
    for ( int i = 0; i < n; ++i )
    {
        const double t = static_cast<double>( i ) / rate, k = std::fmod( t, 0.5 );
        double       v = 0.8 * std::exp( -k * 18.0 ) * std::sin( 6.283185307 * 55.0 * k );
        // a snare on the off-beat: noise, decaying
        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        const double s = std::fmod( t + 0.25, 0.5 );
        v += 0.35 * std::exp( -s * 20.0 ) * ( ( rng >> 8 ) / 8388608.0 - 1.0 );
        drums[static_cast<size_t>( i )] = static_cast<float>( v );
        // a tune: a note every half second, A4 C5 E5 G5, three harmonics
        const int    notes[4] = { 69, 72, 76, 79 };
        const double f = 440.0 * std::pow( 2.0, ( notes[static_cast<int>( t / 0.5 ) % 4] - 69 ) / 12.0 );
        double       u = 0.0;
        for ( int h = 1; h <= 3; ++h )
            u += 0.15 / h * std::sin( 6.283185307 * f * h * t );
        tune[static_cast<size_t>( i )] = static_cast<float>( u );
    }
    const std::vector<AudioFeatures> td = AudioAnalyzer::analyzeSamples( drums.data(), n, 1, rate );
    const std::vector<AudioFeatures> tt = AudioAnalyzer::analyzeSamples( tune.data(), n, 1, rate );
    float                            d_conf = 0.f, d_note = 0.f, t_conf = 1.f;
    int                              t_notes = 0;
    for ( size_t i = 200; i < td.size(); ++i ) // after the first two seconds
    {
        d_conf = std::max( d_conf, td[i].melodyConf );
        d_note = std::max( d_note, td[i].melodyNote );
    }
    for ( size_t i = 200; i < tt.size(); ++i )
    {
        t_conf = std::min( t_conf, tt[i].melodyConf );
        t_notes += tt[i].melodyNote > 0.f ? 1 : 0;
    }
    check( d_conf < 0.2f && d_note == 0.f, "drums alone are no melody (confidence and note stay 0)",
           "confidence at most " + std::to_string( d_conf ).substr( 0, 4 ) );
    check( t_conf > 0.8f && t_notes > static_cast<int>( tt.size() - 200 ) * 9 / 10, "a tune is one, note by note",
           "confidence at least " + std::to_string( t_conf ).substr( 0, 4 ) );
}

/**  The external clock (16.10.2026): beat cues and MIDI clock set tempo and phase while they come, the analysis
 * keeps the time again two seconds after the last one.  Real time (the analysis' clock is the wall clock).
 **/
void clockChecks()
{
    printf( "\nexternal clock (AudioAnalyzer::externalBeat, MidiInput clock)\n" );
    const int                rate = 48000, block = 480;
    const std::vector<float> zeros( block, 0.f );
    auto                     nowRef = []()
    {
        QElapsedTimer t;
        t.start();
        return t.msecsSinceReference();
    };
    AudioAnalyzer::M_ExternalClock = true;
    AudioAnalyzer::M_ClockDelay = 0.06f;
    {
        AudioAnalyzer az;
        const qint64  last = nowRef();
        for ( int k = 4; k >= 0; --k ) // five cues at 120 BPM, the last one now
            az.externalBeat( "test cues", last - k * 500, 0.f, true );
        az.feedBlock( zeros.data(), block, 1, rate );
        const AudioFeatures f = az.getFeatures();
        const double        want = std::fmod( ( nowRef() - last - 60 ) / 500.0 + 1.0, 1.0 ); // heard 60 ms later
        const double        dph = std::fabs( std::remainder( f.beatPhase - want, 1.0 ) );
        check( std::fabs( 40.f + 160.f * f.estimatedBPM - 120.f ) < 0.5f && dph < 0.04 && f.rhythmStrength >= 0.85f,
               "beat cues set the tempo and the phase (placed clockDelay after they arrive)",
               std::to_string( 40.f + 160.f * f.estimatedBPM ).substr( 0, 5 ) + " BPM, phase off by "
                   + std::to_string( dph ).substr( 0, 5 ) );
        std::this_thread::sleep_for( std::chrono::milliseconds( 2100 ) );
        az.feedBlock( zeros.data(), block, 1, rate );
        check( az.getFeatures().estimatedBPM < 0.01f,
               "two seconds after the last beat the analysis keeps the time again" );
        AudioAnalyzer::M_ExternalClock = false;
        az.externalBeat( "test cues", nowRef(), 140.f, true );
        az.feedBlock( zeros.data(), block, 1, rate );
        check( az.getFeatures().estimatedBPM < 0.01f, "externalClock=false: beats from outside change nothing" );
        AudioAnalyzer::M_ExternalClock = true;
    }
    // MIDI clock: Start, then 49 real ticks at 120 BPM (20.83 ms apart, waited out actively: a sleep is too coarse).
    {
        MidiInput mi;
        mi.handleMessage( 0xFA );
        const auto t0 = std::chrono::steady_clock::now();
        for ( int i = 0; i < 49; ++i )
        {
            while ( std::chrono::steady_clock::now() - t0 < std::chrono::microseconds( 20833 * i ) )
            {
            }
            mi.handleMessage( 0xF8 );
        }
        std::vector<MidiInput::Event> beats;
        for ( const MidiInput::Event &e : mi.drain() )
            if ( e.type == 0xF8 )
                beats.push_back( e );
        check( beats.size() == 2 && beats[0].data1 == 1 && std::fabs( beats.back().bpm - 120.f ) < 2.f,
               "MIDI clock after Start: a beat every 24 ticks, with the phase, at the clock's tempo",
               std::to_string( beats.size() ) + " beats, "
                   + ( beats.empty() ? std::string( "-" ) : std::to_string( beats.back().bpm ).substr( 0, 5 ) )
                   + " BPM" );
    }
}

/**  The video export's frame clock (EngineClock, WallClock) and its command line (-g, -j).
 *
 * Runs last: it switches this process's engine clock to virtual time for good.
 **/
void exportChecks()
{
    printf( "\nvideo export (coreclock.h, VideoExport.h)\n" );
    const auto before = EngineClock::now();
    EngineClock::startVirtual();
    const auto origin = EngineClock::now();
    check( EngineClock::isVirtual() && origin >= before, "virtual time starts at the wall-clock moment of the switch" );
    WallClock stopwatch; // started at the origin
    std::this_thread::sleep_for( std::chrono::milliseconds( 20 ) );
    check( EngineClock::now() == origin && stopwatch.elapsed() == 0,
           "between two frames the engine clock stands still" );
    EngineClock::setVirtualSeconds( 90.0 / 60.0 );
    const double frame90 = std::chrono::duration<double>( EngineClock::now() - origin ).count();
    check( std::fabs( frame90 - 1.5 ) < 1e-9, "frame 90 at 60 fps is 1.5 s of engine time", std::to_string( frame90 ) );
    check( stopwatch.elapsed() == 1500, "a stopwatch on the engine clock measures frames, not the wall",
           std::to_string( stopwatch.elapsed() ) + " ms" );
    const double epoch0 = EngineClock::epochSeconds();
    EngineClock::setVirtualSeconds( 3600.0 * 24.0 / 24.0 ); // frame 86400 at 24 fps
    const double hour = std::chrono::duration<double>( EngineClock::now() - origin ).count();
    check( std::fabs( hour - 3600.0 ) < 1e-6, "an hour of 24 fps frames lands on the hour: set per frame, no drift" );
    check( std::fabs( EngineClock::epochSeconds() - epoch0 - 3598.5 ) < 1e-3,
           "the calendar time the class memory stamps moves with the frames" );

    VideoExport::Settings &st = VideoExport::M_Settings;
    check( VideoExport::parseSize( "4k" ) && st.width == 3840 && st.height == 2160, "-g 4k is 3840x2160" );
    check( VideoExport::parseSize( "1920x1080" ) && st.width == 1920 && st.height == 1080, "-g 1920x1080" );
    check( !VideoExport::parseSize( "1921x1080" ) && !VideoExport::parseSize( "8x8" ) && !VideoExport::parseSize( "x" )
               && st.width == 1920,
           "odd, tiny and garbled sizes are refused and change nothing" );
    check( VideoExport::parseOptions( "hevc,blur,nofade,title,q=compact,cq=20" ) && st.codec == "hevc" && st.motionBlur
               && !st.fade && st.title && st.qualityStep == 4 && st.quality == 20,
           "-j hevc,blur,nofade,title,q=compact,cq=20" );
    check( !VideoExport::parseOptions( "sharpen" ), "an unknown -j option is reported" );
    st = VideoExport::Settings(); // nothing left behind: this run is no export
}

/**  Natural scene changes on the 8-bar phrase (16.10.2026): with a confident beat and a drop of this song anchoring
 * the phrase grid, a natural change starts its four-beat fade four beats before the boundary.  The scheduler alone,
 * with synthetic ticks at 120 BPM, on the engine clock's virtual time -- exportChecks() switched it, so the
 * scheduler's timers follow the ticks.
 **/
void phraseChecks()
{
    printf( "\nscene changes on the phrase (SceneScheduler: phrase wait)\n" );
    // Never deleted: their destructor frees GL objects, and -q has no GL context.
    static std::vector<EffectShader *> tex, fx, trans;
    if ( tex.empty() )
    {
        for ( int i = 0; i < 4; ++i )
            tex.push_back( new EffectShader( 3, 4, 1, 2 ) );
        fx.push_back( new EffectShader( 600, 601, 1, 2 ) );
    }
    // The phraseSecsLeft at every natural fade start after the first six seconds.
    auto run = [&]( bool anchored, double t0 )
    {
        SceneScheduler sched;
        sched.attach( &tex, &fx, &trans );
        double clock = t0;
        EngineClock::setVirtualSeconds( clock );
        sched.reset();
        std::vector<float> starts;
        int                prev = sched.texState();
        const float        dt = 1.f / 60.f;
        for ( int f = 0; f < 60 * 120; ++f )
        {
            const float s = static_cast<float>( f ) * dt;
            clock += dt;
            EngineClock::setVirtualSeconds( clock );
            SceneScheduler::Tick t{};
            t.dt = dt;
            t.gateSmooth = 1.f;
            t.timingScale = 1.f;
            t.musicPresence = 1.f;
            t.rhythmStrength = 0.8f;
            t.estimatedBPM = 0.5f; // 120 BPM: a beat is 0.5 s, a bar 2 s, a phrase 16 s
            t.dropCount = anchored && s > 2.f ? 1 : 0;
            const float in = std::fmod( s + 14.f, 16.f ); // the grid runs from the drop at 2 s
            t.phraseSecsLeft = 16.f - in;
            t.downbeatTick = std::fmod( in, 2.f ) < dt;
            sched.tick( t );
            if ( sched.texState() == 1 && prev == 0 && s > 6.f )
                starts.push_back( t.phraseSecsLeft );
            prev = sched.texState();
        }
        return starts;
    };
    const std::vector<float> on = run( true, 200000.0 ), off = run( false, 300000.0 );
    int                      on_phrase = 0, off_phrase = 0;
    for ( float left : on )
        on_phrase += left > 1.45f && left <= 2.05f ? 1 : 0;
    for ( float left : off )
        off_phrase += left > 1.45f && left <= 2.05f ? 1 : 0;
    check( on.size() >= 4 && on_phrase == static_cast<int>( on.size() ),
           "with a drop as anchor every natural change starts four beats before the 8-bar boundary",
           std::to_string( on_phrase ) + " of " + std::to_string( on.size() ) );
    check( off.size() > on.size() && off_phrase < static_cast<int>( off.size() ),
           "without one it waits for the next bar's one as before",
           std::to_string( off.size() ) + " changes, " + std::to_string( off_phrase ) + " on the phrase" );
}

} // namespace

int runCueSelfTest()
{
    if ( const char *capture = getenv( "KALEIDO_CUE_DECODE" ) )
        return decodeCapture( capture );

    printf( "score cues (CueReceiver.h)\n" );

    // ---------------------------------------------------------------- the five messages
    ScoreCue                c;
    const std::vector<char> bar = intMessage( "/phos/bar", 258 );
    check( bar.size() == 20, "a hand-built /phos/bar is 20 bytes (12 address + 4 tags + 4 argument)",
           std::to_string( bar.size() ) );
    check( decodes( bar, c ) && c.kind == ScoreCue::KindE::BAR && c.index == 258,
           "/phos/bar i decodes, most significant byte first" );

    check( decodes( intMessage( "/phos/beat", 7 ), c ) && c.kind == ScoreCue::KindE::BEAT && c.index == 7,
           "/phos/beat i decodes" );

    const std::vector<char> sec = sectionMessage( "Drop", 0.75f );
    check( sec.size() == 32, "a hand-built /phos/section is 32 bytes (16 + 4 + 8 + 4)",
           std::to_string( sec.size() ) );
    check( decodes( sec, c ) && c.kind == ScoreCue::KindE::SECTION
               && c.section == static_cast<int>( CueSectionE::DROP ) && c.energy == 0.75f,
           "/phos/section s f decodes, type by name and energy as a float32" );

    check( decodes( keyMessage( "F# Phrygian" ), c ) && c.kind == ScoreCue::KindE::KEY && c.keyPc == 6,
           "/phos/key s decodes and F# is pitch class 6" );
    check( decodes( keyMessage( "Bb Aeolian" ), c ) && c.keyPc == 10, "and Bb is pitch class 10" );
    check( decodes( keyMessage( "C Dorian" ), c ) && c.keyPc == 0, "and C is pitch class 0" );

    const std::vector<char> drop = dropMessage();
    check( drop.size() == 16 && decodes( drop, c ) && c.kind == ScoreCue::KindE::DROP,
           "/phos/drop carries the empty type tag string and decodes",
           std::to_string( drop.size() ) + " bytes" );

    // A section name this build does not know is still a section: the cue arrives, the type is -1,
    // and the scheduler gets its change. A new category in the generator must not silence the bridge.
    check( decodes( sectionMessage( "Interlude", 0.5f ), c ) && c.kind == ScoreCue::KindE::SECTION
               && c.section == -1,
           "an unknown section name still decodes, with type -1" );

    // ---------------------------------------------------------------- what must be refused
    {
        std::vector<char> b = intMessage( "/phos/bar", 1 );
        b.pop_back();
        check( !decodes( b, c ), "a length that is not a multiple of four is refused" );
    }
    {
        std::vector<char> b = intMessage( "/phos/bar", 1 );
        b[10] = 'x'; // the address's padding, which must be nulls
        check( !decodes( b, c ), "padding that is not nulls is refused" );
    }
    {
        std::vector<char> b;
        putString( b, "/phos/bar" );
        putString( b, ",f" );
        putFloat( b, 1.0f );
        check( !decodes( b, c ), "the right address with the wrong type tag is refused" );
    }
    {
        std::vector<char> b;
        putString( b, "/phos/bar" );
        putString( b, ",i" );
        check( !decodes( b, c ), "a message whose argument is missing is refused" );
    }
    {
        std::vector<char> b = intMessage( "/phos/bar", 1 );
        putInt( b, 99 );
        check( !decodes( b, c ), "a message with an argument too many is refused" );
    }
    check( !decodes( intMessage( "/other/thing", 1 ), c ), "an address that is not ours is not ours" );
    check( !decodeScoreCue( nullptr, 0, c ) && !decodeScoreCue( "", 0, c ),
           "an empty datagram is refused" );

    // ---------------------------------------------------------------- the tick is untouched when off
    //
    // The one property the whole feature rests on. memcpy rather than a copy constructor, so the
    // padding bytes are compared as well and "identical" means identical.
    {
        ScoreCues::instance().reset();
        SceneScheduler::Tick t = sampleTick();
        SceneScheduler::Tick before;
        memcpy( &before, &t, sizeof( before ) );
        ScoreCueBridge         bridge;
        const ScoreCues::Frame quiet = ScoreCues::instance().drain( 0.016f );
        check( !quiet.live, "with no sender the cues are not live" );
        applyScoreCues( quiet, bridge, t );
        check( memcmp( &before, &t, sizeof( before ) ) == 0,
               "and a scheduler tick comes out of applyScoreCues byte for byte as it went in" );
    }

    // ---------------------------------------------------------------- the accumulator
    {
        ScoreCues &cues = ScoreCues::instance();
        cues.reset();
        ScoreCue s;
        decodes( sectionMessage( "Break", 0.3f ), s );
        cues.apply( s );
        ScoreCues::Frame f = cues.drain( 0.016f );
        check( f.live && f.section && f.sectionType == static_cast<int>( CueSectionE::BREAK )
                   && f.energy > 0.29f && f.energy < 0.31f,
               "a section cue arrives once, with its energy" );
        f = cues.drain( 0.016f );
        check( f.live && !f.section, "and is not repeated on the next frame" );

        // The generator stops. After the timeout the audio analysis has to take over again -- a
        // scheduler left waiting for a boundary that will never come is worse than no cues at all.
        f = cues.drain( ScoreCues::LiveSecs );
        check( !f.live, "after the silence timeout the cues stop steering the scheduler" );
    }

    // ---------------------------------------------------------------- the counters
    {
        ScoreCues::instance().reset();
        ScoreCueBridge       bridge;
        SceneScheduler::Tick t = sampleTick(); // sectionCount 17, dropCount 4, from the audio
        applyScoreCues( ScoreCues::instance().drain( 0.016f ), bridge, t );
        check( t.sectionCount == 17 && t.dropCount == 4, "the audio's counters pass through untouched" );

        ScoreCue s;
        decodes( sectionMessage( "Drop", 1.0f ), s );
        ScoreCues::instance().apply( s );
        decodes( dropMessage(), s );
        ScoreCues::instance().apply( s );
        SceneScheduler::Tick u = sampleTick();
        applyScoreCues( ScoreCues::instance().drain( 0.016f ), bridge, u );
        check( u.sectionCount == 18 && u.dropCount == 5,
               "the first cue continues the audio's numbering, so the rising edge is still one",
               "section " + std::to_string( u.sectionCount ) + ", drop " + std::to_string( u.dropCount ) );
        check( !u.sectionKnown && u.sectionId == -1,
               "a cue-driven section is never 'known': the LRU id it would need does not exist" );

        SceneScheduler::Tick v = sampleTick();
        applyScoreCues( ScoreCues::instance().drain( 0.016f ), bridge, v );
        check( v.sectionCount == 18 && v.dropCount == 5, "and a frame with no cue does not move them" );

        // Back to the audio, and back again: the numbers must never go backwards, because the
        // scheduler reads a DIFFERENCE and a step of anything but one is a cue thrown away.
        SceneScheduler::Tick w = sampleTick();
        applyScoreCues( ScoreCues::instance().drain( ScoreCues::LiveSecs ), bridge, w );
        check( w.sectionCount == 17, "when the sender goes quiet the audio's own counter is back" );
        decodes( sectionMessage( "Groove", 0.5f ), s );
        ScoreCues::instance().apply( s );
        SceneScheduler::Tick x = sampleTick();
        applyScoreCues( ScoreCues::instance().drain( 0.016f ), bridge, x );
        check( x.sectionCount == 18, "and a sender that comes back still moves it by exactly one",
               std::to_string( x.sectionCount ) );
    }

    // ---------------------------------------------------------------- the family's dialects (02.10.2026)
    {
        ScoreCue d;
        check( decodes( dialectMessage( "/tot/bar", ",i", "", 12, 0.f ), d ) && d.kind == ScoreCue::KindE::BAR
                   && d.index == 12,
               "Totality's bar line is a bar line" );
        check( decodes( dialectMessage( "/tot/beat", ",if", "", 49, 130.f ), d ) && d.kind == ScoreCue::KindE::BEAT
                   && d.index == 49,
               "and its beat a beat" );
        check( decodes( dialectMessage( "/tot/block", ",s", "Block 3", 0, 0.f ), d )
                   && d.kind == ScoreCue::KindE::SECTION && d.section == static_cast<int>( CueSectionE::GROOVE )
                   && !d.drop,
               "its plateau ('Block 3') a groove" );
        check( decodes( dialectMessage( "/tot/block", ",s", "Return", 0, 0.f ), d )
                   && d.section == static_cast<int>( CueSectionE::DROP ) && d.drop,
               "and its Return a drop" );
        check( decodes( dialectMessage( "/tot/key", ",s", "8A", 0, 0.f ), d ) && d.kind == ScoreCue::KindE::KEY
                   && d.keyPc == 9,
               "a Camelot label: 8A is A" );
        check( decodes( dialectMessage( "/parh/key", ",s", "8B", 0, 0.f ), d ) && d.keyPc == 0
                   && decodes( dialectMessage( "/parh/key", ",s", "1A", 0, 0.f ), d ) && d.keyPc == 8,
               "8B is C, 1A is G#" );
        check( decodes( dialectMessage( "/parh/block", ",s", "Breakdown", 0, 0.f ), d )
                   && d.section == static_cast<int>( CueSectionE::BREAK ),
               "Parhelion's breakdown a break" );
        check( decodes( dialectMessage( "/parh/op", ",s", "add lead", 0, 0.f ), d )
                   && d.kind == ScoreCue::KindE::UNKNOWN,
               "and an operation traffic, nothing more" );
        check( decodes( dialectMessage( "/eph/beat", ",if", "", 36, 124.f ), d ) && d.kind == ScoreCue::KindE::BAR
                   && d.index == 9 && decodes( dialectMessage( "/eph/beat", ",if", "", 37, 124.f ), d )
                   && d.kind == ScoreCue::KindE::BEAT,
               "Ephemeris' every fourth beat is a bar line" );
        check( decodes( dialectMessage( "/eph/phase", ",si", "PEAK", 5, 0.f ), d )
                   && d.section == static_cast<int>( CueSectionE::DROP ) && d.drop,
               "its PEAK a drop" );
        check( decodes( dialectMessage( "/eph/key", ",s", "F#", 0, 0.f ), d ) && d.keyPc == 6, "its key a root" );
        check( decodes( dialectMessage( "/noct/scene", ",sf", "Somnus Field", 0, 0.3f ), d )
                   && d.kind == ScoreCue::KindE::SECTION && d.energy > 0.29f && d.energy < 0.31f,
               "Noctuary's scene a section at its energy" );
        check( !decodes( dialectMessage( "/tot/block", ",i", "", 3, 0.f ), d )
                   && !decodes( dialectMessage( "/eph/bar", ",i", "", 3, 0.f ), d ),
               "and a dialect's message of the wrong shape is refused" );
        ScoreCues::instance().reset();
        decodes( dialectMessage( "/tot/block", ",s", "Return", 0, 0.f ), d );
        ScoreCues::instance().apply( d );
        const ScoreCues::Frame fr = ScoreCues::instance().drain( 0.016f );
        check( fr.live && fr.section && fr.drop, "a Return reaches the scheduler as a section and a drop at once" );
        ScoreCues::instance().reset();
    }

    // ---------------------------------------------------------------- a cue file (-k, 02.10.2026)
    {
        double   at = 0.0;
        ScoreCue line;
        check( parseScoreCueLine( "12.5\t/phos/bar\t7", at, line ) == 1 && at == 12.5
                   && line.kind == ScoreCue::KindE::BAR && line.index == 7,
               "a cue file's bar line reads as the bar it names" );
        check( parseScoreCueLine( "0\t/phos/section\tDrop\t0.9\r", at, line ) == 1
                   && line.kind == ScoreCue::KindE::SECTION && line.section == static_cast<int>( CueSectionE::DROP )
                   && line.energy > 0.89f && line.energy < 0.91f,
               "and a section with its energy, a carriage return or not" );
        check( parseScoreCueLine( "3\t/phos/key\tF# Phrygian", at, line ) == 1 && line.keyPc == 6,
               "and a key with a space in it" );
        check( parseScoreCueLine( "4\t/phos/drop", at, line ) == 1 && line.kind == ScoreCue::KindE::DROP,
               "and a drop without arguments" );
        check( parseScoreCueLine( "# seconds address arguments", at, line ) == 0
                   && parseScoreCueLine( "", at, line ) == 0,
               "comments and blank lines are neither cues nor errors" );
        check( parseScoreCueLine( "1\t/phos/bar", at, line ) < 0
                   && parseScoreCueLine( "1\t/phos/drop\tnow", at, line ) < 0
                   && parseScoreCueLine( "x\t/phos/bar\t1", at, line ) < 0
                   && parseScoreCueLine( "1\t/other\t1", at, line ) < 0,
               "a line whose time, address or arguments do not fit is refused" );

        // The clock: nothing before the WAV plays, each cue once when it is reached.
        const QString path = QDir::temp().filePath( "kaleido_cuetest.tsv" );
        {
            QFile f( path );
            if ( f.open( QIODevice::WriteOnly | QIODevice::Truncate ) )
                f.write(
                    "# a test\n2.0\t/phos/drop\n0.0\t/phos/section\tIntro\t0.2\n0.0\t/phos/bar\t0\n1.0\t/phos/bar\t1\n" );
        }
        ScoreCues::instance().reset();
        ScoreCueFile &file = ScoreCueFile::instance();
        check( file.load( path ) == 4 && file.active(), "a cue file loads its four cues" );
        check( file.feed() == 0, "nothing goes in before the WAV plays" );
        file.setClock( 0.5 );
        check( file.feed() == 2, "at 0.5 s the two cues at zero go in" );
        ScoreCues::Frame f = ScoreCues::instance().drain( 0.016f );
        check( f.live && f.section && f.downbeat && f.bar == 0 && !f.drop,
               "and the scheduler sees them as it would from the socket" );
        check( file.feed() == 0, "a cue goes in once" );
        file.setClock( 2.0 );
        check( file.feed() == 2, "at 2 s the bar and the drop follow" );
        f = ScoreCues::instance().drain( 0.016f );
        check( f.drop && f.bar == 1, "the drop lands" );
        file.reset();
        ScoreCues::instance().reset();
        QFile::remove( path );
    }

    // ---------------------------------------------------------------- a real socket
    {
        ScoreCues::instance().reset();
        const int   port = 9333;
        CueReceiver receiver( nullptr, "127.0.0.1", port );
        check( receiver.listening(), "the receiver binds its port" );
        if ( receiver.listening() )
        {
            QUdpSocket                     out;
            const QHostAddress             to( QString( "127.0.0.1" ) );
            std::vector<std::vector<char>> messages;
            messages.push_back( intMessage( "/phos/bar", 40 ) );
            messages.push_back( sectionMessage( "Drop", 0.9f ) );
            messages.push_back( dropMessage() );
            messages.push_back( keyMessage( "A Aeolian" ) );
            messages.push_back( intMessage( "/phos/beat", 160 ) );
            for ( const std::vector<char> &m : messages )
                out.writeDatagram( m.data(), static_cast<qint64>( m.size() ), to, static_cast<quint16>( port ) );
            const char junk[] = "not osc at all!!"; // 16 bytes: a legal length, an illegal message
            out.writeDatagram( junk, 16, to, static_cast<quint16>( port ) );

            // Loopback is fast but not instant; give the event loop up to a second to deliver.
            QElapsedTimer clock;
            clock.start();
            while ( ScoreCues::instance().accepted() + ScoreCues::instance().rejected() < 6
                    && clock.elapsed() < 1000 )
                QCoreApplication::processEvents( QEventLoop::AllEvents, 10 );

            check( ScoreCues::instance().accepted() == 5, "all five messages arrived over the loopback",
                   std::to_string( ScoreCues::instance().accepted() ) + " accepted" );
            check( ScoreCues::instance().rejected() == 1,
                   "and the datagram that was not ours was counted, not acted on",
                   std::to_string( ScoreCues::instance().rejected() ) + " rejected" );
            const ScoreCues::Frame f = ScoreCues::instance().drain( 0.016f );
            check( f.live && f.downbeat && f.section && f.drop && f.bar == 40
                       && f.sectionType == static_cast<int>( CueSectionE::DROP ) && f.keyPc == 9,
                   "and one frame carries the bar line, the section, the drop and the key" );
        }
    }

    longRunChecks();
    harmonyChecks();
    inputChecks();
    outputChecks();
    settingsChecks();
    rhythmChecks();
    melodyChecks();
    clockChecks();
    exportChecks();
    phraseChecks(); // after exportChecks(): it needs the virtual engine clock

    printf( "\n%d passed, %d failed\n", g_passed, g_failed );
    return g_failed == 0 ? 0 : 1;
}
