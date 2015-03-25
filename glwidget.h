#ifndef CG_RENDERAREA_H
#define CG_RENDERAREA_H

#include <vector>
#include <iostream>

#include <QtOpenGL/QGLWidget>
#include <QtGui/QImage>

#include "filterShader.h"
#include "Configuration.h"


class GLwidget : public QGLWidget 
{
	static const GLdouble SV_TRANSZ;
	static const GLdouble PV_TRANSZ;

    Q_OBJECT

public:            

    GLwidget( QWidget *parent = 0, QGLFormat format = QGLFormat());
	~GLwidget();
    
public slots:
	bool slotSetDirectory(const QString &filename);

protected:   
    //virtual void paintGL();
	virtual void initializeGL();
	virtual void resizeGL ( int width, int height );
	virtual void mousePressEvent( QMouseEvent *event );
	virtual void mouseMoveEvent( QMouseEvent *event );
	virtual void mouseDoubleClickEvent(QMouseEvent *e);
	virtual void keyPressEvent(QKeyEvent *event);
    virtual void timerEvent( QTimerEvent* );
    virtual void swapBuffers();
	virtual void paintEvent(QPaintEvent *event);

	void draw();

	void showSelectConfigurationsMenu( QPainter *painter );

	void traverseConfigurations( const QString& dirname, std::vector<Configuration *> &configurationList );


    int   m_fpsCounter;     // counter for this period
	int   m_fpsValue;       // dispalyed to the used
	int   m_fpsLastPeriod;  // time point of last update
	QTime m_fpsTimer;

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

	//QPainter		*m_painter;
	bool			m_showSelectConfigurationMenu;

	int		m_width;
	int		m_height;


};


#endif
