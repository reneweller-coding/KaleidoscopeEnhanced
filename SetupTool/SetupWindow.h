/**
 * @file SetupWindow.h
 * @brief The Kaleidoscope Setup tool's single window: reads/writes kaleidoscope_settings.ini directly, the same file the main app loads on startup.
 */
#pragma once

#include <QtWidgets/QWidget>

class QCheckBox;
class QComboBox;
class QDoubleSpinBox;
class QSpinBox;
class QLabel;

/**
 * @brief A small standalone settings editor for kaleidoscope_settings.ini.
 *
 * Deliberately NOT a live remote control (that's the embedded web remote's job, see
 * Source/WebRemote.cpp) -- this edits the persisted STARTUP DEFAULTS the main app's
 * GLwidget::loadUiSettings()/RenderPipeline::loadSettings() read once at launch. Changes here
 * only take effect the next time Kaleidoscope.exe starts. No GL/audio/shader dependency at all;
 * a plain Qt Widgets form.
 */
class SetupWindow : public QWidget
{
public:
	SetupWindow();

private:
	/** @brief Locates kaleidoscope_settings.ini and Configurations\ by walking up from the exe's own directory until a folder containing "Configurations" is found (robust regardless of exact build/deploy nesting). @return Absolute path to the repo/install root, or the exe's own directory if no landmark was found. */
	static QString findRootDir();
	/** @brief Full path to kaleidoscope_settings.ini under findRootDir(). */
	static QString settingsPath();
	/** @brief Scans findRootDir()/Configurations/*.xml for ConfigurationName values, skipping hidden="true" presets (dev/review builds), for the start-configuration dropdown. */
	static QStringList discoverConfigNames();

	void loadFromIni();
	void saveToIni();

	QComboBox      *m_startConfig   = nullptr;
	QSpinBox        *m_remotePort    = nullptr;

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

	QLabel          *m_status        = nullptr;
};
