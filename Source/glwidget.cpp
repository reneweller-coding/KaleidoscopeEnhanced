/**
 * @file glwidget.cpp
 * @brief Implements GLwidget: the timer-driven render loop, configuration
 *        loading/switching, keyboard/mouse input, the MIDI/audio-menu/lyrics
 *        overlays, and persisted UI settings.
 */
#include <math.h>

#include <QtCore/QFile>
#include <QtCore/QBuffer>
#include <QtCore/QDateTime>
#include <QtCore/QFileSystemWatcher>
#include <QtCore/QTimer>
#include <QtCore/QCoreApplication>
#include <QtCore/QSettings>
#include <QtCore/QProcess>
#include <QtCore/QDir>
#include <QtGui/QMouseEvent>
#include <QtGui/QPainter>
#include <QtWidgets/QMessageBox>
#include <QtGui/QImage>

#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

//#include<GL/GLU.h>

#include "glcore.h"        // core-profile GL entry points (glcoreInit)
#include "glwidget.h"
#include "WebRemote.h"
#include "SpoutOut.h"    // global facades, released once in ~GLwidget
#include "SpoutIn.h"
#include "VideoIn.h"

 #ifndef GL_MULTISAMPLE
 #define GL_MULTISAMPLE  0x809D
 #endif

// Start configuration requested on the command line (-c <name>); empty = default.
QString GLwidget::s_startConfig;
int     GLwidget::s_remotePort  = 0;
bool    GLwidget::s_batchRender = false;

// ---- Web-remote hooks (called from WebRemote on the main thread) ----
QStringList GLwidget::remoteConfigNames() const
{
	QStringList out;
	for( Configuration *c : m_configurationList )
		out << c->getConfigurationName();
	return out;
}

int GLwidget::remoteActiveConfig() const
{
	for( size_t i = 0; i < m_configurationList.size(); ++i )
		if( m_configurationList[i] == m_actConfiguration )
			return int(i);
	return -1;
}

void GLwidget::remoteSelectConfig( int idx )
{
	if( idx >= 0 && idx < (int)m_configurationList.size()
	    && m_configurationList[idx] != m_actConfiguration )
		switchConfig( m_configurationList[idx] );
}

void GLwidget::remoteNextEffect()
{
	if( m_actConfiguration && m_actConfiguration->m_filterShader )
		m_actConfiguration->m_filterShader->requestSceneChange();
}

void GLwidget::remoteFavorite()
{
	if( m_actConfiguration && m_actConfiguration->m_filterShader )
		m_actConfiguration->m_filterShader->favoriteCurrentEffect();
}

QStringList GLwidget::remoteSceneNames()
{
	if( m_actConfiguration && m_actConfiguration->m_filterShader )
		return m_actConfiguration->m_filterShader->sceneNames();
	return QStringList();
}

void GLwidget::remoteForceScene( int idx )
{
	if( m_actConfiguration && m_actConfiguration->m_filterShader )
		m_actConfiguration->m_filterShader->forceScene( idx );
}

QByteArray GLwidget::remoteSnapshot()
{
	m_snapWantedUntil = m_fpsTimer.elapsed() + 10000;
	return m_snapJpg;
}
bool    GLwidget::s_autoRecord = false;

void GLwidget::traverseConfigurations( const QString& dirname, std::vector<Configuration *> &configurationList )
{
  QDir dir( dirname );
  dir.setFilter( QDir::Dirs | QDir::Files | QDir::NoSymLinks );

  const QFileInfoList fileinfolist = dir.entryInfoList();
  foreach( const QFileInfo& fi,fileinfolist ) {
    if( fi.baseName() == "." || fi.baseName() == ".."  || fi.baseName() == "" ) 
	{
      continue;
    }
    if( fi.isDir() && fi.isReadable() )
	{
      // This is the conditional for recursion
      traverseConfigurations( fi.absoluteFilePath(), configurationList );
    }
    else 
	{
		/*if( fi.QImageReader::canRead(  ) )*/
		if( fi.suffix() == "xml" )
		{
			//do something;
			Configuration *conf = new Configuration( fi.filePath() );
			configurationList.push_back( conf );
		}
    }
  }
}



GLwidget::GLwidget( QWidget *parent )
: QOpenGLWidget(parent)
, m_xTrans(0.0)
, m_yTrans(0.0)
, m_zTrans(-2)
, m_showSelectConfigurationMenu(false)
, m_showFeatureOverlay(false)
, m_audioAnalyzer(nullptr)
, m_fpsCounter(0)
, m_fpsValue(0)
, m_fpsLastPeriod(0)
{
	setFocusPolicy(Qt::StrongFocus);
	setFocus();

	//m_directory = "C:\\Users\\weller\\Pictures";

	// Restore persisted UI state (auto-config / auto-scale toggles, and the last
	// active config as the default start config) before we pick the start config.
	loadUiSettings();

	m_configurationList.clear();
	traverseConfigurations( "..\\Configurations" /*directory*/, m_configurationList );

	// Embedded web remote (CLI -t <port>): phone page with the same harmless
	// controls as the keyboard.  Parented to this widget; main-thread events.
	if( s_remotePort > 0 )
		new WebRemote( this, s_remotePort );

	// Shader HOT-RELOAD (dev aid): watch every user shader; a saved file is
	// recompiled live on the next frame.  Editors often save via replace, so
	// the (dropped) watch path is re-added shortly after each change.
	{
		QStringList watch;
		for( const QString &d : { QString("..\\Scene2D"), QString("..\\FX"),
		                          QString("..\\Transitions") } )
			for( const QFileInfo &fi : QDir(d).entryInfoList({"*.frag"}, QDir::Files) )
				watch << fi.absoluteFilePath();
		if( !watch.isEmpty() )
		{
			m_shaderWatcher = new QFileSystemWatcher( this );
			m_shaderWatcher->addPaths( watch );
			connect( m_shaderWatcher, &QFileSystemWatcher::fileChanged, this,
			         [this]( const QString &p )
			{
				m_pendingReloads.insert( QFileInfo(p).fileName() );
				QTimer::singleShot( 250, this, [this, p]{
					if( QFile::exists(p) && m_shaderWatcher )
						m_shaderWatcher->addPath( p );
				} );
			} );
		}
	}

	// Robustness: a missing/empty Configurations directory used to crash here with
	// an out-of-range vector access.  Fail with a clear message instead.
	if( m_configurationList.empty() )
	{
		fprintf( stderr, "FATAL: no configuration *.xml files found in "
		                 "..\\Configurations - cannot start.\n" );
		exit( 1 );
	}

	// HIDDEN presets (hidden="true" on the root element, e.g. the Komplett
	// master reference and the Test* benches): moved to a side list so they
	// never appear in the user-facing selection — menu, digit keys, web
	// remote and auto-config all index m_configurationList only.  They stay
	// fully loadable via -c <name>; the by-name lookups search both lists.
	for( size_t i = m_configurationList.size(); i-- > 0; )
		if( m_configurationList[i]->isHidden() )
		{
			fprintf( stderr, "Configuration '%s' is hidden (selectable only via -c).\n",
			         m_configurationList[i]->getConfigurationName().toLocal8Bit().constData() );
			m_hiddenConfigurations.push_back( m_configurationList[i] );
			m_configurationList.erase( m_configurationList.begin() + i );
		}
	if( m_configurationList.empty() )
	{
		// Every preset hidden: a broken setup — show them anyway rather than
		// dying, since each hidden file is still a complete, working preset.
		fprintf( stderr, "WARNING: every configuration is hidden - showing them anyway.\n" );
		m_configurationList.swap( m_hiddenConfigurations );
	}

	// Default to the first configuration, or the one requested with -c <name>.
	// -c searches the hidden list too: that is the dev/CI door into the
	// Komplett master and the Test* benches.
	m_actConfiguration = m_configurationList[0];
	if( !s_startConfig.isEmpty() )
	{
		bool found = false;
		for( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
		{
			for( Configuration *c : *lst )
				if( c->getConfigurationName()
				        .compare( s_startConfig, Qt::CaseInsensitive ) == 0 )
				{
					m_actConfiguration = c;
					found = true;
					break;
				}
			if( found ) break;
		}
		if( !found )
			fprintf( stderr, "Configuration '%s' not found - using default.\n",
			         s_startConfig.toLocal8Bit().constData() );
	}

	resetRotation();
}

GLwidget::~GLwidget()
{
	// Zuletzt gewählten Zustand sichern - deckt den GRACEFUL Quit-Pfad ab
	// (Fenster-X, Menü "Exit": app.quit() -> app.exec() kehrt zurück ->
	// dieser Destruktor läuft). Die harten exit(0)-Stellen (Escape/Q/
	// Doppelklick) rufen saveAllSettings() zusätzlich VOR exit() selbst -
	// exit() unterbricht die Ausführung sofort und durchläuft KEINE
	// C++-Destruktoren, dieser hier käme für sie also nie zum Zug.
	saveAllSettings();

	// Closing mid-recording: finalise cleanly (drains + joins the encoder
	// worker) WHILE the audio analyzer is still alive — the recorder closes
	// the WAV through it.  After shutdown() the recorder never touches it.
	m_recorder.shutdown();
	if (m_audioAnalyzer) {
		m_audioAnalyzer->stop();
		m_audioAnalyzer->wait();
		delete m_audioAnalyzer;
	}
	if (m_nowPlaying) {
		m_nowPlaying->stop();
		delete m_nowPlaying;   // joins its thread
	}
	if (m_midi) {
		m_midi->stop();
		delete m_midi;
	}
	delete m_trackMedia;
	// The global Spout facades are released ONCE here (not per preset switch)
	// — with the GL context current, so the receiver texture dies cleanly.
	makeCurrent();
	spoutOutRelease();
	spoutInRelease();
	videoInRelease();
	// Keep the context current across the Configuration deletes too: each
	// ~FilterShader runs cleanTextures()/cleanShaderPrograms() (glDelete*), which
	// need a current GL context — otherwise those deletes are silently dropped
	// (GL_INVALID_OPERATION) and the cleanup is meaningless.
	for( unsigned int i = 0; i < m_configurationList.size(); i++ )
		delete m_configurationList[i];
	for( unsigned int i = 0; i < m_hiddenConfigurations.size(); i++ )
		delete m_hiddenConfigurations[i];
	doneCurrent();
}

/*void GLwidget::slotReloadShader(void)
{
	m_filterShader->loadShader();
	updateGL();
}*/


bool GLwidget::slotSetDirectory(const QString &filename)
{
	//bool success = m_filterShader->loadObj(filename.toAscii().data());
	//updateGL();

	m_directory = filename;
	return true;
}

void GLwidget::initializeGL() 
{ 
	//glEnable(GL_DEPTH_TEST);
	//glEnable(GL_RESCALE_NORMAL);
	//glEnable(GL_CULL_FACE);
	//glShadeModel(GL_SMOOTH); // we use flat shading
	//glEnable(GL_LIGHTING); // enable lighting
	//glEnable(GL_LIGHT0);
	//glLightModeli(GL_LIGHT_MODEL_TWO_SIDE,GL_TRUE);


	// Load OpenGL core entry points now that we have a current context
	// (glcore replaced GLee for the 4.3-core migration; compute entries are
	// optional, everything else is required).
	if( !glcoreInit() )
		fprintf( stderr, "FATAL: required OpenGL core functions missing\n" );

	m_actConfiguration->start( 100, 100 );

	const char *version = (const char *)(glGetString(GL_VERSION));
	fprintf(stderr,"VERSION %s (core profile)\n",version);

	// Migration/validation aid: compile every shader of the active preset
	// eagerly, then quit — the log holds one verdict per shader.
	if( qEnvironmentVariableIsSet( "KALEIDO_COMPILE_ALL" ) )
	{
		if( m_actConfiguration->m_filterShader )
			m_actConfiguration->m_filterShader->compileAllShaders();
		fflush( stderr );
		exit( 0 );
	}

	// Start audio analyser (WASAPI loopback – captures any playing audio)
	m_audioAnalyzer = new AudioAnalyzer(this);
	m_audioAnalyzer->start();
	m_recorder.setAudioAnalyzer( m_audioAnalyzer );

	// Start the "now playing" poller (SMTC: title/artist of the current track).
	m_nowPlaying = new NowPlaying();
	m_nowPlaying->start();

	// Lyrics + Künstlerbilder (LRCLIB / Deezer) - lädt erst bei Trackwechsel
	// und nur, wenn einer der Modi aktiv ist.
	m_trackMedia = new TrackMedia();
	// Test-Hook: KALEIDO_LYRICS_TEST="Artist|Titel" erzwingt einen Abruf ohne
	// laufenden Player; die Playback-Position läuft dann auf der App-Uhr
	// (deterministisch für Batch-Proben).  KALEIDO_LYRICS_MODE=1|2 wählt den
	// Modus, Künstlerbilder gehen mit an.
	{
		QByteArray t = qgetenv( "KALEIDO_LYRICS_TEST" );
		if( !t.isEmpty() )
		{
			QStringList parts = QString::fromLocal8Bit( t ).split( '|' );
			if( parts.size() == 2 )
			{
				m_lyricsTest = true;
				m_artistShow = true;
				QByteArray md = qgetenv( "KALEIDO_LYRICS_MODE" );
				m_lyricsMode = md.isEmpty() ? 2 : qBound( 0, md.toInt(), 2 );
				m_trackStartMs = 0;
				m_trackMedia->requestTrack( parts[0], parts[1] );
				fprintf( stderr, "[Lyrics] TESTMODUS: %s - %s (Modus %d)\n",
				         parts[0].toLocal8Bit().constData(),
				         parts[1].toLocal8Bit().constData(), m_lyricsMode );
			}
		}
	}

	// Optional MIDI control: opens the first controller if one is connected.
	m_midi = new MidiInput();
	if( m_midi->start() )
		fprintf( stderr, "MIDI input: %s\n", m_midi->deviceName().toLocal8Bit().constData() );

#ifdef WIN32
	// Kiosk / installation: keep the display on and suppress the screensaver and
	// system standby for as long as the visualizer runs (ES_CONTINUOUS makes the
	// request persistent without needing to be re-issued).
	SetThreadExecutionState( ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED );
#endif

	// start FPS timer (shown in the 'i' overlay)
	m_fpsTimer.start();
	m_fpsLastPeriod = 0;
	m_fpsCounter    = 0;

	// Adaptive render scale never goes above whatever -s the user launched with.
	m_autoScaleMax  = FilterShader::renderScale();

	// start periodic refesh timer
	startTimer( 16.666666666666 );

	// CLI -r: begin recording straight away (for testing / debugging).
	if( s_autoRecord )
		m_recorder.toggle();

	//glEnable(GL_MULTISAMPLE); //rwrwforeground
	setAutoFillBackground(false); //rwrwforeground
}

void GLwidget::paintGL()
 {
	 draw();

	//qglColor(Qt::white);
    //renderText(100, 100, "txt", QFont("Arial", 32, QFont::Bold, false) );


	//glDisable(GL_LIGHTING);
    //glDisable(GL_DEPTH_TEST);
    //qglColor(Qt::white);
    //renderText(100, 100, "Dies ist ein langer OpenGL Text", QFont("Arial", 48, QFont::Bold, false) );
    //glEnable(GL_DEPTH_TEST);
    //glEnable(GL_LIGHTING);

	// FPS measurement: recompute once per second, shown in the 'i' overlay.
	const qint64 now = m_fpsTimer.elapsed();
	if( now - m_fpsLastPeriod >= 1000 )
	{
		m_fpsValue      = int( m_fpsCounter * 1000.0 / double(now - m_fpsLastPeriod) + 0.5 );
		m_fpsCounter    = 0;
		m_fpsLastPeriod = now;
	}
	m_fpsCounter++;

	// Keep the frame rate near target by nudging the internal render scale.
	updateAdaptiveScale();
 }


//static unsigned int counterExportImages = 0;
//static bool save_images = true;



void GLwidget::draw()
{
	AudioFeatures audio;
	if (m_audioAnalyzer)
		audio = m_audioAnalyzer->getFeatures();

	// Track-change: a fresh track (after a silent gap) gets a clean transition.
	if( audio.trackChange && m_actConfiguration && m_actConfiguration->m_filterShader )
		m_actConfiguration->m_filterShader->requestSceneChange();

	// Apply any queued MIDI control messages.
	applyMidi();

	// Batch render (-x): once the offline WAV has been fully analysed, stop
	// the recording (which kicks off the detached ffmpeg mux) and quit —
	// unattended WAV-to-video rendering.
	if( s_batchRender && !m_batchStopping && m_audioAnalyzer
	    && m_audioAnalyzer->isFinished() )
	{
		m_batchStopping = true;
		if( m_recorder.recording() )
			m_recorder.toggle();
		fprintf( stderr, "BATCH: WAV done - exiting (the mp4 mux continues detached)\n" );
		QTimer::singleShot( 3000, []{ QCoreApplication::quit(); } );
	}

	// Hot-reload: recompile shaders whose files changed (GL context current).
	// Applied to EVERY configuration's pipeline; lazily-uncompiled programs
	// pick up the new source on their eventual first compile anyway.
	if( !m_pendingReloads.isEmpty() )
	{
		for( const QString &n : m_pendingReloads )
			for( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
				for( Configuration *c : *lst )
					if( c && c->m_filterShader )
						c->m_filterShader->reloadFragment( n );
		m_pendingReloads.clear();
	}

	// Auto-config-by-mood (optional, key 'a'): may switch m_actConfiguration.
	updateAutoConfig( audio );

	// QOpenGLWidget renders into its own FBO, not framebuffer 0.  Tell the
	// pipeline where the final image must land, otherwise it draws off-screen.
	m_actConfiguration->m_filterShader->setDefaultFBO( defaultFramebufferObject() );

	m_actConfiguration->m_filterShader->paint(m_RotationMatrix, m_xTrans, m_yTrans, m_zTrans, audio);

	// Capture the clean frame (before any overlay is drawn) while recording
	// or while the instant-replay ring is armed.
	m_recorder.captureIfDue( m_width, m_height );

	// Web-remote live preview: while the phone page polls /api/snapshot,
	// refresh a small JPEG of the output ~1x per second (sync read, but rare
	// and only while someone is actually looking at the page).
	if( s_remotePort > 0 && m_fpsTimer.elapsed() < m_snapWantedUntil
	    && m_fpsTimer.elapsed() - m_snapLast > 900 && m_width > 1 && m_height > 1 )
	{
		m_snapLast = m_fpsTimer.elapsed();
		m_snapBuf.resize( size_t(m_width) * m_height * 4 );
		glPixelStorei( GL_PACK_ALIGNMENT, 1 );
		glReadPixels( 0, 0, m_width, m_height, GL_RGBA, GL_UNSIGNED_BYTE, m_snapBuf.data() );
		QImage img( m_snapBuf.data(), m_width, m_height, QImage::Format_RGBA8888 );
		QImage out = img.mirrored( false, true )
		                .scaledToHeight( 360, Qt::SmoothTransformation );
		QByteArray jpg;
		QBuffer buf( &jpg );
		buf.open( QIODevice::WriteOnly );
		out.save( &buf, "JPG", 70 );
		m_snapJpg = jpg;
	}

	// Config cross-fade: draw the captured previous frame on top, fading out.
	float fadeAlpha = 0.f;
	if( m_fadeStart >= 0 )
	{
		const qint64 dur = 700;                          // fade length (ms)
		qint64 el = m_fpsTimer.elapsed() - m_fadeStart;
		if( el >= dur || m_fadePixmap.isNull() )
		{
			m_fadeStart = -1;                            // done
			m_fadePixmap = QPixmap();
		}
		else
			fadeAlpha = 1.f - float(el) / float(dur);
	}

	// Now-playing TITLE REVEAL: on a track change the title is handed to the
	// engine, which weaves it through the picture in the present pass (the
	// text unfolds out of a kaleidoscopic swirl — replaces the old QPainter
	// lower third).  Toggle stays on key 'p'.
	float npAlpha = 0.f;   // the QPainter lower third is retired (reveal instead)
	if( m_nowPlaying && m_showNowPlaying )
	{
		QString npTitle = m_nowPlaying->title();
		if( !npTitle.isEmpty() && npTitle != m_lastNpTitle )
		{
			m_lastNpTitle = npTitle;
			m_npShownAt   = m_fpsTimer.elapsed();
			if( m_actConfiguration && m_actConfiguration->m_filterShader )
				m_actConfiguration->m_filterShader->showTitle( npTitle,
				                                               m_nowPlaying->artist() );
			// Trackwechsel: Lyrics + Künstlerbilder für den neuen Titel holen
			// (nur wenn ein Modus aktiv ist - sonst keine Netz-Anfragen).
			m_trackStartMs = m_fpsTimer.elapsed();
			m_posSmooth    = -1.0;   // Consumer-PLL neu aufsetzen (neuer Song = neue Zeitachse)
			m_palValid     = false;  // Cover-Palette gehoert zum alten Kuenstler
			m_lastKaraokeLineSeen = -1;
			m_lineChangeMs = -1;
			if( m_trackMedia && !m_lyricsTest
			    && ( m_lyricsMode > 0 || m_artistShow ) )
				m_trackMedia->requestTrack( m_nowPlaying->artist(), npTitle );
		}
	}

	// Lyrics-/Künstlerbild-Overlay: Zustand berechnen + Texturen hochladen
	// (GL-Kontext ist hier aktuell), dann an den PresentPass durchreichen.
	if( m_actConfiguration && m_actConfiguration->m_filterShader )
		updateTrackOverlays( m_actConfiguration->m_filterShader );
	// Demo/test hook: KALEIDO_TITLE_TEST=1 fires one reveal a few seconds in
	// (lets the reveal be tuned without a real media session running).
	{
		static bool titleTest = qEnvironmentVariableIsSet( "KALEIDO_TITLE_TEST" );
		if( titleTest && m_fpsTimer.elapsed() > 3000 )
		{
			titleTest = false;
			if( m_actConfiguration && m_actConfiguration->m_filterShader )
				m_actConfiguration->m_filterShader->showTitle( "Neon Cathedral",
				                                               "The Prisms" );
		}
	}

	//printf( "Painting Now\n" );
	// Only spin up a QPainter when an overlay or the cross-fade needs it, so the
	// normal render path is pure GL (no QPainter/GL state interaction).
	if( m_showSelectConfigurationMenu || m_showFeatureOverlay || m_showHelp
	    || m_showAudioMenu || m_showShaderInfo || m_recorder.recording()
	    || fadeAlpha > 0.f || npAlpha > 0.f )
	{
		QPainter painter(this);
		//painter.setRenderHint(QPainter::Antialiasing);
		if( fadeAlpha > 0.f )
		{
			painter.setOpacity( fadeAlpha );
			painter.drawPixmap( rect(), m_fadePixmap );
			painter.setOpacity( 1.0 );
		}
		if( m_showSelectConfigurationMenu )
			showSelectConfigurationsMenu( &painter );
		if( m_showFeatureOverlay )
			drawFeatureOverlay( &painter, audio );
		if( m_showHelp )
			drawHelpOverlay( &painter );
		if( m_showAudioMenu )
			drawAudioMenu( &painter );
		if( m_showShaderInfo && m_actConfiguration && m_actConfiguration->m_filterShader )
		{
			QString info = m_actConfiguration->m_filterShader->activeShaderInfo();
			QStringList rows = info.split('\n');
			int y = height() - 120;
			painter.fillRect( 20, y - 24, 720, 28 * rows.size() + 16, QColor(0, 0, 0, 175) );
			painter.setFont( QFont("Consolas", 13, QFont::Bold) );
			for( int i = 0; i < rows.size(); ++i )
			{
				painter.setPen( QColor(140, 230, 170) );
				painter.drawText( 34, y + i * 28, rows[i] );
			}
		}
		if( m_recorder.recording() )
		{
			painter.setBrush( QColor(230, 40, 40) );
			painter.setPen( Qt::NoPen );
			painter.drawEllipse( width() - 150, 26, 16, 16 );
			painter.setPen( QColor(255, 255, 255) );
			painter.setFont( QFont("Consolas", 12, QFont::Bold) );
			painter.drawText( width() - 126, 39, QString("REC %1").arg(m_recorder.frameCount()) );
		}
		painter.end();
	}

	/*if (save_images)
	{
		QString efn = "G:/temp/file";
		efn.append( QString::number(counterExportImages) );
		efn.append(".png");

		//printf("Saving Image: %d\n", efn.data() );

		this->grabFrameBuffer().save(efn);
		counterExportImages++;
	}*/

}


void GLwidget::showSelectConfigurationsMenu( QPainter *painter )
{
	
	unsigned int nrConfigurations = (unsigned int) m_configurationList.size();

	unsigned int fontsize = m_height/nrConfigurations*0.3;
	
	QFont font = painter->font() ;
	/* twice the size than the current font size */
	font.setPointSize( fontsize );
	/* set the modified font to the painter */
	painter->setFont(font);	
	QFontMetrics fm(painter->font());


	unsigned int centerX = width()/2;
	unsigned int centerY = height()/2;

	unsigned int sizeSingleLine = fm.lineSpacing();
	unsigned int totalHeight = sizeSingleLine*(nrConfigurations+1);


	int maxStringlength = 0;
	for( unsigned int i = 0; i < nrConfigurations; i++ )
	{
		if( fm.horizontalAdvance((*m_configurationList[i]).getConfigurationName()) > maxStringlength ) //fm.horizontalAdvance(str1)/2
			maxStringlength = fm.horizontalAdvance((*m_configurationList[i]).getConfigurationName());
	}

	maxStringlength = int( maxStringlength * 1.5f );

	
	 // draw the overlayed text using QPainter
    painter->setPen(QColor(197, 197, 197, 157));
    painter->setBrush(QColor(197, 197, 197, 127));

	painter->drawRect(QRect( centerX-(maxStringlength/2), centerY-(totalHeight/2), maxStringlength, totalHeight));
    painter->setPen(Qt::black);
    painter->setBrush(Qt::NoBrush);

	for( unsigned int i = 0; i < nrConfigurations; i++ )
	{
		QString confname = (*m_configurationList[i]).getConfigurationName();

		QString number = QString::number(i+1);
		number += ". ";

		QString total = number + confname;
		painter->drawText(centerX - (fm.horizontalAdvance(total)/2), centerY-(totalHeight/2) + (i+1)*fm.lineSpacing(), QString(total) );
	}

    //painter->drawText(centerX - fm.horizontalAdvance(str1)/2, centerY, str1);

	/*
	QString text = tr("Click and drag with the left mouse button "
                       "to rotate the Qt logo.");
     QFontMetrics metrics = QFontMetrics(font());
     int border = qMax(4, metrics.leading());

     QRect rect = metrics.boundingRect(0, 0, width() - 2*border, int(height()*0.125),
                                       Qt::AlignCenter | Qt::TextWordWrap, text);
     painter->setRenderHint(QPainter::TextAntialiasing);
     painter->fillRect(QRect(0, 0, width(), rect.height() + 2*border),
                      QColor(25, 25, 0, 127));
     painter->setPen(Qt::white);
     painter->fillRect(QRect(0, 0, width(), rect.height() + 2*border),
                       QColor(25, 25, 0, 127));
     painter->drawText((width() - rect.width())/2, border,
                       rect.width(), rect.height(),
                       Qt::AlignCenter | Qt::TextWordWrap, text);
	 float radius = 0.5;
	 //painter->drawEllipse(0, 0, int(2*radius), int(2*radius));*/

}

/// Settings file shared with FilterShader (next to the Configurations folder).
static const char *kUiSettingsPath = "..\\kaleidoscope_settings.ini";

void GLwidget::loadUiSettings()
{
	QSettings s( kUiSettingsPath, QSettings::IniFormat );
	m_autoConfig     = s.value( "autoConfig",  m_autoConfig ).toBool();
	m_autoScale      = s.value( "autoScale",   m_autoScale  ).toBool();
	m_showNowPlaying = s.value( "nowPlaying",  m_showNowPlaying ).toBool();
	m_lyricsMode     = qBound( 0, s.value( "lyricsMode", m_lyricsMode ).toInt(), 2 );
	m_artistShow     = s.value( "artistImages", m_artistShow ).toBool();
	m_lyricsKinetic  = s.value( "lyricsKinetic", m_lyricsKinetic ).toBool();
	for( int i = 0; i < MIDI_TARGETS; ++i )
		m_midiMap[i] = s.value( QString("midiMap%1").arg(i), m_midiMap[i] ).toInt();
	FilterShader::setLightShow( s.value( "lightShow", FilterShader::lightShow() ).toBool() );
	// A persisted active config is the default start config, unless -c overrode it.
	if( s_startConfig.isEmpty() )
		s_startConfig = s.value( "activeConfig", QString() ).toString();
}

void GLwidget::saveUiSettings()
{
	QSettings s( kUiSettingsPath, QSettings::IniFormat );
	if( m_actConfiguration )
		s.setValue( "activeConfig", m_actConfiguration->getConfigurationName() );
	s.setValue( "autoConfig", m_autoConfig );
	s.setValue( "autoScale",  m_autoScale );
	s.setValue( "nowPlaying", m_showNowPlaying );
	s.setValue( "lyricsMode",   m_lyricsMode );
	s.setValue( "artistImages", m_artistShow );
	s.setValue( "lyricsKinetic", m_lyricsKinetic );
	for( int i = 0; i < MIDI_TARGETS; ++i )
		s.setValue( QString("midiMap%1").arg(i), m_midiMap[i] );
	s.setValue( "lightShow",  FilterShader::lightShow() );
	s.sync();
}

void GLwidget::saveAllSettings()
{
	FilterShader::saveSettings();
	saveUiSettings();
}

// Capture the current frame so it can be cross-faded out over the new config.
void GLwidget::beginConfigFade()
{
	m_fadePixmap = QPixmap::fromImage( grabFramebuffer() );
	m_fadeStart  = m_fpsTimer.elapsed();
}

void GLwidget::switchConfig( Configuration *cfg )
{
	// Only record the request here; it is applied in timerEvent (outside paintGL),
	// because the fade capture (grabFramebuffer) re-renders and must not re-enter
	// paintGL when this is reached via auto-config / track-change during draw().
	if( cfg == 0 || cfg == m_actConfiguration )
		return;
	m_pendingConfig = cfg;
}

bool GLwidget::selectConfigByName( const QString &name )
{
	// Hidden presets are reachable by NAME on purpose (dev/CI door);
	// only the index-based selection paths never see them.
	for( const auto *lst : { &m_configurationList, &m_hiddenConfigurations } )
		for( Configuration *c : *lst )
			if( c->getConfigurationName()
			        .compare( name, Qt::CaseInsensitive ) == 0 )
			{
				if( c == m_actConfiguration )
					return false;                 // already active
				switchConfig( c );
				return true;
			}
	return false;
}

void GLwidget::updateAutoConfig( const AudioFeatures &f )
{
	if( !m_autoConfig )
		return;

	// Map the sustained mood to a configuration bucket (2026-07 preset set).
	//   0 ambient/drone -> Ambient, 1 calm -> Galerie,
	//   2 normal -> Allround,       3 energetic -> Club.
	int bucket;
	if     ( f.ambientFactor > 0.6f ) bucket = 0;
	else if ( f.arousal      < 0.33f ) bucket = 1;
	else if ( f.arousal      > 0.66f ) bucket = 3;
	else                               bucket = 2;
	static const char *names[4] = { "Ambient", "Galerie", "Allround", "Club" };

	const qint64 now = m_fpsTimer.elapsed();
	if( bucket != m_moodBucket )
	{
		m_moodBucket      = bucket;
		m_moodBucketSince = now;
	}

	// Only switch once the mood has held for ~8 s and at least ~30 s after the
	// previous switch, so the configuration doesn't flip back and forth.
	if( now - m_moodBucketSince > 8000 && now - m_lastAutoSwitch > 30000 )
	{
		if( selectConfigByName( QString::fromLatin1(names[bucket]) ) )
		{
			m_lastAutoSwitch = now;
			fprintf( stderr, "Auto-config: switched to '%s'\n", names[bucket] );
		}
	}
}

void GLwidget::updateAdaptiveScale()
{
	if( !m_autoScale )
		return;

	const qint64 now = m_fpsTimer.elapsed();
	if( m_fpsValue <= 0 || now - m_lastScaleAdjust < 1500 )   // settle ~1.5 s between steps
		return;

	const float minScale = 0.35f;
	float scale = FilterShader::renderScale();
	float next  = scale;

	if( m_fpsValue < 45 && scale > minScale )
		next = scale - 0.10f;                       // struggling -> coarser, recover FPS
	else if( m_fpsValue > 57 && scale < m_autoScaleMax )
		next = scale + 0.05f;                        // headroom -> finer, up to the ceiling

	if( next < minScale )         next = minScale;
	if( next > m_autoScaleMax )   next = m_autoScaleMax;

	if( next != scale )
	{
		FilterShader::setRenderScale( next );
		if( m_actConfiguration && m_actConfiguration->m_filterShader )
			m_actConfiguration->m_filterShader->resize( m_width, m_height );
		m_lastScaleAdjust = now;
		fprintf( stderr, "Adaptive scale: %.2f (%d FPS)\n", next, m_fpsValue );
	}
}

void GLwidget::mouseDoubleClickEvent(QMouseEvent *e) {
  QWidget::mouseDoubleClickEvent(e);

  saveAllSettings();   // exit() unten läuft an keinem Destruktor vorbei
  exit( 0 );

  // NOTE: exit(0) above never returns, so the fullscreen/maximize toggle below
  // is unreachable dead code left over from an earlier behavior (double-click
  // used to toggle fullscreen; it now quits instead). Kept as-is since this is
  // a comment-only documentation pass, not a behavior change.
  if(isFullScreen()) {
     setWindowState(Qt::WindowMaximized);
  } else {
     setWindowState(Qt::WindowFullScreen);
  }
}

void GLwidget::timerEvent( QTimerEvent* )
{
	// Apply a requested configuration switch here, outside paintGL: capture the
	// current (old) frame for the cross-fade, then stop/start the configurations.
	if( m_pendingConfig && m_pendingConfig != m_actConfiguration )
	{
		beginConfigFade();
		m_actConfiguration->stop();
		m_actConfiguration = m_pendingConfig;
		m_actConfiguration->start( m_width, m_height );
		m_pendingConfig = nullptr;
	}

	// Schedule a repaint; the actual rendering happens in paintGL() where the
	// GL context is guaranteed current (QOpenGLWidget requirement).
	update();
}


void GLwidget::resizeGL( int /*wLogical*/, int /*hLogical*/ )
{
	// QOpenGLWidget calls resizeGL() with LOGICAL (device-independent) pixels,
	// but its default framebuffer is sized to size() * devicePixelRatio().
	// Size the viewport / FBOs to the physical framebuffer so the visualization
	// fills the whole widget (and stays sharp) on high-DPI / scaled displays.
	const qreal dpr = devicePixelRatioF();
	m_width  = int(this->width()  * dpr + 0.5);
	m_height = int(this->height() * dpr + 0.5);

	// Lightweight resize: keeps the loaded image textures + shader programs and
	// only re-sizes the off-screen buffers (no reload, no GL-object leak).
	// (The one-time full build happens in Configuration::start -> reinit.)
	m_actConfiguration->m_filterShader->resize( m_width, m_height );
}

// set rotation Matrix for trackball to Identity
void GLwidget::resetRotation()
{
	/*for(int i = 1; i < 4; i++)
	{
		for(int j = 0; j < i; j++)
		{
			m_RotationMatrix[i*4+j] = m_RotationMatrix[j*4+i]= 0.0;
		}
	}
	m_RotationMatrix[0] = m_RotationMatrix[5] = m_RotationMatrix[10] = m_RotationMatrix[15] = 1.0;*/
}

void GLwidget::mousePressEvent( QMouseEvent * e /*the event*/ )
{
	//m_lastPos = e->pos();
}

void GLwidget::mouseMoveEvent( QMouseEvent * e /*the event*/ )
{
	/*int dx = e->x() - m_lastPos.x();
	int dy = e->y() - m_lastPos.y();

	bool ctrl_key = e->modifiers() & Qt::MetaModifier;		// only needed for Mac OS X, but doesn't hurt on other OSes

	if ( (e->buttons() & Qt::RightButton) || ctrl_key ) // translation along z-Axis
	{
		m_zTrans += 0.2 * dy;
	}
	else if ( e->buttons() & Qt::MidButton ) // translation in xy-Plane
	{
		m_xTrans += 0.01 * dx;
		m_yTrans -= 0.01 * dy;
	}
	else if (e->buttons() & Qt::LeftButton)	// rotation
	{
		// openGL multiplies new transformations on the right
		// we want to apply rotation on the left
		glPushMatrix(); // push current openGL transform matrix to stack
		glLoadIdentity();
		glRotatef(0.5*dx,0.0, 1.0, 0.0);
		glRotatef(0.5*dy,1.0, 0.0, 0.0);
		glMultMatrixf(m_RotationMatrix);
		glGetFloatv(GL_MODELVIEW_MATRIX,m_RotationMatrix);
		glPopMatrix();
	}
	m_lastPos = e->pos();
	e->accept();
	updateGL();*/
}


// Live audio-feature panel (toggled with the 'i' key) — handy for demos and for
// tuning the mapping.  Drawn with QPainter over the rendered frame.
void GLwidget::drawFeatureOverlay( QPainter *painter, const AudioFeatures &f )
{
	struct Row { const char *name; float val; };
	const float bpm = 40.f + f.estimatedBPM * 160.f;
	Row rows[] = {
		{ "musicPresence", f.musicPresence },
		{ "arousal",       f.arousal },
		{ "valence",       f.valence },
		{ "tempo",         f.estimatedBPM },
		{ "mode maj/min",  f.musicalMode },
		{ "keyClarity",    f.keyClarity },
		{ "rhythm",        f.rhythmStrength },
		{ "beat",          f.beatDecay },
		{ "onset",         f.onsetStrength },
		{ "downbeat",      f.downbeat },
		{ "beatPhase",     f.beatPhase },
		{ "flux",          f.spectralFlux },
		{ "centroid",      f.spectralCentroid },
		{ "roughness",     f.roughness },
		{ "sharpness",     f.sharpness },
		{ "stereoWidth",   f.stereoWidth },
		{ "level",         f.overallLevel },
	};
	const int n  = int(sizeof(rows) / sizeof(rows[0]));
	const int x  = 24, y0 = 66, lh = 22, bw = 130, bh = 12;

	painter->fillRect( x - 14, 14, 360, n * lh + 68, QColor(0, 0, 0, 160) );
	painter->setFont( QFont("Consolas", 12, QFont::Bold) );
	painter->setPen( QColor(120, 200, 255) );
	painter->drawText( x, 34, QString("AUDIO FEATURES   %1 FPS   (i to hide)").arg(m_fpsValue) );

	// Live-tunable look knobs (hotkeys).
	painter->setFont( QFont("Consolas", 10) );
	painter->setPen( QColor(170, 205, 170) );
	painter->drawText( x, 54, QString("react[] %1  trail,. %2  mood-= %3  auto-a %4  scale %5 g:%6")
		.arg(FilterShader::reactivity(), 0, 'f', 1)
		.arg(FilterShader::trails(),     0, 'f', 2)
		.arg(FilterShader::mood(),       0, 'f', 1)
		.arg(m_autoConfig ? "ON" : "off")
		.arg(FilterShader::renderScale(), 0, 'f', 2)
		.arg(m_autoScale ? "ON" : "off") );

	painter->setFont( QFont("Consolas", 11) );
	for ( int i = 0; i < n; ++i )
	{
		int ry = y0 + i * lh;
		float v = rows[i].val; if (v < 0.f) v = 0.f; if (v > 1.f) v = 1.f;
		painter->setPen( QColor(205, 214, 230) );
		painter->drawText( x, ry, QString(rows[i].name) );
		int bx = x + 150;
		painter->fillRect( bx, ry - 11, bw, bh, QColor(40, 45, 60) );
		// musicPresence bar turns amber when it drops (speech / non-music mode).
		QColor barCol = (i == 0 && f.musicPresence < 0.5f) ? QColor(255, 170, 60)
		                                                    : QColor(90, 170, 255);
		painter->fillRect( bx, ry - 11, int(bw * v), bh, barCol );
		painter->setPen( QColor(255, 255, 255) );
		QString txt = (i == 3) ? QString::number(bpm, 'f', 0)
		                       : QString::number(rows[i].val, 'f', 2);
		painter->drawText( bx + bw + 8, ry, txt );
	}
}

void GLwidget::drawHelpOverlay( QPainter *painter )
{
	struct Line { const char *key; const char *desc; };
	static const Line lines[] = {
		{ "h",       "show / hide this help" },
		{ "0",       "configuration menu" },
		{ "1 - 9",   "switch configuration" },
		{ "n",       "next effect" },
		{ "i",       "audio-feature overlay (+ FPS)" },
		{ "v",       "show active shader names (debug)" },
		{ "d",       "choose audio source (output / mic)" },
		{ "p",       "now-playing title on/off" },
		{ "w",       "Lyrics: aus / Scroll / Karaoke (Internet)" },
		{ "o",       "Kuenstlerbilder ein/aus (Internet)" },
		{ "a",       "auto-config by mood on/off" },
		{ "g",       "adaptive render scale on/off" },
		{ "l",       "stage lamps / light-show on/off" },
		{ "[  ]",    "reactivity  - less / more" },
		{ ",  .",    "trails       - shorter / longer" },
		{ "-  =",    "mood         - weaker / stronger" },
		{ ";  '",    "latency     - earlier / later" },
		{ "b",       "BLACKOUT (soft fade to black)" },
		{ "e",       "FREEZE the picture" },
		{ "t",       "tap tempo (tap the beat)" },
		{ "u",       "pin / unpin the current effect" },
		{ "f",       "favourite the current effect" },
		{ "z",       "stereo 3D: off / SBS / TB / anaglyph" },
		{ "c  m",    "stereo depth - weaker / stronger" },
		{ "j",       "MIDI learn (cycle targets)" },
		{ "y  x",    "arm / save the instant replay" },
		{ "k",       "save current look + state as default" },
		{ "r",       "record video + music to mp4" },
		{ "s",       "save a screenshot (PNG)" },
		{ "Esc / q", "quit" },
	};
	const int n = int(sizeof(lines) / sizeof(lines[0]));

	const int boxW = 430, lh = 26;
	const int boxH = lh * (n + 1) + 24;
	const int x0 = (width()  - boxW) / 2;
	const int y0 = (height() - boxH) / 2;

	painter->fillRect( x0, y0, boxW, boxH, QColor(0, 0, 0, 190) );
	painter->setPen( QColor(120, 200, 255) );
	painter->setFont( QFont("Consolas", 14, QFont::Bold) );
	painter->drawText( x0 + 20, y0 + 32, QString("KALEIDOSCOPE  -  Tastatur / keys") );

	painter->setFont( QFont("Consolas", 12) );
	for ( int i = 0; i < n; ++i )
	{
		int ry = y0 + 32 + (i + 1) * lh;
		painter->setPen( QColor(150, 230, 150) );
		painter->drawText( x0 + 24, ry, QString(lines[i].key) );
		painter->setPen( QColor(210, 218, 232) );
		painter->drawText( x0 + 150, ry, QString(lines[i].desc) );
	}
}

/// Display names for the MIDI_* learn targets (GLwidget::MIDI_REACT etc.), used
/// in the "MIDI learn" stderr prompts.
static const char *kMidiTargetNames[] =
	{ "Reactivity", "Trails", "Mood", "Latenz-Vorlauf", "Naechster Effekt",
	  "Tap-Tempo", "Blackout" };

void GLwidget::applyMidi()
{
	if( !m_midi )
		return;
	std::vector<MidiInput::Event> evs = m_midi->drain();
	for( const MidiInput::Event &e : evs )
	{
		// ---- MIDI LEARN: bind the incoming controller to the current target ----
		if( m_midiLearn >= 0 )
		{
			bool wantsNote = (m_midiLearn == MIDI_NEXT || m_midiLearn == MIDI_TAP
			                  || m_midiLearn == MIDI_BLACKOUT);
			if( (wantsNote && e.type == 0x90) || (!wantsNote && e.type == 0xB0) )
			{
				m_midiMap[m_midiLearn] = e.data1;
				fprintf( stderr, "MIDI learn: %s -> %s %d\n",
				         kMidiTargetNames[m_midiLearn],
				         wantsNote ? "note" : "CC", e.data1 );
				m_midiLearn++;                              // advance to next target
				if( m_midiLearn >= MIDI_TARGETS )
				{
					m_midiLearn = -1;
					saveUiSettings();                       // persist the new mapping
					fprintf( stderr, "MIDI learn: done (gespeichert)\n" );
				}
			}
			continue;                                       // learn consumes the event
		}

		if( e.type == 0xB0 )                       // Control Change -> mapped knobs
		{
			float v = e.data2 / 127.f;             // 0..1
			if      ( e.data1 == m_midiMap[MIDI_REACT]   ) FilterShader::setReactivity( v * 3.0f  );
			else if ( e.data1 == m_midiMap[MIDI_TRAILS]  ) FilterShader::setTrails     ( v * 0.95f );
			else if ( e.data1 == m_midiMap[MIDI_MOOD]    ) FilterShader::setMood       ( v * 2.5f  );
			else if ( e.data1 == m_midiMap[MIDI_LATENCY] ) FilterShader::setLatency    ( v * 0.25f );
		}
		else if( e.type == 0x90 )                  // Note On -> mapped pads
		{
			// Tap-tempo and blackout fire only on their LEARNED note; the
			// next-effect pad keeps the any-note fallback when unmapped.
			if( m_midiMap[MIDI_TAP] >= 0 && e.data1 == m_midiMap[MIDI_TAP] )
			{
				if( m_audioAnalyzer )
					m_audioAnalyzer->tapTempo();
			}
			else if( m_midiMap[MIDI_BLACKOUT] >= 0 && e.data1 == m_midiMap[MIDI_BLACKOUT] )
			{
				FilterShader::toggleBlackout();
			}
			else if( m_midiMap[MIDI_NEXT] < 0 || e.data1 == m_midiMap[MIDI_NEXT] )
				if( m_actConfiguration && m_actConfiguration->m_filterShader )
					m_actConfiguration->m_filterShader->requestSceneChange();
		}
	}
}

/**
 * @brief Extracts a two-color dominant palette from an artist/cover image.
 *
 * Cover-Palette: die zwei dominanten Farben eines Kuenstlerbilds.  12 Hue-
 * Eimer, gewichtet mit Saettigung*Helligkeit (Grau/Schwarz zaehlt nicht);
 * Sieger = gewichtetes RGB-Mittel seines Eimers, Zweitfarbe = bester Eimer
 * mit Kreis-Abstand >= 2 (sonst dunkle Schattierung der Ersten).  Liefert
 * false fuer praktisch farblose Cover (S/W-Fotos) - dann bleibt das Grading
 * neutral statt einen Zufallston zu erfinden.
 *
 * @param src Source image (any format/size; downscaled internally to 24x24).
 * @param palA Output: dominant color as RGB in 0..1.
 * @param palB Output: secondary color as RGB in 0..1 (or a darkened shade of
 *             palA when no sufficiently distinct second hue bucket exists).
 * @return True if a usable (sufficiently colorful) palette was found; false
 *         for near-greyscale images, in which case palA/palB are unmodified.
 */
static bool extractPalette( const QImage &src, float *palA, float *palB )
{
	if( src.isNull() )
		return false;
	QImage img = src.scaled( 24, 24, Qt::IgnoreAspectRatio, Qt::FastTransformation )
	                .convertToFormat( QImage::Format_RGB32 );
	double wSum[12] = {}, rSum[12] = {}, gSum[12] = {}, bSum[12] = {};
	for( int y = 0; y < img.height(); ++y )
		for( int x = 0; x < img.width(); ++x )
		{
			QColor c( img.pixel( x, y ) );
			float h, s, v;
			c.getHsvF( &h, &s, &v );
			if( h < 0.f || s < 0.22f || v < 0.14f )
				continue;
			int    bkt = int( h * 12.f ) % 12;
			double w   = double( s ) * double( v );
			wSum[bkt] += w;
			rSum[bkt] += w * c.redF();
			gSum[bkt] += w * c.greenF();
			bSum[bkt] += w * c.blueF();
		}
	int best = 0;
	for( int k = 1; k < 12; ++k )
		if( wSum[k] > wSum[best] ) best = k;
	// Mindestens ~4% der Pixel muessen farbig auf den Sieger einzahlen.
	if( wSum[best] < 24.0 * 24.0 * 0.04 * 0.25 )
		return false;
	palA[0] = float( rSum[best] / wSum[best] );
	palA[1] = float( gSum[best] / wSum[best] );
	palA[2] = float( bSum[best] / wSum[best] );
	int second = -1;
	for( int k = 0; k < 12; ++k )
	{
		int dc = abs( k - best );  dc = ( dc > 6 ) ? 12 - dc : dc;
		if( dc >= 2 && ( second < 0 || wSum[k] > wSum[second] ) && wSum[k] > 1.0 )
			second = k;
	}
	if( second >= 0 )
	{
		palB[0] = float( rSum[second] / wSum[second] );
		palB[1] = float( gSum[second] / wSum[second] );
		palB[2] = float( bSum[second] / wSum[second] );
	}
	else
		for( int k = 0; k < 3; ++k ) palB[k] = palA[k] * 0.30f;  // dunkle Schattierung
	return true;
}

// Lyrics-/Künstlerbild-Overlay: pro Frame den Anzeige-Zustand berechnen.
// Sync-Quelle ist die SMTC-Playback-Position (extrapoliert); ohne sie (VLC-
// Fallback, Testmodus) läuft eine lokale Uhr ab Trackwechsel.  Alle Blenden
// sind geslewt, damit nichts hart aufpoppt.
void GLwidget::updateTrackOverlays( FilterShader *fs )
{
	FilterShader::OverlayFrame o;
	if( !m_trackMedia )
	{
		fs->setOverlayFrame( o );
		return;
	}

	// Echtes dt statt einer festen 60-Hz-Annahme: schwankt die Framezeit
	// (GPU-Last, adaptive Render-Skalierung, Compute-Sims), ruckelt das
	// Scroll-Smoothing sonst, weil der Slew-Schritt nicht zur tatsächlich
	// vergangenen Zeit passt. Erster Aufruf / lange Aussetzer werden geklemmt.
	const qint64 nowMs = m_fpsTimer.elapsed();
	float dt = ( m_overlayLastMs < 0 ) ? ( 1.f / 60.f )
	                                   : float( nowMs - m_overlayLastMs ) * 0.001f;
	if( dt < 0.f )    dt = 0.f;
	if( dt > 0.25f )  dt = 0.25f;
	m_overlayLastMs = nowMs;

	auto slew = []( float cur, float target, float rate, float dt )
	{
		float step = rate * dt;
		if( target > cur ) return ( target - cur < step ) ? target : cur + step;
		return ( cur - target < step ) ? target : cur - step;
	};

	// Preset-Wechsel: die neue Konfiguration hat einen EIGENEN PresentPass
	// ohne unsere Texturen - Upload-Merker zurücksetzen, damit Lyrics und
	// Künstlerbild unten sofort neu hochgeladen werden.
	if( fs != m_overlayFs )
	{
		m_overlayFs         = fs;
		m_lyricsRevUploaded = -1;
		m_artistIdxUploaded = -1;
		m_artistRevSeen     = -1;
	}

	// Playback-Position: SMTC, sonst lokale Uhr seit Trackwechsel - beides
	// nur als REFERENZ für die PLL unten.
	double pos = m_nowPlaying ? m_nowPlaying->positionNowSec() : -1.0;
	double dur = 0.0;
	if( m_nowPlaying )
		dur = m_nowPlaying->timeline().durationSec;
	if( pos < 0.0 || m_lyricsTest )
		pos = double( m_fpsTimer.elapsed() - m_trackStartMs ) * 0.001;

	// Consumer-PLL (die Aufnahme des Users hat es bewiesen: trotz monotoner
	// NowPlaying-Publikation kamen noch Rückwärtsschritte an - z.B. wenn ein
	// Player kurz playing=false flackert und dabei ein roher Alt-Wert
	// durchrutscht, oder ein Titel-Flackern das Settle-Fenster auf die
	// lokale Uhr zurücksetzt). Deshalb final HIER, an der einzigen
	// Verbrauchsstelle: eine eigene, mit dem Frame-dt integrierte Position,
	// die zur Referenz nur hin-GLEITET (Rate 0..1.15 - bremst bei Pause bis
	// zum Stillstand, läuft nie rückwärts). Sprünge in BEIDE Richtungen erst
	// nach kurzer Bestätigung: VORWÄRTS 0.4s (ein echter Vorspul-Seek fühlt
	// sich weiter sofort an), RÜCKWÄRTS 2s (echtes Zurückspulen). Beide
	// Fenster waren frueher asymmetrisch (vorwaerts ganz ohne Bestaetigung,
	// "harmlos fuers Auge") - eine PLL-Simulation mit realistischem Referenz-
	// Rauschen zeigte aber: ein einzelner Ausreisser >1.5s voraus sprang
	// SOFORT, und wenn die Referenz eine Umlaufzeit spaeter auf den echten
	// Wert zurueckfiel, erkannte die Rueckwaerts-Bestaetigung genau DAS als
	// "2s konsistent falsch" und sprang zurueck - ein einzelner Ausreisser
	// wurde so zu ZWEI sichtbaren Spruengen (vor, dann zurueck), exakt das
	// gemeldete Huepfen. Kuerzeres Flackern jeder Art wird jetzt in BEIDEN
	// Richtungen komplett ueberbrueckt, die Anzeige laeuft einfach weiter.
	if( m_posSmooth < 0.0 )
	{
		m_posSmooth     = pos;
		m_backJumpSince = -1;
		m_fwdJumpSince  = -1;
	}
	else if( pos - m_posSmooth > 1.5 )
	{
		const qint64 pllNow = m_fpsTimer.elapsed();
		double erwartet = m_fwdJumpRef
		                + ( m_fwdJumpSince >= 0
		                    ? double( pllNow - m_fwdJumpSince ) * 0.001 : 0.0 );
		if( m_fwdJumpSince < 0 || fabs( pos - erwartet ) > 1.0 )
		{
			m_fwdJumpSince = pllNow;         // (neuer) Vorwärts-Kandidat
			m_fwdJumpRef   = pos;
		}
		else if( pllNow - m_fwdJumpSince > 400 )
		{
			m_posSmooth    = pos;            // 0.4s konsistent: echter Seek
			m_fwdJumpSince = -1;
		}
		m_backJumpSince = -1;
		if( m_fwdJumpSince >= 0 )
			m_posSmooth += double(dt);       // solange pending: normal weiterlaufen
	}
	else if( pos - m_posSmooth < -1.5 )
	{
		const qint64 pllNow = m_fpsTimer.elapsed();
		double erwartet = m_backJumpRef
		                + ( m_backJumpSince >= 0
		                    ? double( pllNow - m_backJumpSince ) * 0.001 : 0.0 );
		if( m_backJumpSince < 0 || fabs( pos - erwartet ) > 1.0 )
		{
			m_backJumpSince = pllNow;        // (neuer) Rückwärts-Kandidat
			m_backJumpRef   = pos;
		}
		else if( pllNow - m_backJumpSince > 2000 )
		{
			m_posSmooth     = pos;           // 2s konsistent: echter Seek
			m_backJumpSince = -1;
		}
		m_fwdJumpSince = -1;
		if( m_backJumpSince >= 0 )
			m_posSmooth += double(dt);       // solange pending: normal weiterlaufen
	}
	else
	{
		m_backJumpSince = -1;
		m_fwdJumpSince  = -1;
		// Asymmetrischer Gain: hinterherhinken sanft aufholen (0.3), aber
		// VORAUSlaufen hart abbremsen (2.0) - sonst schiebt eine Pause
		// (eingefrorene Referenz) die Position erst 3.3s über das Ziel
		// hinaus und über die 1.5s-Schwelle in den Vorwärts-Pfad.
		const double err = pos - m_posSmooth;
		double r = 1.0 + err * ( err < 0.0 ? 2.0 : 0.3 );
		if( r < 0.0 )   r = 0.0;
		if( r > 1.15 )  r = 1.15;
		m_posSmooth += double(dt) * r;
	}
	pos = m_posSmooth;

	// ---- Lyrics ----
	if( m_trackMedia->lyricsRevision() != m_lyricsRevUploaded )
	{
		m_lyricsRevUploaded = m_trackMedia->lyricsRevision();
		m_karaokeLine = -1;
		m_scrollVSm   = 0.f;
		const QImage &img = m_trackMedia->lyricsImage();
		if( !img.isNull() )
		{
			QImage gl = img.convertToFormat( QImage::Format_RGBA8888 );
			fs->setLyricsTexture( gl.constBits(), gl.width(), gl.height() );
		}
	}

	bool lyricsOn = ( m_lyricsMode > 0 ) && m_trackMedia->hasLyrics();
	// Laengere textlose Pausen (Intro, Solo, Outro): Lyrics sanft ausblenden
	// statt eine tote/alte Zeile stehenzulassen.  Nutzt den Karaoke-
	// Zeilenindex vom LETZTEN Frame (kontinuierlicher Zustand, 16ms alt -
	// fuer diese Entscheidung unkritisch, vermeidet eine zweite Zeilensuche).
	// WICHTIG: die Hysterese-Suche unten haelt i waehrend einer Luecke auf
	// der VORHERIGEN (zuletzt aktiven) Zeile, nicht auf der kommenden - eine
	// erste Fassung nahm faelschlich lines[i].t0 als Luecken-Ende und fand
	// dadurch nie eine Luecke (durch eine Zeilen-Simulation aufgedeckt).
	if( lyricsOn && m_trackMedia->syncedLyrics() )
	{
		const auto &lines = m_trackMedia->lines();
		int n = int(lines.size());
		if( n > 0 )
		{
			int i = ( m_karaokeLine >= 0 && m_karaokeLine < n ) ? m_karaokeLine : 0;
			bool inLongGap = false;
			if( pos < lines[i].t0 )
			{
				// Intro (nur bei i==0 stabil): vor der allerersten Zeile.
				inLongGap = ( lines[i].t0 > 9.f ) && ( pos < lines[i].t0 - 2.f );
			}
			else if( lines[i].text.isEmpty() && pos < lines[i].t1 )
			{
				// Aktive "Zeile" ist ein Instrumental-Marker (leerer Text,
				// siehe TrackMedia::parseSynced) -- Solo/Break MITTEN im Song,
				// nicht nur Intro/Outro. i steht hier bereits stabil auf dem
				// Marker (die Hysterese-Suche unten haelt es dort), darum
				// reicht dessen eigene Spanne als Luecke.
				inLongGap = ( lines[i].t1 - lines[i].t0 > 9.f )
				          && ( pos > lines[i].t0 + 2.f )
				          && ( pos < lines[i].t1 - 2.f );
			}
			else if( pos >= lines[i].t1 )
			{
				bool hasNext = ( i + 1 < n );
				if( hasNext )
				{
					float gapEnd = lines[i+1].t0;
					inLongGap = ( gapEnd - lines[i].t1 > 9.f )
					          && ( pos > lines[i].t1 + 2.f )
					          && ( pos < gapEnd - 2.f );
				}
				else
					inLongGap = pos > lines[i].t1 + 2.f;   // Outro: unbegrenzt
			}
			if( inLongGap )
				lyricsOn = false;
		}
	}
	m_lyricsAlphaSm = slew( m_lyricsAlphaSm, lyricsOn ? 1.f : 0.f, 1.5f, dt );
	if( lyricsOn || m_lyricsAlphaSm > 0.001f )
	{
		const auto  &lines = m_trackMedia->lines();
		const QImage &img  = m_trackMedia->lyricsImage();
		o.lyricsAlpha  = m_lyricsAlphaSm * 0.92f;
		o.lyricsAspect = img.isNull() ? 1.f
		               : float(img.width()) / float(img.height());

		float targetV = m_scrollVSm;
		if( m_trackMedia->syncedLyrics() )
		{
			// Aktive Zeile suchen (Cache + Vorwärts-/Rückwärtsscan für Seeks).
			// RÜCKWÄRTS mit 0.3s Hysterese: nur ein echtes Zurückspulen soll
			// die Zeile wechseln - ein winziger Positions-Rückschritt (falls
			// je einer durchrutscht) darf das Highlight nicht in die Vorzeile
			// flippen lassen.
			int n = int(lines.size());
			int i = ( m_karaokeLine >= 0 && m_karaokeLine < n ) ? m_karaokeLine : 0;
			while( i + 1 < n && pos >= lines[i].t1 ) ++i;
			while( i > 0     && pos <  lines[i].t0 - 0.3 ) --i;
			// A line index going BACKWARD is exactly the "flip to the previous
			// line" symptom three earlier rounds already tried to fix (monotone
			// NowPlaying publish, consumer PLL, this hysteresis). If it still
			// happens, this is the forensic trail: with -l, it lands in
			// kaleidoscope.log correlated with the exact pos/m_posSmooth that
			// caused it, instead of having to guess at a fourth blind fix.
			if( i < m_karaokeLine )
				fprintf( stderr, "[Lyrics] Zeile RUECKWAERTS: %d -> %d  "
				         "pos=%.3f posSmooth=%.3f  t0[alt]=%.3f t1[alt]=%.3f "
				         "t0[neu]=%.3f t1[neu]=%.3f\n",
				         m_karaokeLine, i, pos, m_posSmooth,
				         lines[m_karaokeLine].t0, lines[m_karaokeLine].t1,
				         lines[i].t0, lines[i].t1 );
			m_karaokeLine = i;

			// Kinetik: Zeilen-Alter fuer den Slam-Einflug der frischen Zeile.
			if( i != m_lastKaraokeLineSeen )
			{
				m_lastKaraokeLineSeen = i;
				m_lineChangeMs        = m_fpsTimer.elapsed();
			}
			if( m_lyricsKinetic && m_lineChangeMs >= 0 )
				o.lyricsLineAge = float( m_fpsTimer.elapsed() - m_lineChangeMs ) * 0.001f;

			const auto &L = lines[i];
			float lineFrac = 0.f;
			if( L.t1 > L.t0 )
				lineFrac = float( ( pos - L.t0 ) / ( L.t1 - L.t0 ) );
			lineFrac = std::min( std::max( lineFrac, 0.f ), 1.f );

			// Scroll-Ziel: Zentrum gleitet kontinuierlich zur nächsten Zeile.
			float c0 = 0.5f * ( L.v0 + L.v1 );
			float c1 = ( i + 1 < n ) ? 0.5f * ( lines[i+1].v0 + lines[i+1].v1 )
			                         : c0;
			targetV = c0 + ( c1 - c0 ) * lineFrac;

			// Highlight IMMER auf der (hysterese-stabilen) aktiven Zeile -
			// frueher war es an "pos >= t0" gebunden, wodurch ein winziger
			// Positions-Ruecklauf um den Zeilenanfang das Highlight kurz
			// ausblendete: alle Zeilen poppten auf volle Helligkeit und
			// zurueck ("Huepfen"), obwohl gar nichts scrollte.
			if( m_lyricsMode == 2 )
			{
				o.lyricsHlV0   = L.v0;
				o.lyricsHlV1   = L.v1;
				o.lyricsHlProg = lineFrac;   // bereits auf 0..1 geklemmt
			}
		}
		else
		{
			// Unsynchronisiert: gleichmäßig über die Songdauer scrollen;
			// ohne Dauer mit fester, gemächlicher Geschwindigkeit.
			if( dur > 10.0 )
				targetV = float( pos / dur );
			else
				targetV = float( pos * 0.008 );
			targetV = std::min( std::max( targetV, 0.f ), 1.f );
		}

		// Immer weich nachziehen statt zu teleportieren - auch bei einem
		// großen Sprung (Seek, oder eine seltene, vom Settle-Fenster in
		// NowPlaying nicht abgefangene Korrektur) mit deutlich höherer Rate,
		// damit es "schnell aufholt" statt zu schneiden. Ein Sprung über die
		// halbe Textur braucht damit ~0.2s statt eines Einzelframe-Cuts.
		float rate = ( fabsf( targetV - m_scrollVSm ) > 0.08f ) ? 2.5f : 0.10f;
		m_scrollVSm = slew( m_scrollVSm, targetV, rate, dt );
		o.lyricsScrollV = m_scrollVSm;
	}

	// ---- Künstlerbilder: Rotation, alle ~45 s für ~14 s eingeblendet ----
	bool artistOn = m_artistShow && m_trackMedia->imageCount() > 0;
	float artistTarget = 0.f;
	if( artistOn )
	{
		// Bei großen Sammlungen (bis 50 Bilder) rotiert es flotter, damit
		// über einen Abend auch wirklich viele Bilder drankommen.
		const bool   viele   = m_trackMedia->imageCount() >= 10;
		const qint64 cycleMs = viele ? 26000 : 45000;
		const qint64 showMs  = viele ? 12000 : 14000;
		const qint64 fadeMs  = 2200;
		qint64 t  = m_fpsTimer.elapsed() - m_trackStartMs;
		if( t < 0 ) t = 0;
		qint64 ph = t % cycleMs;
		int    cy = int( t / cycleMs );
		if( ph < showMs )
		{
			int idx = cy % m_trackMedia->imageCount();
			if( idx != m_artistIdxUploaded
			    || m_artistRevSeen != m_trackMedia->imagesRevision() )
			{
				m_artistIdxUploaded = idx;
				m_artistRevSeen     = m_trackMedia->imagesRevision();
				const QImage &img = m_trackMedia->imageAt( idx );
				fs->setArtistTexture( img.constBits(), img.width(), img.height() );
				// Cover-Palette aus dem frisch gewaehlten Bild ziehen - der
				// Song bekommt organisch die Farbwelt seines Kuenstlers.
				m_palValid = extractPalette( img, m_palA, m_palB );
			}
			float in  = std::min( 1.f, float(ph) / float(fadeMs) );
			float out = std::min( 1.f, float(showMs - ph) / float(fadeMs) );
			artistTarget = std::min( in, out );
		}
	}
	m_artistAlphaSm = slew( m_artistAlphaSm, artistTarget, 1.2f, dt );
	// Cover-Palette: sehr langsam einblenden (0.3/s) - die Farbwelt eines
	// Songs soll sich etablieren, nicht aufpoppen.  Unabhaengig davon, ob
	// das Bild selbst gerade sichtbar ist.
	m_palAmtSm = slew( m_palAmtSm, m_palValid ? 1.f : 0.f, 0.3f, dt );
	if( m_palAmtSm > 0.001f )
	{
		o.paletteAmt = m_palAmtSm;
		for( int k = 0; k < 3; ++k )
		{
			o.paletteA[k] = m_palA[k];
			o.paletteB[k] = m_palB[k];
		}
	}
	if( m_artistAlphaSm > 0.001f && m_artistIdxUploaded >= 0
	    && m_artistIdxUploaded < m_trackMedia->imageCount() )
	{
		const QImage &img = m_trackMedia->imageAt( m_artistIdxUploaded );
		o.artistAlpha  = m_artistAlphaSm * 0.9f;
		o.artistAspect = float(img.width()) / float(std::max( img.height(), 1 ));
	}

	fs->setOverlayFrame( o );
}

void GLwidget::selectAudioDevice( int index )
{
	if( !m_audioAnalyzer )
		return;
	if( index == 0 )                          // 0 = default output (loopback)
	{
		m_audioAnalyzer->requestDevice( QString(), false );
		fprintf( stderr, "Audio source: default (loopback)\n" );
		return;
	}
	QList<AudioDevice> devs = m_audioAnalyzer->devices();
	int di = index - 1;
	if( di >= 0 && di < devs.size() )
	{
		m_audioAnalyzer->requestDevice( devs[di].id, devs[di].isCapture );
		fprintf( stderr, "Audio source: %s\n", devs[di].name.toLocal8Bit().constData() );
	}
}

void GLwidget::drawAudioMenu( QPainter *painter )
{
	QList<AudioDevice> devs;
	QString current;
	if( m_audioAnalyzer ) { devs = m_audioAnalyzer->devices(); current = m_audioAnalyzer->currentDeviceName(); }

	int shown = devs.size(); if( shown > 9 ) shown = 9;   // 1..9 selectable
	int n = shown + 1;                                     // + default entry

	const int boxW = 580, lh = 26;
	const int boxH = lh * (n + 1) + 30;
	const int x0 = (width()  - boxW) / 2;
	const int y0 = (height() - boxH) / 2;

	painter->fillRect( x0, y0, boxW, boxH, QColor(0, 0, 0, 200) );
	painter->setPen( QColor(120, 200, 255) );
	painter->setFont( QFont("Consolas", 14, QFont::Bold) );
	painter->drawText( x0 + 20, y0 + 32, QString("AUDIOQUELLE   (0-9 wählen,  d schließen)") );

	painter->setFont( QFont("Consolas", 12) );
	auto entry = [&]( int i, const QString &label, bool active ) {
		int ry = y0 + 32 + (i + 1) * lh;
		painter->setPen( active ? QColor(150, 230, 150) : QColor(210, 218, 232) );
		painter->drawText( x0 + 24, ry, QString::number(i) + ".  " + label + (active ? "   ←" : "") );
	};
	entry( 0, "Standard-Ausgabe (Loopback)", current.startsWith("Standard") );
	for ( int i = 0; i < shown; ++i )
	{
		QString tag = devs[i].isCapture ? "  [Eingang]" : "  [Ausgabe]";
		entry( i + 1, devs[i].name + tag, !current.startsWith("Standard") && current == devs[i].name );
	}
}

void GLwidget::drawNowPlaying( QPainter *painter, const QString &title,
                              const QString &artist, float alpha )
{
	int a   = int(alpha * 255.f + 0.5f); if (a < 0) a = 0; if (a > 255) a = 255;
	int bgA = int(alpha * 150.f + 0.5f);

	QFont tf("Segoe UI", 20, QFont::Bold);
	QFont af("Segoe UI", 14);
	QFontMetrics tm(tf), am(af);
	int w = qMax(tm.horizontalAdvance(title), am.horizontalAdvance(artist)) + 70;
	const int h = 72;
	const int x = 40;
	const int y = height() - h - 50;

	painter->fillRect( x, y, w, h, QColor(0, 0, 0, bgA) );        // backdrop
	painter->fillRect( x, y, 5, h, QColor(120, 200, 255, a) );    // accent bar

	painter->setFont( tf );
	painter->setPen( QColor(255, 255, 255, a) );
	painter->drawText( x + 22, y + 34, title );
	painter->setFont( af );
	painter->setPen( QColor(180, 210, 240, a) );
	painter->drawText( x + 22, y + 58, artist );
}

void GLwidget::keyPressEvent(QKeyEvent* event)
{
	// The audio-source picker is modal for number keys while it is open, so the
	// digits choose a source instead of switching configuration.
	if( m_showAudioMenu )
	{
		int k = event->key();
		if( k >= Qt::Key_0 && k <= Qt::Key_9 )
		{
			selectAudioDevice( k - Qt::Key_0 );
			m_showAudioMenu = false;
			return;
		}
		if( k == Qt::Key_D || k == Qt::Key_Escape )
		{
			m_showAudioMenu = false;
			return;
		}
	}

    switch(event->key())
	{
		case Qt::Key_Escape:
			saveAllSettings();   // exit() unten läuft an keinem Destruktor vorbei
			exit(0);
			break;
		case Qt::Key_Q:
			saveAllSettings();
			exit(0);
			break;
		case Qt::Key_0:
			m_showSelectConfigurationMenu = !m_showSelectConfigurationMenu;
			break;
		case Qt::Key_I:
			m_showFeatureOverlay = !m_showFeatureOverlay;
			break;
		case Qt::Key_H:
			m_showHelp = !m_showHelp;
			break;
		case Qt::Key_V:
			m_showShaderInfo = !m_showShaderInfo;   // debug: which shaders are active
			break;
		case Qt::Key_D:
			m_showAudioMenu = true;   // closed again from the modal handler above
			break;
		case Qt::Key_P:
			m_showNowPlaying = !m_showNowPlaying;
			fprintf( stderr, "Now-playing display: %s\n", m_showNowPlaying ? "ON" : "OFF" );
			break;

		// ---- Lyrics-Modus zyklisch: aus -> Scroll -> Karaoke ----
		// Umschalt+W: kinetischer Zeilen-Slam an/aus (separat, da manchen der
		// Einflug beim Zeilenwechsel zu unruhig ist).
		case Qt::Key_W:
		{
			if( event->modifiers() & Qt::ShiftModifier )
			{
				m_lyricsKinetic = !m_lyricsKinetic;
				fprintf( stderr, "Lyrics-Kinetik (Zeilen-Slam): %s\n",
				         m_lyricsKinetic ? "AN" : "AUS" );
				break;
			}
			m_lyricsMode = ( m_lyricsMode + 1 ) % 3;
			static const char *kLyricsNames[] = { "AUS", "Scroll", "Karaoke" };
			fprintf( stderr, "Lyrics: %s\n", kLyricsNames[m_lyricsMode] );
			// Beim Einschalten sofort für den laufenden Track nachladen.
			if( m_lyricsMode > 0 && m_trackMedia && m_nowPlaying
			    && !m_nowPlaying->title().isEmpty() )
				m_trackMedia->requestTrack( m_nowPlaying->artist(), m_nowPlaying->title() );
			break;
		}

		// ---- Künstlerbilder an/aus ----
		case Qt::Key_O:
			m_artistShow = !m_artistShow;
			fprintf( stderr, "Kuenstlerbilder: %s\n", m_artistShow ? "AN" : "AUS" );
			if( m_artistShow && m_trackMedia && m_nowPlaying
			    && !m_nowPlaying->title().isEmpty() )
				m_trackMedia->requestTrack( m_nowPlaying->artist(), m_nowPlaying->title() );
			break;
		case Qt::Key_R:
			m_recorder.toggle();   // record visuals + music to an mp4
			break;
		case Qt::Key_L:
			FilterShader::toggleLightShow();   // corner lamps / light-show on/off
			fprintf( stderr, "Stage lamps: %s\n", FilterShader::lightShow() ? "ON" : "OFF" );
			break;
		case Qt::Key_N:
			// Manually advance to the next effect (texture + combine), snappy cut.
			if( m_actConfiguration && m_actConfiguration->m_filterShader )
			{
				m_actConfiguration->m_filterShader->requestSceneChange();
				fprintf( stderr, "n: next effect requested\n" );
			}
			break;

		// ---- Live tuning (values shared across all configs) ----
		case Qt::Key_BracketLeft:  FilterShader::adjustReactivity(-0.10f); break;  // [  less reactive
		case Qt::Key_BracketRight: FilterShader::adjustReactivity(+0.10f); break;  // ]  more reactive
		case Qt::Key_Comma:        FilterShader::adjustTrails(-0.05f);     break;  // ,  shorter trails
		case Qt::Key_Period:       FilterShader::adjustTrails(+0.05f);     break;  // .  longer trails
		case Qt::Key_Minus:        FilterShader::adjustMood(-0.10f);       break;  // -  less mood colour
		case Qt::Key_Equal:        FilterShader::adjustMood(+0.10f);       break;  // =  more mood colour
		case Qt::Key_Semicolon:                                                    // ;  less latency lead
			FilterShader::adjustLatency(-0.01f);
			fprintf( stderr, "Latency lead: %.0f ms\n", FilterShader::latency() * 1000.f );
			break;
		case Qt::Key_Apostrophe:                                                   // '  more latency lead
			FilterShader::adjustLatency(+0.01f);
			fprintf( stderr, "Latency lead: %.0f ms\n", FilterShader::latency() * 1000.f );
			break;

		// ---- Persist the current look + UI state as the startup default ----
		case Qt::Key_K:
			saveAllSettings();
			break;

		// ---- Instant replay: 'y' arms the rolling buffer, 'x' saves it ----
		case Qt::Key_Y:
			m_recorder.toggleReplayArm();
			break;
		case Qt::Key_X:
			m_recorder.saveReplay();
			break;

		// ---- VJ handbrakes ----
		case Qt::Key_B:
			FilterShader::toggleBlackout();
			fprintf( stderr, "Blackout: %s\n", FilterShader::blackout() ? "AN" : "AUS" );
			break;
		case Qt::Key_E:
			FilterShader::toggleFreeze();
			fprintf( stderr, "Freeze: %s\n", FilterShader::frozen() ? "AN" : "AUS" );
			break;
		case Qt::Key_T:
			if( m_audioAnalyzer )
				m_audioAnalyzer->tapTempo();
			break;
		case Qt::Key_U:
			FilterShader::togglePin();
			fprintf( stderr, "Effekt-Pin: %s\n",
			         FilterShader::pinned() ? "AN (haelt den aktuellen Effekt)" : "AUS" );
			break;

		// ---- Taste learning: favourite the current effect ----
		case Qt::Key_F:
			if( m_actConfiguration && m_actConfiguration->m_filterShader )
				m_actConfiguration->m_filterShader->favoriteCurrentEffect();
			break;

		// ---- Stereoscopic output ----
		case Qt::Key_Z:
		{
			FilterShader::cycleStereo();
			static const char *kStereoNames[] =
				{ "AUS", "Side-by-Side", "Top-Bottom", "Anaglyph (rot/cyan)" };
			fprintf( stderr, "Stereo: %s\n", kStereoNames[FilterShader::stereoMode() & 3] );
			break;
		}
		case Qt::Key_C:
			FilterShader::adjustStereoDepth( -0.2f );
			fprintf( stderr, "Stereo-Tiefe: %.1f\n", FilterShader::stereoDepth() );
			break;
		case Qt::Key_M:
			FilterShader::adjustStereoDepth( +0.2f );
			fprintf( stderr, "Stereo-Tiefe: %.1f\n", FilterShader::stereoDepth() );
			break;

		// ---- MIDI learn: cycle through the assignable targets ----
		case Qt::Key_J:
			m_midiLearn = (m_midiLearn < 0) ? 0
			            : (m_midiLearn + 1 >= MIDI_TARGETS ? -1 : m_midiLearn + 1);
			if( m_midiLearn >= 0 )
				fprintf( stderr, "MIDI learn: bewege einen Regler fuer '%s' "
				         "(j = weiter/beenden)\n", kMidiTargetNames[m_midiLearn] );
			else
				fprintf( stderr, "MIDI learn: aus\n" );
			break;

		// ---- Auto-config-by-mood toggle ----
		case Qt::Key_A:
			m_autoConfig = !m_autoConfig;
			m_moodBucket = -1;   // re-evaluate from scratch
			fprintf( stderr, "Auto-config-by-mood: %s\n", m_autoConfig ? "ON" : "OFF" );
			break;

		// ---- Adaptive render-scale toggle ----
		case Qt::Key_G:
			m_autoScale = !m_autoScale;
			fprintf( stderr, "Adaptive render scale: %s\n", m_autoScale ? "ON" : "OFF" );
			break;

		// ---- Screenshot (this window only) ----
		case Qt::Key_S:
		{
			QImage img = grabFramebuffer();
			QString fn = QString("kaleidoscope_%1.png")
			             .arg( QDateTime::currentDateTime().toString("yyyyMMdd_hhmmss") );
			if( img.save( fn ) )
				fprintf( stderr, "Saved screenshot: %s\n", fn.toLocal8Bit().constData() );
			break;
		}
		case Qt::Key_1: case Qt::Key_2: case Qt::Key_3:
		case Qt::Key_4: case Qt::Key_5: case Qt::Key_6:
		case Qt::Key_7: case Qt::Key_8: case Qt::Key_9:
		{
			m_showSelectConfigurationMenu = false;
			unsigned int idx = event->key() - Qt::Key_1;   // 0..8
			if( idx < m_configurationList.size() )
				switchConfig( m_configurationList[idx] );   // cross-fades from the old frame
			else
				printf( "Configuration %u not found!\n", idx + 1 );
			break;
		}

		default:
			event->ignore();
			break;
    }
}
