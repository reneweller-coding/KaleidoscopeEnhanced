/**
 * @file ScoreCues.h
 * @brief Score cues without the socket: the decoder for the generators' OSC messages, the cue file
 *        (`-k`) and ScoreCues, the accumulator the render loop reads.
 *
 * The messages, the generators' dialects and the cue file's format are described in CueReceiver.h,
 * which adds the UDP socket and the bridge to the scheduler. This part needs neither the network
 * nor the scheduler, so the PresetEditor, which compiles AudioAnalyzer.cpp (it feeds ScoreCueFile
 * the WAV's clock), links it on its own.
 */
#ifndef SCORECUES_H
#define SCORECUES_H

#include <QtCore/QString>

#include <atomic>
#include <cstddef>
#include <vector>

/** @brief The section categories `/phos/section` can name, in the generator's own order. */
enum class CueSectionE : int
{
    INTRO = 0, ///< the opening atmosphere
    GROOVE,    ///< the first core
    BUILD,     ///< a buildup towards a drop
    DROP,      ///< a core
    BREAK,     ///< a breakdown
    OUTRO,     ///< the closing bars
    PDB,       ///< pre-drop break: the last bar of a buildup
    CUT,       ///< the first beats of a breakdown, everything but the reverb tail gone
    COUNT
};
/** @brief Display names, indexed by CueSectionE; also what arrives on the wire. */
extern const char *const CueSectionNames[static_cast<int>( CueSectionE::COUNT )];

/** @brief One decoded OSC message. */
struct ScoreCue
{
    /** @brief Which of the five messages this is. */
    enum class KindE : int
    {
        BEAT = 0,
        BAR,
        SECTION,
        KEY,
        DROP,
        UNKNOWN
    };

    KindE kind = KindE::UNKNOWN; ///< what arrived
    int   index = 0;             ///< beat or bar number, for Kind::Beat and Kind::Bar
    int   section = -1;          ///< CueSectionE, or -1 when the name is not one we know
    float energy = 0.f;          ///< 0..1 on the generator's energy arc, for Kind::Section
    int   keyPc = -1;            ///< pitch class 0..11 of the key, or -1
    char  text[40] = {};         ///< the string argument as it arrived ("Drop", "F# Phrygian")
    bool  drop = false;          ///< a section that lands as a drop as well (a dialect's Return, Drop or PEAK)
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
 * same shape RenderPipeline::setLightShow() and M_Pinned already use for global state.
 */
class ScoreCues
{
public:
    /** @brief One frame's worth of cue state, taken off the accumulator. */
    struct Frame
    {
        bool  live = false;     ///< a cue arrived recently enough to steer the scheduler
        bool  downbeat = false; ///< a `/phos/bar` landed since the previous frame
        bool  section = false;  ///< a `/phos/section` landed
        bool  drop = false;     ///< a `/phos/drop` landed
        float energy = 0.f;     ///< the energy of the section that is playing
        int   sectionType = -1; ///< CueSectionE of that section, or -1
        int   keyPc = -1;       ///< pitch class of the key, or -1
        int   bar = -1;         ///< the last bar number that arrived
    };

    /** @brief How long after the last datagram the cues are still taken as live. */
    static const float LiveSecs;

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

    float m_silence = 1.0e6f; ///< seconds since the last accepted datagram
    bool  m_bar = false;      ///< a bar arrived since the last drain()
    bool  m_section = false;  ///< @copydoc m_bar
    bool  m_drop = false;     ///< @copydoc m_bar
    float m_energy = 0.f;     ///< the last section's energy
    int   m_sectionType = -1; ///< the last section's type
    int   m_keyPc = -1;       ///< the last key
    int   m_barIndex = -1;    ///< the last bar number
    int   m_accepted = 0;     ///< @copydoc accepted
    int   m_rejected = 0;     ///< @copydoc rejected
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
        double   seconds = 0.0; ///< when, from the start of the WAV
        ScoreCue cue;           ///< what
    };
    std::vector<Timed>  m_cues;          ///< the file's cues, sorted by time (stable: file order within a time)
    size_t              m_next = 0;      ///< the first cue not yet handed over
    std::atomic<double> m_clock{ -1.0 }; ///< the WAV's position; below zero until it plays
};

#endif // SCORECUES_H
