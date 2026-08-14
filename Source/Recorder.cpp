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

void Recorder::toggle()
{
	if( !m_recording )
	{
		QString ts = QDateTime::currentDateTime().toString("yyyyMMdd_hhmmss");
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
