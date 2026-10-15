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
 * **The family's dialects (02.10.2026).** The other generators of the family say the same things in their own words,
 * and decodeScoreCue() understands them too: Totality (`/tot/beat i f`, `/tot/bar i`, `/tot/block s`, `/tot/op s`,
 * `/tot/key s` -- a Camelot label such as "8A"), Parhelion (`/parh/...`, the same five), Ephemeris (`/eph/beat i f`,
 * `/eph/phase s i`, `/eph/key s`, `/eph/conjunction i f`) and Noctuary (`/noct/bar i`, `/noct/key s`, `/noct/scene s
 * f`). A block, a phase or a scene becomes a section of the table above (a Return, a Drop, a PEAK lands as a drop as
 * well), a bar line is a bar line (Ephemeris has none: its every fourth beat is one), an operation or a conjunction
 * keeps the cues alive without moving anything.
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

#include "SceneScheduler.h"
#include "ScoreCues.h"

class QUdpSocket;

/**
 * @brief The two counters that turn a cue stream into the rising edges the scheduler watches.
 *
 * SceneScheduler reacts to `sectionCount == last + 1` and `dropCount == last + 1`, so a cue cannot
 * simply be written into those fields: the numbers have to keep counting from wherever the audio
 * analysis had got to. One of these lives in each RenderPipeline, beside the scheduler it feeds.
 */
struct ScoreCueBridge
{
    int  sections = 0;     ///< sections handed over while the cues are live
    int  drops = 0;        ///< drops handed over while the cues are live
    int  lastSections = 0; ///< what was handed over last frame, from whichever source
    int  lastDrops = 0;    ///< @copydoc lastSections
    bool wasLive = false;  ///< whether the previous frame was cue-driven
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

    QUdpSocket *m_socket = nullptr;  ///< the bound socket, a child of this object
    bool        m_listening = false; ///< @copydoc listening
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
