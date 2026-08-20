/**
 * @file Recorder.cpp
 * @brief Implementation of Recorder: the PBO async-readback capture path,
 *        the shared encoder worker thread, recording start/stop lifecycle,
 *        and instant-replay ring save.
 */
#include <algorithm>

#include <QtCore/QBuffer>
#include <QtCore/QDateTime>
#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QProcess>
#include <QtCore/QStringList>

#include "glcore.h"        // Core-Profile-Einsprungpunkte (PBO-Funktionen)
#include "Recorder.h"
#include "AudioAnalyzer.h"

#ifndef GL_PIXEL_PACK_BUFFER
#define GL_PIXEL_PACK_BUFFER 0x88EB
#endif
#ifndef GL_STREAM_READ
#define GL_STREAM_READ 0x88E1
#endif

Recorder::Recorder()
{
	m_clock.start();
}

Recorder::~Recorder()
{
	// shutdown() sollte vorher gelaufen sein (finalisiert mit lebendem
	// AudioAnalyzer). Falls nicht: wenigstens den Worker sauber beenden.
	shutdown();
}

/**
 * @brief Finalise any in-progress recording, or otherwise just stop the worker thread, and forget the audio analyzer.
 *
 * If a recording is in progress it goes through the normal
 * finishRecording() path (drain + mux) so it ends up complete even if the
 * caller forgot to call shutdown() before destroying the AudioAnalyzer. If
 * no recording is running but the worker is still alive (e.g. servicing the
 * replay ring), it is asked to quit and joined directly. Either way,
 * m_audio is cleared last so nothing after this call can dereference a
 * soon-to-be-destroyed analyzer.
 */
void Recorder::shutdown()
{
	if( m_recording )
	{
		m_recording = false;
		finishRecording();
	}
	else if( m_thread.joinable() )
	{
		{
			std::lock_guard<std::mutex> lk( m_mx );
			m_quit = true;
		}
		m_cv.notify_all();
		m_thread.join();
	}
	m_audio = nullptr;
}

/**
 * @brief Start or stop a full recording.
 *
 * On start: creates a fresh timestamped recordings/rec_* directory, resets
 * the frame counter/concat list/carry duration, starts the audio WAV
 * capture (if an analyzer is set), and ensures the shared encoder worker is
 * running. On stop: hands off to finishRecording() to drain and mux, then
 * restarts the worker if the replay ring is still armed (the worker was
 * shared and finishRecording() joins it).
 */
void Recorder::toggle()
{
	if( !m_recording )
	{
		// Millisecond resolution: two short-lived recordings (e.g. back-to-back
		// verify.ps1 probes) starting in the same wall-clock SECOND used to
		// compute the identical rec_YYYYMMDD_HHMMSS name; QDir().mkpath() on an
		// already-existing directory is a silent no-op, so the second run's
		// frames landed in the first run's folder, numbered from 0 and
		// overwriting/interleaving with the first scene's frames.
		QString ts = QDateTime::currentDateTime().toString("yyyyMMdd_hhmmss_zzz");
		m_recDir = QString("recordings/rec_%1").arg(ts);
		QDir().mkpath( m_recDir );
		m_recFrame = 0;
		m_recConcat.clear();
		m_recCarryDur  = 0.f;
		m_recLastFrame = nowMs();
		if( m_audio )
			m_audio->startRecording( m_recDir + "/audio.wav" );
		// Encoder-Worker starten (EIN Thread -> Frames bleiben in Reihenfolge).
		ensureWorker();
		m_recording = true;
		fprintf( stderr, "REC start -> %s\n", m_recDir.toLocal8Bit().constData() );
	}
	else
	{
		m_recording = false;
		finishRecording();
		// Der Worker bedient auch den Replay-Ring — bei Bedarf neu starten.
		if( m_replayArmed )
			ensureWorker();
	}
}

/**
 * @brief Arm/disarm the instant-replay ring.
 *
 * Arming starts the shared encoder worker (if not already running) and
 * resets the replay pacing clock so the first captured frame doesn't get a
 * bogus huge duration.
 */
void Recorder::toggleReplayArm()
{
	m_replayArmed = !m_replayArmed;
	if( m_replayArmed )
	{
		ensureWorker();
		m_repLastFrame = 0;
	}
	fprintf( stderr, "Instant-Replay-Puffer: %s\n", m_replayArmed ? "AN" : "AUS" );
}

void Recorder::captureIfDue( int w, int h )
{
	if( m_recording )
		captureFrame( w, h );
	else if( m_replayArmed )
		captureReplayFrame( w, h );
}

// Encoder-Worker: spiegelt, skaliert und JPEG-encodiert die Frames abseits
// des GL-Threads, damit die Aufnahme das Rendern nicht mehr ausbremst.
/**
 * @brief Encoder worker thread loop.
 *
 * Waits on m_cv for either a queued job or a quit request; on quit it still
 * drains the queue completely before returning, so every frame that was
 * ever accepted into the queue gets written before shutdown()/
 * finishRecording() proceeds to mux. Each job is bottom-up mirrored (GL
 * readback is bottom-up) and downscaled to at most 720 px tall. A job with
 * an empty @c path is a replay-ring job: it's JPEG-encoded straight into
 * memory and appended to m_replayFrames, after which the ring is trimmed
 * from the front to stay under ~31 s of total duration. A job with a path
 * is a recording frame and is saved to disk as a JPEG at that path.
 */
void Recorder::worker()
{
	for(;;)
	{
		RecJob job;
		{
			std::unique_lock<std::mutex> lk( m_mx );
			m_cv.wait( lk, [this]{ return m_quit || !m_queue.empty(); } );
			if( m_queue.empty() )
			{
				if( m_quit ) return;      // erst beenden, wenn alles geschrieben ist
				continue;
			}
			job = std::move( m_queue.front() );
			m_queue.pop_front();
		}
		int h = job.img.height();
		QImage out = job.img.mirrored( false, true )               // GL ist bottom-up
		                .scaledToHeight( h > 720 ? 720 : h, Qt::SmoothTransformation );

		if( job.path.isEmpty() )
		{
			// Replay-Ring-Job: in den Speicher encodieren, ~30 s Historie halten.
			QByteArray jpg;
			QBuffer buf( &jpg );
			buf.open( QIODevice::WriteOnly );
			out.save( &buf, "JPG", 80 );
			std::lock_guard<std::mutex> rl( m_replayMx );
			m_replayFrames.push_back( ReplayFrame{ jpg, job.dur } );
			float total = 0.f;
			for( const ReplayFrame &r : m_replayFrames ) total += r.dur;
			while( total > 31.f && m_replayFrames.size() > 1 )
			{
				total -= m_replayFrames.front().dur;
				m_replayFrames.pop_front();
			}
			continue;
		}

		out.save( job.path, "JPG", 85 );
	}
}

void Recorder::ensureWorker()
{
	if( m_thread.joinable() )
		return;
	m_quit = false;
	m_thread = std::thread( &Recorder::worker, this );
}

// Instant Replay: ~15 fps in den rollenden Ring, solange scharf (und nicht
// ohnehin aufgenommen wird — der Recording-Pfad erfasst mit 30 fps).
/**
 * @brief Rate-limit and dispatch one replay-ring capture (~15 fps).
 *
 * Skips the frame if less than ~66 ms (1/15 s) has elapsed since the last
 * replay capture. The measured inter-frame duration is clamped to 0.5 s so
 * a pause or the very first frame doesn't inject a huge gap into the replay
 * timeline.
 */
void Recorder::captureReplayFrame( int w, int h )
{
	qint64 now = nowMs();
	if( now - m_repLastFrame < 66 )
		return;
	float dur = (m_repLastFrame == 0) ? (1.f/15.f) : float(now - m_repLastFrame) / 1000.f;
	if( dur > 0.5f ) dur = 0.5f;                 // Lücken klemmen (Pause, 1. Frame)
	m_repLastFrame = now;

	asyncCapture( dur, true, w, h );
}

// PBO-doppelt-gepufferter Async-Readback — siehe Header-Kommentar. Stellt den
// glReadPixels DIESES Frames in PBO[cur] ein (kehrt sofort zurück) und
// konsumiert den fertigen Transfer des VORHERIGEN Frames aus PBO[prev].
/**
 * @brief Issue this frame's async PBO readback and consume the previous frame's completed transfer into the encoder queue.
 *
 * This is the core of the "one frame of latency, zero GPU->CPU stall"
 * design: glReadPixels into PBO[cur] with a NULL client pointer queues a
 * DMA transfer and returns immediately (glBufferData with NULL data also
 * orphans the buffer, so a resolution change doesn't corrupt an in-flight
 * transfer). PBO[prev] holds LAST frame's transfer, which by now has had a
 * full frame to complete, so glMapBuffer on it does not block. The mapped
 * data is copied into a QImage and pushed onto the shared job queue (capped
 * at 8 pending jobs); if the queue is full the frame is dropped and its
 * duration is carried (m_repCarryDur / m_recCarryDur) into whichever frame
 * of the same kind (replay vs. recording) is queued next, so the resulting
 * video's total duration still matches wall-clock time despite the drop.
 * Successfully queued recording frames also grow the ffmpeg concat-list
 * string (m_recConcat) with their filename and duration right here.
 * @param dur Output duration in seconds this frame should occupy in the timeline.
 * @param toReplay True to route the frame into the replay ring; false to write it as a numbered recording frame.
 * @param w Framebuffer width in pixels (readback size).
 * @param h Framebuffer height in pixels (readback size).
 */
void Recorder::asyncCapture( float dur, bool toReplay, int w, int h )
{
	if( w < 2 || h < 2 ) return;

	if( m_pbo[0] == 0 )
		glGenBuffers( 2, m_pbo );

	const int cur  = m_pboIdx;
	const int prev = 1 - m_pboIdx;

	// 1. Readback dieses Frames einreihen (Orphaning passt die Größe bei
	//    Auflösungswechseln an)
	glBindBuffer( GL_PIXEL_PACK_BUFFER, m_pbo[cur] );
	glBufferData( GL_PIXEL_PACK_BUFFER, (GLsizeiptr)w * h * 4, NULL, GL_STREAM_READ );
	glReadPixels( 0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, 0 );
	m_pboMeta[cur].pending = true;
	m_pboMeta[cur].replay  = toReplay;
	m_pboMeta[cur].dur     = dur;
	m_pboMeta[cur].w       = w;
	m_pboMeta[cur].h       = h;

	// 2. Daten des vorherigen Frames konsumieren (DMA ist längst fertig)
	PboMeta &pm = m_pboMeta[prev];
	if( pm.pending )
	{
		pm.pending = false;
		glBindBuffer( GL_PIXEL_PACK_BUFFER, m_pbo[prev] );
		void *ptr = glMapBuffer( GL_PIXEL_PACK_BUFFER, GL_READ_ONLY );
		if( ptr )
		{
			QImage img( (const uchar*)ptr, pm.w, pm.h, QImage::Format_RGBA8888 );
			bool queued = false;
			QString fn;
			if( !pm.replay )
				fn = QString("%1/frame_%2.jpg").arg(m_recDir).arg(m_recFrame, 6, 10, QChar('0'));
			{
				std::lock_guard<std::mutex> lk( m_mx );
				if( m_queue.size() < 8 )
				{
					float carry = pm.replay ? m_repCarryDur : 0.f;
					m_queue.push_back( RecJob{ img.copy(), fn, pm.dur + carry } );
					queued = true;
				}
			}
			glUnmapBuffer( GL_PIXEL_PACK_BUFFER );
			if( queued )
			{
				m_cv.notify_one();
				if( pm.replay )
					m_repCarryDur = 0.f;
				else
				{
					m_recConcat += QString("file 'frame_%1.jpg'\nduration %2\n")
					               .arg(m_recFrame, 6, 10, QChar('0'))
					               .arg(pm.dur + m_recCarryDur, 0, 'f', 4);
					m_recCarryDur = 0.f;
					m_recFrame++;
				}
			}
			else if( pm.replay ) m_repCarryDur += pm.dur;
			else                 m_recCarryDur += pm.dur;
		}
	}
	glBindBuffer( GL_PIXEL_PACK_BUFFER, 0 );

	m_pboIdx = prev;
}

// Replay-Ring (Frames + rollendes Audio) speichern und wie eine Aufnahme muxen.
/**
 * @brief Save the current replay ring to disk and mux it (with trimmed audio) into replays/replay_TIMESTAMP/replay.mp4.
 *
 * Bails out (with a stderr hint) if fewer than 15 frames are buffered.
 * Otherwise snapshots the ring under its mutex, writes every frame as a
 * numbered JPEG plus an ffmpeg concat list (frames.txt), and asks the audio
 * analyzer for a WAV dump covering the ring's total video duration (+0.5 s
 * slack). Because the audio ring typically holds MORE history than the
 * video ring, the WAV input is trimmed from the front via ffmpeg's -ss so
 * both streams end bündig (flush) together at the end. The mux itself runs
 * as a detached ffmpeg process, exactly like finishRecording()'s.
 */
void Recorder::saveReplay()
{
	std::deque<ReplayFrame> frames;
	{
		std::lock_guard<std::mutex> rl( m_replayMx );
		frames = m_replayFrames;
	}
	if( frames.size() < 15 )
	{
		fprintf( stderr, "REPLAY: noch nichts im Puffer (mit 'y' aktivieren, dann etwas warten)\n" );
		return;
	}

	QString ts  = QDateTime::currentDateTime().toString("yyyyMMdd_hhmmss");
	QString dir = QString("replays/replay_%1").arg(ts);
	QDir().mkpath( dir );

	QString concat;
	float total = 0.f;
	for( int i = 0; i < (int)frames.size(); ++i )
	{
		QString fn = QString("frame_%1.jpg").arg(i, 6, 10, QChar('0'));
		QFile f( dir + "/" + fn );
		if( f.open(QIODevice::WriteOnly) ) { f.write( frames[i].jpg ); f.close(); }
		concat += QString("file '%1'\nduration %2\n").arg(fn).arg(frames[i].dur, 0, 'f', 4);
		total  += frames[i].dur;
	}
	concat += QString("file 'frame_%1.jpg'\n").arg((int)frames.size()-1, 6, 10, QChar('0'));
	QFile lf( dir + "/frames.txt" );
	if( lf.open(QIODevice::WriteOnly | QIODevice::Text) )
	{ lf.write( concat.toLocal8Bit() ); lf.close(); }

	bool haveAudio = m_audio
	              && m_audio->dumpReplayWav( dir + "/audio.wav", total + 0.5f );

	QStringList args;
	args << "-y" << "-f" << "concat" << "-safe" << "0" << "-i" << (dir + "/frames.txt");
	if( haveAudio )
	{
		// Der Audio-Ring hält MEHR als das Video: Anfang so trimmen, dass
		// beide Enden bündig liegen (ffmpeg -ss auf dem WAV-Input).
		float wavLen = total + 0.5f;
		args << "-ss" << QString::number( std::max(0.f, wavLen - total), 'f', 2 )
		     << "-i" << (dir + "/audio.wav");
	}
	args << "-c:v" << "libx264" << "-pix_fmt" << "yuv420p";
	if( haveAudio ) args << "-c:a" << "aac";
	args << "-shortest" << (dir + "/replay.mp4");
	QProcess::startDetached( "ffmpeg", args );

	fprintf( stderr, "REPLAY: %d Frames (%.1f s) -> %s (mux replay.mp4)\n",
	         (int)frames.size(), total, dir.toLocal8Bit().constData() );
}

// Das frisch gerenderte Bild (sauber, vor jedem Overlay) mit ~30 fps erfassen
// und dem Encoder-Worker übergeben; auf dem GL-Thread bleiben nur glReadPixels
// + ein memcpy. Die ffmpeg-concat-Liste entsteht hier mit den echten Dauern.
/**
 * @brief Rate-limit and dispatch one recording capture (~30 fps).
 *
 * Skips the frame if less than ~33 ms (1/30 s) has elapsed since the last
 * recording capture. Duration for the very first frame is assumed to be
 * exactly 1/30 s; every subsequent frame uses the real measured delta so
 * the concat-list durations (built in asyncCapture()) reflect actual
 * pacing, not a nominal frame rate.
 */
void Recorder::captureFrame( int w, int h )
{
	qint64 now = nowMs();
	if( now - m_recLastFrame < 33 )      // ~30-fps-Deckel
		return;
	float dur = (m_recFrame == 0) ? (1.0f/30.0f) : float(now - m_recLastFrame) / 1000.f;
	m_recLastFrame = now;

	asyncCapture( dur, false, w, h );    // PBO-Pfad: kein GPU->CPU-Stall
}

// Finalisieren: WAV schließen, concat-Liste + make_video.bat schreiben und
// ffmpeg detacht die Frames + Audio zu kaleidoscope.mp4 muxen lassen.
/**
 * @brief Finalise a recording: drop any in-flight PBO frame, drain and stop the worker, close the audio WAV, write the concat list and a fallback batch file, and launch a detached ffmpeg mux.
 *
 * Order matters here:
 *  1. Both m_pboMeta[] pending flags are cleared FIRST so a frame that was
 *     still in flight in the PBO pipeline is discarded rather than being
 *     consumed and appended to frames.txt after that file has already been
 *     finalised (which would desync the concat list from what's on disk).
 *  2. The worker thread is asked to quit and joined; since worker() only
 *     returns once its queue is empty, every frame that WAS already queued
 *     is guaranteed to be written to disk before the mux starts reading it.
 *  3. The audio WAV is stopped (flushed and closed) only after the worker
 *     has drained, so encoding never races the file being finalised.
 *  4. frames.txt gets a final duplicate of the last frame entry (without a
 *     duration) because the ffmpeg concat demuxer requires one; a
 *     make_video.bat is also written as a manual fallback in case the
 *     immediately-launched detached ffmpeg mux doesn't run (e.g. not on
 *     PATH in some environment).
 */
void Recorder::finishRecording()
{
	// Zuerst jeden In-Flight-PBO-Frame verwerfen: er darf nicht als
	// verirrter Recording-Job konsumiert werden, nachdem frames.txt final ist.
	m_pboMeta[0].pending = false;
	m_pboMeta[1].pending = false;

	// Worker drainen + beenden (er endet erst bei leerer Queue, jeder
	// eingereihte Frame wird also noch geschrieben, bevor der Mux startet).
	if( m_thread.joinable() )
	{
		{
			std::lock_guard<std::mutex> lk( m_mx );
			m_quit = true;
		}
		m_cv.notify_all();
		m_thread.join();
	}

	if( m_audio )
		m_audio->stopRecording();      // flusht + schließt das WAV

	QString listPath = m_recDir + "/frames.txt";
	QFile lf( listPath );
	if( lf.open(QIODevice::WriteOnly | QIODevice::Text) )
	{
		QByteArray data = m_recConcat.toLocal8Bit();
		if( m_recFrame > 0 )   // concat-Demuxer will den letzten Eintrag doppelt, ohne Dauer
			data += QString("file 'frame_%1.jpg'\n").arg(m_recFrame-1, 6, 10, QChar('0')).toLocal8Bit();
		lf.write( data );
		lf.close();
	}

	QFile bf( m_recDir + "/make_video.bat" );
	if( bf.open(QIODevice::WriteOnly | QIODevice::Text) )
	{
		bf.write( "@echo off\r\ncd /d \"%~dp0\"\r\n"
		          "ffmpeg -y -f concat -safe 0 -i frames.txt -i audio.wav "
		          "-c:v libx264 -pix_fmt yuv420p -c:a aac -shortest kaleidoscope.mp4\r\n"
		          "pause\r\n" );
		bf.close();
	}

	// Sofort automatisch muxen (detacht; ffmpeg ist auf dem PATH).
	// make_video.bat bleibt als Fallback liegen.
	QStringList args;
	args << "-y" << "-f" << "concat" << "-safe" << "0" << "-i" << listPath
	     << "-i" << (m_recDir + "/audio.wav")
	     << "-c:v" << "libx264" << "-pix_fmt" << "yuv420p" << "-c:a" << "aac"
	     << "-shortest" << (m_recDir + "/kaleidoscope.mp4");
	QProcess::startDetached( "ffmpeg", args );

	fprintf( stderr, "REC stop: %d frames -> %s (muxing kaleidoscope.mp4)\n",
	         m_recFrame, m_recDir.toLocal8Bit().constData() );
}
