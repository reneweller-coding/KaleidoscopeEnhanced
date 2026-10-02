/**
 * @file CueReceiver.cpp
 * @brief Implementation of the score-cue receiver: the OSC decoder, the accumulator the render
 *        loop reads, and the UDP socket.
 */
#include "CueReceiver.h"

#include <QtCore/QByteArray>
#include <QtNetwork/QHostAddress>
#include <QtNetwork/QUdpSocket>

#include <QtCore/QFile>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

const char *const kCueSectionNames[static_cast<int>( CueSection::Count )] =
	{ "Intro", "Groove", "Build", "Drop", "Break", "Outro", "Pdb", "Cut" };

const float ScoreCues::kLiveSecs = 2.0f;

namespace
{

/// The five addresses, in the order of ScoreCue::Kind.
const char *const kAddresses[5] = { "/phos/beat", "/phos/bar", "/phos/section", "/phos/key", "/phos/drop" };

/// Big-endian int32 at @p pos. OSC is network byte order throughout.
int readInt( const char *data, int pos )
{
	return   ( static_cast<int>( static_cast<unsigned char>( data[pos]     ) ) << 24 )
	       | ( static_cast<int>( static_cast<unsigned char>( data[pos + 1] ) ) << 16 )
	       | ( static_cast<int>( static_cast<unsigned char>( data[pos + 2] ) ) <<  8 )
	       |   static_cast<int>( static_cast<unsigned char>( data[pos + 3] ) );
}

/// Big-endian float32 at @p pos.
float readFloat( const char *data, int pos )
{
	const int bits = readInt( data, pos );
	float f;
	memcpy( &f, &bits, 4 );
	return f;
}

/**
 * @brief One OSC string: bytes up to a null, then null padding to the next multiple of four.
 *
 * The padding is CHECKED, not skipped. A sender that pads with anything other than nulls is not
 * speaking OSC, and a receiver that shrugs at that is the reason two programs can disagree about a
 * format for years without either of them noticing.
 * @param data Datagram.
 * @param size Its length.
 * @param pos  Where the string starts; advanced past the padding on success.
 * @param out  Receives the text, truncated to @p cap - 1 characters.
 * @param cap  Size of @p out.
 * @return false when the string is unterminated, unpadded, or runs past the end.
 */
bool readString( const char *data, int size, int &pos, char *out, int cap )
{
	int end = pos;
	while( end < size && data[end] != 0 )
		end++;
	if( end >= size )
		return false;                       // no terminator inside the datagram
	int next = end + 1;
	while( next & 3 )
	{
		if( next >= size || data[next] != 0 )
			return false;                   // padding is missing or is not nulls
		next++;
	}
	const int len = ( end - pos < cap - 1 ) ? end - pos : cap - 1;
	memcpy( out, data + pos, static_cast<size_t>( len ) );
	out[len] = 0;
	pos = next;
	return true;
}

/// Pitch class of a key name's leading note ("F# Phrygian" -> 6), or -1.
int pitchClassOf( const char *text )
{
	static const int kBase[7] = { 9, 11, 0, 2, 4, 5, 7 };   // A B C D E F G
	if( text[0] < 'A' || text[0] > 'G' )
		return -1;
	int pc = kBase[text[0] - 'A'];
	if( text[1] == '#' )
		pc += 1;
	else if( text[1] == 'b' )
		pc -= 1;
	return ( pc % 12 + 12 ) % 12;
}

/// A section name of one of the family's dialects, and what it means here.
struct DialectSection
{
	const char *name;      ///< as the generator sends it (a prefix where @c prefix is set)
	CueSection  section;   ///< the section it becomes
	float       energy;    ///< its energy (the dialects send none)
	bool        drop;      ///< whether it lands as a drop too
	bool        prefix;    ///< @c name is a prefix ("Block 3")
};

/// Totality's blocks (its Cue.h): the intro, the plateaus, the reduction, the return, the outro.
const DialectSection kTotalitySections[] = {
	{ "Intro", CueSection::Intro, 0.30f, false, false }, { "Block", CueSection::Groove, 0.60f, false, true },
	{ "Reduction", CueSection::Break, 0.35f, false, false }, { "Return", CueSection::Drop, 0.90f, true, false },
	{ "Outro", CueSection::Outro, 0.30f, false, false } };
/// Parhelion's sections (its Cue.h).
const DialectSection kParhelionSections[] = {
	{ "Intro", CueSection::Intro, 0.30f, false, false }, { "Groove", CueSection::Groove, 0.55f, false, false },
	{ "Breakdown", CueSection::Break, 0.30f, false, false }, { "Build", CueSection::Build, 0.60f, false, false },
	{ "Main drop", CueSection::Drop, 1.00f, true, false }, { "Drop", CueSection::Drop, 0.90f, true, false },
	{ "Outro", CueSection::Outro, 0.30f, false, false } };
/// Ephemeris' phases (its Cue.h).
const DialectSection kEphemerisSections[] = {
	{ "ATMOSPHERE", CueSection::Intro, 0.20f, false, false }, { "ENTRY", CueSection::Groove, 0.45f, false, false },
	{ "BUILD", CueSection::Build, 0.60f, false, false }, { "LEAD", CueSection::Drop, 0.75f, false, false },
	{ "PEAK", CueSection::Drop, 0.95f, true, false }, { "BREAKDOWN", CueSection::Break, 0.35f, false, false },
	{ "BRIDGE", CueSection::Groove, 0.50f, false, false }, { "CODA", CueSection::Outro, 0.30f, false, false } };

/// @p text looked up in @p table (@p n entries); anything else -- a set's track, a name not in the table -- is a groove.
template <size_t N>
void dialectSection( const DialectSection ( &table )[N], ScoreCue &out )
{
	out.kind    = ScoreCue::Kind::Section;
	out.section = static_cast<int>( CueSection::Groove );
	out.energy  = 0.5f;
	for( const DialectSection &d : table )
		if( d.prefix ? strncmp( out.text, d.name, strlen( d.name ) ) == 0 : strcmp( out.text, d.name ) == 0 )
		{
			out.section = static_cast<int>( d.section );
			out.energy  = d.energy;
			out.drop    = d.drop;
			return;
		}
}

/// The pitch class of a Camelot label ("8A" A minor, "8B" C major), or -1.
int camelotPitchClass( const char *text )
{
	char *end = nullptr;
	const long n = strtol( text, &end, 10 );
	if( end == text || n < 1 || n > 12 || ( *end != 'A' && *end != 'B' ) || end[1] != 0 )
		return -1;
	const int minor = static_cast<int>( ( 7 * ( n - 5 ) % 12 + 12 ) % 12 );   // 8A -> 9 (A); the inverse of 7k+4 (mod 12)
	return *end == 'A' ? minor : ( minor + 3 ) % 12;                          // B: the relative major
}

/**
 * @brief One message of the family's other dialects (see CueReceiver.h), after its address.
 * @return true when it is one of theirs and well formed
 */
bool decodeDialect( const char *address, const char *data, int size, int pos, ScoreCue &out )
{
	enum Who { Tot, Parh, Eph, Noct } who;
	const char *what;
	if( strncmp( address, "/tot/", 5 ) == 0 ) { who = Tot; what = address + 5; }
	else if( strncmp( address, "/parh/", 6 ) == 0 ) { who = Parh; what = address + 6; }
	else if( strncmp( address, "/eph/", 5 ) == 0 ) { who = Eph; what = address + 5; }
	else if( strncmp( address, "/noct/", 6 ) == 0 ) { who = Noct; what = address + 6; }
	else return false;

	char tags[16];
	if( !readString( data, size, pos, tags, sizeof( tags ) ) || tags[0] != ',' )
		return false;
	// The arguments, by their tags; anything left over or missing refuses the message.
	int ints[2] = {};
	float floats[2] = {};
	int ni = 0, nf = 0, ns = 0;
	for( const char *t = tags + 1; *t != 0; ++t )
	{
		if( *t == 'i' && ni < 2 && pos + 4 <= size ) { ints[ni++] = readInt( data, pos ); pos += 4; }
		else if( *t == 'f' && nf < 2 && pos + 4 <= size ) { floats[nf++] = readFloat( data, pos ); pos += 4; }
		else if( *t == 's' && ns < 1 && readString( data, size, pos, out.text, sizeof( out.text ) ) ) ns++;
		else return false;
	}
	if( pos != size )
		return false;

	const bool beat = strcmp( what, "beat" ) == 0 && ni == 1 && ns == 0;
	if( beat && who != Noct )
	{
		out.index = ints[0];
		// Ephemeris sends no bar lines: its every fourth beat is one (its pieces are in four).
		out.kind = ( who == Eph && ints[0] >= 0 && ints[0] % 4 == 0 ) ? ScoreCue::Kind::Bar : ScoreCue::Kind::Beat;
		if( out.kind == ScoreCue::Kind::Bar )
			out.index = ints[0] / 4;
		return true;
	}
	if( strcmp( what, "bar" ) == 0 && ni == 1 && ns == 0 && nf == 0 && who != Eph )
	{
		out.kind = ScoreCue::Kind::Bar;
		out.index = ints[0];
		return true;
	}
	if( strcmp( what, "key" ) == 0 && ns == 1 && ni == 0 && nf == 0 )
	{
		out.kind  = ScoreCue::Kind::Key;
		out.keyPc = ( who == Tot || who == Parh ) ? camelotPitchClass( out.text ) : pitchClassOf( out.text );
		return true;
	}
	if( who == Tot && strcmp( what, "block" ) == 0 && ns == 1 && ni == 0 ) { dialectSection( kTotalitySections, out ); return true; }
	if( who == Parh && strcmp( what, "block" ) == 0 && ns == 1 && ni == 0 ) { dialectSection( kParhelionSections, out ); return true; }
	if( who == Eph && strcmp( what, "phase" ) == 0 && ns == 1 && ni == 1 ) { dialectSection( kEphemerisSections, out ); return true; }
	if( who == Noct && strcmp( what, "scene" ) == 0 && ns == 1 && nf == 1 )
	{
		// A preset or a journey's step arriving: a new scene, at the energy Noctuary gives it.
		out.kind    = ScoreCue::Kind::Section;
		out.section = static_cast<int>( CueSection::Groove );
		out.energy  = floats[0];
		return true;
	}
	// The rest is traffic: an operation of Totality's or Parhelion's form, a conjunction of Ephemeris' rows.
	if( ( ( who == Tot || who == Parh ) && strcmp( what, "op" ) == 0 && ns == 1 ) ||
	    ( who == Eph && strcmp( what, "conjunction" ) == 0 && ni == 1 && nf == 1 ) )
	{
		out.kind = ScoreCue::Kind::Unknown;
		return true;
	}
	return false;
}

} // namespace

bool decodeScoreCue( const char *data, int size, ScoreCue &out )
{
	out = ScoreCue();
	if( data == nullptr || size <= 0 || ( size & 3 ) )
		return false;                       // every OSC message is a multiple of four bytes

	int pos = 0;
	char address[40];
	if( !readString( data, size, pos, address, sizeof( address ) ) )
		return false;
	int kind = -1;
	for( int i = 0; i < 5; i++ )
		if( strcmp( address, kAddresses[i] ) == 0 )
			kind = i;
	if( kind < 0 )
		return decodeDialect( address, data, size, pos, out );   // the family's other generators, or not ours

	char tags[16];
	if( !readString( data, size, pos, tags, sizeof( tags ) ) || tags[0] != ',' )
		return false;

	switch( static_cast<ScoreCue::Kind>( kind ) )
	{
		case ScoreCue::Kind::Beat:
		case ScoreCue::Kind::Bar:
			if( strcmp( tags, ",i" ) != 0 || pos + 4 != size )
				return false;
			out.index = readInt( data, pos );
			break;

		case ScoreCue::Kind::Section:
		{
			if( strcmp( tags, ",sf" ) != 0 )
				return false;
			if( !readString( data, size, pos, out.text, sizeof( out.text ) ) || pos + 4 != size )
				return false;
			out.energy = readFloat( data, pos );
			for( int i = 0; i < static_cast<int>( CueSection::Count ); i++ )
				if( strcmp( out.text, kCueSectionNames[i] ) == 0 )
					out.section = i;
			break;
		}

		case ScoreCue::Kind::Key:
			if( strcmp( tags, ",s" ) != 0 )
				return false;
			if( !readString( data, size, pos, out.text, sizeof( out.text ) ) || pos != size )
				return false;
			out.keyPc = pitchClassOf( out.text );
			break;

		case ScoreCue::Kind::Drop:
			// A message with no arguments still carries a type tag string: "," on its own.
			if( strcmp( tags, "," ) != 0 || pos != size )
				return false;
			break;

		default:
			return false;
	}
	out.kind = static_cast<ScoreCue::Kind>( kind );
	return true;
}

// ---------------------------------------------------------------------------- a cue file's lines

int parseScoreCueLine( const char *line, double &seconds, ScoreCue &out )
{
	out = ScoreCue();
	seconds = 0.0;
	// Tab-separated fields; a trailing carriage return (a file written on Windows) is not part of the last one.
	std::string text( line != nullptr ? line : "" );
	while( !text.empty() && ( text.back() == '\r' || text.back() == '\n' ) )
		text.pop_back();
	size_t first = text.find_first_not_of( " \t" );
	if( first == std::string::npos || text[first] == '#' )
		return 0;
	std::vector<std::string> field;
	size_t from = 0;
	for( ;; )
	{
		const size_t tab = text.find( '\t', from );
		field.push_back( text.substr( from, tab == std::string::npos ? std::string::npos : tab - from ) );
		if( tab == std::string::npos )
			break;
		from = tab + 1;
	}
	if( field.size() < 2 )
		return -1;

	char *end = nullptr;
	seconds = strtod( field[0].c_str(), &end );
	if( end == field[0].c_str() || *end != 0 || seconds < 0.0 )
		return -1;
	int kind = -1;
	for( int i = 0; i < 5; i++ )
		if( field[1] == kAddresses[i] )
			kind = i;
	if( kind < 0 )
		return -1;

	const size_t args = field.size() - 2;
	switch( static_cast<ScoreCue::Kind>( kind ) )
	{
		case ScoreCue::Kind::Beat:
		case ScoreCue::Kind::Bar:
		{
			if( args != 1 )
				return -1;
			const long v = strtol( field[2].c_str(), &end, 10 );
			if( end == field[2].c_str() || *end != 0 )
				return -1;
			out.index = static_cast<int>( v );
			break;
		}
		case ScoreCue::Kind::Section:
		{
			if( args != 2 )
				return -1;
			snprintf( out.text, sizeof( out.text ), "%s", field[2].c_str() );
			out.energy = static_cast<float>( strtod( field[3].c_str(), &end ) );
			if( end == field[3].c_str() || *end != 0 )
				return -1;
			for( int i = 0; i < static_cast<int>( CueSection::Count ); i++ )
				if( strcmp( out.text, kCueSectionNames[i] ) == 0 )
					out.section = i;
			break;
		}
		case ScoreCue::Kind::Key:
			if( args != 1 )
				return -1;
			snprintf( out.text, sizeof( out.text ), "%s", field[2].c_str() );
			out.keyPc = pitchClassOf( out.text );
			break;
		case ScoreCue::Kind::Drop:
			if( args != 0 )
				return -1;
			break;
		default:
			return -1;
	}
	out.kind = static_cast<ScoreCue::Kind>( kind );
	return 1;
}

// ---------------------------------------------------------------------------- ScoreCueFile

ScoreCueFile &ScoreCueFile::instance()
{
	static ScoreCueFile s;
	return s;
}

int ScoreCueFile::load( const QString &path )
{
	reset();
	QFile f( path );
	if( !f.open( QIODevice::ReadOnly ) )
	{
		fprintf( stderr, "CUES: cannot open %s\n", qPrintable( path ) );
		return -1;
	}
	int lineNo = 0;
	while( !f.atEnd() )
	{
		const QByteArray line = f.readLine();
		lineNo++;
		Timed t;
		const int r = parseScoreCueLine( line.constData(), t.seconds, t.cue );
		if( r < 0 )
		{
			fprintf( stderr, "CUES: %s line %d is not a cue: %s", qPrintable( path ), lineNo, line.constData() );
			m_cues.clear();
			return -1;
		}
		if( r > 0 )
			m_cues.push_back( t );
	}
	std::stable_sort( m_cues.begin(), m_cues.end(), []( const Timed &a, const Timed &b ) { return a.seconds < b.seconds; } );
	fprintf( stderr, "CUES: %d cues from %s\n", static_cast<int>( m_cues.size() ), qPrintable( path ) );
	return static_cast<int>( m_cues.size() );
}

int ScoreCueFile::feed()
{
	const double now = m_clock.load( std::memory_order_relaxed );
	int n = 0;
	while( m_next < m_cues.size() && now >= 0.0 && m_cues[m_next].seconds <= now )
	{
		ScoreCues::instance().apply( m_cues[m_next].cue );
		m_next++;
		n++;
	}
	return n;
}

void ScoreCueFile::reset()
{
	m_cues.clear();
	m_next = 0;
	m_clock.store( -1.0, std::memory_order_relaxed );
}

// ---------------------------------------------------------------------------- ScoreCues

ScoreCues &ScoreCues::instance()
{
	static ScoreCues s;
	return s;
}

void ScoreCues::apply( const ScoreCue &c )
{
	m_accepted++;
	m_silence = 0.f;
	switch( c.kind )
	{
		case ScoreCue::Kind::Bar:
			m_bar      = true;
			m_barIndex = c.index;
			break;
		case ScoreCue::Kind::Section:
			m_section     = true;
			m_sectionType = c.section;
			m_energy      = c.energy;
			if( c.drop )
				m_drop = true;   // a dialect's Return, Drop or PEAK: a new section that lands as a drop
			break;
		case ScoreCue::Kind::Drop:
			m_drop = true;
			break;
		case ScoreCue::Kind::Key:
			m_keyPc = c.keyPc;
			break;
		default:
			// A beat carries no state of its own: the scheduler quantises to the BAR line, and a
			// per-beat trigger is exactly the kind of thing the temporal budget forbids. It still
			// counts as traffic, which is what keeps the live flag alive between bar lines.
			break;
	}
}

ScoreCues::Frame ScoreCues::drain( float dtSec )
{
	if( dtSec > 0.f )
		m_silence += dtSec;

	Frame f;
	// A generator that was switched off, or a network that went away, must not leave the scheduler
	// waiting for a section boundary that will never come: after kLiveSecs of silence the audio
	// analysis takes over again, exactly as if no sender had ever been there.
	f.live = ( m_silence < kLiveSecs );
	if( f.live )
	{
		f.downbeat    = m_bar;
		f.section     = m_section;
		f.drop        = m_drop;
		f.energy      = m_energy;
		f.sectionType = m_sectionType;
		f.keyPc       = m_keyPc;
		f.bar         = m_barIndex;
	}
	m_bar = m_section = m_drop = false;
	return f;
}

void ScoreCues::reset()
{
	*this = ScoreCues();
}

// ---------------------------------------------------------------------------- the scheduler hook

void applyScoreCues( const ScoreCues::Frame &cue, ScoreCueBridge &bridge, SceneScheduler::Tick &t )
{
	if( !cue.live )
	{
		// Nothing to say. The tick is left exactly as the audio built it -- this branch is what
		// makes the feature invisible when it is off, and `Kaleidoscope.exe -q` compares the bytes.
		bridge.wasLive     = false;
		bridge.lastSections = t.sectionCount;
		bridge.lastDrops    = t.dropCount;
		return;
	}

	// Taking over: continue counting from whatever the scheduler was handed last frame, so the
	// first cue still reads as a rising edge of exactly one and not as a jump it would ignore.
	if( !bridge.wasLive )
	{
		bridge.sections = bridge.lastSections;
		bridge.drops    = bridge.lastDrops;
		bridge.wasLive  = true;
	}
	if( cue.section )
		bridge.sections++;
	if( cue.drop )
		bridge.drops++;

	t.sectionCount = bridge.sections;
	t.dropCount    = bridge.drops;
	t.downbeatTick = cue.downbeat;
	// The song-structure memory is keyed on the analyser's recycled eight-slot LRU id. A cue has no
	// such id, and handing it the section TYPE instead would key every drop of a whole set to one
	// slot -- the "always the same scenes" failure that index has produced before. A cue-driven
	// section rolls fresh; see the header for the full reasoning.
	t.sectionId    = -1;
	t.sectionKnown = false;

	bridge.lastSections = t.sectionCount;
	bridge.lastDrops    = t.dropCount;
}

// ---------------------------------------------------------------------------- the socket

CueReceiver::CueReceiver( QObject *parent, const QString &bindAddress, int port )
	: QObject( parent )
{
	if( port <= 0 || port > 65535 )
		return;
	QHostAddress addr;
	if( !addr.setAddress( bindAddress ) )
		addr = QHostAddress::AnyIPv4;
	m_socket = new QUdpSocket( this );
	// ShareAddress for the same reason WebRemote's discovery socket uses it: two Kaleidoscope
	// instances on one machine should both be able to watch the same generator.
	if( m_socket->bind( addr, static_cast<quint16>( port ),
	                    QUdpSocket::ShareAddress | QUdpSocket::ReuseAddressHint ) )
	{
		QObject::connect( m_socket, &QUdpSocket::readyRead, this, [this]() { handleDatagrams(); } );
		m_listening = true;
		fprintf( stderr, "SCORE CUES: listening on UDP %s:%d\n",
		         bindAddress.toLocal8Bit().constData(), port );
	}
	else
		fprintf( stderr, "SCORE CUES: could not bind UDP %s:%d (%s) - the scheduler keeps using the audio.\n",
		         bindAddress.toLocal8Bit().constData(), port,
		         m_socket->errorString().toLocal8Bit().constData() );
}

void CueReceiver::handleDatagrams()
{
	while( m_socket->hasPendingDatagrams() )
	{
		QByteArray buf;
		buf.resize( static_cast<int>( m_socket->pendingDatagramSize() ) );
		const qint64 n = m_socket->readDatagram( buf.data(), buf.size() );
		if( n <= 0 )
			continue;
		ScoreCue c;
		if( decodeScoreCue( buf.constData(), static_cast<int>( n ), c ) )
			ScoreCues::instance().apply( c );
		else
			ScoreCues::instance().noteRejected();
	}
}
