/**
 * @file glwidget.h
 * @brief Declares GLwidget, the QOpenGLWidget subclass that owns the render loop,
 *        input handling and the audio/MIDI/track-media wiring for the visualizer.
 */
#ifndef GLWIDGET_H
#define GLWIDGET_H

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

#include "RenderPipeline.h"
#include "Configuration.h"
#include "AudioAnalyzer.h"
#include "NowPlaying.h"
#include "MidiInput.h"
#include "Recorder.h"
#include "TrackMedia.h"


/**
 * @brief The QOpenGLWidget that drives the whole visualizer: render loop, input,
 *        and the audio/MIDI/track-media wiring.
 *
 * GLwidget owns the timer-driven render loop (paintGL()/timerEvent()), the active
 * Configuration (a loaded preset made of a RenderPipeline pipeline), and the
 * AudioAnalyzer that feeds it per-frame AudioFeatures. It also owns the optional
 * peripherals: MIDI control surface mapping (MidiInput), "now playing" title/
 * artist polling (NowPlaying), synced lyrics + artist-image overlays (TrackMedia),
 * screen recording / instant replay (Recorder), and the embedded web remote
 * (WebRemote, constructed only when a port was requested on the command line).
 * Keyboard shortcuts (keyPressEvent) are the primary user interface; the web
 * remote exposes a small harmless subset of the same controls for phone use.
 * Configuration switches are requested via switchConfig() but only actually
 * applied in timerEvent(), outside paintGL(), so the cross-fade frame grab
 * cannot re-enter paintGL().
 */
class GLwidget : public QOpenGLWidget
{
	static const GLdouble SV_TRANSZ;   ///< Unused legacy trackball constant (start view translation-Z).
	static const GLdouble PV_TRANSZ;   ///< Unused legacy trackball constant (projection view translation-Z).

    Q_OBJECT

public:

    /**
     * @brief Constructs the widget: restores persisted UI settings, loads every
     *        Configuration (*.xml) under ../Configurations, sets up shader
     *        hot-reload watching and (if requested) the web remote, and picks
     *        the initial active configuration (default, -c name, or persisted).
     * @param parent Parent widget, forwarded to QOpenGLWidget.
     */
    GLwidget( QWidget *parent = 0 );
    /**
     * @brief Persists settings, shuts down the recorder/audio/now-playing/MIDI
     *        subsystems in dependency order, releases the global Spout/VideoIn
     *        facades, and deletes every loaded Configuration while the GL
     *        context is still current (so their GL object cleanup isn't dropped).
     */
	~GLwidget();

	/// Start configuration name (CLI -c \<name\>); empty = first config. Set from
	/// main() before the widget is constructed, so it must be public.
	static QString s_startConfig;

	/// CLI -r: start recording immediately on launch (used for testing/debugging).
	static bool s_autoRecord;

	/// CLI -t \<port\>: start the embedded web remote on this port (0 = off).
	/// Defaults to 8080 (on); a PERSISTED port (see loadUiSettings()) only
	/// applies if s_remotePortFromCli stays false, same "-c wins" precedence
	/// as s_startConfig.
	static int  s_remotePort;
	/// Set true by parsecommandline() when -t was actually passed, so a
	/// persisted remotePort setting doesn't override an explicit CLI choice.
	static bool s_remotePortFromCli;

	/// CLI -x \<wav\>: batch render — record the offline WAV deterministically,
	/// then auto-quit once it ends (the mp4 mux continues detached).
	static bool s_batchRender;

	// ---- Web-remote hooks (same harmless controls as the keyboard) ----
	/**
	 * @brief Lists the display names of every user-facing (non-hidden) configuration.
	 * @return Configuration names in selection order, for the web remote's picker.
	 */
	QStringList remoteConfigNames() const;
	/**
	 * @brief Finds the index of the currently active configuration.
	 * @return Index into the user-facing configuration list, or -1 if not found.
	 */
	int         remoteActiveConfig() const;
	/// Live frame rate, as shown in the overlay.  Exposed for the web remote:
	/// the auto render-scale hides a struggling scene by quietly getting
	/// coarser, so the frame rate is the only way to see it happening.
	int         fpsValue() const { return m_fpsValue; }
	/**
	 * @brief Requests a switch to the configuration at the given index (web remote).
	 * @param idx Index into the user-facing configuration list.
	 */
	void        remoteSelectConfig( int idx );
	/// Requests the next effect (scene/combine change) on the active configuration.
	void        remoteNextEffect();
	/**
	 * @brief Lists the scene names available in the active configuration's pipeline.
	 * @return Scene names, or an empty list if there is no active filter shader.
	 */
	QStringList remoteSceneNames();
	/**
	 * @brief Forces the active configuration's pipeline to a specific scene.
	 * @param idx Index into the list returned by remoteSceneNames().
	 */
	void        remoteForceScene( int idx );
	/**
	 * @brief Cached JPEG thumbnail for one scene in the remote's browser grid, if one has been captured yet.
	 * @param idx Index into the list returned by remoteSceneNames().
	 * @return A small JPEG, or an empty QByteArray if that scene hasn't been on screen (with the remote open) yet this session.
	 */
	QByteArray  remoteThumb( int idx ) const;
	bool        autoConfigEnabled() const   { return m_autoConfig; }   ///< Whether auto-config-by-mood is currently on.
	void        setAutoConfigEnabled( bool on ) { m_autoConfig = on; m_moodBucket = -1; }   ///< Toggles auto-config-by-mood and resets the mood bucket so it re-evaluates from scratch.

	// ---- Remote-/Setup-Tool-Schalter für die optionalen Online-Extras ----
	// (Web-Remote /api/toggle + /api/set; the keyboard shortcuts 'w'/'o'/'g'/
	// 'p' set the same members directly, these just add a remote-safe API.)
	bool        autoScaleEnabled() const    { return m_autoScale; }   ///< Whether adaptive render-scale (key 'g') is currently on.
	void        setAutoScaleEnabled( bool on ) { m_autoScale = on; }
	bool        nowPlayingEnabled() const   { return m_showNowPlaying; }   ///< Whether the now-playing title reveal (key 'p') is currently on.
	void        setNowPlayingEnabled( bool on ) { m_showNowPlaying = on; }
	bool        artistImagesEnabled() const { return m_artistShow; }   ///< Whether the artist-image corner (key 'o') is currently on.
	void        setArtistImagesEnabled( bool on );
	bool        videoPipEnabled() const     { return m_videoEnabled; }   ///< Whether the music-video search/download (independent of, but gated by, artistImagesEnabled()) is currently on.
	void        setVideoPipEnabled( bool on );
	int         lyricsModeValue() const     { return m_lyricsMode; }   ///< 0 = off, 1 = scroll, 2 = karaoke (key 'w' cycles).
	void        setLyricsModeValue( int mode );
	/// Live preview: returns the cached small JPEG of the output and keeps the
	/// ~1 Hz refresh in paintGL alive for the next few seconds.  All on the
	/// GUI thread (QTcpServer + paintGL), so no locking is needed.
	QByteArray  remoteSnapshot();
	/// Favorites the currently active effect (same as key 'f').
	void        remoteFavorite();
	void        remoteSaveReplay()          { m_recorder.saveReplay(); }         ///< Saves the instant-replay ring buffer to disk (same as key 'x').
	bool        remoteReplayArmed() const   { return m_recorder.replayArmed(); } ///< Whether the instant-replay ring buffer is currently armed.
	void        remoteToggleReplayArm()     { m_recorder.toggleReplayArm(); }    ///< Arms/disarms the instant-replay ring buffer (same as key 'y').

public slots:
	/**
	 * @brief Stores the working directory for media lookups. Legacy hook, currently
	 *        only records the path; does not itself load anything.
	 * @param filename Directory (or file) path to remember.
	 * @return Always true.
	 */
	bool slotSetDirectory(const QString &filename);

protected:
	/// Per-frame render entry point (QOpenGLWidget override): draws the scene via
	/// draw(), then updates the FPS counter and the adaptive render scale.
	virtual void paintGL();
	/// One-time GL setup (QOpenGLWidget override): loads core GL entry points,
	/// starts the active configuration's pipeline, and starts the audio analyzer,
	/// now-playing poller, track-media fetcher, MIDI input and the frame timer.
	virtual void initializeGL();
	/**
	 * @brief Resizes the viewport/FBOs to the physical (DPI-scaled) framebuffer size
	 *        (QOpenGLWidget override).
	 * @param width Logical width passed by Qt (unused; physical size is recomputed).
	 * @param height Logical height passed by Qt (unused; physical size is recomputed).
	 */
	virtual void resizeGL ( int width, int height );
	/**
	 * @brief Mouse-press handler (currently a no-op stub; trackball code is commented out).
	 * @param event The mouse press event.
	 */
	virtual void mousePressEvent( QMouseEvent *event );
	/**
	 * @brief Mouse-move handler (currently a no-op stub; trackball code is commented out).
	 * @param event The mouse move event.
	 */
	virtual void mouseMoveEvent( QMouseEvent *event );
	/**
	 * @brief Double-click handler: persists settings and hard-exits the process.
	 * @param e The mouse double-click event.
	 */
	virtual void mouseDoubleClickEvent(QMouseEvent *e);
	/**
	 * @brief Main keyboard shortcut dispatcher: configuration switching, look
	 *        knobs (reactivity/trails/mood/latency), recording, MIDI learn,
	 *        overlays, stereo mode and quit.
	 * @param event The key press event.
	 */
	virtual void keyPressEvent(QKeyEvent *event);
    /**
     * @brief Periodic ~60 Hz tick (16.667 ms): applies any pending configuration
     *        switch outside paintGL(), then schedules a repaint via update().
     */
    virtual void timerEvent( QTimerEvent* );

	/// Renders one frame: audio features, MIDI, batch-render exit check, shader
	/// hot-reload, auto-config, the RenderPipeline pipeline, recording capture,
	/// web-remote snapshot, config cross-fade, now-playing reveal, lyrics/
	/// artist-image overlays, and any QPainter overlays (menus, help, REC dot).
	void draw();

	/**
	 * @brief Draws the numbered configuration-selection overlay (key '0').
	 * @param painter Active QPainter for this frame.
	 */
	void showSelectConfigurationsMenu( QPainter *painter );
	/**
	 * @brief Draws the live audio-feature panel with value bars and look knobs (key 'i').
	 * @param painter Active QPainter for this frame.
	 * @param f Current per-frame audio features to display.
	 */
	void drawFeatureOverlay( QPainter *painter, const AudioFeatures &f );
	/**
	 * @brief Draws the keyboard-shortcut help box (key 'h').
	 * @param painter Active QPainter for this frame.
	 */
	void drawHelpOverlay( QPainter *painter );
	void drawAudioMenu( QPainter *painter );   ///< Draws the runtime audio-source picker overlay (key 'd').
	void selectAudioDevice( int index );       ///< Selects an audio input by menu index: 0 = default loopback, 1..N = the Nth listed device.

	/**
	 * @brief Draws the "now playing" lower-third box (title/artist), shown
	 *        briefly when the track changes (key 'p'). Currently unused in
	 *        draw() — the title reveal was moved into the shader pipeline —
	 *        but kept as a QPainter-based fallback renderer.
	 * @param painter Active QPainter for this frame.
	 * @param title Track title to display.
	 * @param artist Track artist to display.
	 * @param alpha Fade-in/out opacity, 0..1.
	 */
	void drawNowPlaying( QPainter *painter, const QString &title,
	                     const QString &artist, float alpha );
	NowPlaying     *m_nowPlaying    = nullptr;   ///< SMTC "now playing" title/artist/position poller; started in initializeGL().
	bool			m_showNowPlaying = true;     ///< Whether the now-playing title reveal is enabled (key 'p', persisted).
	QString			m_lastNpTitle;                ///< Last title seen from m_nowPlaying, used to detect a track change.
	qint64			m_npShownAt     = -100000;   ///< m_fpsTimer timestamp when the current title reveal started.

	// ---- Lyrics + Künstlerbilder (TrackMedia: LRCLIB / Deezer, optional) ----
	// Taste 'w' schaltet den Lyrics-Modus (aus -> Scroll -> Karaoke), Taste
	// 'o' die Künstlerbilder.  updateTrackOverlays() berechnet pro Frame den
	// Overlay-Zustand (Playback-Sync, Blenden, Bildrotation) und reicht ihn
	// samt Texturen an den RenderPipeline/PresentPass durch.
	/**
	 * @brief Computes this frame's lyrics/artist-image overlay state (sync
	 *        position via a consumer PLL, karaoke line, fades, palette) and
	 *        uploads any changed textures, then hands the result to the given
	 *        RenderPipeline's present pass.
	 * @param fs RenderPipeline (present pass) to upload overlay textures/state to.
	 */
	void			updateTrackOverlays( RenderPipeline *fs );
	/// Re-requests lyrics/artist-images/video for whatever NowPlaying reports
	/// right now (same m_key-dedup as a real track change, so this is a
	/// harmless no-op if nothing actually needs (re)fetching) -- shared by
	/// the 'w'/'o' key handlers and the new setArtistImagesEnabled()/
	/// setVideoPipEnabled()/setLyricsModeValue() so turning an extra ON from
	/// ANY live control surface (keyboard, web remote) picks it up for the
	/// currently-playing track immediately, not just on the next track
	/// change. (The standalone setup tool only edits the settings file for
	/// the NEXT app start, so it never needs this.)
	void			requestCurrentTrackMedia();
	TrackMedia	   *m_trackMedia     = nullptr;   ///< Fetches synced lyrics + artist images (LRCLIB/Deezer) for the current track.
	// Default beim allerersten Start (keine gespeicherten Settings): Karaoke
	// + Künstlerbilder an - ab dann persistiert loadUiSettings()/saveUiSettings()
	// den zuletzt gewählten Zustand.
	int				m_lyricsMode     = 2;      ///< 0 aus, 1 Scroll, 2 Karaoke (persistiert)
	bool			m_artistShow     = true;   ///< Künstlerbilder an/aus (persistiert)
	// Eigener Schalter, UNABHÄNGIG von m_artistShow: wer Künstlerbilder will,
	// aber keine automatischen YouTube-Downloads (Netzwerk/Platte), kann das
	// hier separat abschalten -- der Video-PiP braucht trotzdem BEIDE Flags
	// (siehe updateTrackOverlays()), weil er sich denselben Eck-Slot teilt.
	bool			m_videoEnabled   = true;   ///< Musikvideo-Suche/-Wiedergabe an/aus (persistiert), zusätzlich zu m_artistShow.
	// Kinetischer Zeilen-Slam beim Karaoke-Zeilenwechsel: per User-Feedback
	// ("springt zuviel") standardmäßig AUS, per Umschalt+W zuschaltbar
	// (persistiert wie die anderen Overlay-Einstellungen).
	bool			m_lyricsKinetic  = false;   ///< Kinetic line-slam animation on karaoke line change, off by default (Shift+W).
	int				m_lyricsRevUploaded = -1;   ///< TrackMedia lyrics revision last uploaded as a texture; forces re-upload on preset switch.
	int				m_artistRevSeen  = -1;      ///< TrackMedia images revision last observed, for change detection.
	int				m_artistIdx      = -1;      ///< Unused index reservation (see m_artistIdxUploaded for the active one).
	int				m_artistIdxUploaded = -1;   ///< Index of the artist image currently uploaded as a texture.
	float			m_lyricsAlphaSm  = 0.f;     ///< Slewed (smoothed) lyrics overlay opacity.
	float			m_artistAlphaSm  = 0.f;     ///< Slewed (smoothed) artist-image overlay opacity.
	QString			m_videoPathLoaded;          ///< Path last passed to videoPipLoad(), so a still-loading/still-current video isn't reloaded every frame; cleared (and the PiP released) once no cached video applies.
	float			m_videoAlphaSm   = 0.f;     ///< Slewed (smoothed) music-video PiP opacity; only ramps IN (see the comment at its use site for why the fade-out is an immediate cut instead).
	float			m_scrollVSm      = 0.f;     ///< Slewed (smoothed) vertical scroll position of the lyrics texture.
	int				m_karaokeLine    = -1;      ///< Index of the currently active/highlighted karaoke line.
	// Kinetik: wann die aktive Karaoke-Zeile zuletzt gewechselt hat
	// (Slam-Einflug der frischen Zeile im Present).
	int				m_lastKaraokeLineSeen = -1;  ///< Last karaoke line index seen, to detect a line change.
	qint64			m_lineChangeMs   = -1;       ///< m_fpsTimer timestamp of the last karaoke line change.
	// Cover-Palette: dominante Farben des aktuellen Kuenstlerbilds.
	float			m_palA[3] = { 0.f, 0.f, 0.f };   ///< Dominant RGB color extracted from the current artist image.
	float			m_palB[3] = { 0.f, 0.f, 0.f };   ///< Secondary RGB color extracted from the current artist image.
	bool			m_palValid       = false;   ///< Whether extractPalette() found a usable (non-greyscale) palette for the current image.
	float			m_palAmtSm       = 0.f;     ///< Slewed (smoothed) blend amount of the cover palette grading.
	qint64			m_trackStartMs   = 0;      ///< Fallback-Uhr ohne SMTC-Position
	bool			m_lyricsTest     = false;  ///< KALEIDO_LYRICS_TEST aktiv
	// Echtes dt fürs Scroll-/Blend-Smoothing (nicht an die 60-Hz-Annahme
	// gekoppelt) - ohne das ruckelt es, sobald die Framezeit schwankt.
	qint64			m_overlayLastMs  = -1;   ///< m_fpsTimer timestamp of the previous updateTrackOverlays() call, for real dt.
	// Consumer-seitige PLL für die Playback-Position: EIGENE, stetig
	// integrierte Uhr, die nur zur jeweils verfügbaren Referenz (SMTC oder
	// lokale Uhr) hin BESCHLEUNIGT oder BREMST (Rate 0..1.15) - springen
	// kann sie konstruktionsbedingt nur bei einem echten Seek (>1.5s).
	// Deckt ALLE Restquellen von Rückwärtsschritten ab (Playing-Flackern,
	// Titel-Flackern/Settle-Resets, SMTC<->Lokaluhr-Übergabe).
	double			m_posSmooth      = -1.0;   ///< Consumer-PLL smoothed playback position (seconds); < 0 = not yet initialized.
	// Rückwärts-Sprünge der Referenz werden erst nach ~2s konsistenter
	// Bestätigung übernommen (echter Rückwärts-Seek) - kürzeres Flackern
	// (Titel-/Playing-Flaps) wird komplett überbrückt.
	qint64			m_backJumpSince  = -1;   ///< m_fpsTimer timestamp when a backward reference jump was first observed; -1 = none pending.
	double			m_backJumpRef    = 0.0;  ///< Reference position of the pending backward jump candidate.
	// Dieselbe Bestätigung jetzt auch VORWÄRTS, nur kürzer (0.4s statt 2s -
	// ein echter Vorspul-Seek soll sich weiter sofort anfühlen). Vorher
	// sprang ein einzelner verrutschter Referenzwert >1.5s voraus GANZ OHNE
	// Bestätigung durch - unauffällig für sich allein, aber sobald die
	// Referenz eine Umlaufzeit später wieder auf den echten Wert zurückfiel,
	// erkannte die Rückwärts-Logik genau DAS als "2s konsistent falsch" und
	// sprang zurück: ein einzelner Ausreißer wurde so zu ZWEI sichtbaren
	// Sprüngen (vor, dann zurück) - exakt das gemeldete Huepfen, durch eine
	// PLL-Simulation mit realistischem Referenz-Rauschen nachgestellt.
	qint64			m_fwdJumpSince   = -1;   ///< m_fpsTimer timestamp when a forward reference jump was first observed; -1 = none pending.
	double			m_fwdJumpRef     = 0.0;  ///< Reference position of the pending forward jump candidate.
	// An WELCHEN RenderPipeline die Overlay-Texturen zuletzt hochgeladen wurden:
	// jede Konfiguration hat ihren EIGENEN PresentPass - nach einem Preset-
	// Wechsel müssen Lyrics-/Künstlerbild-Texturen dort neu hochgeladen
	// werden, sonst sind sie "verloren".
	RenderPipeline   *m_overlayFs      = nullptr;   ///< RenderPipeline that last received the overlay textures, to detect a preset switch.

	// Optional MIDI control (knobs -> look params, pads -> next effect).
	// MIDI LEARN (key 'j'): cycles through the targets below; the next CC
	// (targets 0-3) or note (target 4) that arrives is bound to it and the
	// learn advances to the next target.  Mappings persist in the settings.
	/// Drains and applies queued MIDI events: in MIDI-learn mode binds the next
	/// event to the target being learned, otherwise routes mapped CCs to look
	/// knobs (reactivity/trails/mood/latency) and mapped notes to tap-tempo,
	/// blackout, or next-effect.
	void            applyMidi();
	MidiInput      *m_midi          = nullptr;   ///< Optional MIDI controller input; opened in initializeGL() if a device is present.
	/// MIDI-learn targets, cycled with key 'j': controller knobs (CC-mapped) first,
	/// then note-mapped pads.
	enum { MIDI_REACT = 0, MIDI_TRAILS, MIDI_MOOD, MIDI_LATENCY, MIDI_NEXT,
	       MIDI_TAP, MIDI_BLACKOUT, MIDI_TARGETS };
	int             m_midiMap[MIDI_TARGETS] = { 1, 2, 3, -1, -1, -1, -1 };  ///< CC/note nr per MIDI_* target, -1 = frei
	int             m_midiLearn     = -1;   ///< -1 = off, else target being learned

	// Recording + Instant Replay: komplett in Source/Recorder.{h,cpp}
	// gekapselt (PBO-Readback, Encoder-Worker, Replay-Ring, ffmpeg-Mux).
	// GLwidget ruft nur noch toggle()/captureIfDue()/saveReplay() etc.
	Recorder        m_recorder;   ///< Screen recording + instant-replay ring buffer (PBO readback, encoder worker, ffmpeg mux).
	std::vector<unsigned char> m_snapBuf;        ///< glReadPixels scratch (Web-Snapshot)

	/**
	 * @brief Recursively scans a directory tree for *.xml preset files and
	 *        constructs a Configuration for each one found.
	 * @param dirname Directory to scan (recurses into subdirectories).
	 * @param configurationList Output list; each found preset is appended here.
	 */
	void traverseConfigurations( const QString& dirname, std::vector<Configuration *> &configurationList );
	// hidden="true" presets: kept out of every index-based selection path
	// (menu, digit keys, web remote), reachable only by name (-c / auto-config).
	std::vector<Configuration *> m_hiddenConfigurations;   ///< Presets with hidden="true": reachable only by name (-c / auto-config).

	// Request a configuration switch (applied in timerEvent, OUTSIDE paintGL, so
	// the cross-fade grab can't re-enter paintGL).  Cross-fades from the old frame.
	/**
	 * @brief Requests a switch to the given configuration. Only records the
	 *        request (applied later in timerEvent()); no-op if cfg is null or
	 *        already active.
	 * @param cfg Configuration to switch to.
	 */
	void switchConfig( Configuration *cfg );
	/// Grabs the current framebuffer into m_fadePixmap and starts the fade timer,
	/// so the outgoing configuration's last frame can be cross-faded out.
	void beginConfigFade();
	Configuration *m_pendingConfig = nullptr;  ///< Requested switch, applied next timerEvent() tick.
	QPixmap m_fadePixmap;               ///< Last frame of the previous config, drawn fading out during a cross-fade.
	qint64  m_fadeStart = -1;           ///< Fade start (m_fpsTimer ms); <0 = no fade in progress.

	// Switch to the configuration with the given name (case-insensitive).
	// Returns true if it switched to a *different* configuration.
	/**
	 * @brief Looks up a configuration by name (case-insensitive, searches both
	 *        the visible and hidden lists) and requests a switch to it.
	 * @param name Configuration name to match.
	 * @return True if it switched to a *different* configuration; false if not
	 *         found or already active.
	 */
	bool selectConfigByName( const QString &name );

	// Auto-config-by-mood: when enabled, pick a configuration that matches the
	// sustained musical mood (ambient/energy), with hysteresis + a dwell time.
	/**
	 * @brief When auto-config is enabled, maps the sustained mood (ambient
	 *        factor / arousal) to a preset bucket and switches to it once the
	 *        mood has held steady for a dwell time (hysteresis against flapping).
	 * @param f Current per-frame audio features.
	 */
	void updateAutoConfig( const AudioFeatures &f );

	bool    m_autoConfig      = false;  ///< toggled with key 'a'
	int     m_moodBucket      = -1;     ///< current mood bucket (see .cpp)
	qint64  m_moodBucketSince = 0;      ///< when the bucket last changed

	// Shader hot-reload (dev aid): saved .frag files in Scene2D\/FX\ are
	// recompiled live on the next frame (GL context current in paintGL).
	class QFileSystemWatcher *m_shaderWatcher = nullptr;   ///< Watches every loaded *.frag file for dev-time hot reload.
	QSet<QString>             m_pendingReloads;            ///< Filenames (basenames) changed since the last frame, awaiting recompile.

	// Web-remote live preview: small JPEG of the output, refreshed ~1 Hz in
	// paintGL while the phone page polls /api/snapshot.
	QByteArray m_snapJpg;             ///< Cached JPEG-encoded downscaled output frame for the web remote's live preview.
	qint64     m_snapWantedUntil = 0; ///< m_fpsTimer deadline until which the snapshot keeps refreshing (extended by remoteSnapshot()).
	qint64     m_snapLast        = 0; ///< m_fpsTimer timestamp of the last snapshot refresh (throttles to ~1 Hz).

	/// Per-scene thumbnail cache for the web remote's scene browser, indexed by
	/// the active configuration's texture-effect index (same order as
	/// RenderPipeline::sceneNames()). Filled opportunistically off the SAME
	/// downscaled readback as m_snapJpg — no extra glReadPixels — so it only
	/// grows while someone has the remote page open; entries for scenes not
	/// visited yet in this session stay empty (the remote page just shows no
	/// image for those). Reset on every config switch, since the indices mean
	/// a different scene list.
	std::vector<QByteArray> m_sceneThumbs;

	bool m_batchStopping = false;   ///< batch render: shutdown initiated
	qint64  m_lastAutoSwitch  = 0;      ///< when auto-config last switched

	// Persist / restore UI state (active config, auto-config, auto-scale) in the
	// same settings file RenderPipeline uses.  Saved with 'k', loaded at startup.
	/// Restores persisted UI state (active config name, auto-config, auto-scale,
	/// now-playing/lyrics/artist toggles, MIDI mapping) from the shared settings
	/// INI, called once from the constructor.
	void    loadUiSettings();
	/// Writes the current UI state to the shared settings INI (key 'k' and every
	/// quit path).
	void    saveUiSettings();
	// Bündelt saveUiSettings() + RenderPipeline::saveSettings() - ruft die
	// Taste 'k' auf UND jeder Quit-Pfad (auch die harten exit(0)-Stellen,
	// die keine C++-Destruktoren mehr durchlaufen), damit der zuletzt
	// gewählte Zustand wirklich immer übersteht.
	void    saveAllSettings();

	// Adaptive render scale: nudge RenderPipeline's internal render scale to keep
	// the frame rate near target, never exceeding the launch -s value.
	/// Nudges RenderPipeline's render scale down when the frame rate is struggling
	/// (< 45 FPS) and back up when there's headroom (> 57 FPS), clamped between
	/// a fixed floor and the launch -s ceiling, with a settle delay between steps.
	void    updateAdaptiveScale();
	bool    m_autoScale       = true;   ///< toggled with key 'g'
	float   m_autoScaleMax    = 1.f;    ///< ceiling: an explicit -s, else 1.0 (never the persisted working value)
	float   m_displayHz       = 60.f;   ///< refresh rate the render timer was paced to; adaptation targets a fraction of it
	qint64  m_lastScaleAdjust = 0;      ///< when the scale was last changed


    int     m_fpsCounter;     ///< frames counted in the current period
	int     m_fpsValue;       ///< frames-per-second shown in the overlay
	qint64  m_fpsLastPeriod;  ///< m_fpsTimer.elapsed() at the last update (qint64: kiosk runs for weeks)
	QElapsedTimer m_fpsTimer; ///< Free-running elapsed timer, started in initializeGL(); the app's master clock for timing/fades/overlays.

	void resetRotation(); ///< Sets the rotation matrix to identity (currently a no-op stub; body is commented out).

	RenderPipeline	*m_renderPipeline;   ///< Unused legacy member (the active pipeline is Configuration::m_renderPipeline instead).
    ImageLoader     *m_imageLoader;   ///< Unused legacy member.


	std::vector<Configuration *> m_configurationList;   ///< Loaded user-facing (non-hidden) presets, in load order; indexed by digit keys / menu / web remote.

	// some variables for trackball
	float			m_RotationMatrix[16];						//!< global rotation Matrix
	float			m_xTrans, m_yTrans, m_zTrans;				//!< global translation
	QPoint			m_lastPos;   ///< Last mouse position (trackball input; currently unused, handlers are stubs).

	QString			m_directory;   ///< Working directory set via slotSetDirectory(); currently only stored, not consumed.

	Configuration  *m_actConfiguration;   ///< Currently active configuration (owns the live RenderPipeline pipeline).

	AudioAnalyzer  *m_audioAnalyzer;   ///< WASAPI loopback/capture audio analyzer; produces the per-frame AudioFeatures.

	//QPainter		*m_painter;
	bool			m_showSelectConfigurationMenu;   ///< Whether the configuration-selection overlay is shown (key '0').
	bool			m_showFeatureOverlay;            ///< Whether the audio-feature panel is shown (key 'i').
	bool			m_showHelp = false;              ///< Whether the keyboard-shortcut help box is shown (key 'h').
	bool			m_showAudioMenu = false;         ///< Whether the audio-source picker overlay is shown (key 'd').
	bool			m_showShaderInfo = false;   ///< debug: active shader names ('v')

	int		m_width;    ///< Physical (DPI-scaled) framebuffer width, set in resizeGL().
	int		m_height;   ///< Physical (DPI-scaled) framebuffer height, set in resizeGL().


};


#endif
