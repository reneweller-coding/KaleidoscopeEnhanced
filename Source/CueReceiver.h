/**
 * @file CueReceiver.h
 * @brief Score cues over OSC/UDP: the generator tells the scheduler where the bars, the sections
 *        and the drops are, so it no longer has to guess them from the audio.
 *
 * The Phosphene psytrance generator (docs/PLAN.md 8.3 over there) WROTE the music it is playing.
 * It knows the bar line exactly, it knows a drop is coming before it lands, and it knows when a
 * section ends -- none of which an FFT of the loudspeaker output can do better than guess.
 * Switched on, it sends five messages, and this is the end that reads them:
 *
 * | message                | meaning                                             |
 * |------------------------|-----------------------------------------------------|
 * | `/phos/beat i`         | beat number from the start of the set                |
 * | `/phos/bar i`          | bar number from the start of the set                 |
 * | `/phos/section s f`    | a section starts: its type and its energy (0..1)     |
 * | `/phos/key s`          | the key from here, e.g. "F# Phrygian"                |
 * | `/phos/drop`           | a drop lands on this instant                         |
 *
 * **Nothing here is required.** With no sender -- the normal case -- ScoreCues::Frame::live stays
 * false and applyScoreCues() leaves the scheduler tick exactly as the audio analysis built it.
 * That is not a claim, it is checked: `Kaleidoscope.exe -q` builds a tick, runs it through
 * applyScoreCues() with nothing live, and compares the bytes.
 *
 * **And the cues never reach anything they should not.** They feed the two counters the scheduler
 * already watches for a rising edge (Tick::sectionCount, Tick::dropCount) and the downbeat flag it
 * already quantises to. Everything the standing rules protect -- camera, zoom, rotation, every
 * continuous motion -- is untouched, because a cue is an event on the same wire a section change
 * has always travelled on. A cue that lands mid-fade therefore meets the same guards as an
 * analyser-derived one (SceneScheduler.cpp: the `midFade` test, and the drop's shorten-the-running-
 * fade branch), and cannot retarget a fade that is already visible.
 *
 * The socket is a plain QUdpSocket on the Qt main thread, exactly like WebRemote's discovery
 * responder: the render loop and the event loop are the same thread here, so a datagram can be
 * turned into state the next frame reads without any synchronisation.
 *
 * **Or from a file (02.10.2026).** A rendered track has its cues written down beside it, so a batch
 * render (`-x track.wav -k track.cues.tsv`) can be steered by them as a live set is by the socket:
 * ScoreCueFile holds the file's cues and hands each to ScoreCues once the offline WAV has played up
 * to its time. One line per message, tab-separated -- the seconds, the address, the arguments:
 *
 * @code
 *   # seconds  address        arguments
 *   0.000      /phos/key      F# Phrygian
 *   0.000      /phos/section  Intro   0.20
 *   0.000      /phos/bar      0
 *   0.000      /phos/beat     0
 *   59.077     /phos/drop
 * @endcode
 */
#ifndef CUERECEIVER_H
#define CUERECEIVER_H

#include <QtCore/QObject>
#include <QtCore/QString>

#include <atomic>
#include <vector>

#include "SceneScheduler.h"

class QUdpSocket;

/** @brief The section categories `/phos/section` can name, in the generator's own order. */
enum class CueSection : int
{
	Intro = 0,   ///< the opening atmosphere
	Groove,      ///< the first core
	Build,       ///< a buildup towards a drop
	Drop,        ///< a core
	Break,       ///< a breakdown
	Outro,       ///< the closing bars
	Pdb,         ///< pre-drop break: the last bar of a buildup
	Cut,         ///< the first beats of a breakdown, everything but the reverb tail gone
	Count
};
/** @brief Display names, indexed by CueSection; also what arrives on the wire. */
extern const char *const kCueSectionNames[static_cast<int>( CueSection::Count )];

/** @brief One decoded OSC message. */
struct ScoreCue
{
	/** @brief Which of the five messages this is. */
	enum class Kind : int { Beat = 0, Bar, Section, Key, Drop, Unknown };

	Kind  kind    = Kind::Unknown;   ///< what arrived
	int   index   = 0;               ///< beat or bar number, for Kind::Beat and Kind::Bar
	int   section = -1;              ///< CueSection, or -1 when the name is not one we know
	float energy  = 0.f;             ///< 0..1 on the generator's energy arc, for Kind::Section
	int   keyPc   = -1;              ///< pitch class 0..11 of the key, or -1
	char  text[40] = {};             ///< the string argument as it arrived ("Drop", "F# Phrygian")
};

/**
 * @brief Decodes one OSC 1.0 datagram into a ScoreCue.
 *
 * Strict on purpose: a message whose padding, type tag string or length is not what the
 * specification says is rejected rather than half-read. Anything arriving on this port that is not
 * one of the five addresses is not an error either -- it is simply not ours.
 * @param data Datagram bytes.
 * @param size Their number.
 * @param out  Receives the decoded cue.
 * @return true when @p out is one of the five messages.
 */
bool decodeScoreCue( const char *data, int size, ScoreCue &out );

/**
 * @brief Reads one line of a cue file (see the file comment): the seconds, the address, the arguments.
 *
 * The same five messages with the same arguments as on the wire, and as strict: a line whose
 * address is not one of them, or whose arguments do not fit it, is refused.
 * @param line    The line, without its line break (a trailing carriage return is allowed).
 * @param seconds Receives the time of the cue, in seconds from the start of the WAV.
 * @param out     Receives the cue.
 * @return 1 for a cue, 0 for a blank line or a comment (`#`), -1 for a line that is neither.
 */
int parseScoreCueLine( const char *line, double &seconds, ScoreCue &out );

/**
 * @brief What the generator has said, as the render loop needs it: counters, not messages.
 *
 * One per process (the scheduler that reads it is per configuration, but the socket is not), the
 * same shape RenderPipeline::setLightShow() and s_pinned already use for global state.
 */
class ScoreCues
{
public:
	/** @brief One frame's worth of cue state, taken off the accumulator. */
	struct Frame
	{
		bool  live        = false;   ///< a cue arrived recently enough to steer the scheduler
		bool  downbeat    = false;   ///< a `/phos/bar` landed since the previous frame
		bool  section     = false;   ///< a `/phos/section` landed
		bool  drop        = false;   ///< a `/phos/drop` landed
		float energy      = 0.f;     ///< the energy of the section that is playing
		int   sectionType = -1;      ///< CueSection of that section, or -1
		int   keyPc       = -1;      ///< pitch class of the key, or -1
		int   bar         = -1;      ///< the last bar number that arrived
	};

	/** @brief How long after the last datagram the cues are still taken as live. */
	static const float kLiveSecs;

	/** @brief The one instance. */
	static ScoreCues &instance();

	/** @brief Takes one decoded message (main thread). @param c The cue. */
	void apply( const ScoreCue &c );

	/**
	 * @brief Reads and clears one frame's worth of events, and ages the live flag.
	 * @param dtSec Wall-clock seconds since the previous call.
	 * @return What the scheduler should be told this frame.
	 */
	Frame drain( float dtSec );

	/** @brief Datagrams accepted since the program started (for the remote's status page). */
	int accepted() const { return m_accepted; }
	/** @brief Datagrams that arrived on the port but were not one of the five messages. */
	int rejected() const { return m_rejected; }
	/** @brief Counts a datagram that did not decode; it changes no state and is not an error. */
	void noteRejected() { m_rejected++; }
	/** @brief Forgets everything (used by the self test, so one check cannot leak into the next). */
	void reset();

private:
	ScoreCues() {}

	float m_silence     = 1.0e6f;   ///< seconds since the last accepted datagram
	bool  m_bar         = false;    ///< a bar arrived since the last drain()
	bool  m_section     = false;    ///< @copydoc m_bar
	bool  m_drop        = false;    ///< @copydoc m_bar
	float m_energy      = 0.f;      ///< the last section's energy
	int   m_sectionType = -1;       ///< the last section's type
	int   m_keyPc       = -1;       ///< the last key
	int   m_barIndex    = -1;       ///< the last bar number
	int   m_accepted    = 0;        ///< @copydoc accepted
	int   m_rejected    = 0;        ///< @copydoc rejected
};

/**
 * @brief A cue file (`-k`): the generator's cues, handed to ScoreCues as the offline WAV reaches them.
 *
 * The clock is the WAV's own position (AudioAnalyzer::analyzeWavOffline() sets it after every block
 * on its thread; hence the atomic), so the cues land on the music the analyser is hearing, whatever
 * the frame rate. feed() runs on the main thread before the scheduler drains the cues; a cue whose
 * time has passed goes in once, in file order. Without a file nothing here does anything.
 */
class ScoreCueFile
{
public:
	/** @brief The one instance. */
	static ScoreCueFile &instance();

	/**
	 * @brief Reads a cue file and replaces whatever was loaded.
	 * @param path The file.
	 * @return The number of cues read, or -1 when the file cannot be opened or has a line that is
	 *         not a cue (it names the line on stderr).
	 */
	int load( const QString &path );

	/** @brief Whether a file with at least one cue is loaded. */
	bool active() const { return !m_cues.empty(); }

	/** @brief The WAV's position, in seconds (any thread). @param seconds Played so far. */
	void setClock( double seconds ) { m_clock.store( seconds, std::memory_order_relaxed ); }

	/**
	 * @brief Hands every cue up to the clock to ScoreCues (main thread).
	 * @return How many went in this time.
	 */
	int feed();

	/** @brief Forgets the file and the clock (used by the self test). */
	void reset();

private:
	ScoreCueFile() {}

	/** @brief One line of the file. */
	struct Timed
	{
		double   seconds = 0.0;   ///< when, from the start of the WAV
		ScoreCue cue;             ///< what
	};
	std::vector<Timed>  m_cues;              ///< the file's cues, sorted by time (stable: file order within a time)
	size_t              m_next  = 0;         ///< the first cue not yet handed over
	std::atomic<double> m_clock { -1.0 };    ///< the WAV's position; below zero until it plays
};

/**
 * @brief The two counters that turn a cue stream into the rising edges the scheduler watches.
 *
 * SceneScheduler reacts to `sectionCount == last + 1` and `dropCount == last + 1`, so a cue cannot
 * simply be written into those fields: the numbers have to keep counting from wherever the audio
 * analysis had got to. One of these lives in each RenderPipeline, beside the scheduler it feeds.
 */
struct ScoreCueBridge
{
	int  sections     = 0;       ///< sections handed over while the cues are live
	int  drops        = 0;       ///< drops handed over while the cues are live
	int  lastSections = 0;       ///< what was handed over last frame, from whichever source
	int  lastDrops    = 0;       ///< @copydoc lastSections
	bool wasLive      = false;   ///< whether the previous frame was cue-driven
};

/**
 * @brief Overlays a frame of score cues on a scheduler tick that was built from the audio.
 *
 * With ScoreCues::Frame::live false this does nothing at all -- @p t comes out byte for byte as it
 * went in, which is the property that makes the whole feature safe to ship switched off.
 *
 * With cues live, four fields change and no others:
 *  - `sectionCount` and `dropCount` count the generator's boundaries instead of the analyser's
 *    guesses, continuing from the number the scheduler was last handed so the rising edge still
 *    reads as +1 across the switch-over;
 *  - `downbeatTick` is the real bar line rather than a beat tracker's estimate of it;
 *  - `sectionKnown` is forced false. The scheduler's song-structure memory is keyed on the
 *    analyser's recycled eight-slot LRU id, and a cue does not carry one; feeding it the section
 *    TYPE instead would make every drop in a set replay the same scene, which is precisely the
 *    "always the same scenes" failure that index has caused before. A cue-driven section therefore
 *    always rolls fresh.
 * @param cue    This frame's cues.
 * @param bridge The counters, kept across frames by the caller.
 * @param t      The tick, modified in place.
 */
void applyScoreCues( const ScoreCues::Frame &cue, ScoreCueBridge &bridge, SceneScheduler::Tick &t );

/**
 * @brief Binds the cue port and feeds every datagram into ScoreCues.
 *
 * Deliberately NO Q_OBJECT: this project only runs moc over three headers
 * (AudioAnalyzer/glwidget/QMyWindow), and WebRemote sets the precedent for a plain QObject subclass
 * that uses lambda connections instead of its own signals. Parented to the widget that creates it,
 * so it dies with the window and needs no shutdown path of its own.
 */
class CueReceiver : public QObject
{
public:
	/**
	 * @brief Binds `<bindAddress>:<port>` and starts listening.
	 * @param parent      Owner (the GL widget), for Qt's parent/child destruction.
	 * @param bindAddress Interface to listen on; "0.0.0.0" for any, "127.0.0.1" for this machine only.
	 * @param port        UDP port; nothing is bound when it is 0 or out of range.
	 */
	CueReceiver( QObject *parent, const QString &bindAddress, int port );

	/** @brief Whether the socket is bound and listening. */
	bool listening() const { return m_listening; }

private:
	/** @brief Reads every pending datagram and hands what decodes to ScoreCues. */
	void handleDatagrams();

	QUdpSocket *m_socket    = nullptr;   ///< the bound socket, a child of this object
	bool        m_listening = false;     ///< @copydoc listening
};

/**
 * @brief `Kaleidoscope.exe -q`: the score-cue self test, run instead of opening a window.
 *
 * Five things, none of which needs a GL context, a sound card or a generator: the cue file's lines
 * and its clock (02.10.2026); the decoder against
 * datagrams built by hand from the OSC 1.0 specification (and against malformed ones, which have to
 * be refused); the accumulator's live/expire behaviour; a real socket, fed by a real QUdpSocket;
 * and the one property everything else rests on -- with no cues live, a scheduler tick comes out of
 * applyScoreCues() byte for byte as it went in.
 * @return 0 when every check held, 1 otherwise (the process exit code).
 */
int runCueSelfTest();

#endif // CUERECEIVER_H
