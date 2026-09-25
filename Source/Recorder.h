/**
 * @file Recorder.h
 * @brief Framebuffer-capture recorder: a full recording ('r' / CLI -r) piped
 *        raw into ffmpeg, and a rolling instant-replay ring of JPEG frames,
 *        both fed by one PBO-backed async readback.
 */
#ifndef RECORDER_H
#define RECORDER_H

// Video-Recorder + Instant-Replay, herausgelöst aus GLwidget (2026-08-14).
//
// Zwei Betriebsarten mit getrennten Ausgabewegen:
//   RECORDING  (Taste 'r'): ~30 fps als ROHE RGBA-Frames in eine laufende
//              ffmpeg-Instanz (recordings/rec_*/video.mp4), am Ende mit dem
//              Audio-WAV zu kaleidoscope.mp4 gemuxt — das Video wird dabei
//              nur KOPIERT, nicht neu kodiert.
//   REPLAY     (Taste 'y' scharf, 'x' speichert): rollender ~30-s-Ring aus
//              JPEG-Frames im RAM (~15 fps) + PCM-Ring des Analyzers.
//
// Warum roh: früher wurde jeder Frame ZWEIMAL kodiert — hier per CPU zu JPEG,
// danach dekodierte ffmpeg alle wieder, um daraus h264 zu machen — und alles
// über 720 px wurde vorher weggeworfen. Der JPEG-Pool (bis zu 6 Threads)
// existierte nur, um diese Stufe überhaupt bei 30 fps zu halten. Jetzt schafft
// EIN Schreib-Thread 30 fps bei voller Auflösung, weil er nur noch spiegelt
// und in eine Pipe schreibt. Der Pool bedient weiterhin den Replay-Ring und
// den Rückfallweg, falls ffmpeg nicht startet.
//
// GPU-seitig läuft die Erfassung über einen doppelt gepufferten PBO-Readback:
// glReadPixels in ein Pixel-Pack-Buffer kehrt sofort zurück; konsumiert wird
// der Puffer des VORHERIGEN Frames, dessen DMA längst fertig ist. Ein Frame
// Latenz, kein GPU→CPU-Stall. Begrenzte Queues droppen Frames statt Speicher
// aufzublähen — die verlorene Zeit wandert als Carry in die Dauer des nächsten
// Frames, und der Pipe-Schreiber rechnet gemessene Dauern in ganze Frames bei
// fester Bildrate um, sodass die Ausgabe CFR ist und trotzdem genau so lange
// dauert wie die Aufnahme.
//
// Threading-Vertrag: alle public-Methoden werden vom GL-/GUI-Thread gerufen;
// captureIfDue() braucht einen aktuellen GL-Kontext. Der Pool fasst nur Queue
// + Replay-Ring an, der Pipe-Thread nur seine eigene Queue und den ffmpeg-
// Prozess (QProcess ist nicht thread-sicher — er gehört diesem Thread allein).

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
class QProcess;

/**
 * @brief Captures the rendered framebuffer to disk, either as a full
 *        recording or into a rolling instant-replay ring.
 *
 * Recorder owns a PBO-double-buffered async GL readback (captureIfDue(), one
 * frame of latency, no GPU->CPU stall) feeding two mutually exclusive modes.
 * RECORDING ('r', ~30 fps) streams raw RGBA frames into a running ffmpeg at
 * the full render resolution and muxes that video with the audio WAV on stop,
 * copying the video stream rather than re-encoding it. Instant REPLAY ('y'
 * arms, 'x' saves) keeps a rolling ~30 s ring of JPEG frames at ~15 fps in
 * RAM, capped at 720 px because the ring's size is the constraint there,
 * paired with the AudioAnalyzer's PCM ring and muxed on save. Both queues are
 * bounded and drop frames under load rather than growing unbounded; a dropped
 * frame's duration is carried into the next queued frame so the timeline
 * still adds up. Threading contract: every public method is called from the
 * GL/GUI thread, and captureIfDue() requires a current GL context; the JPEG
 * pool only ever touches its queue and the replay ring, and the pipe thread
 * only its own queue and the ffmpeg process, each behind its own mutex.
 */
class Recorder
{
public:
	Recorder();
	~Recorder();          ///< Only joins the worker thread now; call shutdown() beforehand to finalise a live recording (joint nur noch den Worker; shutdown() vorher rufen!).

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
	void   captureFrame( int w, int h );        ///< Recording-path capture (~30 fps): paces against a fixed deadline and dispatches asyncCapture(); see the definition.
	void   captureReplayFrame( int w, int h );  ///< Replay-ring capture (~15 fps): rate-limits and dispatches asyncCapture() with toReplay=true; see the definition.
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

	// ---- raw video pipe (the recording path) ----
	// Recording frames no longer become JPEGs. They are written as raw RGBA
	// straight into a running ffmpeg, which encodes them once, in hardware.
	// The old path encoded every frame TWICE -- a CPU JPEG here, then ffmpeg
	// decoding all of them again to make the h264 -- and threw away everything
	// above 720 px on the way. See startVideoPipe() for why this needs its own
	// single thread rather than the pool.
	/** @brief Launch the ffmpeg process this recording pipes raw frames into, locking the video size to @p w x @p h. @return false if ffmpeg could not be started, which puts the recording on the JPEG fallback path. */
	bool   startVideoPipe( int w, int h );
	/** @brief Raw-pipe writer thread body: flips each recording frame, converts the measured frame durations into constant-rate output, and writes to ffmpeg's stdin in strict order. Finalises the ffmpeg process before returning. */
	void   pipeWriter();

	qint64 nowMs() const { return m_clock.elapsed(); }   ///< Milliseconds elapsed on the recorder's own clock since construction.

	AudioAnalyzer *m_audio = nullptr;   ///< Audio source for the recording WAV / replay PCM ring; may be null (silent video).
	QElapsedTimer  m_clock;                     ///< Recorder's own monotonic clock, started in the constructor; only deltas are ever used (via nowMs()) for frame pacing and durations.

	// Recording-Zustand
	bool    m_recording    = false;   ///< True while a full recording is in progress.
	QString m_recDir;                 ///< Output directory for the current/last recording (recordings/rec_*).
	int     m_recFrame     = 0;       ///< Number of recording frames written so far.
	qint64  m_recLastFrame = 0;       ///< Timestamp (ms) of the last recording frame capture, for pacing/duration.
	QString m_recConcat;                        ///< ffmpeg concat-demuxer list ("file ... / duration ...") built incrementally in asyncCapture() with the measured frame durations; written to frames.txt by finishRecording() on the JPEG fallback path.
	float   m_recCarryDur  = 0.f;               ///< Seconds of recording frames dropped by the bounded pipe queue, carried into the next queued recording frame's duration so the timeline still adds up.

	// Encoder-Worker (bedient Recording UND Replay-Ring)
	/** @brief One unit of encoder work: an image to mirror/scale/encode, its destination path (empty means "route to the replay ring instead"), and its output duration.
	 *  `seq` is assigned on the GL thread and only orders REPLAY frames (recording frames carry their index in `path`). */
	struct RecJob { QImage img; /**< Frame pixels as read back from the PBO (bottom-up, RGBA8888), copied so the PBO can be unmapped. */ QString path; /**< Destination JPEG path for a recording frame; empty = replay-ring job (path leer -> Replay). */ float dur = 0.f; /**< Seconds this frame occupies in the output timeline (measured delta plus any carried drop time). */ unsigned long long seq = 0; /**< Monotonic capture sequence number from m_seq; replay frames are re-sorted by it when inserted into the ring. */ };
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

	QProcess               *m_ff = nullptr;   ///< The ffmpeg receiving raw frames; created, used and destroyed ONLY on the pipe thread (QProcess is not thread-safe).
	std::thread             m_pipeThread;     ///< Single writer thread -- a pipe is a stream, so frame order is not negotiable.
	std::mutex              m_pipeMx;         ///< Guards m_pipeQueue and m_pipeQuit.
	std::condition_variable m_pipeCv;         ///< Signals the pipe thread that a frame is queued or that the recording is stopping.
	std::deque<RecJob>      m_pipeQueue;      ///< Pending recording frames awaiting the pipe.
	bool                    m_pipeQuit = false;      ///< Set to ask the pipe thread to drain, close ffmpeg's stdin and exit.
	bool                    m_pipeFallback = false;  ///< ffmpeg unavailable: recording frames are handed to the JPEG pool instead, exactly as before this path existed.
	int                     m_pipeW = 0;      ///< Video width the pipe was opened with; later frames are rescaled to it (a resolution change mid-recording would otherwise desynchronise the raw stream).
	int                     m_pipeH = 0;      ///< Video height the pipe was opened with.
	double                  m_pipeOwed = 0.0; ///< Fractional output-frame debt: measured durations are turned into whole frames at kPipeFps, so the CFR output still lasts exactly as long as the capture did.
	std::vector<uchar>      m_pipeBuf;        ///< Reusable scratch holding one vertically flipped frame (GL readback is bottom-up).
	QString                 m_videoPath;      ///< The video-only mp4 ffmpeg writes (recordings/rec_*/video.mp4); muxed with the audio WAV on stop. Empty until startVideoPipe() ran.

	// ---- motion blur ----
	// The app renders at the display rate (120 Hz here) but records at 30 or
	// 60, so most rendered frames are currently drawn and thrown away. Summing
	// them into the captured frame is a temporal box filter over the capture
	// interval -- what a shutter does -- and costs no extra rendering, because
	// those frames exist either way.
	/** @brief Creates or resizes the accumulation targets. @return false if they could not be created, which disables motion blur for the run. */
	bool   ensureBlurTargets( int w, int h );
	/** @brief Adds the frame currently in the read framebuffer to the accumulator. */
	void   accumulateFrame( int w, int h );
	/** @brief Divides the accumulator by the frames that went in and leaves the result in m_mbResolveFbo, ready for readback. */
	void   resolveBlur( int w, int h );

	bool   m_mbWanted   = false;   ///< Setting: motion blur requested for this run (ini key motionBlur).
	bool   m_mbReady    = false;   ///< Targets exist and the program linked.
	bool   m_mbTried    = false;   ///< Creation attempted; a soft failure is permanent, not retried per frame.
	GLuint m_mbAccumTex = 0;       ///< RGBA16F sum of the frames since the last capture (8-bit would clip after ~4 frames).
	GLuint m_mbAccumFbo = 0;       ///< FBO with m_mbAccumTex attached; accumulateFrame() draws into it with additive (GL_ONE, GL_ONE) blending.
	GLuint m_mbResolveTex = 0;     ///< RGBA8 target holding sum/N, which the PBO readback then reads.
	GLuint m_mbResolveFbo = 0;     ///< FBO with m_mbResolveTex attached; resolveBlur() leaves it bound as the READ framebuffer so the following asyncCapture() reads the average.
	GLuint m_mbSrcTex   = 0;       ///< Copy of the rendered frame, so it can be SAMPLED (glCopyTexSubImage2D, no shader).
	GLuint m_mbProg     = 0;       ///< Accumulate.frag program (standard.vert): writes tex * scale; used for both the add (scale 1) and the divide (scale 1/N). 0 = not yet linked or link failed.
	GLint  m_mbTexUni   = -1;      ///< Uniform location: source sampler ("tex") of m_mbProg.
	GLint  m_mbScaleUni = -1;      ///< Uniform location: multiplier ("scale") of m_mbProg -- 1 when accumulating, 1/m_mbCount when resolving.
	/** @brief Width in pixels the blur targets were allocated for; a size change reallocates them. */
	int    m_mbW = 0, m_mbH = 0;   ///< Height in pixels the blur targets were allocated for.
	int    m_mbCount = 0;          ///< Frames summed since the last capture; the divisor is this MEASURED count.

	// PBO-Doppelpuffer für den asynchronen Readback
	GLuint m_pbo[2] = { 0, 0 };   ///< Double-buffered pixel-pack buffer objects for async glReadPixels.
	int    m_pboIdx = 0;          ///< Index of the PBO slot used for THIS frame's readback (the other slot is consumed).
	/** @brief Bookkeeping for one PBO slot's in-flight readback. */
	struct PboMeta { bool pending = false; /**< A glReadPixels into this slot has been issued and not yet consumed. */ bool replay = false; /**< Destination of the frame: true = replay ring, false = recording pipe. */
	                 float dur = 0.f; /**< Output duration in seconds handed to the resulting RecJob. */ int w = 0, /**< Readback width in pixels (the QImage geometry when mapping). */ h = 0; /**< Readback height in pixels. */ };
	PboMeta m_pboMeta[2];   ///< Per-PBO-slot metadata (pending flag, target mode, duration, size).

	// Replay-Ring
	/** @brief One buffered replay-ring frame: its JPEG bytes and output duration. */
	struct ReplayFrame { QByteArray jpg; /**< JPEG-encoded frame (quality 80, at most 720 px tall). */ float dur; /**< Seconds this frame lasts in the replay timeline; summed to trim the ring to ~31 s. */ unsigned long long seq = 0; /**< Capture sequence number (RecJob::seq); the ring is kept sorted by it. */ };
	bool                    m_replayArmed = false;   ///< True while the instant-replay ring is armed and capturing.
	std::mutex              m_replayMx;              ///< Guards m_replayFrames.
	std::deque<ReplayFrame> m_replayFrames;          ///< Rolling ~30 s ring of encoded replay frames (oldest at the front).
	qint64                  m_repLastFrame = 0;       ///< Timestamp (ms) of the last replay-ring frame capture, for pacing/duration.
	float                   m_repCarryDur  = 0.f;     ///< Duration of replay frames dropped by the bounded queue, carried into the next queued replay frame's duration.
};

#endif
