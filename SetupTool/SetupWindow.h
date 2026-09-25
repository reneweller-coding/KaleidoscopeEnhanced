/**
 * @file SetupWindow.h
 * @brief The Kaleidoscope Setup tool's single window: reads/writes kaleidoscope_settings.ini directly, the same file the main app loads on startup.
 */
#pragma once

#include <QtWidgets/QWidget>
#include "Strings.h"

class QCheckBox;
class QComboBox;
class QDoubleSpinBox;
class QSpinBox;
class QLineEdit;
class QLabel;
class QProgressBar;
class QPushButton;
class QScrollArea;
class QVBoxLayout;

/**
 * @brief A small standalone settings editor for kaleidoscope_settings.ini.
 *
 * Deliberately NOT a live remote control (that's the embedded web remote's job, see
 * Source/WebRemote.cpp) -- this edits the persisted STARTUP DEFAULTS the main app's
 * GLwidget::loadUiSettings()/RenderPipeline::loadSettings() read once at launch. Most changes
 * only take effect the next time Kaleidoscope.exe starts; the one exception is the language
 * dropdown, which retranslates THIS window's own labels immediately (via buildContent()
 * tearing down and rebuilding the form) so picking a language is a WYSIWYG action, not a "trust
 * me, it worked" one. No GL/audio/shader dependency at all; a plain Qt Widgets form.
 */
class SetupWindow : public QWidget
{
public:
	/** @brief Builds the window: reads the persisted language first (so the very first form build is already in it), creates the fixed chrome (scroll area, status line, Save/Close row), then buildContent(), retranslateChrome() and loadFromIni(). */
	SetupWindow();

private:
	/** @brief Locates kaleidoscope_settings.ini and Presets\ by walking up from the exe's own directory until a folder containing "Presets" (or the pre-04.09.2026 "Configurations") is found (robust regardless of exact build/deploy nesting). @return Absolute path to the repo/install root, or the exe's own directory if no landmark was found. */
	static QString findRootDir();
	/** @brief Full path to kaleidoscope_settings.ini under findRootDir(). */
	static QString settingsPath();
	/** @brief Scans findRootDir()/Presets/\*.xml for ConfigurationName values, skipping hidden="true" presets (dev/review builds), for the start-configuration dropdown. @return The visible preset names, sorted case-insensitively. */
	static QStringList discoverConfigNames();

	/** @brief (Re)builds the scrollable form (every group except the fixed Save/Close row) in the CURRENT language, preserving whichever field values are already set. Called once from the constructor and again whenever the language dropdown changes. */
	void buildContent();
	/** @brief Updates the window title and the two fixed action-button labels to the current language (the parts NOT inside the rebuildable content). */
	void retranslateChrome();
	/** @brief Fills every field from kaleidoscope_settings.ini, using the same defaults the main app falls back to when a key is missing (so a fresh machine shows what it will actually run with). The language combo is synced to Strings::language() with its signal blocked, so this never re-triggers the rebuild. Shows a "no settings file yet" note in the status line if the ini does not exist. */
	void loadFromIni();
	/** @brief Writes every field back to kaleidoscope_settings.ini (activeConfig is removed rather than written for "last used"; an empty OSC host is stored as 127.0.0.1), then reports success or the failing path in the status line for four seconds. */
	void saveToIni();

	QVBoxLayout *m_outerLayout  = nullptr;   ///< Persistent top-level layout (this widget's only layout).
	QScrollArea *m_scrollArea   = nullptr;   ///< Persistent scroll container; its content widget is swapped out by buildContent().
	QWidget     *m_content      = nullptr;   ///< The rebuildable form content; deleted and recreated by buildContent().
	QPushButton *m_saveBtn      = nullptr;   ///< Fixed "Save" button below the scroll area; triggers saveToIni(). Label set by retranslateChrome().
	QPushButton *m_closeBtn     = nullptr;   ///< Fixed "Close" button; closes the window without saving. Label set by retranslateChrome().

	QComboBox      *m_language      = nullptr;   ///< UI language (ini key language; item data "de"/"en"). Changing it saves, rebuilds the whole form in the new language and reloads (deferred, see buildContent()).
	QComboBox      *m_startConfig   = nullptr;   ///< Preset to start with (ini key activeConfig; item data = ConfigurationName). First item, empty data, means "last used" and removes the key on save.
	QSpinBox        *m_remotePort    = nullptr;   ///< Web-remote HTTP port (ini key remotePort), 0..65535; 0 shows as "off"; default 8080.
	QLineEdit       *m_imageDir      = nullptr;   ///< Photo-source folder (ini key imageDirectory); empty = the bundled Images folder.

	/** @name Extra-content downloader
	 *  The photo library and the 3D models are published as release assets
	 *  rather than bundled (together about 2 GB against a 20 MB installer),
	 *  which used to mean a manual hunt through GitHub and a hand-unzip into
	 *  the correct folder.  These fetch them and unpack them in place.
	 *
	 *  Nothing here is persisted: the checkboxes describe an ACTION, not a
	 *  setting, so they are not written to the ini and are re-derived from
	 *  what is actually on disk every time the window opens.
	 *  @{ */
	QCheckBox       *m_packBox[4]    = { nullptr, nullptr, nullptr, nullptr };   ///< One per pack (same order as SetupWindow.cpp's kPacks table): ticked = download it. Default-ticked only when nothing of that kind is on disk yet; disabled while a download runs.
	QLabel          *m_packState[4]  = { nullptr, nullptr, nullptr, nullptr };   ///< Per-pack "(n JPG, installed)" note next to its checkbox, green when something is installed; empty otherwise.
	QPushButton     *m_packGet       = nullptr;   ///< Starts startPackDownloads(); its label carries the selected total size, and while #m_packBusy it reads "Cancel" and sets #m_packCancel instead.
	QProgressBar    *m_packProgress  = nullptr;   ///< Percent of the pack currently downloading; switched to busy (0,0) while extracting; hidden when idle.
	QLabel          *m_packStatus    = nullptr;   ///< Word-wrapped downloader status line: "downloading x (i/n) — got / total", extracting, done, cancelled, or the failure text in red.
	bool             m_packBusy      = false;   ///< A download is in flight; the button doubles as Cancel.
	bool             m_packCancel    = false;   ///< Cancel requested; checked between packs and inside the reply loop.
	/** @} */

	void refreshPackStates();       ///< Re-derive "installed" from disk and re-tick the boxes accordingly.
	void startPackDownloads();      ///< Fetch every ticked pack in turn, then unpack it.
	void updatePackButton();        ///< Put the selected total onto the button label.

	QComboBox      *m_lyricsMode    = nullptr;   ///< Lyrics display (ini key lyricsMode, stored as the index 0..2: off / scrolling / karaoke); default karaoke.
	QCheckBox       *m_lyricsKinetic = nullptr;   ///< Karaoke line-entry animation (ini key lyricsKinetic); default off.
	QCheckBox       *m_artistImages  = nullptr;   ///< Fetch and show artist images online (ini key artistImages); default on.
	QCheckBox       *m_videoEnabled  = nullptr;   ///< Music-video picture-in-picture via yt-dlp (ini key videoEnabled); default on.

	QCheckBox       *m_autoConfig    = nullptr;   ///< Let the app switch presets by detected mood automatically (ini key autoConfig); default off.
	QCheckBox       *m_autoScale     = nullptr;   ///< Adaptive render scale to hold the frame rate (ini key autoScale); default on.
	QCheckBox       *m_nowPlaying    = nullptr;   ///< Title reveal on track change (ini key nowPlaying); default on.
	QCheckBox       *m_lightShow     = nullptr;   ///< Stage-lamp light-show overlay (ini key lightShow); default off.

	QDoubleSpinBox  *m_reactivity    = nullptr;   ///< Audio reactivity gain (ini key reactivity), 0.00..3.00; default 1.0.
	QDoubleSpinBox  *m_trails        = nullptr;   ///< Frame-persistence/trails amount (ini key trails), 0.00..0.95; default 0.6.
	QDoubleSpinBox  *m_mood          = nullptr;   ///< Mood-axis intensity (ini key mood), 0.00..2.50; default 1.0.
	QSpinBox        *m_latencyMs     = nullptr;   ///< Audio lead compensation shown in milliseconds, 0..250; stored in SECONDS as ini key latencyLead.
	QDoubleSpinBox  *m_renderScale   = nullptr;   ///< Base render resolution factor (ini key renderScale), 0.25..2.00; default 1.0.
	QComboBox      *m_stereoMode    = nullptr;   ///< Stereoscopic output (ini key stereoMode, index 0..3: off / side-by-side / top-bottom / anaglyph).
	QDoubleSpinBox  *m_stereoDepth   = nullptr;   ///< Stereo separation strength (ini key stereoDepth), 0.00..2.00; default 1.0.
	QComboBox      *m_videoCodec    = nullptr;   ///< Recording codec family (ini key videoCodec, stored as the NAME "h264"/"hevc"/"av1", not an index); unknown value falls back to H.264.
	QCheckBox       *m_motionBlur   = nullptr;   ///< Motion blur for recordings (ini key motionBlur).
	QCheckBox       *m_updateCheck  = nullptr;   ///< Optional startup check for a newer GitHub release (ini key updateCheck).
	QCheckBox       *m_showHidden   = nullptr;   ///< Debug: unhide Komplett/Test* presets (ini key showHiddenPresets).
	QSpinBox        *m_oscPort      = nullptr;   ///< OSC output port, 0 = off (ini key oscPort).
	QLineEdit       *m_oscHost      = nullptr;   ///< OSC target host (ini key oscHost).
	QComboBox      *m_recFps        = nullptr;   ///< Recording frame rate (ini key recordFps).
	QComboBox      *m_ssaa          = nullptr;   ///< Supersampling ceiling (ini key renderScaleMax), item data 1.0 / 1.5 / 2.0; a hand-edited value snaps to the nearest step on load.

	QLabel          *m_status        = nullptr;   ///< Fixed status line between the scroll area and the buttons: green "saved" / red "save failed: path" from saveToIni(), cleared after four seconds; also the "no settings file yet" note.
};
