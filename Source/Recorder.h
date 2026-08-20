/**
 * @file Recorder.h
 * @brief Framebuffer-capture-to-disk recorder: full recording ('r' /
 *        CLI -r) and a rolling instant-replay ring, sharing one PBO-backed
 *        async-readback + JPEG-encoder worker thread.
 */
#ifndef RECORDER_H
#define RECORDER_H

// Video-Recorder + Instant-Replay, herausgelöst aus GLwidget (2026-08-14).
//
// Zwei Betriebsarten, die sich einen Encoder-Worker teilen:
//   RECORDING  (Taste 'r'): ~30 fps in recordings/rec_*/frame_*.jpg + Audio-WAV,
//              am Ende detachter ffmpeg-Mux zu kaleidoscope.mp4.
//   REPLAY     (Taste 'y' scharf, 'x' speichert): rollender ~30-s-Ring aus
//              JPEG-Frames im RAM (~15 fps) + PCM-Ring des Analyzers.
//
// GPU-seitig läuft die Erfassung über einen doppelt gepufferten PBO-Readback:
// glReadPixels in ein Pixel-Pack-Buffer kehrt sofort zurück; konsumiert wird
// der Puffer des VORHERIGEN Frames, dessen DMA längst fertig ist. Ein Frame
// Latenz, kein GPU→CPU-Stall. Das Spiegeln/Skalieren/JPEG-Encodieren macht
// ein einzelner Worker-Thread (Reihenfolge bleibt erhalten); eine begrenzte
// Queue droppt Frames statt Speicher aufzublähen — die verlorene Zeit wandert
// als Carry in die Dauer des nächsten Frames, die Video-Timeline stimmt.
//
// Threading-Vertrag: alle public-Methoden werden vom GL-/GUI-Thread gerufen;
// captureIfDue() braucht einen aktuellen GL-Kontext. Der Worker fasst nur
// Queue + Replay-Ring an (eigene Mutexe).

#include <thread>
#include <mutex>
#include <condition_variable>
#include <deque>
#include <vector>

#include <QtCore/QString>
#include <QtCore/QElapsedTimer>
#include <QtGui/QImage>
#include <QtGui/qopengl.h>

class AudioAnalyzer;

/**
 * @brief Captures the rendered framebuffer to disk, either as a full
 *        recording or into a rolling instant-replay ring.
 *
 * Recorder owns a PBO-double-buffered async GL readback (captureIfDue(), one
 * frame of latency, no GPU->CPU stall) feeding a single background worker
 * thread that mirrors/scales/JPEG-encodes frames in order, shared by two
 * mutually exclusive modes: RECORDING ('r', ~30 fps to
 * recordings/rec_TIMESTAMP/frame_NNNNNN.jpg + an audio WAV, muxed to an mp4 via a
 * detached ffmpeg on stop) and instant REPLAY ('y' arms, 'x' saves; a
 * rolling ~30 s ring of JPEG frames at ~15 fps in RAM, paired with the
 * AudioAnalyzer's PCM ring, also muxed via ffmpeg on save). The encode
 * queue is bounded and drops frames under load rather than growing
 * unbounded; dropped frame durations are carried into the next queued
 * frame's duration so the resulting video's timeline still adds up.
 * Threading contract: every public method is called from the GL/GUI
 * thread, and captureIfDue() requires a current GL context; the worker
 * thread only ever touches the job queue and the replay ring, each behind
 * its own mutex.
 */
class Recorder
{
public:
	Recorder();
	~Recorder();          // joint nur noch den Worker; shutdown() vorher rufen!   ///< Only joins the worker thread now; call shutdown() beforehand to finalise a live recording.

	/** Der Analyzer liefert das Audio (WAV-Mitschnitt bzw. Replay-PCM-Ring).
	 *  nullptr ist erlaubt — dann entstehen stumme Videos. */
	/**
	 * @brief Set the audio source used for the recording WAV and the replay PCM ring.
	 * @param a Analyzer to pull audio from; nullptr is allowed and yields silent videos.
	 */
	void setAudioAnalyzer( AudioAnalyzer *a ) { m_audio = a; }

	/** VOR dem Löschen des AudioAnalyzers rufen (z.B. im ~GLwidget-Rumpf):
	 *  finalisiert eine laufende Aufnahme (Drain + Mux) und vergisst den
	 *  Analyzer — der Destruktor fasst ihn danach nicht mehr an. */
	/**
	 * @brief Finalise any in-progress recording (drain the worker + start the ffmpeg mux) and forget the audio analyzer.
	 *
	 * Must be called before the AudioAnalyzer is destroyed (e.g. in the body
	 * of ~GLwidget); afterwards the destructor no longer touches it.
	 */
	void shutdown();

	// ---- Recording (Taste 'r' / CLI -r / Batch-Ende) ----
	/** @brief Toggle recording on/off: starts a new timestamped recordings/rec_* directory and worker, or stops and finalises the current one. */
	void toggle();
	bool recording()  const { return m_recording; }   ///< True while a recording is in progress.
	int  frameCount() const { return m_recFrame; }    ///< Number of frames written to the current/last recording.

	// ---- Instant Replay (Tasten 'y' / 'x', Web-Remote) ----
	/** @brief Arm or disarm the rolling instant-replay ring buffer (starts/keeps the worker running while armed). */
	void toggleReplayArm();
	bool replayArmed() const { return m_replayArmed; }   ///< True while the instant-replay ring is actively capturing.
	/** @brief Save the current instant-replay ring to disk as replays/replay_TIMESTAMP/replay.mp4 (drops the request if fewer than 15 frames are buffered). */
	void saveReplay();

	/** Pro Frame rufen (GL-Kontext aktuell, Bild fertig gerendert, noch ohne
	 *  Overlays). Erfasst je nach Modus mit ~30 bzw. ~15 fps; w/h = physische
	 *  Framebuffer-Größe. */
	/**
	 * @brief Capture the current framebuffer if the active mode's frame interval has elapsed.
	 *
	 * Call once per frame with a current GL context, after the picture is
	 * fully rendered but before any overlays. Captures at ~30 fps while
	 * recording() or ~15 fps while replayArmed() (mutually exclusive).
	 * @param w Physical framebuffer width in pixels.
	 * @param h Physical framebuffer height in pixels.
	 */
	void captureIfDue( int w, int h );

private:
	void   captureFrame( int w, int h );        // Recording-Pfad (~30 fps)   ///< Recording-path capture (~30 fps), see captureFrame() definition.
	void   captureReplayFrame( int w, int h );  // Replay-Ring    (~15 fps)   ///< Replay-ring capture (~15 fps), see captureReplayFrame() definition.
	/**
	 * @brief Kick off the PBO double-buffered async readback for one frame and hand the previous frame's finished transfer to the encoder queue.
	 * @param dur Duration in seconds this frame should occupy in the output timeline.
	 * @param toReplay True to route the frame into the replay ring instead of a numbered recording frame file.
	 * @param w Framebuffer width in pixels.
	 * @param h Framebuffer height in pixels.
	 */
	void   asyncCapture( float dur, bool toReplay, int w, int h );
	/** @brief Drain and stop the encoder worker, close the audio WAV, write the concat list + fallback batch file, and launch a detached ffmpeg mux to kaleidoscope.mp4. */
	void   finishRecording();
	/** @brief Start the encoder worker thread if it isn't already running. */
	void   ensureWorker();
	/** @brief Encoder worker thread body: pulls jobs off the queue and mirrors/scales/JPEG-encodes them (to disk for recording jobs, into RAM for replay jobs) until told to quit. */
	void   worker();
	qint64 nowMs() const { return m_clock.elapsed(); }   ///< Milliseconds elapsed on the recorder's own clock since construction.

	AudioAnalyzer *m_audio = nullptr;   ///< Audio source for the recording WAV / replay PCM ring; may be null (silent video).
	QElapsedTimer  m_clock;                     // eigene Uhr (nur Deltas nötig)   ///< Recorder's own clock (only deltas are needed, via nowMs()).

	// Recording-Zustand
	bool    m_recording    = false;   ///< True while a full recording is in progress.
	QString m_recDir;                 ///< Output directory for the current/last recording (recordings/rec_*).
	int     m_recFrame     = 0;       ///< Number of recording frames written so far.
	qint64  m_recLastFrame = 0;       ///< Timestamp (ms) of the last recording frame capture, for pacing/duration.
	QString m_recConcat;                        // ffmpeg-concat-Liste im Aufbau   ///< ffmpeg concat-demuxer list being built incrementally.
	float   m_recCarryDur  = 0.f;               // Dauer gedroppter Frames   ///< Duration of frames dropped by the bounded queue, carried into the next queued frame's duration.

	// Encoder-Worker (bedient Recording UND Replay-Ring)
	/** @brief One unit of encoder work: an image to mirror/scale/encode, its destination path (empty means "route to the replay ring instead"), and its output duration. */
	/** @brief One unit of encoder work. `seq` is assigned on the GL thread and only
	 *  orders REPLAY frames (recording frames carry their index in `path`). */
	struct RecJob { QImage img; QString path; float dur = 0.f; unsigned long long seq = 0; };  // path leer -> Replay
	// A POOL, not one thread. Encoding is mirror + downscale + JPEG per frame and
	// was the pipeline's hard ceiling: measured across all 528 scenes the capture
	// rate sat at 8.4-12.7 fps (median 10.7) against a 30 fps cap, and it barely
	// varied with scene complexity -- the signature of a fixed per-frame cost, not
	// of shader load. Frames beyond the queue bound were dropped silently.
	// Recording jobs are order-independent (their frame index is baked into `path`
	// on the GL thread, and frames.txt is written there too), so they parallelise
	// freely; replay jobs are re-ordered by `seq` on insertion.
	std::vector<std::thread> m_threads;  ///< Encoder worker pool.
	std::mutex              m_mx;        ///< Guards m_queue and m_quit.
	std::condition_variable m_cv;        ///< Signals a worker when a job is queued or quit is requested.
	std::deque<RecJob>      m_queue;     ///< Bounded pending encode jobs (cap scales with the pool).
	double                  m_recDue = 0.0;  ///< Next capture deadline (ms). Advanced by a fixed period, never reset to 'now' -- see captureFrame().
	unsigned long long      m_seq = 0;   ///< Monotonic job counter (GL thread), orders replay frames.
	unsigned long long      m_dropped = 0; ///< Frames discarded because the queue was full; reported on stop.
	bool                    m_quit = false;   ///< Set to request the workers to exit once the queue drains.

	// PBO-Doppelpuffer für den asynchronen Readback
	GLuint m_pbo[2] = { 0, 0 };   ///< Double-buffered pixel-pack buffer objects for async glReadPixels.
	int    m_pboIdx = 0;          ///< Index of the PBO slot used for THIS frame's readback (the other slot is consumed).
	/** @brief Bookkeeping for one PBO slot's in-flight readback. */
	struct PboMeta { bool pending = false; bool replay = false;
	                 float dur = 0.f; int w = 0, h = 0; };
	PboMeta m_pboMeta[2];   ///< Per-PBO-slot metadata (pending flag, target mode, duration, size).

	// Replay-Ring
	/** @brief One buffered replay-ring frame: its JPEG bytes and output duration. */
	struct ReplayFrame { QByteArray jpg; float dur; unsigned long long seq = 0; };
	bool                    m_replayArmed = false;   ///< True while the instant-replay ring is armed and capturing.
	std::mutex              m_replayMx;              ///< Guards m_replayFrames.
	std::deque<ReplayFrame> m_replayFrames;          ///< Rolling ~30 s ring of encoded replay frames (oldest at the front).
	qint64                  m_repLastFrame = 0;       ///< Timestamp (ms) of the last replay-ring frame capture, for pacing/duration.
	float                   m_repCarryDur  = 0.f;     ///< Duration of replay frames dropped by the bounded queue, carried into the next queued replay frame's duration.
};

#endif
