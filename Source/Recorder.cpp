/**
 * @file Recorder.cpp
 * @brief Implementation of Recorder: the PBO async-readback capture path,
 *        the shared encoder worker thread, recording start/stop lifecycle,
 *        and instant-replay ring save.
 */
#include <algorithm>
#include <mutex>
#include <chrono>
#include <thread>

#include <QtCore/QBuffer>
#include <QtCore/QDateTime>
#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QProcess>
#include <QtCore/QSettings>
#include <QtCore/QStringList>

#include "glcore.h"        // Core-Profile-Einsprungpunkte (PBO-Funktionen)
#include "Recorder.h"
#include "AudioAnalyzer.h"

// ---------------------------------------------------------------------------
// Video codec selection: prefer the GPU's NVENC block over libx264.
//
// Every mux here used to hard-code libx264, i.e. the CPU re-encoded the whole
// recording after the CPU had already JPEG-encoded every frame. On a machine
// with an NVENC block that is two software encodes for a job the GPU does in
// fixed-function silicon, and it competes for the very cores the audio
// analysis runs on.
//
// Presence in `ffmpeg -encoders` is NOT sufficient: an ffmpeg build can list
// h264_nvenc while the driver or GPU refuses it at runtime. So this actually
// ENCODES a tiny throwaway clip once and keeps the result. Probed lazily on
// first use, never on the render thread's critical path.
// Does this encoder actually work HERE? Encodes a throwaway clip and checks the
// exit code. 256x256 on purpose: NVENC, AMF and QSV all impose minimum
// dimensions and alignment, and a 64x64 probe can be rejected by a perfectly
// working encoder -- which would silently demote the machine to software.
static bool probeEncoder( const QString &enc, const QStringList &encArgs )
{
    QProcess p;
    QStringList a;
    a << "-hide_banner" << "-loglevel" << "error"
      << "-f" << "lavfi" << "-i" << "nullsrc=s=256x256:d=0.2"
      << encArgs << "-pix_fmt" << "yuv420p" << "-f" << "null" << "-";
    p.start( "ffmpeg", a );
    if( !p.waitForFinished( 15000 ) )
    {
        p.kill();
        p.waitForFinished( 2000 );
        return false;
    }
    const bool ok = ( p.exitStatus() == QProcess::NormalExit && p.exitCode() == 0 );
    if( !ok )
        fprintf( stderr, "[recorder]   %s unavailable\n", qPrintable( enc ) );
    return ok;
}

struct Candidate { const char *name; QStringList args; };

// One family per output codec. Within a family: discrete-GPU encoder first
// (on a machine that has one it is also the card doing the rendering, so its
// encode block is the silicon sitting idle next to the work), then Intel's
// integrated Quick Sync, then software.
//
// The rate-control flags are per-vendor and NOT interchangeable: NVENC wants
// -cq, AMF wants -rc cqp with explicit qp values, QSV wants -global_quality,
// x264/x265 want -crf. Passing the wrong one is ignored without a warning and
// you get whatever default bitrate the encoder felt like. SVT-AV1's -crf is a
// different scale again -- 30 there is roughly x264's 20, not a quality drop.
static QList<Candidate> codecFamily( const QString &fam )
{
    if( fam == "hevc" )
        return {
            { "hevc_nvenc", { "-c:v", "hevc_nvenc", "-preset", "p5", "-cq", "20",
                              "-tag:v", "hvc1" } },
            { "hevc_amf",   { "-c:v", "hevc_amf", "-quality", "balanced",
                              "-rc", "cqp", "-qp_i", "20", "-qp_p", "20",
                              "-tag:v", "hvc1" } },
            { "hevc_qsv",   { "-c:v", "hevc_qsv", "-preset", "medium",
                              "-global_quality", "20", "-tag:v", "hvc1" } },
            { "libx265",    { "-c:v", "libx265", "-preset", "medium", "-crf", "20",
                              "-tag:v", "hvc1" } },
        };
    if( fam == "av1" )
        return {
            // AV1's quality scale runs 0..63, not 0..51 like h264/hevc, and NVENC
            // needs an explicit rate control with -b:v 0 or it targets a bitrate
            // and ignores -cq entirely. Measured on an RTX 5090 against the same
            // 8 s source (size / SSIM vs. source):
            //   av1 -cq 20  60.2 MB / 0.9906     h264 -cq 20  55.4 MB / 0.9750
            //   av1 -cq 25  29.0 MB / 0.9736     hevc -cq 20  21.2 MB / 0.9812
            //   av1 -cq 32  24.2 MB / 0.9676
            // cq 25 is the point that matches h264's quality at roughly half the
            // size. Note HEVC beats every AV1 point here on BOTH axes, so on
            // NVIDIA hardware av1 is a compatibility choice, not a quality one.
            { "av1_nvenc",  { "-c:v", "av1_nvenc", "-preset", "p5",
                              "-rc", "vbr", "-cq", "25", "-b:v", "0" } },
            { "av1_amf",    { "-c:v", "av1_amf", "-quality", "balanced",
                              "-rc", "cqp", "-qp_i", "20", "-qp_p", "20" } },
            { "av1_qsv",    { "-c:v", "av1_qsv", "-preset", "medium",
                              "-global_quality", "25" } },
            { "libsvtav1",  { "-c:v", "libsvtav1", "-preset", "8", "-crf", "30" } },
        };
    return {
        { "h264_nvenc", { "-c:v", "h264_nvenc", "-preset", "p5", "-cq", "20" } },
        { "h264_amf",   { "-c:v", "h264_amf", "-quality", "balanced",
                          "-rc", "cqp", "-qp_i", "20", "-qp_p", "20" } },
        { "h264_qsv",   { "-c:v", "h264_qsv", "-preset", "medium",
                          "-global_quality", "20" } },
        { "libx264",    { "-c:v", "libx264", "-preset", "medium", "-crf", "20" } },
    };
}

// Which output codec to aim for. h264 stays the DEFAULT because it is the one
// every player, editor and phone opens without thinking. hevc roughly halves
// the file at the same quality, which matters now that recordings run at the
// full render resolution rather than 720p; av1 is smaller still but slower to
// encode and younger in playback support.
static QString wantedCodecFamily()
{
    QString fam = qEnvironmentVariable( "KALEIDO_VIDEO_CODEC" ).trimmed().toLower();
    if( fam.isEmpty() )
    {
        // Same file the rest of the app uses (see RenderPipeline::loadSettings
        // and the SetupTool), read directly so the Recorder stays free of
        // settings plumbing.
        QSettings st( "..\\kaleidoscope_settings.ini", QSettings::IniFormat );
        fam = st.value( "videoCodec", "h264" ).toString().trimmed().toLower();
    }
    if( fam == "h265" ) fam = "hevc";
    if( fam != "hevc" && fam != "av1" ) fam = "h264";
    return fam;
}

static QStringList computeVideoCodecArgs()
{
    QStringList cached;
    const QString fam = wantedCodecFamily();
    const QList<Candidate> candidates = codecFamily( fam );

    // Escape hatch: KALEIDO_VIDEO_ENCODER=hevc_nvenc (or any encoder name in
    // any family) skips the search. Still verified before use, so a typo or an
    // unsupported pick falls through to the normal order rather than producing
    // a broken recording.
    const QString forced = qEnvironmentVariable( "KALEIDO_VIDEO_ENCODER" ).trimmed();
    if( !forced.isEmpty() )
    {
        for( const QString &f : { QString("h264"), QString("hevc"), QString("av1") } )
            for( const Candidate &c : codecFamily( f ) )
                if( forced.compare( QLatin1String( c.name ), Qt::CaseInsensitive ) == 0
                    && probeEncoder( c.name, c.args ) )
                {
                    cached = c.args;
                    cached << "-pix_fmt" << "yuv420p";
                    fprintf( stderr, "[recorder] video encoder: %s (forced via KALEIDO_VIDEO_ENCODER)\n",
                             c.name );
                    return cached;
                }
        fprintf( stderr, "[recorder] KALEIDO_VIDEO_ENCODER=\"%s\" not usable, probing normally\n",
                 qPrintable( forced ) );
    }

    for( const Candidate &c : candidates )
    {
        // libx264 is the h264 family's last entry and is assumed present rather
        // than probed: if ffmpeg exists at all it has it, and probing would only
        // add a startup delay on machines with no hardware encoder -- exactly
        // the ones that can least afford it. libx265/libsvtav1 get no such pass:
        // plenty of ffmpeg builds ship without them.
        const bool assumePresent = ( qstrcmp( c.name, "libx264" ) == 0 );
        const bool isSoftware = assumePresent
                             || qstrcmp( c.name, "libx265" ) == 0
                             || qstrcmp( c.name, "libsvtav1" ) == 0;
        if( assumePresent || probeEncoder( c.name, c.args ) )
        {
            cached = c.args;
            cached << "-pix_fmt" << "yuv420p";
            fprintf( stderr, "[recorder] video encoder: %s (%s)\n",
                     c.name, isSoftware ? "CPU, no hardware encoder found" : "hardware" );
            return cached;
        }
    }

    // The requested family is not available on this machine at all. Fall back to
    // h264 rather than failing the recording -- a bigger file beats no file.
    if( fam != "h264" )
    {
        fprintf( stderr, "[recorder] no %s encoder available here - falling back to h264\n",
                 qPrintable( fam ) );
        for( const Candidate &c : codecFamily( "h264" ) )
        {
            const bool assumePresent = ( qstrcmp( c.name, "libx264" ) == 0 );
            if( assumePresent || probeEncoder( c.name, c.args ) )
            {
                cached = c.args;
                cached << "-pix_fmt" << "yuv420p";
                fprintf( stderr, "[recorder] video encoder: %s (%s)\n",
                         c.name, assumePresent ? "CPU" : "hardware" );
                return cached;
            }
        }
    }

    cached << "-c:v" << "libx264" << "-pix_fmt" << "yuv420p";   // unreachable, kept safe
    return cached;
}

// The probe spawns up to three short ffmpeg processes. finishRecording() needs
// the answer, and finishRecording() runs on the GL thread -- so probing there
// would stall the render loop at the exact moment the user stops a recording.
// warmVideoEncoderProbe() therefore kicks it off on a throwaway thread when
// recording STARTS, roughly a full recording ahead of when the answer is due.
//
// std::call_once, not "if( cached.isEmpty() )": with two threads reaching for
// the same cache that check is a data race, and call_once also gives the
// blocking behaviour we want if a recording is somehow stopped before the warm
// probe finished -- the GL thread waits for the running probe instead of
// starting a second one.
static std::once_flag g_codecOnce;
static QStringList    g_codecArgs;

// NOT a bare static std::thread: ~thread() calls std::terminate() if the thread
// is still joinable, so arming the replay ring and then closing the window
// before anything was ever muxed would abort the process on the way out. The
// holder joins instead. The explicit joinVideoEncoderProbe() calls below mean
// this destructor is a backstop that normally has nothing left to do.
struct ProbeThread
{
    std::thread t;
    ~ProbeThread() { if( t.joinable() ) t.join(); }
};
static ProbeThread g_codecProbe;

static QStringList videoCodecArgs()
{
    std::call_once( g_codecOnce, []{ g_codecArgs = computeVideoCodecArgs(); } );
    return g_codecArgs;
}

static void warmVideoEncoderProbe()
{
    if( g_codecProbe.t.joinable() ) return;       // already warming
    g_codecProbe.t = std::thread( []{ videoCodecArgs(); } );
}

// Must run before the process can exit: a detached probe still inside QProcess
// while QCoreApplication tears down is a crash at shutdown. By the time this is
// called videoCodecArgs() has already returned, so call_once is satisfied and
// the join only waits for the thread to unwind.
static void joinVideoEncoderProbe()
{
    if( g_codecProbe.t.joinable() ) g_codecProbe.t.join();
}


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
	else if( !m_threads.empty() )
	{
		{
			std::lock_guard<std::mutex> lk( m_mx );
			m_quit = true;
		}
		m_cv.notify_all();
		for( std::thread &t : m_threads ) if( t.joinable() ) t.join();
		m_threads.clear();
	}
	// Safety net. finishRecording() normally joins the pipe thread; if control
	// ever reaches here with it still running, joining beats ~thread()'s
	// std::terminate().
	if( m_pipeThread.joinable() )
	{
		{
			std::lock_guard<std::mutex> lk( m_pipeMx );
			m_pipeQuit = true;
		}
		m_pipeCv.notify_all();
		m_pipeThread.join();
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
		m_recDue       = 0.0;   // re-armed on the first captured frame
		if( m_audio )
			m_audio->startRecording( m_recDir + "/audio.wav" );
		// Encoder-Worker starten (EIN Thread -> Frames bleiben in Reihenfolge).
		ensureWorker();
		warmVideoEncoderProbe();   // Codec-Probe jetzt, nicht erst beim Stoppen

		// Raw-Pipe-Schreiber: nimmt ab jetzt die Aufnahme-Frames entgegen.
		m_pipeQuit     = false;
		m_pipeFallback = false;
		m_pipeW = m_pipeH = 0;
		m_pipeOwed = 0.0;
		m_videoPath.clear();
		if( !m_pipeThread.joinable() )
			m_pipeThread = std::thread( &Recorder::pipeWriter, this );
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
		warmVideoEncoderProbe();   // ein Replay-Save muxt ebenfalls
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
		// This pool now serves the REPLAY ring (and recording only on the ffmpeg
		// fallback path). The 720 px cap belongs here: the ring holds ~30 s of
		// frames in RAM, so its size is the constraint. Recordings go through
		// the raw pipe instead and keep their full resolution.
		int h = job.img.height();
		QImage out = job.img.mirrored( false, true )               // GL ist bottom-up
		                // FastTransformation, not Smooth: this is a 1080->720 downscale
	                // that is then JPEG-encoded at quality 80-85, where the
	                // difference is not visible, and Smooth was a large share of
	                // the per-frame encode cost.
	                .scaledToHeight( h > 720 ? 720 : h, Qt::FastTransformation );

		if( job.path.isEmpty() )
		{
			// Replay-Ring-Job: in den Speicher encodieren, ~30 s Historie halten.
			QByteArray jpg;
			QBuffer buf( &jpg );
			buf.open( QIODevice::WriteOnly );
			out.save( &buf, "JPG", 80 );
			std::lock_guard<std::mutex> rl( m_replayMx );
			// Recording jobs are order-independent (their index is in the path),
			// but this ring IS the replay timeline, so with a pool the frames
			// have to go back in `seq` order. They arrive nearly sorted, so the
			// scan from the back is O(1) in practice.
			{
				auto it = m_replayFrames.end();
				while( it != m_replayFrames.begin() && (it - 1)->seq > job.seq ) --it;
				m_replayFrames.insert( it, ReplayFrame{ jpg, job.dur, job.seq } );
			}
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

// Nominal output frame rate of the raw pipe. It matches the capture deadline
// in captureFrame(); the writer converts each frame's MEASURED duration into a
// whole number of output frames at this rate, so the file stays constant-rate
// (which every player and editor prefers) while still lasting exactly as long
// as the capture did.
// Read once per process from the settings file. 30 is the default because it
// halves the file for material that is mostly slow evolution; 60 is there for
// fast scenes, where 30 visibly steps. Not a per-recording knob on purpose --
// changing it mid-recording would break the constant-rate contract the pipe
// writer relies on.
static double recordFps()
{
    static double fps = 0.0;
    if( fps == 0.0 )
    {
        QSettings st( "..\\kaleidoscope_settings.ini", QSettings::IniFormat );
        const int v = st.value( "recordFps", 30 ).toInt();
        fps = ( v >= 45 ) ? 60.0 : 30.0;     // only these two are offered
    }
    return fps;
}

/**
 * @brief Start the ffmpeg that this recording pipes raw frames into.
 *
 * The size is locked here, on the first captured frame, because rawvideo has
 * no per-frame headers -- the decoder is told the geometry once and every
 * subsequent byte is positional. A window resize mid-recording would shear the
 * whole stream, so pipeWriter() rescales later frames to this size instead.
 *
 * Input is rgba because that is exactly what glReadPixels handed us: no
 * conversion, no intermediate image. The encoder flags come from the same
 * probe the mux uses, so a recording is hardware-encoded wherever a mux
 * would have been.
 */
bool Recorder::startVideoPipe( int w, int h )
{
	m_pipeW = w;
	m_pipeH = h;
	m_videoPath = m_recDir + "/video.mp4";

	QStringList a;
	a << "-y" << "-hide_banner" << "-loglevel" << "error"
	  << "-f" << "rawvideo"
	  << "-pixel_format" << "rgba"
	  << "-video_size" << QString( "%1x%2" ).arg( w ).arg( h )
	  << "-framerate" << QString::number( recordFps() )
	  << "-i" << "-"
	  << videoCodecArgs()
	  << m_videoPath;

	m_ff = new QProcess();
	m_ff->setProcessChannelMode( QProcess::ForwardedErrorChannel );
	m_ff->start( "ffmpeg", a );
	if( !m_ff->waitForStarted( 10000 ) )
	{
		fprintf( stderr, "[recorder] could not start ffmpeg for the raw video pipe - "
		                 "falling back to writing JPEG frames.\n" );
		delete m_ff;
		m_ff = nullptr;
		return false;
	}
	fprintf( stderr, "[recorder] raw pipe: %dx%d @ %.0f fps, encoded once (no JPEG stage)\n",
	         w, h, recordFps() );
	return true;
}

/**
 * @brief Raw-pipe writer thread.
 *
 * Single-threaded on purpose. The pool exists because JPEG-encoding a frame
 * was expensive; writing raw bytes is not, and a pipe carries no frame index,
 * so out-of-order writes would garble the video rather than merely reorder it.
 * One producer (the GL thread) and one consumer therefore keep frame order for
 * free.
 *
 * On quit it drains whatever is still queued, closes ffmpeg's stdin -- which
 * is how ffmpeg learns the stream ended -- and waits for it to finish writing
 * the file, so finishRecording() can mux immediately afterwards.
 */
void Recorder::pipeWriter()
{
	bool tried = false;
	for(;;)
	{
		RecJob job;
		{
			std::unique_lock<std::mutex> lk( m_pipeMx );
			m_pipeCv.wait( lk, [this]{ return m_pipeQuit || !m_pipeQueue.empty(); } );
			if( m_pipeQueue.empty() )
			{
				if( m_pipeQuit ) break;
				continue;
			}
			job = std::move( m_pipeQueue.front() );
			m_pipeQueue.pop_front();
		}

		if( !tried )
		{
			tried = true;
			m_pipeFallback = !startVideoPipe( job.img.width(), job.img.height() );
		}
		if( m_pipeFallback )
		{
			// Hand it to the JPEG pool: that path is unchanged and still
			// leaves frames + make_video.bat for a manual mux.
			//
			// This WAITS for room rather than dropping. Dropping here would be
			// wrong twice over: the pool queue would otherwise grow unbounded
			// with full-resolution images, and asyncCapture() has already
			// written this frame's line into frames.txt, so a frame discarded
			// at this point would leave the concat list pointing at a JPEG that
			// never gets written -- which fails the whole mux. Blocking instead
			// pushes the backpressure up to the bounded pipe queue, where the
			// GL thread drops with the carry/concat accounting intact.
			// No deadlock: finishRecording() joins this thread BEFORE it stops
			// the pool, so the pool is always still draining.
			for(;;)
			{
				{
					std::lock_guard<std::mutex> lk( m_mx );
					if( m_queue.size() < 6 * m_threads.size() + 2 )
					{
						m_queue.push_back( std::move( job ) );
						break;
					}
				}
				std::this_thread::sleep_for( std::chrono::milliseconds( 2 ) );
			}
			m_cv.notify_one();
			continue;
		}

		QImage src = job.img;
		if( src.width() != m_pipeW || src.height() != m_pipeH )
			src = src.scaled( m_pipeW, m_pipeH, Qt::IgnoreAspectRatio, Qt::FastTransformation );

		// Flip bottom-up into the scratch buffer. This replaces QImage::mirrored(),
		// which allocated a whole image per frame.
		const int stride = m_pipeW * 4;
		const size_t bytes = size_t( stride ) * size_t( m_pipeH );
		if( m_pipeBuf.size() != bytes ) m_pipeBuf.resize( bytes );
		for( int y = 0; y < m_pipeH; ++y )
			memcpy( m_pipeBuf.data() + size_t( y ) * stride,
			        src.constScanLine( m_pipeH - 1 - y ), stride );

		// Measured duration -> whole output frames. The debt carries the
		// fraction forward, so rounding never accumulates into drift.
		m_pipeOwed += double( job.dur ) * recordFps();
		int n = int( m_pipeOwed + 0.5 );
		if( n < 1 ) n = 1;
		if( n > 8 ) n = 8;          // a long stall must not spool out a huge run
		m_pipeOwed -= n;

		for( int k = 0; k < n; ++k )
		{
			m_ff->write( (const char*)m_pipeBuf.data(), qint64( bytes ) );
			// Backpressure: without this the QProcess write buffer grows without
			// bound whenever the encoder is briefly slower than the capture.
			while( m_ff->bytesToWrite() > qint64( 64 ) * 1024 * 1024 )
				if( !m_ff->waitForBytesWritten( 5000 ) ) break;
		}
	}

	if( m_ff )
	{
		m_ff->closeWriteChannel();          // EOF -> ffmpeg finalises the file
		if( !m_ff->waitForFinished( 60000 ) )
		{
			fprintf( stderr, "[recorder] ffmpeg did not finish in time - killing it; "
			                 "the video may be truncated.\n" );
			m_ff->kill();
			m_ff->waitForFinished( 5000 );
		}
		delete m_ff;
		m_ff = nullptr;
	}
}

void Recorder::ensureWorker()
{
	if( !m_threads.empty() )
		return;
	m_quit = false;
	// One encoder thread could not keep up with the 30 fps cap (measured ~11 fps
	// sustained, near-identical for every scene). Leave two cores for the GL and
	// audio threads; the pool is small on purpose, encoding is memory-bound.
	unsigned hw = std::thread::hardware_concurrency();
	unsigned n  = ( hw > 4u ) ? ( hw - 2u ) : 2u;
	if( n > 6u ) n = 6u;
	for( unsigned i = 0; i < n; ++i )
		m_threads.emplace_back( &Recorder::worker, this );
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
			if( pm.replay )
			{
				std::lock_guard<std::mutex> lk( m_mx );
				// Bound scales with the pool so the extra threads actually have
				// work in flight. A full queue still drops the frame (never
				// stalls the GL thread) but now it is counted, not silent.
				if( m_queue.size() < 6 * m_threads.size() + 2 )
				{
					m_queue.push_back( RecJob{ img.copy(), fn, pm.dur + m_repCarryDur, m_seq++ } );
					queued = true;
				}
				else
				{
					++m_dropped;   // encoder saturated; frame discarded, never a GL stall
				}
			}
			else
			{
				// Recording frames go to the raw pipe, which has its own single
				// writer (order matters on a stream). The bound is smaller than
				// the pool's: there is no per-frame encode to hide latency
				// behind, and each pending frame is a full uncompressed image.
				std::lock_guard<std::mutex> lk( m_pipeMx );
				if( m_pipeQueue.size() < 8 )
				{
					m_pipeQueue.push_back( RecJob{ img.copy(), fn, pm.dur + m_recCarryDur, m_seq++ } );
					queued = true;
				}
				else
				{
					++m_dropped;
				}
			}
			glUnmapBuffer( GL_PIXEL_PACK_BUFFER );
			if( queued )
			{
				if( pm.replay )
				{
					m_cv.notify_one();
					m_repCarryDur = 0.f;
				}
				else
				{
					m_pipeCv.notify_one();
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
	args << videoCodecArgs();
	if( haveAudio ) args << "-c:a" << "aac";
	args << "-shortest" << (dir + "/replay.mp4");
	QProcess::startDetached( "ffmpeg", args );
	joinVideoEncoderProbe();

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

	// Fixed 30 fps DEADLINE, advanced by exactly one period -- not a
	// "has 33 ms passed since the last capture?" test.
	//
	// That test beats against the render rate. The renderer is driven by a
	// 16.67 ms timer, so frames arrive at 16.7, 33.4, 50.1, 66.8 ms... and a
	// gate that resets its reference to `now` on every capture alternates
	// between taking every 2nd and every 3rd frame as the jitter crosses the
	// 33 ms boundary. Measured result: ~23 fps written while the renderer was
	// comfortably doing 60 and the encoder was dropping nothing -- the
	// shortfall was pure aliasing, not cost.
	//
	// Advancing a deadline by a constant period removes the beat: at 60 fps it
	// takes exactly every second frame. The resync guard keeps a long stall
	// (scene load, shader compile) from queueing a burst of catch-up frames.
	if( m_recDue == 0.0 )
		m_recDue = double( now );
	if( double( now ) < m_recDue )
		return;
	m_recDue += 1000.0 / recordFps();
	if( m_recDue < double( now ) - 200.0 )
		m_recDue = double( now );

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
	if( m_dropped )
		fprintf( stderr, "[recorder] %llu frame(s) dropped: the encoder could not keep "
		                 "up. Pacing stays correct (the dropped time is carried into the "
		                 "next frame's duration), but the capture rate was below the "
		                 "%.0f fps cap.\n",
		         (unsigned long long) m_dropped, recordFps() );
	m_dropped = 0;

	// Raw-Pipe zuerst schließen: der Thread schreibt die Restframes, sendet
	// ffmpeg EOF und wartet, bis die Videodatei fertig geschrieben ist.
	if( m_pipeThread.joinable() )
	{
		{
			std::lock_guard<std::mutex> lk( m_pipeMx );
			m_pipeQuit = true;
		}
		m_pipeCv.notify_all();
		m_pipeThread.join();
	}

	// Worker drainen + beenden (er endet erst bei leerer Queue, jeder
	// eingereihte Frame wird also noch geschrieben, bevor der Mux startet).
	if( !m_threads.empty() )
	{
		{
			std::lock_guard<std::mutex> lk( m_mx );
			m_quit = true;
		}
		m_cv.notify_all();
		for( std::thread &t : m_threads ) if( t.joinable() ) t.join();
		m_threads.clear();
	}

	if( m_audio )
		m_audio->stopRecording();      // flusht + schließt das WAV

	QStringList args;
	QString batCmd;

	if( !m_pipeFallback && !m_videoPath.isEmpty() )
	{
		// The picture is already encoded. All that is left is putting it in a
		// container next to the audio -- the video stream is COPIED, never
		// touched again, which is the whole point of the pipe.
		args << "-y" << "-i" << m_videoPath
		     << "-i" << (m_recDir + "/audio.wav")
		     << "-c:v" << "copy" << "-c:a" << "aac"
		     << "-shortest" << (m_recDir + "/kaleidoscope.mp4");
		batCmd = "@echo off\r\ncd /d \"%~dp0\"\r\n"
		         "ffmpeg -y -i video.mp4 -i audio.wav -c:v copy -c:a aac "
		         "-shortest kaleidoscope.mp4\r\npause\r\n";
	}
	else
	{
		// Fallback: ffmpeg was not available when the recording started, so the
		// frames went to disk as JPEGs and this is the old concat mux.
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
		args << "-y" << "-f" << "concat" << "-safe" << "0" << "-i" << listPath
		     << "-i" << (m_recDir + "/audio.wav")
		     << videoCodecArgs() << "-c:a" << "aac"
		     << "-shortest" << (m_recDir + "/kaleidoscope.mp4");
		// Mirror whatever the probe actually selected, so the manual fallback is
		// not silently slower than the automatic mux beside it.
		batCmd = QString( "@echo off\r\ncd /d \"%~dp0\"\r\n"
		                  "ffmpeg -y -f concat -safe 0 -i frames.txt -i audio.wav %1 "
		                  "-c:a aac -shortest kaleidoscope.mp4\r\npause\r\n" )
		         .arg( videoCodecArgs().join( ' ' ) );
	}

	QFile bf( m_recDir + "/make_video.bat" );
	if( bf.open(QIODevice::WriteOnly | QIODevice::Text) )
	{
		bf.write( batCmd.toLocal8Bit() );
		bf.close();
	}

	// Sofort automatisch muxen (detacht; ffmpeg ist auf dem PATH).
	// make_video.bat bleibt als Fallback liegen.
	QProcess::startDetached( "ffmpeg", args );
	joinVideoEncoderProbe();

	fprintf( stderr, "REC stop: %d frames %s -> %s (muxing kaleidoscope.mp4)\n",
	         m_recFrame,
	         m_pipeFallback ? "(JPEG fallback)" : "(raw pipe, single encode)",
	         m_recDir.toLocal8Bit().constData() );
}
