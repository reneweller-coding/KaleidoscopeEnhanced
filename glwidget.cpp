#include <math.h>

#include <QtCore/QFile>
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
, m_audioAnalyzer(nullptr)
{
	setFocusPolicy(Qt::StrongFocus);
	setFocus();

	//m_directory = "C:\\Users\\weller\\Pictures";

	
	m_configurationList.clear();
	traverseConfigurations( "..\\Configurations" /*directory*/, m_configurationList );
	
	m_actConfiguration = m_configurationList[0];//new Configuration( directory );
	//m_configurationList.push_back( conf );
	// = conf;

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

    
	// start FPS timer
	//m_fpsTimer.start();
	//m_fpsLastPeriod = m_fpsTimer.elapsed() - 1000;

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

	// update value
	/*int now = m_fpsTimer.elapsed();
	if( now - m_fpsLastPeriod >= 1000 )
	{
		m_fpsValue = m_fpsCounter;
		m_fpsCounter = 0;
		m_fpsLastPeriod = now;
	}

	// count this frame
	m_fpsCounter++;*/

	
 }


//static unsigned int counterExportImages = 0;
//static bool save_images = true;



void GLwidget::draw()
{
	AudioFeatures audio;
	if (m_audioAnalyzer)
		audio = m_audioAnalyzer->getFeatures();

	// QOpenGLWidget renders into its own FBO, not framebuffer 0.  Tell the
	// pipeline where the final image must land, otherwise it draws off-screen.
	m_actConfiguration->m_filterShader->setDefaultFBO( defaultFramebufferObject() );

	m_actConfiguration->m_filterShader->paint(m_RotationMatrix, m_xTrans, m_yTrans, m_zTrans, audio);
	
	//printf( "Painting Now\n" );
	// Only spin up a QPainter when the overlay menu is actually visible, so the
	// normal render path is pure GL (no QPainter/GL state interaction).
	if( m_showSelectConfigurationMenu )
	{
		QPainter painter(this);
		//painter.setRenderHint(QPainter::Antialiasing);
		showSelectConfigurationsMenu( &painter );
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


void GLwidget::resizeGL( int width, int height ) 
{
	m_width = width;
	m_height = height;

	m_actConfiguration->m_filterShader->reinit(width,height);
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
