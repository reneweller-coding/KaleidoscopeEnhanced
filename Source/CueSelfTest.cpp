/*****************************************************************************\
 *                              CueSelfTest
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  `Kaleidoscope.exe -q`: the score-cue receiver checked without a window, a sound card or a generator -- and the
 *  building blocks of a show that runs for days (LongRunVariety.h: scene memory, lab clock, class novelty) and the
 *  harmonic change end to end (a synthetic chord change through the analyzer and the app's conditioning).
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
#include "AudioAnalyzer.h"
#include "AudioConditioner.h"

#include <QtCore/QCoreApplication>
#include <QtCore/QDir>
#include <QtCore/QElapsedTimer>
#include <QtCore/QFile>
#include <QtNetwork/QHostAddress>
#include <QtNetwork/QUdpSocket>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
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

    printf( "\n%d passed, %d failed\n", g_passed, g_failed );
    return g_failed == 0 ? 0 : 1;
}
