/**
 * @file CueSelfTest.cpp
 * @brief `Kaleidoscope.exe -q`: the score-cue receiver checked without a window, a sound card or a
 *        generator.
 *
 * The datagrams below are written out byte by byte from the OSC 1.0 specification -- address string
 * terminated and padded with nulls to a multiple of four, then the type tag string beginning with a
 * comma, then big-endian arguments -- and not copied from anything Phosphene produced. That is what
 * makes them an oracle: if the decoder agrees with a hand-built message, the two programs agree
 * about the format, whereas a round trip through one encoder and its own decoder would prove only
 * that they are consistently wrong. The malformed cases matter just as much: a receiver that
 * shrugs at bad padding is how two programs drift apart for a year without noticing.
 */
#include "CueReceiver.h"

#include <QtCore/QCoreApplication>
#include <QtCore/QDir>
#include <QtCore/QElapsedTimer>
#include <QtCore/QFile>
#include <QtNetwork/QHostAddress>
#include <QtNetwork/QUdpSocket>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

namespace
{

int g_passed = 0;
int g_failed = 0;

/// Records one check; failures always print, passes print too (there are few of them).
void check( bool ok, const char *what, const std::string &detail = std::string() )
{
	if( ok )
		g_passed++;
	else
		g_failed++;
	printf( "  [%s] %s%s%s\n", ok ? " ok " : "FAIL", what,
	        detail.empty() ? "" : "  -- ", detail.c_str() );
}

/// An OSC string: the text, its terminator, then nulls up to the next multiple of four.
void putString( std::vector<char> &b, const char *s )
{
	const size_t n = strlen( s ) + 1;
	b.insert( b.end(), s, s + n );
	while( b.size() & 3 )
		b.push_back( 0 );
}

/// A big-endian int32.
void putInt( std::vector<char> &b, int v )
{
	const unsigned u = static_cast<unsigned>( v );
	b.push_back( static_cast<char>( ( u >> 24 ) & 0xFF ) );
	b.push_back( static_cast<char>( ( u >> 16 ) & 0xFF ) );
	b.push_back( static_cast<char>( ( u >>  8 ) & 0xFF ) );
	b.push_back( static_cast<char>(   u         & 0xFF ) );
}

/// A big-endian float32.
void putFloat( std::vector<char> &b, float v )
{
	int bits;
	memcpy( &bits, &v, 4 );
	putInt( b, bits );
}

/// `/phos/bar i` and `/phos/beat i`.
std::vector<char> intMessage( const char *address, int value )
{
	std::vector<char> b;
	putString( b, address );
	putString( b, ",i" );
	putInt( b, value );
	return b;
}

/// `/phos/section s f`.
std::vector<char> sectionMessage( const char *type, float energy )
{
	std::vector<char> b;
	putString( b, "/phos/section" );
	putString( b, ",sf" );
	putString( b, type );
	putFloat( b, energy );
	return b;
}

/// `/phos/key s`.
std::vector<char> keyMessage( const char *key )
{
	std::vector<char> b;
	putString( b, "/phos/key" );
	putString( b, ",s" );
	putString( b, key );
	return b;
}

/// `/phos/drop` -- no arguments, but still a type tag string.
std::vector<char> dropMessage()
{
	std::vector<char> b;
	putString( b, "/phos/drop" );
	putString( b, "," );
	return b;
}

bool decodes( const std::vector<char> &b, ScoreCue &out )
{
	return decodeScoreCue( b.data(), static_cast<int>( b.size() ), out );
}

/// A tick with values that are all distinct, so a field that is silently overwritten shows up.
SceneScheduler::Tick sampleTick()
{
	SceneScheduler::Tick t{};
	t.dt             = 0.0166f;
	t.downbeatTick   = true;
	t.gateSmooth     = 0.81f;
	t.timingScale    = 1.23f;
	t.pinned         = false;
	t.harmonicChange = 0.42f;
	t.musicPresence  = 0.93f;
	t.sectionCount   = 17;
	t.sectionId      = 5;
	t.sectionKnown   = true;
	t.dropCount      = 4;
	t.rhythmStrength = 0.66f;
	t.estimatedBPM   = 0.55f;
	t.logAttackTime  = 0.31f;
	t.buildUp        = 0.22f;
	t.phraseSecsLeft = 7.5f;
	return t;
}

/**
 * @brief Decodes a capture file and prints one line per message, then stops.
 *
 * KALEIDO_CUE_DECODE=<file> turns `-q` into exactly that and nothing else. The file is a sequence
 * of records, each a big-endian 32-bit length followed by that many bytes -- datagrams as they came
 * off the wire. It exists so that THE BYTES THE GENERATOR REALLY SENT can be put through THIS
 * decoder, rather than through a hand-built imitation of them: the checker on the Phosphene side
 * (Tools/cue_check.py) captures a run, decodes it with its own Python decoder, and compares that
 * with what this prints. Three decoders, one set of bytes, no shared code between any of them.
 * @param path The capture file.
 * @return 0 when every record decoded, 1 otherwise.
 */
int decodeCapture( const char *path )
{
	FILE *f = fopen( path, "rb" );
	if( f == nullptr )
	{
		fprintf( stderr, "cue capture: cannot open %s\n", path );
		return 1;
	}
	int bad = 0, good = 0;
	for( ;; )
	{
		unsigned char header[4];
		if( fread( header, 1, 4, f ) != 4 )
			break;
		const int size = ( header[0] << 24 ) | ( header[1] << 16 ) | ( header[2] << 8 ) | header[3];
		if( size <= 0 || size > 4096 )
			break;
		std::vector<char> buf( static_cast<size_t>( size ) );
		if( fread( buf.data(), 1, static_cast<size_t>( size ), f ) != static_cast<size_t>( size ) )
			break;
		ScoreCue c;
		if( !decodeScoreCue( buf.data(), size, c ) )
		{
			printf( "bad\n" );
			bad++;
			continue;
		}
		good++;
		switch( c.kind )
		{
			case ScoreCue::Kind::Beat:    printf( "beat %d\n", c.index ); break;
			case ScoreCue::Kind::Bar:     printf( "bar %d\n", c.index ); break;
			case ScoreCue::Kind::Section: printf( "section %s %.4f\n", c.text, c.energy ); break;
			case ScoreCue::Kind::Key:     printf( "key %s %d\n", c.text, c.keyPc ); break;
			default:                      printf( "drop\n" ); break;
		}
	}
	fclose( f );
	fprintf( stderr, "cue capture: %d decoded, %d refused\n", good, bad );
	return bad == 0 && good > 0 ? 0 : 1;
}

} // namespace

int runCueSelfTest()
{
	if( const char *capture = getenv( "KALEIDO_CUE_DECODE" ) )
		return decodeCapture( capture );

	printf( "score cues (CueReceiver.h)\n" );

	// ---------------------------------------------------------------- the five messages
	ScoreCue c;
	const std::vector<char> bar = intMessage( "/phos/bar", 258 );
	check( bar.size() == 20, "a hand-built /phos/bar is 20 bytes (12 address + 4 tags + 4 argument)",
	       std::to_string( bar.size() ) );
	check( decodes( bar, c ) && c.kind == ScoreCue::Kind::Bar && c.index == 258,
	       "/phos/bar i decodes, most significant byte first" );

	check( decodes( intMessage( "/phos/beat", 7 ), c ) && c.kind == ScoreCue::Kind::Beat && c.index == 7,
	       "/phos/beat i decodes" );

	const std::vector<char> sec = sectionMessage( "Drop", 0.75f );
	check( sec.size() == 32, "a hand-built /phos/section is 32 bytes (16 + 4 + 8 + 4)",
	       std::to_string( sec.size() ) );
	check( decodes( sec, c ) && c.kind == ScoreCue::Kind::Section
	       && c.section == static_cast<int>( CueSection::Drop ) && c.energy == 0.75f,
	       "/phos/section s f decodes, type by name and energy as a float32" );

	check( decodes( keyMessage( "F# Phrygian" ), c ) && c.kind == ScoreCue::Kind::Key && c.keyPc == 6,
	       "/phos/key s decodes and F# is pitch class 6" );
	check( decodes( keyMessage( "Bb Aeolian" ), c ) && c.keyPc == 10, "and Bb is pitch class 10" );
	check( decodes( keyMessage( "C Dorian" ), c ) && c.keyPc == 0, "and C is pitch class 0" );

	const std::vector<char> drop = dropMessage();
	check( drop.size() == 16 && decodes( drop, c ) && c.kind == ScoreCue::Kind::Drop,
	       "/phos/drop carries the empty type tag string and decodes",
	       std::to_string( drop.size() ) + " bytes" );

	// A section name this build does not know is still a section: the cue arrives, the type is -1,
	// and the scheduler gets its change. A new category in the generator must not silence the bridge.
	check( decodes( sectionMessage( "Interlude", 0.5f ), c ) && c.kind == ScoreCue::Kind::Section
	       && c.section == -1, "an unknown section name still decodes, with type -1" );

	// ---------------------------------------------------------------- what must be refused
	{
		std::vector<char> b = intMessage( "/phos/bar", 1 );
		b.pop_back();
		check( !decodes( b, c ), "a length that is not a multiple of four is refused" );
	}
	{
		std::vector<char> b = intMessage( "/phos/bar", 1 );
		b[10] = 'x';   // the address's padding, which must be nulls
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
		ScoreCueBridge bridge;
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
		check( f.live && f.section && f.sectionType == static_cast<int>( CueSection::Break )
		       && f.energy > 0.29f && f.energy < 0.31f, "a section cue arrives once, with its energy" );
		f = cues.drain( 0.016f );
		check( f.live && !f.section, "and is not repeated on the next frame" );

		// The generator stops. After the timeout the audio analysis has to take over again -- a
		// scheduler left waiting for a boundary that will never come is worse than no cues at all.
		f = cues.drain( ScoreCues::kLiveSecs );
		check( !f.live, "after the silence timeout the cues stop steering the scheduler" );
	}

	// ---------------------------------------------------------------- the counters
	{
		ScoreCues::instance().reset();
		ScoreCueBridge bridge;
		SceneScheduler::Tick t = sampleTick();     // sectionCount 17, dropCount 4, from the audio
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
		applyScoreCues( ScoreCues::instance().drain( ScoreCues::kLiveSecs ), bridge, w );
		check( w.sectionCount == 17, "when the sender goes quiet the audio's own counter is back" );
		decodes( sectionMessage( "Groove", 0.5f ), s );
		ScoreCues::instance().apply( s );
		SceneScheduler::Tick x = sampleTick();
		applyScoreCues( ScoreCues::instance().drain( 0.016f ), bridge, x );
		check( x.sectionCount == 18, "and a sender that comes back still moves it by exactly one",
		       std::to_string( x.sectionCount ) );
	}

	// ---------------------------------------------------------------- a cue file (-k, 02.10.2026)
	{
		double at = 0.0;
		ScoreCue line;
		check( parseScoreCueLine( "12.5\t/phos/bar\t7", at, line ) == 1 && at == 12.5
		       && line.kind == ScoreCue::Kind::Bar && line.index == 7, "a cue file's bar line reads as the bar it names" );
		check( parseScoreCueLine( "0\t/phos/section\tDrop\t0.9\r", at, line ) == 1 && line.kind == ScoreCue::Kind::Section
		       && line.section == static_cast<int>( CueSection::Drop ) && line.energy > 0.89f && line.energy < 0.91f,
		       "and a section with its energy, a carriage return or not" );
		check( parseScoreCueLine( "3\t/phos/key\tF# Phrygian", at, line ) == 1 && line.keyPc == 6, "and a key with a space in it" );
		check( parseScoreCueLine( "4\t/phos/drop", at, line ) == 1 && line.kind == ScoreCue::Kind::Drop, "and a drop without arguments" );
		check( parseScoreCueLine( "# seconds address arguments", at, line ) == 0 && parseScoreCueLine( "", at, line ) == 0,
		       "comments and blank lines are neither cues nor errors" );
		check( parseScoreCueLine( "1\t/phos/bar", at, line ) < 0 && parseScoreCueLine( "1\t/phos/drop\tnow", at, line ) < 0
		       && parseScoreCueLine( "x\t/phos/bar\t1", at, line ) < 0 && parseScoreCueLine( "1\t/other\t1", at, line ) < 0,
		       "a line whose time, address or arguments do not fit is refused" );

		// The clock: nothing before the WAV plays, each cue once when it is reached.
		const QString path = QDir::temp().filePath( "kaleido_cuetest.tsv" );
		{
			QFile f( path );
			if( f.open( QIODevice::WriteOnly | QIODevice::Truncate ) )
				f.write( "# a test\n2.0\t/phos/drop\n0.0\t/phos/section\tIntro\t0.2\n0.0\t/phos/bar\t0\n1.0\t/phos/bar\t1\n" );
		}
		ScoreCues::instance().reset();
		ScoreCueFile &file = ScoreCueFile::instance();
		check( file.load( path ) == 4 && file.active(), "a cue file loads its four cues" );
		check( file.feed() == 0, "nothing goes in before the WAV plays" );
		file.setClock( 0.5 );
		check( file.feed() == 2, "at 0.5 s the two cues at zero go in" );
		ScoreCues::Frame f = ScoreCues::instance().drain( 0.016f );
		check( f.live && f.section && f.downbeat && f.bar == 0 && !f.drop, "and the scheduler sees them as it would from the socket" );
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
		const int port = 9333;
		CueReceiver receiver( nullptr, "127.0.0.1", port );
		check( receiver.listening(), "the receiver binds its port" );
		if( receiver.listening() )
		{
			QUdpSocket out;
			const QHostAddress to( QString( "127.0.0.1" ) );
			std::vector<std::vector<char>> messages;
			messages.push_back( intMessage( "/phos/bar", 40 ) );
			messages.push_back( sectionMessage( "Drop", 0.9f ) );
			messages.push_back( dropMessage() );
			messages.push_back( keyMessage( "A Aeolian" ) );
			messages.push_back( intMessage( "/phos/beat", 160 ) );
			for( const std::vector<char> &m : messages )
				out.writeDatagram( m.data(), static_cast<qint64>( m.size() ), to, static_cast<quint16>( port ) );
			const char junk[] = "not osc at all!!";   // 16 bytes: a legal length, an illegal message
			out.writeDatagram( junk, 16, to, static_cast<quint16>( port ) );

			// Loopback is fast but not instant; give the event loop up to a second to deliver.
			QElapsedTimer clock;
			clock.start();
			while( ScoreCues::instance().accepted() + ScoreCues::instance().rejected() < 6
			       && clock.elapsed() < 1000 )
				QCoreApplication::processEvents( QEventLoop::AllEvents, 10 );

			check( ScoreCues::instance().accepted() == 5, "all five messages arrived over the loopback",
			       std::to_string( ScoreCues::instance().accepted() ) + " accepted" );
			check( ScoreCues::instance().rejected() == 1, "and the datagram that was not ours was counted, not acted on",
			       std::to_string( ScoreCues::instance().rejected() ) + " rejected" );
			const ScoreCues::Frame f = ScoreCues::instance().drain( 0.016f );
			check( f.live && f.downbeat && f.section && f.drop && f.bar == 40
			       && f.sectionType == static_cast<int>( CueSection::Drop ) && f.keyPc == 9,
			       "and one frame carries the bar line, the section, the drop and the key" );
		}
	}

	printf( "\n%d passed, %d failed\n", g_passed, g_failed );
	return g_failed == 0 ? 0 : 1;
}
