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
#include "Recorder.h"
#include "TrackMedia.h"


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
	void        remoteSaveReplay()          { m_recorder.saveReplay(); }
	bool        remoteReplayArmed() const   { return m_recorder.replayArmed(); }
	void        remoteToggleReplayArm()     { m_recorder.toggleReplayArm(); }

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

	// ---- Lyrics + Künstlerbilder (TrackMedia: LRCLIB / Deezer, optional) ----
	// Taste 'w' schaltet den Lyrics-Modus (aus -> Scroll -> Karaoke), Taste
	// 'o' die Künstlerbilder.  updateTrackOverlays() berechnet pro Frame den
	// Overlay-Zustand (Playback-Sync, Blenden, Bildrotation) und reicht ihn
	// samt Texturen an den FilterShader/PresentPass durch.
	void			updateTrackOverlays( FilterShader *fs );
	TrackMedia	   *m_trackMedia     = nullptr;
	// Default beim allerersten Start (keine gespeicherten Settings): Karaoke
	// + Künstlerbilder an - ab dann persistiert loadUiSettings()/saveUiSettings()
	// den zuletzt gewählten Zustand.
	int				m_lyricsMode     = 2;      // 0 aus, 1 Scroll, 2 Karaoke (persistiert)
	bool			m_artistShow     = true;   // Künstlerbilder an/aus (persistiert)
	// Kinetischer Zeilen-Slam beim Karaoke-Zeilenwechsel: per User-Feedback
	// ("springt zuviel") standardmäßig AUS, per Umschalt+W zuschaltbar
	// (persistiert wie die anderen Overlay-Einstellungen).
	bool			m_lyricsKinetic  = false;
	int				m_lyricsRevUploaded = -1;
	int				m_artistRevSeen  = -1;
	int				m_artistIdx      = -1;
	int				m_artistIdxUploaded = -1;
	float			m_lyricsAlphaSm  = 0.f;
	float			m_artistAlphaSm  = 0.f;
	float			m_scrollVSm      = 0.f;
	int				m_karaokeLine    = -1;
	// Kinetik: wann die aktive Karaoke-Zeile zuletzt gewechselt hat
	// (Slam-Einflug der frischen Zeile im Present).
	int				m_lastKaraokeLineSeen = -1;
	qint64			m_lineChangeMs   = -1;
	// Cover-Palette: dominante Farben des aktuellen Kuenstlerbilds.
	float			m_palA[3] = { 0.f, 0.f, 0.f };
	float			m_palB[3] = { 0.f, 0.f, 0.f };
	bool			m_palValid       = false;
	float			m_palAmtSm       = 0.f;
	qint64			m_trackStartMs   = 0;      // Fallback-Uhr ohne SMTC-Position
	bool			m_lyricsTest     = false;  // KALEIDO_LYRICS_TEST aktiv
	// Echtes dt fürs Scroll-/Blend-Smoothing (nicht an die 60-Hz-Annahme
	// gekoppelt) - ohne das ruckelt es, sobald die Framezeit schwankt.
	qint64			m_overlayLastMs  = -1;
	// Consumer-seitige PLL für die Playback-Position: EIGENE, stetig
	// integrierte Uhr, die nur zur jeweils verfügbaren Referenz (SMTC oder
	// lokale Uhr) hin BESCHLEUNIGT oder BREMST (Rate 0..1.15) - springen
	// kann sie konstruktionsbedingt nur bei einem echten Seek (>1.5s).
	// Deckt ALLE Restquellen von Rückwärtsschritten ab (Playing-Flackern,
	// Titel-Flackern/Settle-Resets, SMTC<->Lokaluhr-Übergabe).
	double			m_posSmooth      = -1.0;
	// Rückwärts-Sprünge der Referenz werden erst nach ~2s konsistenter
	// Bestätigung übernommen (echter Rückwärts-Seek) - kürzeres Flackern
	// (Titel-/Playing-Flaps) wird komplett überbrückt.
	qint64			m_backJumpSince  = -1;
	double			m_backJumpRef    = 0.0;
	// Dieselbe Bestätigung jetzt auch VORWÄRTS, nur kürzer (0.4s statt 2s -
	// ein echter Vorspul-Seek soll sich weiter sofort anfühlen). Vorher
	// sprang ein einzelner verrutschter Referenzwert >1.5s voraus GANZ OHNE
	// Bestätigung durch - unauffällig für sich allein, aber sobald die
	// Referenz eine Umlaufzeit später wieder auf den echten Wert zurückfiel,
	// erkannte die Rückwärts-Logik genau DAS als "2s konsistent falsch" und
	// sprang zurück: ein einzelner Ausreißer wurde so zu ZWEI sichtbaren
	// Sprüngen (vor, dann zurück) - exakt das gemeldete Huepfen, durch eine
	// PLL-Simulation mit realistischem Referenz-Rauschen nachgestellt.
	qint64			m_fwdJumpSince   = -1;
	double			m_fwdJumpRef     = 0.0;
	// An WELCHEN FilterShader die Overlay-Texturen zuletzt hochgeladen wurden:
	// jede Konfiguration hat ihren EIGENEN PresentPass - nach einem Preset-
	// Wechsel müssen Lyrics-/Künstlerbild-Texturen dort neu hochgeladen
	// werden, sonst sind sie "verloren".
	FilterShader   *m_overlayFs      = nullptr;

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

	// Recording + Instant Replay: komplett in Source/Recorder.{h,cpp}
	// gekapselt (PBO-Readback, Encoder-Worker, Replay-Ring, ffmpeg-Mux).
	// GLwidget ruft nur noch toggle()/captureIfDue()/saveReplay() etc.
	Recorder        m_recorder;
	std::vector<unsigned char> m_snapBuf;        // glReadPixels scratch (Web-Snapshot)

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
	// Bündelt saveUiSettings() + FilterShader::saveSettings() - ruft die
	// Taste 'k' auf UND jeder Quit-Pfad (auch die harten exit(0)-Stellen,
	// die keine C++-Destruktoren mehr durchlaufen), damit der zuletzt
	// gewählte Zustand wirklich immer übersteht.
	void    saveAllSettings();

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
