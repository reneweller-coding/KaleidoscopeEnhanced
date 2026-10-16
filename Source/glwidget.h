//---------------------------------------------------------------------------
//                              GLwidget
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Declares GLwidget, the QOpenGLWidget subclass that owns the render loop, input handling and the
 *  audio/MIDI/track-media wiring for the visualizer.
 *
 *  @author René Weller
 */

#ifndef GLWIDGET_H
#define GLWIDGET_H

#include <vector>
#include <iostream>
#include <thread>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include <deque>

#include <QtOpenGLWidgets/QOpenGLWidget>
#include <QtGui/QImage>
#include <QtGui/QPixmap>
#include <QtCore/QHash>
#include <QtCore/QSet>
#include <QtCore/QVector>

#include "RenderPipeline.h"
#include "Configuration.h"
#include "AudioAnalyzer.h"
#include "NowPlaying.h"
#include "MidiInput.h"
#include "Recorder.h"
#include "OscSender.h"
#include "TrackMedia.h"
#include "OsdMenu.h"
#include "VideoExport.h"

class UpdateCheck;

/** Where one overlay menu drew its rows last frame, so a mouse click can be mapped back to a row without duplicating
 * the layout arithmetic.
 **/
struct MenuHit
{
    QRect box;       ///< The menu panel; a click outside it closes the menu.
    int   rowY0 = 0; ///< Top edge of the first visible row.
    int   rowH = 0;  ///< Row height in the same coordinates.
    int   rows = 0;  ///< How many rows were actually drawn.
    int   top = 0;   ///< Index of the first visible row within the filtered list.
};


/** @class GLwidget
 *
 * The QOpenGLWidget that drives the whole visualizer: render loop, input, and the audio/MIDI/track-media wiring.
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
 **/
class GLwidget : public QOpenGLWidget
{
    static const GLdouble StartViewTransZ; ///< Unused legacy trackball constant (start view translation-Z).
    static const GLdouble ProjViewTransZ;  ///< Unused legacy trackball constant (projection view translation-Z).

    Q_OBJECT

public:
    /**  Constructs the widget: restores persisted UI settings, loads every Configuration (*.xml) under ../Presets,
     * sets up shader hot-reload watching and (if requested) the web remote, and picks the initial active
     * configuration (default, -c name, or persisted).
     *
     * @param parent  Parent widget, forwarded to QOpenGLWidget. (in)
     **/
    explicit GLwidget( QWidget *parent = 0 );
    /**  Persists settings, shuts down the recorder/audio/now-playing/MIDI subsystems in dependency order, releases
     * the global Spout/VideoIn facades, and deletes every loaded Configuration while the GL context is still
     * current (so their GL object cleanup isn't dropped).
     **/
    ~GLwidget();

    /** Start configuration name (CLI -c \<name\>); empty = first config.
     *
     * Set from main() before the widget is constructed, so it must be public.
     **/
    static QString M_StartConfig;

    /** CLI -r: start recording immediately on launch (used for testing/debugging). */
    static bool M_AutoRecord;

    /** CLI -t \<port\>: start the embedded web remote on this port (0 = off).
     *
     * Defaults to 8080 (on); a PERSISTED port (see loadUiSettings()) only applies if M_RemotePortFromCli stays false,
     * same "-c wins" precedence as M_StartConfig.
     **/
    static int M_RemotePort;
    /** Set true by parsecommandline() when -t was actually passed, so a persisted remotePort setting doesn't
     * override an explicit CLI choice.
     **/
    static bool M_RemotePortFromCli;

    /** CLI -x \<wav\>: batch render — record the offline WAV deterministically, then auto-quit once it ends (the mp4
     * mux continues detached).
     **/
    static bool M_BatchRender;

    // ---- Web-remote hooks (same harmless controls as the keyboard) ----
    /**  Lists the display names of every user-facing (non-hidden) configuration.
     *
     * @return
     *   Configuration names in selection order, for the web remote's picker.
     **/
    QStringList remoteConfigNames() const;
    /**  Finds the index of the currently active configuration.
     *
     * @return
     *   Index into the user-facing configuration list, or -1 if not found.
     **/
    int remoteActiveConfig() const;
    /**  Live frame rate, as shown in the overlay.
     *
     * @return
     *   Frames per second, rounded.
     *
     * Exposed for the web remote: the auto render-scale hides a struggling scene by quietly getting coarser, so the
     * frame rate is the only way to see it happening.
     **/
    int fpsValue() const { return m_fpsValue; }
    /**  Requests a switch to the configuration at the given index (web remote).
     *
     * @param idx  Index into the user-facing configuration list. (in)
     **/
    void remoteSelectConfig( int idx );
    /** Requests the next effect (scene/combine change) on the active configuration. */
    void remoteNextEffect();
    /**  Lists the scene names available in the active configuration's pipeline.
     *
     * @return
     *   Scene names, or an empty list if there is no active filter shader.
     **/
    QStringList remoteSceneNames();
    /**  Forces the active configuration's pipeline to a specific scene.
     *
     * @param idx  Index into the list returned by remoteSceneNames(). (in)
     **/
    void remoteForceScene( int idx );
    /**  Cached JPEG thumbnail for one scene in the remote's browser grid, if one has been captured yet.
     *
     * @param idx  Index into the list returned by remoteSceneNames(). (in)
     *
     * @return
     *   A small JPEG, or an empty QByteArray if that scene hasn't been on screen (with the remote open) yet this
     *   session.
     **/
    QByteArray remoteThumb( int idx ) const;
    /**  Whether auto-config-by-mood is currently on.
     *
     * @return
     *   True if auto-config-by-mood is currently on.
     **/
    bool autoConfigEnabled() const { return m_autoConfig; }
    /**  Toggles auto-config-by-mood and resets the mood bucket so it re-evaluates from scratch.
     *
     * @param on  True switches auto-config-by-mood on, false off. (in)
     **/
    void setAutoConfigEnabled( bool on )
    {
        m_autoConfig = on;
        m_moodBucket = -1;
    }

    // ---- Remote/setup-tool switches for the optional online extras ----
    // (Web-Remote /api/toggle + /api/set; the keyboard shortcuts 'w'/'o'/'g'/
    // 'p' set the same members directly, these just add a remote-safe API.)
    /**  Whether adaptive render-scale (key 'g') is currently on.
     *
     * @return
     *   True if adaptive render-scale (key 'g') is currently on.
     **/
    bool autoScaleEnabled() const { return m_autoScale; }
    /**  Switches adaptive render-scale on/off (same state as key 'g'); the current scale is left where it is until
     * updateAdaptiveScale() moves it.
     *
     * @param on  New state. (in)
     **/
    void setAutoScaleEnabled( bool on )
    {
        m_autoScale = on;
        m_autoScaleByProfile = false;
    }
    /**  Whether the now-playing title reveal (key 'p') is currently on.
     *
     * @return
     *   True if the now-playing title reveal (key 'p') is currently on.
     **/
    bool nowPlayingEnabled() const
    {
        return m_showNowPlaying;
    }
    /**  Switches the now-playing title reveal on/off (same state as key 'p').
     *
     * @param on  New state. (in)
     **/
    void setNowPlayingEnabled( bool on )
    {
        m_showNowPlaying = on;
    }
    /**  Whether the artist-image corner (key 'o') is currently on.
     *
     * @return
     *   True if the artist-image corner (key 'o') is currently on.
     **/
    bool artistImagesEnabled() const
    {
        return m_artistShow;
    }
    /**  Switches the artist-image corner on/off (same state as key 'o'); switching on immediately requests media for
     * the current track.
     *
     * @param on  New state. (in)
     **/
    void setArtistImagesEnabled( bool on );
    /**  Whether the music-video search/download (independent of, but gated by, artistImagesEnabled()) is currently
     * on.
     *
     * @return
     *   True if the music-video picture-in-picture is switched on.
     **/
    bool videoPipEnabled() const
    {
        return m_videoEnabled;
    }
    /**  Switches the music-video PiP search/download on/off; switching on immediately requests media for the current
     * track.
     *
     * @param on  New state. (in)
     **/
    void setVideoPipEnabled( bool on );
    /**  0 = off, 1 = scroll, 2 = karaoke (key 'w' cycles).
     *
     * @return
     *   0 = off, 1 = scroll, 2 = karaoke (key 'w' cycles).
     **/
    int lyricsModeValue() const { return m_lyricsMode; }
    /**  Sets the lyrics mode directly (remote/setup tool; key 'w' cycles the same value); any non-zero mode
     * immediately requests media for the current track.
     *
     * @param mode  0 = off, 1 = scroll, 2 = karaoke; clamped to that range. (in)
     **/
    void setLyricsModeValue( int mode );
    /**  Live preview: returns the cached small JPEG of the output and keeps the ~1 Hz refresh in paintGL alive for
     * the next few seconds.
     *
     * @return
     *   The last JPEG of the output; empty until the first refresh.
     *
     * All on the GUI thread (QTcpServer + paintGL), so no locking is needed.
     **/
    QByteArray remoteSnapshot();
    /** Favorites the currently active effect (same as key 'f'). */
    void remoteFavorite();
    /**  Cue memory: the identified track as "artist|title" (or KALEIDO_FAKE_TRACK for offline tests); empty when
     * nothing is identified.
     *
     * @return
     *   Cue memory: the identified track as "artist|title" (or KALEIDO_FAKE_TRACK for offline tests); empty when
     *   nothing is identified.
     **/
    QString cueTrackKey() const;
    /**  Cue memory: playback position in seconds (extrapolated), or the run clock under KALEIDO_FAKE_TRACK; <0 when
     * unknown.
     *
     * @return
     *   Cue memory: playback position in seconds (extrapolated), or the run clock under KALEIDO_FAKE_TRACK; <0 when
     *   unknown.
     **/
    double cuePosSec() const;
    /** Web remote: mark or unmark the scene on screen (same as SPACE). */
    void remoteToggleMark();
    /** Web remote: write every marked scene to Presets/Marked.xml (same as SHIFT+SPACE). */
    void remoteSaveMarked();
    /** Saves the instant-replay ring buffer to disk (same as key 'x'). */
    void remoteSaveReplay()
    {
        m_recorder.saveReplay();
    }
    /**  Whether the instant-replay ring buffer is currently armed.
     *
     * @return
     *   True if the instant-replay ring buffer is currently armed.
     **/
    bool remoteReplayArmed() const
    {
        return m_recorder.replayArmed();
    }
    /** Arms/disarms the instant-replay ring buffer (same as key 'y'). */
    void remoteToggleReplayArm()
    {
        m_recorder.toggleReplayArm();
    }

    // ---- Web-remote hooks, second wave: the remaining keyboard functions ----
    // Everything here mirrors exactly one key handler in keyPressEvent(), so
    // the phone and the keyboard stay two views of the same state rather than
    // two code paths that can drift apart.
    /** Starts/stops the mp4 video+music recording (same as key 'r'). */
    void remoteToggleRecord()
    {
        m_recorder.toggle();
    }
    /**  Whether an mp4 recording is currently running.
     *
     * @return
     *   True if an mp4 recording is currently running.
     **/
    bool remoteRecording() const { return m_recorder.recording(); }
    /**  Saves a PNG screenshot of the current frame (same as key 's').
     *
     * @return
     *   The file name written, or an empty string on failure.
     **/
    QString remoteScreenshot();
    /** Feeds one tap into the tap-tempo estimator (same as key 't'). */
    void remoteTapTempo();
    /**  The active shader names/transition overlay text (same content as key 'v').
     *
     * @return
     *   Multi-line text, or empty without an active pipeline.
     **/
    QString remoteShaderInfo() const;
    /**  Whether the on-screen active-shader-names overlay (key 'v') is shown.
     *
     * @return
     *   True if the on-screen active-shader-names overlay (key 'v') is shown.
     **/
    bool shaderInfoVisible() const
    {
        return m_showShaderInfo;
    }
    /**  Shows/hides the active-shader-names overlay (same state as key 'v').
     *
     * @param on  New state. (in)
     **/
    void setShaderInfoVisible( bool on )
    {
        m_showShaderInfo = on;
    }
    /**  Whether the on-screen audio-feature/FPS overlay (key 'i') is shown.
     *
     * @return
     *   True if the on-screen audio-feature/FPS overlay (key 'i') is shown.
     **/
    bool featureOverlayVisible() const
    {
        return m_showFeatureOverlay;
    }
    /**  Shows/hides the audio-feature/FPS overlay (same state as key 'i').
     *
     * @param on  New state. (in)
     **/
    void setFeatureOverlayVisible( bool on )
    {
        m_showFeatureOverlay = on;
    }
    /** Persists the current look + state as the startup default (same as key 'k'). */
    void remoteSaveDefaults()
    {
        saveAllSettings( true );
    }
    /**  Name of the active configuration, even when it is hidden and therefore absent from remoteConfigNames().
     *
     * @return
     *   Name of the active configuration, even when it is hidden and therefore absent from remoteConfigNames().
     **/
    QString remoteActiveConfigName() const;

    // ---- Optional update check (see UpdateCheck.h for the safety rules) ----
    /**  Whether the optional GitHub release check is switched on ("updateCheck" setting).
     *
     * @return
     *   True if the optional GitHub release check is switched on ("updateCheck" setting).
     **/
    bool updateCheckEnabled() const
    {
        return m_updateCheck;
    }
    /**  This build's version string (KALEIDOSCOPE_VERSION).
     *
     * @return
     *   This build's version string (KALEIDOSCOPE_VERSION).
     **/
    QString appVersion() const;
    /**  Whether a newer release was found by the last check.
     *
     * @return
     *   True if a newer release was found by the last check.
     **/
    bool updateAvailable() const;
    /**  Version of the newest release, empty if none/not checked.
     *
     * @return
     *   Version of the newest release, empty if none/not checked.
     **/
    QString updateVersion() const;
    /**  Human-readable check/download status for the UI.
     *
     * @return
     *   Human-readable check/download status for the UI.
     **/
    QString updateStatus() const;
    /** Downloads the newer release's installer and launches it (explicit user action only). */
    void remoteInstallUpdate();

public slots:
    /**  Stores the working directory for media lookups.
     *
     * @param filename  Directory (or file) path to remember. (in)
     *
     * @return
     *   Always true.
     *
     * Legacy hook, currently only records the path; does not itself load anything.
     **/
    bool slotSetDirectory( const QString &filename );

protected:
    /**  Per-frame render entry point (QOpenGLWidget override): draws the scene via draw(), then updates the FPS
     * counter and the adaptive render scale.
     **/
    virtual void paintGL();
    /**  One-time GL setup (QOpenGLWidget override): loads core GL entry points, starts the active configuration's
     * pipeline, and starts the audio analyzer, now-playing poller, track-media fetcher, MIDI input and the frame
     * timer.
     *
     * @sideeffects
     *   Changes AudioAnalyzer::M_OfflineWav.
     **/
    virtual void initializeGL();
    /**  Resizes the viewport/FBOs to the physical (DPI-scaled) framebuffer size (QOpenGLWidget override).
     *
     * @param width   Logical width passed by Qt (unused; physical size is recomputed). (in)
     * @param height  Logical height passed by Qt (unused; physical size is recomputed). (in)
     **/
    virtual void resizeGL( int width, int height );
    /**  Mouse-press handler: a click inside an open overlay menu picks a row, a click outside closes it (see the
     * definition for details).
     *
     * @param e  The mouse press event. (in)
     **/
    virtual void mousePressEvent( QMouseEvent *e );
    /**  Scrolls whichever overlay menu is open; inert otherwise.
     *
     * @param e  The wheel turn; one notch of 120 units moves the menu by one row. (in)
     **/
    virtual void wheelEvent( QWheelEvent *e );
    /**  Mouse-move handler (currently a no-op stub; trackball code is commented out).
     *
     * @param e  The mouse move event. (in)
     **/
    virtual void mouseMoveEvent( QMouseEvent *e );
    /**  Double-click handler: persists settings and hard-exits the process.
     *
     * @param e  The mouse double-click event. (in)
     **/
    virtual void mouseDoubleClickEvent( QMouseEvent *e );
    /**  Main keyboard shortcut dispatcher: configuration switching, look knobs (reactivity/trails/mood/latency),
     * recording, MIDI learn, overlays, stereo mode and quit.
     *
     * @param event  The key press event. (in)
     **/
    virtual void keyPressEvent( QKeyEvent *event );
    /**  Periodic ~60 Hz tick (16.667 ms): applies any pending configuration switch outside paintGL(), then schedules
     * a repaint via update().
     **/
    virtual void timerEvent( QTimerEvent * );
    /**  Video export: the top-level window's close button asks the export to stop (the file is finished) instead of
     * killing it half-written.
     *
     * @param obj  The watched object (the top-level window). (in)
     * @param ev   The event. (in)
     *
     * @return
     *   true if the event was taken (a close during an export).
     **/
    bool eventFilter( QObject *obj, QEvent *ev ) override;

    /**  Video export (VideoExport.h): renders a slice of frames (about 50 ms of work) into the export target, then
     * gives the event loop a turn and schedules itself again; at the end it finishes the file and quits.
     *
     * Runs from a zero-time timer, not from paintGL(): Qt does not paint a minimised or hidden window, and the
     * export must not stop because the preview is out of sight.
     **/
    void exportStep();
    /** Video export: the preview -- the latest frame letterboxed into the window, with the progress line. */
    void paintExportPreview();
    /** Video export: GL setup at the end of initializeGL() instead of the live services (audio capture, now
     * playing, MIDI, the frame timer).
     **/
    void beginExport();

    /**  Renders one frame: audio features, MIDI, batch-render exit check, shader hot-reload, auto-config, the
     * RenderPipeline pipeline, recording capture, web-remote snapshot, config cross-fade, now-playing reveal,
     * lyrics/ artist-image overlays, and any QPainter overlays (menus, help, REC dot).
     **/
    void draw();

    /**  Draws the numbered configuration-selection overlay (key '0').
     *
     * @param painter  Active QPainter for this frame. (in)
     **/
    void showSelectConfigurationsMenu( QPainter *painter );
    /**  Draws the live audio-feature panel with value bars and look knobs (key 'i').
     *
     * @param painter  Active QPainter for this frame. (in)
     * @param f        Current per-frame audio features to display. (in)
     **/
    void drawFeatureOverlay( QPainter *painter, const AudioFeatures &f );
    /**  Draws the keyboard-shortcut help box (key 'h').
     *
     * @param painter  Active QPainter for this frame. (in)
     **/
    void drawHelpOverlay( QPainter *painter );
    /**  Draws the runtime audio-source picker overlay (key 'd').
     *
     * @param painter  Painter on the widget, active for this frame's overlay. (in)
     **/
    void drawAudioMenu( QPainter *painter );
    /**  Rows in that overlay: the default entry plus every enumerated device.
     *
     * @return
     *   1 plus the number of devices the analyser enumerated.
     **/
    int audioMenuCount() const;
    /**  Indices into #m_configurationList matching #m_configMenuFilter (all of them when it is empty).
     *
     * @return
     *   Indices into #m_configurationList matching #m_configMenuFilter (all of them when it is empty).
     **/
    QVector<int> configMenuMatches() const;
    /**  Audio rows matching #m_audioMenuFilter: 0 = default output, 1..N = the device at N-1.
     *
     * @return
     *   The matching rows, in list order.
     **/
    QVector<int> audioMenuMatches() const;
    /**  Selects an audio input by menu index: 0 = default loopback, 1..N = the Nth listed device.
     *
     * @param index  Menu index: 0 = default loopback, N = the Nth listed device. (in)
     **/
    void selectAudioDevice( int index );

    /**  Draws the "now playing" lower-third box (title/artist), shown briefly when the track changes (key 'p').
     *
     * @param painter  Active QPainter for this frame. (in)
     * @param title    Track title to display. (in)
     * @param artist   Track artist to display. (in)
     * @param alpha    Fade-in/out opacity, 0..1. (in)
     *
     * Currently unused in draw() — the title reveal was moved into the shader pipeline — but kept as a QPainter-based
     * fallback renderer.
     **/
    void        drawNowPlaying( QPainter *painter, const QString &title,
                                const QString &artist, float alpha );
    NowPlaying *m_nowPlaying = nullptr; ///< SMTC "now playing" title/artist/position poller; started in initializeGL().
    bool        m_showNowPlaying = true; ///< Whether the now-playing title reveal is enabled (key 'p', persisted).
    QString     m_lastNpTitle;           ///< Last title seen from m_nowPlaying, used to detect a track change.
    qint64      m_npShownAt = -100000;   ///< m_fpsTimer timestamp when the current title reveal started.

    // ---- Lyrics + artist images (TrackMedia: LRCLIB / Deezer, optional) ----
    // Key 'w' cycles the lyrics mode (off -> scroll -> karaoke), key 'o'
    // toggles the artist images.  updateTrackOverlays() computes the overlay
    // state every frame (playback sync, fades, image rotation) and hands it,
    // together with the textures, to the RenderPipeline/PresentPass.
    /**  Computes this frame's lyrics/artist-image overlay state (sync position via a consumer PLL, karaoke line,
     * fades, palette) and uploads any changed textures, then hands the result to the given RenderPipeline's present
     * pass.
     *
     * @param fs  RenderPipeline (present pass) to upload overlay textures/state to. (in)
     **/
    void updateTrackOverlays( RenderPipeline *fs );
    /**  Re-requests lyrics/artist-images/video for whatever NowPlaying reports right now (same m_key-dedup as a real
     * track change, so this is a harmless no-op if nothing actually needs (re)fetching) -- shared by the 'w'/'o'
     * key handlers and the new setArtistImagesEnabled()/ setVideoPipEnabled()/setLyricsModeValue() so turning an
     * extra ON from ANY live control surface (keyboard, web remote) picks it up for the currently-playing track
     * immediately, not just on the next track change.
     *
     * (The standalone setup tool only edits the settings file for the NEXT app start, so it never needs this.)
     **/
    void        requestCurrentTrackMedia();
    TrackMedia *m_trackMedia = nullptr; ///< Fetches synced lyrics + artist images (LRCLIB/Deezer) for the current
                                        ///< track.
    // Default on the very first start (no saved settings): karaoke + artist
    // images on - from then on loadUiSettings()/saveUiSettings() persist the
    // last chosen state.
    int  m_lyricsMode = 2;    ///< 0 off, 1 scroll, 2 karaoke (persisted)
    bool m_artistShow = true; ///< Artist images on/off (persisted)
    // A switch of its own, INDEPENDENT of m_artistShow: whoever wants artist
    // images but no automatic YouTube downloads (network/disk) can turn this
    // off separately -- the video PiP still needs BOTH flags (see
    // updateTrackOverlays()), because it shares the same corner slot.
    bool m_videoEnabled = true; ///< Music-video search/playback on/off (persisted), on top of m_artistShow.
    // Kinetic line slam on a karaoke line change: OFF by default after user
    // feedback ("jumps too much"), switched on with Shift+W (persisted like
    // the other overlay settings).
    bool m_lyricsKinetic = false; ///< Kinetic line-slam animation on karaoke line change, off by default (Shift+W).
    // Optional, and off unless the user switches it on in the setup tool --
    // it is the only thing here that contacts a server on its own.
    bool m_updateCheck = false; ///< Whether to ask GitHub for a newer release at startup ("updateCheck" setting).
    UpdateCheck *m_update = nullptr;       ///< Owned update checker; only constructed when m_updateCheck is on.
    int m_lyricsRevUploaded = -1; ///< TrackMedia lyrics revision last uploaded as a texture; forces re-upload on preset
                                  ///< switch.
    int     m_artistRevSeen = -1;          ///< TrackMedia images revision last observed, for change detection.
    int     m_artistIdx = -1;              ///< Unused index reservation (see m_artistIdxUploaded for the active one).
    int     m_artistIdxUploaded = -1;      ///< Index of the artist image currently uploaded as a texture.
    float   m_lyricsAlphaSm = 0.f;         ///< Slewed (smoothed) lyrics overlay opacity.
    float   m_artistAlphaSm = 0.f;         ///< Slewed (smoothed) artist-image overlay opacity.
    QString m_videoPathLoaded;  ///< Path last passed to videoPipLoad(), so a still-loading/still-current video isn't
                                ///< reloaded every frame; cleared (and the PiP released) once no cached video applies.
    float m_videoAlphaSm = 0.f; ///< Slewed (smoothed) music-video PiP opacity; only ramps IN (see the comment at its
                                ///< use site for why the fade-out is an immediate cut instead).
    float m_scrollVSm = 0.f;               ///< Slewed (smoothed) vertical scroll position of the lyrics texture.
    int   m_karaokeLine = -1;              ///< Index of the currently active/highlighted karaoke line.
    // Kinetics: when the active karaoke line last changed (the fresh line's
    // slam-in in the present pass).
    int    m_lastKaraokeLineSeen = -1; ///< Last karaoke line index seen, to detect a line change.
    qint64 m_lineChangeMs = -1;        ///< m_fpsTimer timestamp of the last karaoke line change.
    // Cover palette: dominant colours of the current artist image.
    float  m_palA[3] = { 0.f, 0.f, 0.f }; ///< Dominant RGB color extracted from the current artist image.
    float  m_palB[3] = { 0.f, 0.f, 0.f }; ///< Secondary RGB color extracted from the current artist image.
    bool m_palValid = false; ///< Whether extractPalette() found a usable (non-greyscale) palette for the current image.
    float  m_palAmtSm = 0.f;              ///< Slewed (smoothed) blend amount of the cover palette grading.
    qint64 m_trackStartMs = 0;            ///< Fallback clock without an SMTC position
    bool   m_lyricsTest = false;          ///< KALEIDO_LYRICS_TEST active
    // Real dt for the scroll/blend smoothing (not tied to a 60 Hz assumption)
    // - without it the motion stutters as soon as the frame time varies.
    qint64 m_overlayLastMs = -1; ///< m_fpsTimer timestamp of the previous updateTrackOverlays() call, for real dt.
    // Consumer-side PLL for the playback position: its OWN, continuously
    // integrated clock, which only SPEEDS UP or SLOWS DOWN (rate 0..1.15)
    // towards whichever reference is available (SMTC or the local clock) -
    // by construction it can jump only on a real seek (>1.5s).  Covers ALL
    // remaining sources of backward steps (Playing flicker, title flicker /
    // settle resets, hand-over between SMTC and the local clock).
    double m_posSmooth = -1.0; ///< Consumer-PLL smoothed playback position (seconds); < 0 = not yet initialized.
    // Backward jumps of the reference are only taken over after ~2s of
    // consistent confirmation (a real backward seek) - shorter flicker
    // (title/Playing flaps) is bridged completely.
    qint64 m_backJumpSince = -1; ///< m_fpsTimer timestamp when a backward reference jump was first observed; -1 = none
                                 ///< pending.
    double m_backJumpRef = 0.0;  ///< Reference position of the pending backward jump candidate.
    // The same confirmation now FORWARD too, only shorter (0.4s instead of
    // 2s - a real fast-forward seek should still feel immediate).  Before,
    // a single stray reference value >1.5s ahead went through WITHOUT ANY
    // confirmation - unremarkable on its own, but as soon as the reference
    // fell back to the true value one round trip later, the backward logic
    // took exactly THAT as "2s consistently wrong" and jumped back: a single
    // outlier thus became TWO visible jumps (forward, then back) - exactly
    // the reported hopping, reproduced by a PLL simulation with realistic
    // reference noise.
    qint64 m_fwdJumpSince = -1; ///< m_fpsTimer timestamp when a forward reference jump was first observed; -1 = none
                                ///< pending.
    double m_fwdJumpRef = 0.0;  ///< Reference position of the pending forward jump candidate.
    // WHICH RenderPipeline the overlay textures were last uploaded to: every
    // configuration has its OWN PresentPass - after a preset switch the
    // lyrics/artist-image textures must be uploaded there again, otherwise
    // they are "lost".
    RenderPipeline *m_overlayFs = nullptr; ///< RenderPipeline that last received the overlay textures, to detect a
                                           ///< preset switch.

    // Optional MIDI control (knobs -> look params, pads -> next effect).
    // MIDI LEARN (key 'j'): cycles through the targets below; the next CC
    // (targets 0-3) or note (target 4) that arrives is bound to it and the
    // learn advances to the next target.  Mappings persist in the settings.
    /**  Drains and applies queued MIDI events: in MIDI-learn mode binds the next event to the target being learned,
     * otherwise routes mapped CCs to look knobs (reactivity/trails/mood/latency) and mapped notes to tap-tempo,
     * blackout, or next-effect.
     **/
    void       applyMidi();
    MidiInput *m_midi = nullptr; ///< Optional MIDI controller input; taken over from M_MidiOpened once its start thread
                                 ///< opened a device.
    static std::atomic<MidiInput *> M_MidiOpened; ///< Handed over by the MIDI start thread (initializeGL) when a device
                                                  ///< is open.
    OscSender     m_osc; ///< OSC/UDP output of the analysis (mood, beats, bands); off unless oscPort is set.
    QElapsedTimer m_oscClock;                     ///< Wall clock for OscSender's rate limiting.
    /** Score cues IN (CueReceiver.h): a generator that wrote the music says where the bars, sections and drops are.
     *
     * Off unless cuePort is set in the ini; nothing else changes then.
     **/
    int     m_cuePort = 0;         ///< UDP port for the score cues; 0 = the feature is off.
    QString m_cueBind = "0.0.0.0"; ///< Interface to listen on ("127.0.0.1" = this machine only).
    QString m_notice;              ///< The message notify() shows; empty = none.
    qint64  m_noticeAt = -1;       ///< m_fpsTimer time the notice appeared; -1 = with the next frame.
    int     m_noticeMs = 0;        ///< How long the notice stays, in milliseconds.
    /** MIDI-learn targets, cycled with key 'j': controller knobs (CC-mapped) first, then note-mapped pads. */
    enum
    {
        MIDI_REACT = 0,
        MIDI_TRAILS,
        MIDI_MOOD,
        MIDI_LATENCY,
        MIDI_NEXT,
        MIDI_TAP,
        MIDI_BLACKOUT,
        MIDI_TARGETS
    };
    int  m_midiMap[MIDI_TARGETS] = { -1, -1, -1, -1, -1, -1, -1 }; ///< CC/note nr per MIDI_* target, -1 = unbound
    bool m_midiLearned = false; ///< The map was learned ('j'); until then nothing is bound -- the old default CC 1-3
                                ///< let a keyboard's modulation wheel turn the reactivity.
    int m_midiLearn = -1;                                          ///< -1 = off, else target being learned

    // Recording + instant replay: fully encapsulated in Source/Recorder.{h,cpp}
    // (PBO readback, encoder workers, replay ring, ffmpeg mux).  GLwidget only
    // calls toggle()/captureIfDue()/saveReplay() etc.
    Recorder m_recorder; ///< Screen recording + instant-replay ring buffer (PBO readback, encoder worker, ffmpeg mux).
    VideoExport    *m_export = nullptr; ///< The video export of this run (CLI -e), or null in a live show.
    AudioEventLatch m_eventLatch; ///< Turns the analyzer's event counters into this frame's beat/onset/track events.
    bool                       m_exportEnded = false; ///< The export has been finished (endGL() ran).
    std::vector<unsigned char> m_snapBuf;             ///< glReadPixels scratch (Web-Snapshot)

    /**  Recursively scans a directory tree for *.xml preset files and constructs a Configuration for each one found.
     *
     * @param dirname            Directory to scan (recurses into subdirectories). (in)
     * @param configurationList  Output list; each found preset is appended here. (out)
     **/
    void traverseConfigurations( const QString &dirname, std::vector<Configuration *> &configurationList );
    // hidden="true" presets: kept out of every index-based selection path
    // (menu, digit keys, web remote), reachable only by name (-c / auto-config).
    std::vector<Configuration *> m_hiddenConfigurations; ///< Presets with hidden="true": reachable only by name (-c /
                                                         ///< auto-config).

    // Request a configuration switch (applied in timerEvent, OUTSIDE paintGL, so
    // the cross-fade grab can't re-enter paintGL).  Cross-fades from the old frame.
    /**  Requests a switch to the given configuration.
     *
     * @param cfg  Configuration to switch to. (in)
     *
     * Only records the request (applied later in timerEvent()); no-op if cfg is null or already active.
     **/
    void switchConfig( Configuration *cfg );
    /**  Grabs the current framebuffer into m_fadePixmap and starts the fade timer, so the outgoing configuration's
     * last frame can be cross-faded out.
     **/
    void           beginConfigFade();
    Configuration *m_pendingConfig = nullptr; ///< Requested switch, applied next timerEvent() tick.
    QPixmap        m_fadePixmap; ///< Last frame of the previous config, drawn fading out during a cross-fade.
    qint64         m_fadeStart = -1;          ///< Fade start (m_fpsTimer ms); <0 = no fade in progress.

    // Switch to the configuration with the given name (case-insensitive).
    // Returns true if it switched to a *different* configuration.
    /**  Looks up a configuration by name (case-insensitive, searches both the visible and hidden lists) and requests
     * a switch to it.
     *
     * @param name  Configuration name to match. (in)
     *
     * @return
     *   True if it switched to a *different* configuration; false if not found or already active.
     **/
    bool selectConfigByName( const QString &name );

    // Auto-config-by-mood: when enabled, pick a configuration that matches the
    // sustained musical mood (ambient/energy), with hysteresis + a dwell time.
    /**  When auto-config is enabled, maps the sustained mood (ambient factor / arousal) to a preset bucket and
     * switches to it once the mood has held steady for a dwell time (hysteresis against flapping).
     *
     * @param f  Current per-frame audio features. (in)
     **/
    void updateAutoConfig( const AudioFeatures &f );

    bool   m_autoConfig = false;  ///< toggled with key 'a'
    int    m_moodBucket = -1;     ///< current mood bucket (see .cpp)
    qint64 m_moodBucketSince = 0; ///< when the bucket last changed

    // Shader hot-reload (dev aid): saved .frag files in Scene2D\/FX\ are
    // recompiled live on the next frame (GL context current in paintGL).
    class QFileSystemWatcher *m_shaderWatcher = nullptr; ///< Watches every loaded *.frag file for dev-time hot reload.
    QSet<QString> m_pendingReloads; ///< Filenames (basenames) changed since the last frame, awaiting recompile.

    // Web-remote live preview: small JPEG of the output, refreshed ~1 Hz in
    // paintGL while the phone page polls /api/snapshot.
    QByteArray m_snapJpg; ///< Cached JPEG-encoded downscaled output frame for the web remote's live preview.
    qint64     m_snapWantedUntil = 0; ///< m_fpsTimer deadline until which the snapshot keeps refreshing (extended by
                                      ///< remoteSnapshot()).
    qint64 m_snapLast = 0;            ///< m_fpsTimer timestamp of the last snapshot refresh (throttles to ~1 Hz).

    /** Per-scene thumbnail cache for the web remote's scene browser, indexed by the active configuration's
     * texture-effect index (same order as RenderPipeline::sceneNames()).
     *
     * Filled opportunistically off the SAME downscaled readback as m_snapJpg — no extra glReadPixels — so it only grows
     * while someone has the remote page open; entries for scenes not visited yet in this session stay empty (the remote
     * page just shows no image for those). Reset on every config switch, since the indices mean a different scene list.
     **/
    std::vector<QByteArray> m_sceneThumbs;

    bool   m_batchStopping = false; ///< batch render: shutdown initiated
    qint64 m_lastAutoSwitch = 0;    ///< when auto-config last switched

    // Persist / restore UI state (active config, auto-config, auto-scale) in the
    // same settings file RenderPipeline uses.  Saved with 'k', loaded at startup.
    /**  Restores persisted UI state (active config name, auto-config, auto-scale, now-playing/lyrics/artist toggles,
     * MIDI mapping) from the shared settings INI, called once from the constructor.
     *
     * @sideeffects
     *   Changes M_RemotePort, M_StartConfig.
     **/
    void loadUiSettings();
    /**  The UI state as the ini keys it lives under, with the values now.
     *
     * @return
     *   key -> value, in the order they are written.
     **/
    QList<QPair<QString, QVariant>> uiSettings() const;
    /** Notes the UI state as the session starts with it (start preset and command line included), see SettingsFile. */
    void rememberUiSettings();
    /**  Writes the UI state to the shared settings INI.
     *
     * @param everything  Every key ('k', "save as default"); otherwise only the keys this session changed. (in)
     *
     * @return
     *   Why the file could not be written, or an empty string.
     **/
    QString saveUiSettings( bool everything );
    /**  Persists RenderPipeline::saveSettings() (look knobs) plus saveUiSettings() (UI state).
     *
     * @param everything  Every key -- key 'k', the menu's and the remote's "save as default"; every quit path
     *                    writes only what this session changed, so an edit in the Setup tool made while the show
     *                    ran survives it. (in)
     *
     * Called by every quit path as well (including the hard exit(0) spots, which run no C++ destructors), so the
     * last chosen state really always survives.  A file that cannot be written is said on screen.
     **/
    void saveAllSettings( bool everything );
    /**  Whether the settings can be written where they live; says so on screen when not.
     *
     * An installation under Program Files cannot write beside itself without admin rights, and every write --
     * settings, taste, scene memory -- failed there without a word.
     **/
    void checkSettingsWritable();
    /**  Shows a short message on screen (bottom centre, fading) and writes it to the log.
     *
     * @param text  The message, in the UI language. (in)
     * @param ms    How long it stays, in milliseconds. (in)
     **/
    void notify( const QString &text, int ms = 6000 );
    /**  The notice's opacity now: fades in and out over a quarter second.
     *
     * @return
     *   0 when there is none or it is over, up to 1.
     **/
    float noticeAlpha();
    /**  Draws the notice of notify().
     *
     * @param painter  The overlay painter. (in,out)
     * @param alpha    Its opacity (noticeAlpha()). (in)
     **/
    void drawNotice( QPainter *painter, float alpha );
    /** Opens the remote-control menu at its root. */
    void openOsdMenu();
    /** Asks "quit?" in the menu (Esc outside any menu). */
    void openQuitConfirm();
    /**  Rows of the menu's root level.
     *
     * @return
     *   Rows of the menu's root level.
     **/
    std::vector<OsdItem> osdRootItems();
    /**  One row per preset in #m_configurationList.
     *
     * @return
     *   One row per preset in #m_configurationList.
     **/
    std::vector<OsdItem> osdPresetItems();
    /**  Default output plus one row per audio device.
     *
     * @return
     *   Default output plus one row per audio device.
     **/
    std::vector<OsdItem> osdAudioSourceItems();

    // Adaptive render scale: nudge RenderPipeline's internal render scale to keep
    // the frame rate near target, never exceeding the launch -s value.
    /**  Nudges RenderPipeline's render scale down when the frame rate is struggling (< 45 FPS) and back up when
     * there's headroom (> 57 FPS), clamped between a fixed floor and the launch -s ceiling, with a settle delay
     * between steps.
     **/
    void updateAdaptiveScale();
    bool m_autoScale = true;           ///< toggled with key 'g'
    bool m_autoScaleByProfile = false; ///< m_autoScale was switched on by the quality profile for this session only
                                       ///< (not saved)
    /**  The quality profile (ini "qualityProfile": auto | high | low): light settings for a weak GPU (GL context
     * current).
     *
     * @sideeffects
     *   Changes EffectShader::M_ChainScale.
     **/
    void   applyQualityProfile();
    float  m_autoScaleMax = 1.f;  ///< ceiling: an explicit -s, else 1.0 (never the persisted working value)
    float  m_displayHz = 60.f;    ///< refresh rate the render timer was paced to; adaptation targets a fraction of it
    qint64 m_lastScaleAdjust = 0; ///< when the scale was last changed


    int           m_fpsCounter;    ///< frames counted in the current period
    int           m_fpsValue;      ///< frames-per-second shown in the overlay
    qint64        m_fpsLastPeriod; ///< m_fpsTimer.elapsed() at the last update (qint64: kiosk runs for weeks)
    QElapsedTimer m_fpsTimer; ///< Free-running elapsed timer, started in initializeGL(); the app's master clock for
                              ///< timing/fades/overlays.

    // KALEIDO_SCENE_SWEEP=<seconds>: walk EVERY scene of the loaded config in
    // order, holding each for that many seconds (see draw()).
    /**  The sweep interval in seconds, 0 when KALEIDO_SCENE_SWEEP is unset.
     *
     * @return
     *   The sweep interval in seconds, 0 when KALEIDO_SCENE_SWEEP is unset.
     **/
    static int sweepSeconds()
    {
        static const int Sweep = qEnvironmentVariableIntValue( "KALEIDO_SCENE_SWEEP" );
        return Sweep;
    }
    /**  Whether a catalogue sweep is running (review mode, not normal playback).
     *
     * @return
     *   Whether a catalogue sweep is running (review mode, not normal playback).
     **/
    static bool sweepActive() { return sweepSeconds() > 0; }
    /** Accumulated render time of one scene (KALEIDO_COST_LOG). */
    struct SceneCost
    {
        double ms = 0.0;    /**< Summed wall-clock render time of the scene's frames, in milliseconds (divided by frames
                               for the report). */
        int    frames = 0;  /**< Number of frames the scene was measured over. */
        double cover = 0.0; /**< Summed RenderPipeline::activeCoverage() readings (fraction of the frame the model
                               covered, mesh scenes only). */
        int coverN = 0; /**< Number of frames that contributed to cover; 0 = no coverage measured (not a mesh scene). */
    };
    QHash<QString, SceneCost> m_sceneCost; ///< Per-scene render cost; empty unless KALEIDO_COST_LOG is set.
    /** Write the measured per-scene cost to scene-cost.json and clear it. */
    void dumpSceneCost();
    /**  FX sweep interval in seconds, 0 when KALEIDO_FX_SWEEP is unset.
     *
     * @return
     *   FX sweep interval in seconds, 0 when KALEIDO_FX_SWEEP is unset.
     *
     * The scene sweep's counterpart for overlays.  An FX that does nothing is
     * a real failure class -- 43 silent FX and transitions were once found at
     * one go -- and the picker is random, so no overlay is reliably on screen
     * at a known moment.  Holds the scene still and walks the FX instead.
     **/
    static int fxSweepSeconds()
    {
        static const int Sweep = qEnvironmentVariableIntValue( "KALEIDO_FX_SWEEP" );
        return Sweep;
    }
    int    m_fxSweepIdx = 0;       ///< Next FX index the sweep will jump to.
    qint64 m_fxSweepNextMs = -1;   ///< Deadline for the next FX jump; -1 = not started.
    int    m_sweepIdx = 0;         ///< Next scene index the sweep will jump to.
    qint64 m_sweepNextMs = -1;     ///< m_fpsTimer deadline for the next jump; -1 = not started yet.
    int    m_sweepWant = -1;       ///< Scene the sweep last asked for; -1 = none yet.
    int    m_sweepShown = -1;      ///< Scene last seen ACTUALLY active, so drift gets logged rather than assumed away.
    qint64 m_sweepJumpMs = 0;      ///< m_fpsTimer stamp of the last jump (the retry waits out the cross-fade).
    bool   m_sweepReview = false;  ///< Review mode enabled once at sweep start (the scheduler must not cut mid-window).
    bool   m_sweepRetried = false; ///< One retry per window: enough to undo a stolen cut, not enough to fight the
                                   ///< scheduler.

    /** Sets the rotation matrix to identity (currently a no-op stub; body is commented out). */
    void resetRotation();

    RenderPipeline *m_renderPipeline; ///< Unused legacy member (the active pipeline is Configuration::m_renderPipeline
                                      ///< instead).
    ImageLoader *m_imageLoader;       ///< Unused legacy member.


    std::vector<Configuration *> m_configurationList; ///< Loaded user-facing (non-hidden) presets, in load order;
                                                      ///< indexed by digit keys / menu / web remote.

    // some variables for trackball
    float m_rotationMatrix[16]; //!< global rotation Matrix
    float m_xTrans, /**< Global X translation handed to RenderPipeline::paint() for the legacy mesh preview path (0; the
                       trackball code that moved it is commented out). */
        m_yTrans,   /**< Global Y translation for the legacy mesh preview path (0; trackball code commented out). */
        m_zTrans;   //!< global translation (Z, initialised to -2; trackball code commented out)
    QPoint m_lastPos;           ///< Last mouse position (trackball input; currently unused, handlers are stubs).

    QString m_directory; ///< Working directory set via slotSetDirectory(); currently only stored, not consumed.

    Configuration *m_actConfiguration; ///< Currently active configuration (owns the live RenderPipeline pipeline).

    AudioAnalyzer *m_audioAnalyzer; ///< WASAPI loopback/capture audio analyzer; produces the per-frame AudioFeatures.

    // QPainter		*m_painter;
    bool    m_showSelectConfigurationMenu; ///< Whether the configuration-selection overlay is shown (key '0').
    int     m_configMenuCursor = 0;        ///< Highlighted row in that overlay (arrow keys move it, Enter picks it).
    int     m_configMenuTop = 0;           ///< First visible row: the list scrolls once it is taller than the window.
    QString m_configMenuFilter;            ///< Typed substring filter; empty shows every preset.
    MenuHit m_configMenuHit;               ///< Row geometry from the last draw, for mouse hit-testing.
    bool    m_showFeatureOverlay;          ///< Whether the audio-feature panel is shown (key 'i').
    bool    m_showHelp = false;            ///< Whether the keyboard-shortcut help box is shown (key 'h').
    bool    m_showAudioMenu = false;       ///< Whether the audio-source picker overlay is shown (key 'd').
    int     m_audioMenuCursor = 0;         ///< Highlighted row in that overlay (arrow keys move it, Enter picks it).
    int     m_audioMenuTop = 0; ///< First visible row: the device list scrolls once it is taller than the window.
    QString m_audioMenuFilter;             ///< Typed substring filter; empty shows every device.
    MenuHit m_audioMenuHit;                ///< Row geometry from the last draw, for mouse hit-testing.
    bool    m_showShaderInfo = false;      ///< debug: active shader names ('v')
    OsdMenu m_osd;                         ///< Remote-control menu (OK / Menu key), see OsdMenu.h.

    int m_width;  ///< Physical (DPI-scaled) framebuffer width, set in resizeGL().
    int m_height; ///< Physical (DPI-scaled) framebuffer height, set in resizeGL().
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    GLwidget( const GLwidget & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    GLwidget &operator=( const GLwidget & ) = delete;
};


#endif
