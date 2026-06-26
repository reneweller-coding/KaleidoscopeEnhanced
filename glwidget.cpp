#include <math.h>

#include <QtCore/QFile>
#include <QtCore/QDateTime>
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

#include "GLee.h"        // GLeeInit() + GL extension entry points
#include "glwidget.h"

 #ifndef GL_MULTISAMPLE
 #define GL_MULTISAMPLE  0x809D
 #endif

// Start configuration requested on the command line (-c <name>); empty = default.
QString GLwidget::s_startConfig;
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

	// Robustness: a missing/empty Configurations directory used to crash here with
	// an out-of-range vector access.  Fail with a clear message instead.
	if( m_configurationList.empty() )
	{
		fprintf( stderr, "FATAL: no configuration *.xml files found in "
		                 "..\\Configurations - cannot start.\n" );
		exit( 1 );
	}

	// Default to the first configuration, or the one requested with -c <name>.
	m_actConfiguration = m_configurationList[0];
	if( !s_startConfig.isEmpty() )
	{
		bool found = false;
		for( unsigned int i = 0; i < m_configurationList.size(); i++ )
			if( m_configurationList[i]->getConfigurationName()
			        .compare( s_startConfig, Qt::CaseInsensitive ) == 0 )
			{
				m_actConfiguration = m_configurationList[i];
				found = true;
				break;
			}
		if( !found )
			fprintf( stderr, "Configuration '%s' not found - using default.\n",
			         s_startConfig.toLocal8Bit().constData() );
	}

	resetRotation();
}

GLwidget::~GLwidget()
{
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
	for( unsigned int i = 0; i < m_configurationList.size(); i++ )
		delete m_configurationList[i];
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


	// Load OpenGL extension entry points now that we have a current context.
	// (GLee supplies the FBO / shader EXT functions used by the render pipeline.)
	GLeeInit();

	m_actConfiguration->start( 100, 100 );

	const char *version = (const char *)(glGetString(GL_VERSION));
	fprintf(stderr,"VERSION %s",version);

	// Start audio analyser (WASAPI loopback – captures any playing audio)
	m_audioAnalyzer = new AudioAnalyzer(this);
	m_audioAnalyzer->start();

	// Start the "now playing" poller (SMTC: title/artist of the current track).
	m_nowPlaying = new NowPlaying();
	m_nowPlaying->start();

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
		toggleRecording();

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

	// Auto-config-by-mood (optional, key 'a'): may switch m_actConfiguration.
	updateAutoConfig( audio );

	// QOpenGLWidget renders into its own FBO, not framebuffer 0.  Tell the
	// pipeline where the final image must land, otherwise it draws off-screen.
	m_actConfiguration->m_filterShader->setDefaultFBO( defaultFramebufferObject() );

	m_actConfiguration->m_filterShader->paint(m_RotationMatrix, m_xTrans, m_yTrans, m_zTrans, audio);

	// Capture the clean frame (before any overlay is drawn) while recording.
	if( m_recording )
		captureFrame();

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

	// Now-playing lower-third: appears for a few seconds when the track changes.
	QString npTitle, npArtist;
	float   npAlpha = 0.f;
	if( m_nowPlaying && m_showNowPlaying )
	{
		npTitle  = m_nowPlaying->title();
		npArtist = m_nowPlaying->artist();
		if( !npTitle.isEmpty() && npTitle != m_lastNpTitle )
		{
			m_lastNpTitle = npTitle;
			m_npShownAt   = m_fpsTimer.elapsed();
		}
		qint64 el = m_fpsTimer.elapsed() - m_npShownAt;
		if( !npTitle.isEmpty() && el >= 0 && el < 6000 )
		{
			npAlpha = 1.f;                                  // fade in / out
			if( el < 400 )       npAlpha = el / 400.f;
			else if( el > 5300 ) npAlpha = (6000 - el) / 700.f;
		}
	}

	//printf( "Painting Now\n" );
	// Only spin up a QPainter when an overlay or the cross-fade needs it, so the
	// normal render path is pure GL (no QPainter/GL state interaction).
	if( m_showSelectConfigurationMenu || m_showFeatureOverlay || m_showHelp
	    || m_showAudioMenu || m_showShaderInfo || m_recording
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
		if( npAlpha > 0.f )
			drawNowPlaying( &painter, npTitle, npArtist, npAlpha );
		if( m_recording )
		{
			painter.setBrush( QColor(230, 40, 40) );
			painter.setPen( Qt::NoPen );
			painter.drawEllipse( width() - 150, 26, 16, 16 );
			painter.setPen( QColor(255, 255, 255) );
			painter.setFont( QFont("Consolas", 12, QFont::Bold) );
			painter.drawText( width() - 126, 39, QString("REC %1").arg(m_recFrame) );
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

// Settings file shared with FilterShader (next to the Configurations folder).
static const char *kUiSettingsPath = "..\\kaleidoscope_settings.ini";

void GLwidget::loadUiSettings()
{
	QSettings s( kUiSettingsPath, QSettings::IniFormat );
	m_autoConfig     = s.value( "autoConfig",  m_autoConfig ).toBool();
	m_autoScale      = s.value( "autoScale",   m_autoScale  ).toBool();
	m_showNowPlaying = s.value( "nowPlaying",  m_showNowPlaying ).toBool();
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
	s.sync();
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
	for( unsigned int i = 0; i < m_configurationList.size(); i++ )
		if( m_configurationList[i]->getConfigurationName()
		        .compare( name, Qt::CaseInsensitive ) == 0 )
		{
			if( m_configurationList[i] == m_actConfiguration )
				return false;                     // already active
			switchConfig( m_configurationList[i] );
			return true;
		}
	return false;
}

void GLwidget::updateAutoConfig( const AudioFeatures &f )
{
	if( !m_autoConfig )
		return;

	// Map the sustained mood to a configuration bucket.
	//   0 ambient/drone, 1 calm, 2 normal, 3 energetic.
	int bucket;
	if     ( f.ambientFactor > 0.6f ) bucket = 0;
	else if ( f.arousal      < 0.33f ) bucket = 1;
	else if ( f.arousal      > 0.66f ) bucket = 3;
	else                               bucket = 2;
	static const char *names[4] = { "darkambient", "slow", "normal", "psychedelic" };

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

  exit( 0 );

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
		{ "a",       "auto-config by mood on/off" },
		{ "g",       "adaptive render scale on/off" },
		{ "[  ]",    "reactivity  - less / more" },
		{ ",  .",    "trails       - shorter / longer" },
		{ "-  =",    "mood         - weaker / stronger" },
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

void GLwidget::applyMidi()
{
	if( !m_midi )
		return;
	std::vector<MidiInput::Event> evs = m_midi->drain();
	for( const MidiInput::Event &e : evs )
	{
		if( e.type == 0xB0 )                       // Control Change -> look knobs
		{
			float v = e.data2 / 127.f;             // 0..1
			switch( e.data1 )
			{
				case 1:  FilterShader::setReactivity( v * 3.0f  ); break;  // CC1  mod wheel
				case 2:  FilterShader::setTrails     ( v * 0.95f ); break;  // CC2
				case 3:  FilterShader::setMood       ( v * 2.5f  ); break;  // CC3
				default: break;
			}
		}
		else if( e.type == 0x90 )                  // Note On -> next effect
		{
			if( m_actConfiguration && m_actConfiguration->m_filterShader )
				m_actConfiguration->m_filterShader->requestSceneChange();
		}
	}
}

void GLwidget::toggleRecording()
{
	if( !m_recording )
	{
		QString ts = QDateTime::currentDateTime().toString("yyyyMMdd_hhmmss");
		m_recDir = QString("recordings/rec_%1").arg(ts);
		QDir().mkpath( m_recDir );
		m_recFrame = 0;
		m_recConcat.clear();
		m_recLastFrame = m_fpsTimer.elapsed();
		if( m_audioAnalyzer )
			m_audioAnalyzer->startRecording( m_recDir + "/audio.wav" );
		m_recording = true;
		fprintf( stderr, "REC start -> %s\n", m_recDir.toLocal8Bit().constData() );
	}
	else
	{
		m_recording = false;
		finishRecording();
	}
}

// Grab the freshly-rendered frame (clean, before any overlay) at ~30 fps and save
// it as a JPG, building the ffmpeg concat list with the real per-frame durations.
void GLwidget::captureFrame()
{
	qint64 now = m_fpsTimer.elapsed();
	if( now - m_recLastFrame < 33 )      // ~30 fps cap
		return;
	float dur = (m_recFrame == 0) ? (1.0f/30.0f) : float(now - m_recLastFrame) / 1000.f;
	m_recLastFrame = now;

	int w = m_width, h = m_height;
	if( w < 2 || h < 2 ) return;
	if( (int)m_recBuf.size() < w*h*4 ) m_recBuf.resize( (size_t)w*h*4 );
	glReadPixels( 0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, m_recBuf.data() );

	QImage img( m_recBuf.data(), w, h, QImage::Format_RGBA8888 );
	QImage out = img.mirrored( false, true )                       // GL is bottom-up
	                .scaledToHeight( h > 720 ? 720 : h, Qt::SmoothTransformation );
	QString fn = QString("%1/frame_%2.jpg").arg(m_recDir).arg(m_recFrame, 6, 10, QChar('0'));
	out.save( fn, "JPG", 85 );

	m_recConcat += QString("file 'frame_%1.jpg'\nduration %2\n")
	               .arg(m_recFrame, 6, 10, QChar('0')).arg(dur, 0, 'f', 4);
	m_recFrame++;
}

// Finalise: close the WAV, write the concat list + a make_video.bat, and kick off
// ffmpeg to mux the frames + audio into kaleidoscope.mp4.
void GLwidget::finishRecording()
{
	if( m_audioAnalyzer )
		m_audioAnalyzer->stopRecording();      // flushes + closes the WAV

	QString listPath = m_recDir + "/frames.txt";
	QFile lf( listPath );
	if( lf.open(QIODevice::WriteOnly | QIODevice::Text) )
	{
		QByteArray data = m_recConcat.toLocal8Bit();
		if( m_recFrame > 0 )   // concat demuxer wants the last entry once more, no duration
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

	// Auto-mux now (detached; ffmpeg is on PATH).  make_video.bat is the fallback.
	QStringList args;
	args << "-y" << "-f" << "concat" << "-safe" << "0" << "-i" << listPath
	     << "-i" << (m_recDir + "/audio.wav")
	     << "-c:v" << "libx264" << "-pix_fmt" << "yuv420p" << "-c:a" << "aac"
	     << "-shortest" << (m_recDir + "/kaleidoscope.mp4");
	QProcess::startDetached( "ffmpeg", args );

	fprintf( stderr, "REC stop: %d frames -> %s (muxing kaleidoscope.mp4)\n",
	         m_recFrame, m_recDir.toLocal8Bit().constData() );
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
			exit(0);
			break;
		case Qt::Key_Q:
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
		case Qt::Key_R:
			toggleRecording();   // record visuals + music to an mp4
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

		// ---- Persist the current look + UI state as the startup default ----
		case Qt::Key_K:
			FilterShader::saveSettings();
			saveUiSettings();
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
