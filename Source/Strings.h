/**
 * @file Strings.h
 * @brief The one place every on-screen UI label lives, in every supported language -- shared between Kaleidoscope.exe (QPainter overlays) and SetupTool.exe (its own widgets), and used by WebRemote.cpp to build the phone page in the current language.
 */
#pragma once

// Strings: DE/EN string table for every user-visible label this project
// draws itself (QPainter overlays, the SetupTool widgets, the web-remote
// page). Deliberately NOT used for: stderr/log fprintf text (developer
// diagnostics, not UI), song/artist/scene/preset names (external data, not
// app-owned text), or the Android remote app (a separate Java codebase --
// see AndroidRemote/res/values{,-en}/strings.xml for its own, idiomatic
// Android string-resource localisation).
//
// Same shape as this codebase's existing kAudioLocNames[]-style tables
// (EffectShader.cpp): one enum listing every string, one array per
// language in the SAME order, a lookup by id. German is the default/
// fallback language (this app's primary audience); English is the first
// additional one. Adding a third language later means: extend Lang, add
// one more parallel array, extend T()'s switch.
//
// The CURRENT language is process-wide global state (like RenderPipeline's
// s_reactivity etc.) -- there is only ever one active language per running
// process, so this needs no instance. Persisted as the "language" key in
// kaleidoscope_settings.ini ("de"/"en"); callers (main.cpp, SetupWindow)
// own reading/writing that key and call setLanguage() with the result --
// this header only owns the enum, the tables, and the current selection.

enum class Lang { DE = 0, EN = 1 };

enum StrId
{
	// ---- glwidget.cpp: help overlay ('h') ----
	S_HELP_TITLE,
	S_HELP_H, S_HELP_0, S_HELP_N, S_HELP_I, S_HELP_V, S_HELP_D, S_HELP_P,
	S_HELP_W, S_HELP_O, S_HELP_A, S_HELP_G, S_HELP_L, S_HELP_REACTIVITY, S_HELP_TRAILS,
	S_HELP_MOOD, S_HELP_LATENCY, S_HELP_B, S_HELP_E, S_HELP_T, S_HELP_U, S_HELP_F,
	S_HELP_Z, S_HELP_CM, S_HELP_J, S_HELP_YX, S_HELP_K, S_HELP_R, S_HELP_S, S_HELP_ESC,

	// ---- glwidget.cpp: feature/stats overlay ('i') ----
	S_FEATURE_TITLE_FMT,    // "AUDIO FEATURES   %1 FPS   (i to hide)"
	S_FEATURE_STATUS_FMT,   // "react[] %1  trail,. %2  mood-= %3  auto-a %4  scale %5 g:%6"
	S_ON, S_OFF,

	// ---- glwidget.cpp: audio-source menu ('d') ----
	S_AUDIOMENU_TITLE,
	S_AUDIOMENU_DEFAULT_OUTPUT,
	S_AUDIOMENU_INPUT_TAG,
	S_AUDIOMENU_OUTPUT_TAG,

	// ---- glwidget.cpp: recording indicator ----
	S_REC_FMT,   // "REC %1"

	// ---- WebRemote.cpp: phone page ----
	S_WR_TITLE, S_WR_H1, S_WR_NEXT, S_WR_BLACKOUT, S_WR_FAVORITE, S_WR_REPLAY_BUFFER,
	S_WR_REPLAY_SAVE, S_WR_REACTIVITY, S_WR_TRAILS, S_WR_MOOD, S_WR_LATENCY,
	S_WR_LIGHTSHOW, S_WR_AUTOPRESET, S_WR_AUTOSCALE, S_WR_TITLEREVEAL, S_WR_LYRICS_PREFIX,
	S_WR_ARTISTIMAGES, S_WR_VIDEO, S_WR_SCENEBROWSER,
	S_WR_LYRICS_OFF, S_WR_LYRICS_SCROLL, S_WR_LYRICS_KARAOKE,

	// ---- SetupTool ----
	S_SETUP_WINDOW_TITLE,
	S_SETUP_GROUP_START, S_SETUP_LASTUSED, S_SETUP_STARTCONFIG,
	S_SETUP_REMOTEPORT_OFF, S_SETUP_REMOTEPORT,
	S_SETUP_GROUP_LANGUAGE, S_SETUP_LANGUAGE_LABEL, S_SETUP_LANG_DE, S_SETUP_LANG_EN,
	S_SETUP_GROUP_ONLINE, S_SETUP_LYRICSMODE_LABEL, S_SETUP_LYRICS_KINETIC,
	S_SETUP_ARTISTIMAGES, S_SETUP_VIDEO, S_SETUP_VIDEO_HINT,
	S_SETUP_GROUP_BEHAVIOR, S_SETUP_AUTOCONFIG, S_SETUP_AUTOSCALE, S_SETUP_NOWPLAYING,
	S_SETUP_LIGHTSHOW,
	S_SETUP_GROUP_TUNE, S_SETUP_REACTIVITY, S_SETUP_TRAILS, S_SETUP_MOOD, S_SETUP_MS_SUFFIX,
	S_SETUP_LATENCY, S_SETUP_RENDERSCALE, S_SETUP_STEREO_OFF, S_SETUP_STEREO_SBS,
	S_SETUP_STEREO_TB, S_SETUP_STEREO_ANA, S_SETUP_STEREOMODE, S_SETUP_STEREODEPTH,
	S_SETUP_VIDEOCODEC, S_SETUP_CODEC_HINT,
	S_HELP_SPACE, S_HELP_SHIFT_SPACE,
	S_WR_MARK, S_WR_SAVEMARKED,
	S_MENU_CONFIG_TITLE, S_MENU_NAV_HINT, S_MENU_NO_MATCH,
	S_SETUP_SSAA, S_SETUP_SSAA_HINT,
	S_SETUP_RECFPS, S_SETUP_MOTIONBLUR, S_SETUP_MOTIONBLUR_HINT,
	S_SETUP_SHOWHIDDEN, S_SETUP_SHOWHIDDEN_HINT,
	S_SETUP_OSCPORT, S_SETUP_OSCHOST, S_SETUP_OSC_HINT,
	S_SETUP_SAVE, S_SETUP_CLOSE,
	S_SETUP_NO_SETTINGS_YET, S_SETUP_SAVED_OK, S_SETUP_SAVE_FAILED,

	// ---- WebRemote.cpp: tabbed page, second wave ----
	// (appended at the END on purpose: both language tables in Strings.cpp are
	// positional arrays, so inserting anywhere above would silently shift every
	// later string onto the wrong id.)
	S_WR_TAB_LIVE, S_WR_TAB_PRESETS, S_WR_TAB_CAPTURE, S_WR_TAB_DISPLAY,
	S_WR_TAB_IMAGE, S_WR_TAB_INFO,
	S_WR_FREEZE, S_WR_PIN, S_WR_TAPTEMPO,
	S_WR_RECORD_START, S_WR_RECORD_STOP, S_WR_SCREENSHOT,
	S_WR_SHADERNAMES, S_WR_FEATUREOVERLAY,
	S_WR_STEREOMODE, S_WR_STEREODEPTH, S_WR_RENDERSCALE,
	S_WR_SAVEDEFAULTS, S_WR_ACTIVE_PRESET, S_WR_NOTHING_PLAYING,
	S_WR_FPS, S_WR_RECORDING_NOW,

	S_COUNT
};

namespace Strings
{
	/** @brief Sets the process-wide current language; callers own reading it from the "language" ini key. */
	void setLanguage( Lang lang );
	/** @brief The current language (Lang::DE until setLanguage() is called). */
	Lang language();
	/** @brief Parses "de"/"en" (case-insensitive; anything else -> DE) as stored in kaleidoscope_settings.ini. */
	Lang fromCode( const char *code );
	/** @brief The ini-stored code for a language ("de"/"en"). */
	const char *toCode( Lang lang );
	/** @brief Looks up @p id in the CURRENT language's table. @return A UTF-8 string literal; never null. */
	const char *T( StrId id );
}
