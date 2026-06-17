#ifndef CG_RENDERAREA_H
#define CG_RENDERAREA_H

#include <vector>
#include <iostream>

#include <QtOpenGLWidgets/QOpenGLWidget>
#include <QtGui/QImage>
#include <QtGui/QPixmap>

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
	void drawHelpOverlay( QPainter *painter );
	void drawAudioMenu( QPainter *painter );   // runtime audio-source picker ('d')
	void selectAudioDevice( int index );       // 0 = default loopback, 1..N = listed

	void traverseConfigurations( const QString& dirname, std::vector<Configuration *> &configurationList );

	// Request a configuration switch (applied in timerEvent, OUTSIDE paintGL, so
	// the cross-fade grab can't re-enter paintGL).  Cross-fades from the old frame.
	void switchConfig( Configuration *cfg );
	void beginConfigFade();             // capture the current frame as the fade-out layer
	Configuration *m_pendingConfig = nullptr;  // requested switch, applied next tick
	QPixmap m_fadePixmap;               // last frame of the previous config
	qint64  m_fadeStart = -1;           // fade start (m_fpsTimer ms); <0 = no fade

	// Switch to the configuration with the given name (case-insensitive).
	// Returns true if it switched to a *different* configuration.
	bool selectConfigByName( const QString &name );

	// Auto-config-by-mood: when enabled, pick a configuration that matches the
	// sustained musical mood (ambient/energy), with hysteresis + a dwell time.
	void updateAutoConfig( const AudioFeatures &f );

	bool    m_autoConfig      = false;  // toggled with key 'a'
	int     m_moodBucket      = -1;     // current mood bucket (see .cpp)
	qint64  m_moodBucketSince = 0;      // when the bucket last changed
	qint64  m_lastAutoSwitch  = 0;      // when auto-config last switched

	// Persist / restore UI state (active config, auto-config, auto-scale) in the
	// same settings file FilterShader uses.  Saved with 'k', loaded at startup.
	void    loadUiSettings();
	void    saveUiSettings();

	// Adaptive render scale: nudge FilterShader's internal render scale to keep
	// the frame rate near target, never exceeding the launch -s value.
	void    updateAdaptiveScale();
	bool    m_autoScale       = true;   // toggled with key 'g'
	float   m_autoScaleMax    = 1.f;    // ceiling = the launch render scale
	qint64  m_lastScaleAdjust = 0;      // when the scale was last changed


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
	bool			m_showHelp = false;
	bool			m_showAudioMenu = false;

	int		m_width;
	int		m_height;


};


#endif
