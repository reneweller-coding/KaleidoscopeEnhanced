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

#include <QtCore/QString>
#include <QtCore/QElapsedTimer>
#include <QtGui/QImage>
#include <QtGui/qopengl.h>

class AudioAnalyzer;

class Recorder
{
public:
	Recorder();
	~Recorder();          // joint nur noch den Worker; shutdown() vorher rufen!

	/** Der Analyzer liefert das Audio (WAV-Mitschnitt bzw. Replay-PCM-Ring).
	 *  nullptr ist erlaubt — dann entstehen stumme Videos. */
	void setAudioAnalyzer( AudioAnalyzer *a ) { m_audio = a; }

	/** VOR dem Löschen des AudioAnalyzers rufen (z.B. im ~GLwidget-Rumpf):
	 *  finalisiert eine laufende Aufnahme (Drain + Mux) und vergisst den
	 *  Analyzer — der Destruktor fasst ihn danach nicht mehr an. */
	void shutdown();

	// ---- Recording (Taste 'r' / CLI -r / Batch-Ende) ----
	void toggle();
	bool recording()  const { return m_recording; }
	int  frameCount() const { return m_recFrame; }

	// ---- Instant Replay (Tasten 'y' / 'x', Web-Remote) ----
	void toggleReplayArm();
	bool replayArmed() const { return m_replayArmed; }
	void saveReplay();

	/** Pro Frame rufen (GL-Kontext aktuell, Bild fertig gerendert, noch ohne
	 *  Overlays). Erfasst je nach Modus mit ~30 bzw. ~15 fps; w/h = physische
	 *  Framebuffer-Größe. */
	void captureIfDue( int w, int h );

private:
	void   captureFrame( int w, int h );        // Recording-Pfad (~30 fps)
	void   captureReplayFrame( int w, int h );  // Replay-Ring    (~15 fps)
	void   asyncCapture( float dur, bool toReplay, int w, int h );
	void   finishRecording();
	void   ensureWorker();
	void   worker();
	qint64 nowMs() const { return m_clock.elapsed(); }

	AudioAnalyzer *m_audio = nullptr;
	QElapsedTimer  m_clock;                     // eigene Uhr (nur Deltas nötig)

	// Recording-Zustand
	bool    m_recording    = false;
	QString m_recDir;
	int     m_recFrame     = 0;
	qint64  m_recLastFrame = 0;
	QString m_recConcat;                        // ffmpeg-concat-Liste im Aufbau
	float   m_recCarryDur  = 0.f;               // Dauer gedroppter Frames

	// Encoder-Worker (bedient Recording UND Replay-Ring)
	struct RecJob { QImage img; QString path; float dur = 0.f; };  // path leer -> Replay
	std::thread             m_thread;
	std::mutex              m_mx;
	std::condition_variable m_cv;
	std::deque<RecJob>      m_queue;
	bool                    m_quit = false;

	// PBO-Doppelpuffer für den asynchronen Readback
	GLuint m_pbo[2] = { 0, 0 };
	int    m_pboIdx = 0;
	struct PboMeta { bool pending = false; bool replay = false;
	                 float dur = 0.f; int w = 0, h = 0; };
	PboMeta m_pboMeta[2];

	// Replay-Ring
	struct ReplayFrame { QByteArray jpg; float dur; };
	bool                    m_replayArmed = false;
	std::mutex              m_replayMx;
	std::deque<ReplayFrame> m_replayFrames;
	qint64                  m_repLastFrame = 0;
	float                   m_repCarryDur  = 0.f;
};

#endif
