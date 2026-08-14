#ifndef CG_RENDERAREA_H
#define CG_RENDERAREA_H

#include <vector>
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <deque>

#include <QtOpenGLWidgets/QOpenGLWidget>
#include <QtGui/QImage>
#include <QtGui/QPixmap>
#include <QtCore/QSet>

#include "filterShader.h"
#include "Configuration.h"
#include "AudioAnalyzer.h"
#include "NowPlaying.h"
#include "MidiInput.h"


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

	// CLI -r: start recording immediately on launch (used for testing/debugging).
	static bool s_autoRecord;

	// CLI -t <port>: start the embedded web remote on this port (0 = off).
	static int  s_remotePort;

	// CLI -x <wav>: batch render — record the offline WAV deterministically,
	// then auto-quit once it ends (the mp4 mux continues detached).
	static bool s_batchRender;

	// ---- Web-remote hooks (same harmless controls as the keyboard) ----
	QStringList remoteConfigNames() const;
	int         remoteActiveConfig() const;
	// Live frame rate, as shown in the overlay.  Exposed for the web remote:
	// the auto render-scale hides a struggling scene by quietly getting
	// coarser, so the frame rate is the only way to see it happening.
	int         fpsValue() const { return m_fpsValue; }
	void        remoteSelectConfig( int idx );
	void        remoteNextEffect();
	QStringList remoteSceneNames();
	void        remoteForceScene( int idx );
	bool        autoConfigEnabled() const   { return m_autoConfig; }
	void        setAutoConfigEnabled( bool on ) { m_autoConfig = on; m_moodBucket = -1; }
	// Live preview: returns the cached small JPEG of the output and keeps the
	// ~1 Hz refresh in paintGL alive for the next few seconds.  All on the
	// GUI thread (QTcpServer + paintGL), so no locking is needed.
	QByteArray  remoteSnapshot();
	void        remoteFavorite();
	void        remoteSaveReplay()          { saveReplay(); }
	bool        remoteReplayArmed() const   { return m_replayArmed; }
	void        remoteToggleReplayArm();

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

	// "Now playing" lower-third: shown briefly when the track changes (key 'p').
	void drawNowPlaying( QPainter *painter, const QString &title,
	                     const QString &artist, float alpha );
	NowPlaying     *m_nowPlaying    = nullptr;
	bool			m_showNowPlaying = true;
	QString			m_lastNpTitle;
	qint64			m_npShownAt     = -100000;

	// Optional MIDI control (knobs -> look params, pads -> next effect).
	// MIDI LEARN (key 'j'): cycles through the targets below; the next CC
	// (targets 0-3) or note (target 4) that arrives is bound to it and the
	// learn advances to the next target.  Mappings persist in the settings.
	void            applyMidi();
	MidiInput      *m_midi          = nullptr;
	enum { MIDI_REACT = 0, MIDI_TRAILS, MIDI_MOOD, MIDI_LATENCY, MIDI_NEXT,
	       MIDI_TAP, MIDI_BLACKOUT, MIDI_TARGETS };
	int             m_midiMap[MIDI_TARGETS] = { 1, 2, 3, -1, -1, -1, -1 };  // CC/note nr, -1 = frei
	int             m_midiLearn     = -1;   // -1 = off, else target being learned

	// Recording: capture the visualization frames (+ the loopback audio) and mux
	// them to an mp4 with ffmpeg.  Toggled with key 'r'.
	void            toggleRecording();
	void            captureFrame();
	void            finishRecording();
	bool            m_recording     = false;
	QString         m_recDir;
	int             m_recFrame      = 0;
	qint64          m_recLastFrame  = 0;
	QString         m_recConcat;                 // ffmpeg concat list being built
	std::vector<unsigned char> m_recBuf;         // glReadPixels scratch

	// Async encoder: mirror/scale/JPEG used to run synchronously in paintGL and
	// throttled rendering to ~18 fps while recording.  Now only glReadPixels (+ a
	// memcpy) stays on the GL thread; a single worker thread (order-preserving)
	// does the image work.  A bounded queue drops frames instead of ballooning
	// memory if the encoder can't keep up; the dropped time is added to the next
	// frame's duration so the video timeline stays correct.
	struct RecJob { QImage img; QString path; float dur = 0.f; };  // path empty -> replay ring
	std::thread             m_recThread;
	std::mutex              m_recMx;
	std::condition_variable m_recCv;
	std::deque<RecJob>      m_recQueue;
	bool                    m_recQuit    = false;
	float                   m_recCarryDur = 0.f;  // duration of dropped frames
	void                    recWorker();          // worker-thread loop
	void                    ensureRecWorker();    // (re)start the worker if needed

	// Instant replay (key 'y' arms, 'x' saves): a rolling ~30 s ring of encoded
	// JPEG frames (worker thread) + the analyzer's rolling PCM ring.  Armed is
	// opt-in because the periodic glReadPixels costs a little performance.
	struct ReplayFrame { QByteArray jpg; float dur; };
	void                    captureReplayFrame(); // ~15 fps into the ring
	void                    saveReplay();         // dump ring + audio, mux mp4

	// PBO double-buffered ASYNC readback: glReadPixels into a pixel-pack
	// buffer returns immediately; the PREVIOUS frame's buffer (whose DMA has
	// long finished) is mapped instead — recording / replay capture no longer
	// stalls the GPU→CPU pipeline every frame.  One frame of added latency in
	// the capture, invisible in the output.
	void                    asyncCapture( float dur, bool toReplay );
	GLuint                  m_pbo[2] = { 0, 0 };
	int                     m_pboIdx = 0;
	struct PboMeta { bool pending = false; bool replay = false;
	                 float dur = 0.f; int w = 0, h = 0; };
	PboMeta                 m_pboMeta[2];
	bool                    m_replayArmed  = false;
	std::mutex              m_replayMx;
	std::deque<ReplayFrame> m_replayFrames;
	qint64                  m_repLastFrame = 0;
	float                   m_repCarryDur  = 0.f;

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

	// Shader hot-reload (dev aid): saved .frag files in Scene\/Combine\ are
	// recompiled live on the next frame (GL context current in paintGL).
	class QFileSystemWatcher *m_shaderWatcher = nullptr;
	QSet<QString>             m_pendingReloads;

	// Web-remote live preview: small JPEG of the output, refreshed ~1 Hz in
	// paintGL while the phone page polls /api/snapshot.
	QByteArray m_snapJpg;
	qint64     m_snapWantedUntil = 0;
	qint64     m_snapLast        = 0;

	bool m_batchStopping = false;   // batch render: shutdown initiated
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
	bool			m_showShaderInfo = false;   // debug: active shader names ('v')

	int		m_width;
	int		m_height;


};


#endif
