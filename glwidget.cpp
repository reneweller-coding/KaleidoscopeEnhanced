#include <math.h>

#include <QtCore/QFile>
#include <QtCore/QDateTime>
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

	// Auto-config-by-mood (optional, key 'a'): may switch m_actConfiguration.
	updateAutoConfig( audio );

	// QOpenGLWidget renders into its own FBO, not framebuffer 0.  Tell the
	// pipeline where the final image must land, otherwise it draws off-screen.
	m_actConfiguration->m_filterShader->setDefaultFBO( defaultFramebufferObject() );

	m_actConfiguration->m_filterShader->paint(m_RotationMatrix, m_xTrans, m_yTrans, m_zTrans, audio);
	
	//printf( "Painting Now\n" );
	// Only spin up a QPainter when an overlay is actually visible, so the
	// normal render path is pure GL (no QPainter/GL state interaction).
	if( m_showSelectConfigurationMenu || m_showFeatureOverlay )
	{
		QPainter painter(this);
		//painter.setRenderHint(QPainter::Antialiasing);
		if( m_showSelectConfigurationMenu )
			showSelectConfigurationsMenu( &painter );
		if( m_showFeatureOverlay )
			drawFeatureOverlay( &painter, audio );
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
	
	unsigned int nrConfigurations = m_configurationList.size();

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


	unsigned int maxStringlength = 0;
	for( unsigned int i = 0; i < nrConfigurations; i++ )
	{
		if( fm.horizontalAdvance((*m_configurationList[i]).getConfigurationName()) > maxStringlength ) //fm.horizontalAdvance(str1)/2
			maxStringlength = fm.horizontalAdvance((*m_configurationList[i]).getConfigurationName());
	}

	maxStringlength *= 1.5;

	
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

bool GLwidget::selectConfigByName( const QString &name )
{
	for( unsigned int i = 0; i < m_configurationList.size(); i++ )
		if( m_configurationList[i]->getConfigurationName()
		        .compare( name, Qt::CaseInsensitive ) == 0 )
		{
			if( m_configurationList[i] == m_actConfiguration )
				return false;                     // already active
			m_actConfiguration->stop();
			m_actConfiguration = m_configurationList[i];
			m_actConfiguration->start( m_width, m_height );
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

void GLwidget::keyPressEvent(QKeyEvent* event)
{
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
		case Qt::Key_N:
			// Manually advance to the next texture effect.
			if( m_actConfiguration && m_actConfiguration->m_filterShader )
				m_actConfiguration->m_filterShader->requestSceneChange();
			break;

		// ---- Live tuning (values shared across all configs) ----
		case Qt::Key_BracketLeft:  FilterShader::adjustReactivity(-0.10f); break;  // [  less reactive
		case Qt::Key_BracketRight: FilterShader::adjustReactivity(+0.10f); break;  // ]  more reactive
		case Qt::Key_Comma:        FilterShader::adjustTrails(-0.05f);     break;  // ,  shorter trails
		case Qt::Key_Period:       FilterShader::adjustTrails(+0.05f);     break;  // .  longer trails
		case Qt::Key_Minus:        FilterShader::adjustMood(-0.10f);       break;  // -  less mood colour
		case Qt::Key_Equal:        FilterShader::adjustMood(+0.10f);       break;  // =  more mood colour

		// ---- Persist the current look settings as the startup default ----
		case Qt::Key_K:            FilterShader::saveSettings();           break;

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
		case Qt::Key_1:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 0 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[0];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 1 not found!\n" );
			break;
		case Qt::Key_2:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 1 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[1];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 2 not found!\n" );
			break;
		case Qt::Key_3:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 2 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[2];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 3 not found!\n" );
			break;
		case Qt::Key_4:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 3 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[3];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 3 not found!\n" );
			break;
		case Qt::Key_5:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 4 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[4];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 4 not found!\n" );
			break;
		case Qt::Key_6:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 5 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[5];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 5 not found!\n" );
			break;
		case Qt::Key_7:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 6 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[6];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 6 not found!\n" );
			break;
		case Qt::Key_8:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 7 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[7];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 8 not found!\n" );
			break;
		case Qt::Key_9:
			m_showSelectConfigurationMenu = false;
			if( m_configurationList.size() > 8 )
			{
				m_actConfiguration->stop();
				m_actConfiguration = m_configurationList[8];
				m_actConfiguration->start( m_width, m_height );
			}
			else
				printf( "Configuration 9 not found!\n" );
			break;

		default:
			event->ignore();
			break;
    }
}
