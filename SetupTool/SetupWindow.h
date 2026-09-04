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
	SetupWindow();

private:
	/** @brief Locates kaleidoscope_settings.ini and Presets\ by walking up from the exe's own directory until a folder containing "Presets" (or the pre-04.09.2026 "Configurations") is found (robust regardless of exact build/deploy nesting). @return Absolute path to the repo/install root, or the exe's own directory if no landmark was found. */
	static QString findRootDir();
	/** @brief Full path to kaleidoscope_settings.ini under findRootDir(). */
	static QString settingsPath();
	/** @brief Scans findRootDir()/Presets/*.xml for ConfigurationName values, skipping hidden="true" presets (dev/review builds), for the start-configuration dropdown. */
	static QStringList discoverConfigNames();

	/** @brief (Re)builds the scrollable form (every group except the fixed Save/Close row) in the CURRENT language, preserving whichever field values are already set. Called once from the constructor and again whenever the language dropdown changes. */
	void buildContent();
	/** @brief Updates the window title and the two fixed action-button labels to the current language (the parts NOT inside the rebuildable content). */
	void retranslateChrome();
	void loadFromIni();
	void saveToIni();

	QVBoxLayout *m_outerLayout  = nullptr;   ///< Persistent top-level layout (this widget's only layout).
	QScrollArea *m_scrollArea   = nullptr;   ///< Persistent scroll container; its content widget is swapped out by buildContent().
	QWidget     *m_content      = nullptr;   ///< The rebuildable form content; deleted and recreated by buildContent().
	QPushButton *m_saveBtn      = nullptr;
	QPushButton *m_closeBtn     = nullptr;

	QComboBox      *m_language      = nullptr;
	QComboBox      *m_startConfig   = nullptr;
	QSpinBox        *m_remotePort    = nullptr;
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
	QCheckBox       *m_packBox[4]    = { nullptr, nullptr, nullptr, nullptr };
	QLabel          *m_packState[4]  = { nullptr, nullptr, nullptr, nullptr };
	QPushButton     *m_packGet       = nullptr;
	QProgressBar    *m_packProgress  = nullptr;
	QLabel          *m_packStatus    = nullptr;
	bool             m_packBusy      = false;   ///< A download is in flight; the button doubles as Cancel.
	bool             m_packCancel    = false;   ///< Cancel requested; checked between packs and inside the reply loop.
	/** @} */

	void refreshPackStates();       ///< Re-derive "installed" from disk and re-tick the boxes accordingly.
	void startPackDownloads();      ///< Fetch every ticked pack in turn, then unpack it.
	void updatePackButton();        ///< Put the selected total onto the button label.

	QComboBox      *m_lyricsMode    = nullptr;
	QCheckBox       *m_lyricsKinetic = nullptr;
	QCheckBox       *m_artistImages  = nullptr;
	QCheckBox       *m_videoEnabled  = nullptr;

	QCheckBox       *m_autoConfig    = nullptr;
	QCheckBox       *m_autoScale     = nullptr;
	QCheckBox       *m_nowPlaying    = nullptr;
	QCheckBox       *m_lightShow     = nullptr;

	QDoubleSpinBox  *m_reactivity    = nullptr;
	QDoubleSpinBox  *m_trails        = nullptr;
	QDoubleSpinBox  *m_mood          = nullptr;
	QSpinBox        *m_latencyMs     = nullptr;
	QDoubleSpinBox  *m_renderScale   = nullptr;
	QComboBox      *m_stereoMode    = nullptr;
	QDoubleSpinBox  *m_stereoDepth   = nullptr;
	QComboBox      *m_videoCodec    = nullptr;
	QCheckBox       *m_motionBlur   = nullptr;   ///< Motion blur for recordings (ini key motionBlur).
	QCheckBox       *m_updateCheck  = nullptr;   ///< Optional startup check for a newer GitHub release (ini key updateCheck).
	QCheckBox       *m_showHidden   = nullptr;   ///< Debug: unhide Komplett/Test* presets (ini key showHiddenPresets).
	QSpinBox        *m_oscPort      = nullptr;   ///< OSC output port, 0 = off (ini key oscPort).
	QLineEdit       *m_oscHost      = nullptr;   ///< OSC target host (ini key oscHost).
	QComboBox      *m_recFps        = nullptr;   ///< Recording frame rate (ini key recordFps).
	QComboBox      *m_ssaa          = nullptr;   ///< Supersampling ceiling (ini key renderScaleMax).   ///< Recording codec family (ini key videoCodec: h264/hevc/av1).

	QLabel          *m_status        = nullptr;
};
