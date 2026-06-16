#ifndef CG_RENDERAREA_H
#define CG_RENDERAREA_H

#include <vector>
#include <iostream>

#include <QtOpenGLWidgets/QOpenGLWidget>
#include <QtGui/QImage>

#include "filterShader.h"
#include "Configuration.h"
#include "AudioAnalyzer.h"


class GLwidget : public QOpenGLWidget
{
	static const GLdouble SV_TRANSZ;
	static const GLdouble PV_TRANSZ;

    Q_OBJECT

public:

    GLwidget( QWidget *parent = 0 );
	~GLwidget();

	// Start configuration name (CLI -c <name>); empty = first config. Set from
	// main() before the widget is constructed, so it must be public.
	static QString s_startConfig;

public slots:
	bool slotSetDirectory(const QString &filename);

protected:
	virtual void paintGL();
	virtual void initializeGL();
	virtual void resizeGL ( int width, int height );
	virtual void mousePressEvent( QMouseEvent *event );
	virtual void mouseMoveEvent( QMouseEvent *event );
	virtual void mouseDoubleClickEvent(QMouseEvent *e);
	virtual void keyPressEvent(QKeyEvent *event);
    virtual void timerEvent( QTimerEvent* );

	void draw();

	void showSelectConfigurationsMenu( QPainter *painter );
	void drawFeatureOverlay( QPainter *painter, const AudioFeatures &f );

	void traverseConfigurations( const QString& dirname, std::vector<Configuration *> &configurationList );


    int     m_fpsCounter;     // frames counted in the current period
	int     m_fpsValue;       // frames-per-second shown in the overlay
	qint64  m_fpsLastPeriod;  // m_fpsTimer.elapsed() at the last update (qint64: kiosk runs for weeks)
	QElapsedTimer m_fpsTimer;

	void resetRotation(); // set rotation matrix to Identity

	FilterShader	*m_filterShader;
    ImageLoader     *m_imageLoader;


	std::vector<Configuration *> m_configurationList;

	// some variables for trackball
	float			m_RotationMatrix[16];						//!< global rotation Matrix
	float			m_xTrans, m_yTrans, m_zTrans;				//!< global translation
	QPoint			m_lastPos;

	QString			m_directory;

	Configuration  *m_actConfiguration;

	AudioAnalyzer  *m_audioAnalyzer;

	//QPainter		*m_painter;
	bool			m_showSelectConfigurationMenu;
	bool			m_showFeatureOverlay;

	int		m_width;
	int		m_height;


};


#endif
