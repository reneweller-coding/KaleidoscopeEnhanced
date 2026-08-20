/**
 * @file Strings.cpp
 * @brief Implementation of Strings: the DE/EN tables (see Strings.h for the design rationale).
 */
#include "Strings.h"
#include <cstring>
#include <cstdlib>

namespace {

Lang g_lang = Lang::DE;

// Order MUST match the StrId enum exactly -- both tables are indexed
// directly by it, no separate key lookup.
const char *kDE[S_COUNT] = {
	// ---- Hilfe-Uebersicht ----
	/* S_HELP_TITLE */        "KALEIDOSCOPE  -  Tastatur",
	/* S_HELP_H */             "Hilfe anzeigen / verbergen",
	/* S_HELP_0 */             "Konfigurationsmenü",
	/* S_HELP_1_9 */           "Konfiguration wechseln",
	/* S_HELP_N */             "nächster Effekt",
	/* S_HELP_I */             "Audio-Feature-Anzeige (+ FPS)",
	/* S_HELP_V */             "aktive Shader-Namen anzeigen (Debug)",
	/* S_HELP_D */             "Audioquelle wählen (Ausgabe / Mikrofon)",
	/* S_HELP_P */             "Titel-Einblendung an/aus",
	/* S_HELP_W */             "Songtexte: aus / Scroll / Karaoke (Internet)",
	/* S_HELP_O */             "Künstlerbilder an/aus (Internet)",
	/* S_HELP_A */             "Auto-Konfiguration nach Stimmung an/aus",
	/* S_HELP_G */             "adaptive Bildskalierung an/aus",
	/* S_HELP_L */             "Bühnenlampen / Lightshow an/aus",
	/* S_HELP_REACTIVITY */    "Reactivity  - weniger / mehr",
	/* S_HELP_TRAILS */        "Trails       - kürzer / länger",
	/* S_HELP_MOOD */          "Mood         - schwächer / stärker",
	/* S_HELP_LATENCY */       "Latenz-Vorlauf - früher / später",
	/* S_HELP_B */             "BLACKOUT (sanft auf Schwarz)",
	/* S_HELP_E */             "Bild einfrieren (FREEZE)",
	/* S_HELP_T */             "Tap-Tempo (Beat antippen)",
	/* S_HELP_U */             "aktuellen Effekt anheften / lösen",
	/* S_HELP_F */             "aktuellen Effekt favorisieren",
	/* S_HELP_Z */             "Stereo-3D: aus / SBS / TB / Anaglyph",
	/* S_HELP_CM */            "Stereo-Tiefe - schwächer / stärker",
	/* S_HELP_J */             "MIDI-Learn (Ziele durchschalten)",
	/* S_HELP_YX */            "Instant-Replay scharf schalten / speichern",
	/* S_HELP_K */             "aktuellen Look + Zustand als Standard speichern",
	/* S_HELP_R */             "Video + Musik als mp4 aufnehmen",
	/* S_HELP_S */             "Screenshot speichern (PNG)",
	/* S_HELP_ESC */           "Beenden",

	// ---- Feature-/Statistik-Anzeige ----
	/* S_FEATURE_TITLE_FMT */  "AUDIO-FEATURES   %1 FPS   (i zum Ausblenden)",
	/* S_FEATURE_STATUS_FMT */ "react[] %1  trail,. %2  mood-= %3  auto-a %4  scale %5 g:%6",
	/* S_ON */                 "AN",
	/* S_OFF */                "aus",

	// ---- Audioquellen-Menü ----
	/* S_AUDIOMENU_TITLE */          "AUDIOQUELLE   (0-9 wählen,  d schließen)",
	/* S_AUDIOMENU_DEFAULT_OUTPUT */ "Standard-Ausgabe (Loopback)",
	/* S_AUDIOMENU_INPUT_TAG */      "  [Eingang]",
	/* S_AUDIOMENU_OUTPUT_TAG */     "  [Ausgabe]",

	// ---- Aufnahme-Anzeige ----
	/* S_REC_FMT */            "REC %1",

	// ---- Web-Remote-Seite ----
	/* S_WR_TITLE */           "Kaleidoscope Remote",
	/* S_WR_H1 */              "Kaleidoscope Remote",
	/* S_WR_NEXT */            "Nächster Effekt",
	/* S_WR_BLACKOUT */        "Blackout",
	/* S_WR_FAVORITE */        "Favorit",
	/* S_WR_REPLAY_BUFFER */   "Replay-Puffer",
	/* S_WR_REPLAY_SAVE */     "Replay speichern",
	/* S_WR_REACTIVITY */      "Reactivity",
	/* S_WR_TRAILS */          "Trails",
	/* S_WR_MOOD */            "Mood",
	/* S_WR_LATENCY */         "Latenz-Vorlauf (ms)",
	/* S_WR_LIGHTSHOW */       "Lightshow",
	/* S_WR_AUTOPRESET */      "Auto-Preset",
	/* S_WR_AUTOSCALE */       "Auto-Skalierung",
	/* S_WR_TITLEREVEAL */     "Titel-Einblendung",
	/* S_WR_LYRICS_PREFIX */   "Songtexte: ",
	/* S_WR_ARTISTIMAGES */    "Künstlerbilder",
	/* S_WR_VIDEO */           "Musikvideo",
	/* S_WR_SCENEBROWSER */    "Szenen-Browser",
	/* S_WR_LYRICS_OFF */      "Aus",
	/* S_WR_LYRICS_SCROLL */   "Scroll",
	/* S_WR_LYRICS_KARAOKE */  "Karaoke",

	// ---- Setup-Tool ----
	/* S_SETUP_WINDOW_TITLE */    "Kaleidoscope Setup",
	/* S_SETUP_GROUP_START */     "Start",
	/* S_SETUP_LASTUSED */        "(zuletzt verwendet)",
	/* S_SETUP_STARTCONFIG */     "Startkonfiguration:",
	/* S_SETUP_REMOTEPORT_OFF */  "Aus",
	/* S_SETUP_REMOTEPORT */      "Web-Remote-Port:",
	/* S_SETUP_GROUP_LANGUAGE */  "Sprache",
	/* S_SETUP_LANGUAGE_LABEL */  "Sprache:",
	/* S_SETUP_LANG_DE */         "Deutsch",
	/* S_SETUP_LANG_EN */         "Englisch",
	/* S_SETUP_GROUP_ONLINE */    "Optionale Online-Extras (Internetzugriff)",
	/* S_SETUP_LYRICSMODE_LABEL */"Songtexte:",
	/* S_SETUP_LYRICS_KINETIC */  "Zeilen-Einflug-Animation (Karaoke)",
	/* S_SETUP_ARTISTIMAGES */    "Künstlerbilder anzeigen",
	/* S_SETUP_VIDEO */           "Musikvideo automatisch suchen (YouTube via yt-dlp)",
	/* S_SETUP_VIDEO_HINT */      "Braucht \"Künstlerbilder\" an (nutzt denselben Eck-Platz) und yt-dlp auf dem PATH.",
	/* S_SETUP_GROUP_BEHAVIOR */  "Verhalten",
	/* S_SETUP_AUTOCONFIG */      "Auto-Preset nach Stimmung",
	/* S_SETUP_AUTOSCALE */       "Adaptive Bildskalierung (FPS-abhängig)",
	/* S_SETUP_NOWPLAYING */      "Titel-Einblendung bei Songwechsel",
	/* S_SETUP_LIGHTSHOW */       "Lightshow (Bühnenlampen-Overlay)",
	/* S_SETUP_GROUP_TUNE */      "Bild/Ton-Feintuning",
	/* S_SETUP_REACTIVITY */      "Reactivity:",
	/* S_SETUP_TRAILS */          "Trails:",
	/* S_SETUP_MOOD */            "Mood:",
	/* S_SETUP_MS_SUFFIX */       " ms",
	/* S_SETUP_LATENCY */         "Latenz-Vorlauf:",
	/* S_SETUP_RENDERSCALE */     "Render-Skalierung:",
	/* S_SETUP_STEREO_OFF */      "Aus",
	/* S_SETUP_STEREO_SBS */      "Side-by-Side",
	/* S_SETUP_STEREO_TB */       "Top-Bottom",
	/* S_SETUP_STEREO_ANA */      "Anaglyph (Rot/Cyan)",
	/* S_SETUP_STEREOMODE */      "Stereoskopie:",
	/* S_SETUP_STEREODEPTH */     "Stereo-Tiefe:",
	/* S_SETUP_SAVE */            "Speichern",
	/* S_SETUP_CLOSE */           "Schließen",
	/* S_SETUP_NO_SETTINGS_YET */ "Noch keine gespeicherten Einstellungen gefunden - Vorgabewerte.",
	/* S_SETUP_SAVED_OK */        "Gespeichert - wirkt beim nächsten Start von Kaleidoscope.exe.",
	/* S_SETUP_SAVE_FAILED */     "Konnte nicht gespeichert werden: ",
};

const char *kEN[S_COUNT] = {
	// ---- Help overview ----
	/* S_HELP_TITLE */        "KALEIDOSCOPE  -  Keyboard",
	/* S_HELP_H */             "show / hide this help",
	/* S_HELP_0 */             "configuration menu",
	/* S_HELP_1_9 */           "switch configuration",
	/* S_HELP_N */             "next effect",
	/* S_HELP_I */             "audio-feature overlay (+ FPS)",
	/* S_HELP_V */             "show active shader names (debug)",
	/* S_HELP_D */             "choose audio source (output / mic)",
	/* S_HELP_P */             "now-playing title on/off",
	/* S_HELP_W */             "lyrics: off / scroll / karaoke (internet)",
	/* S_HELP_O */             "artist images on/off (internet)",
	/* S_HELP_A */             "auto-config by mood on/off",
	/* S_HELP_G */             "adaptive render scale on/off",
	/* S_HELP_L */             "stage lamps / light-show on/off",
	/* S_HELP_REACTIVITY */    "reactivity  - less / more",
	/* S_HELP_TRAILS */        "trails       - shorter / longer",
	/* S_HELP_MOOD */          "mood         - weaker / stronger",
	/* S_HELP_LATENCY */       "latency lead - earlier / later",
	/* S_HELP_B */             "BLACKOUT (soft fade to black)",
	/* S_HELP_E */             "FREEZE the picture",
	/* S_HELP_T */             "tap tempo (tap the beat)",
	/* S_HELP_U */             "pin / unpin the current effect",
	/* S_HELP_F */             "favourite the current effect",
	/* S_HELP_Z */             "stereo 3D: off / SBS / TB / anaglyph",
	/* S_HELP_CM */            "stereo depth - weaker / stronger",
	/* S_HELP_J */             "MIDI learn (cycle targets)",
	/* S_HELP_YX */            "arm / save the instant replay",
	/* S_HELP_K */             "save current look + state as default",
	/* S_HELP_R */             "record video + music to mp4",
	/* S_HELP_S */             "save a screenshot (PNG)",
	/* S_HELP_ESC */           "quit",

	// ---- Feature/stats overlay ----
	/* S_FEATURE_TITLE_FMT */  "AUDIO FEATURES   %1 FPS   (i to hide)",
	/* S_FEATURE_STATUS_FMT */ "react[] %1  trail,. %2  mood-= %3  auto-a %4  scale %5 g:%6",
	/* S_ON */                 "ON",
	/* S_OFF */                "off",

	// ---- Audio-source menu ----
	/* S_AUDIOMENU_TITLE */          "AUDIO SOURCE   (0-9 select,  d close)",
	/* S_AUDIOMENU_DEFAULT_OUTPUT */ "Default output (loopback)",
	/* S_AUDIOMENU_INPUT_TAG */      "  [input]",
	/* S_AUDIOMENU_OUTPUT_TAG */     "  [output]",

	// ---- Recording indicator ----
	/* S_REC_FMT */            "REC %1",

	// ---- Web-remote page ----
	/* S_WR_TITLE */           "Kaleidoscope Remote",
	/* S_WR_H1 */              "Kaleidoscope Remote",
	/* S_WR_NEXT */            "Next Effect",
	/* S_WR_BLACKOUT */        "Blackout",
	/* S_WR_FAVORITE */        "Favourite",
	/* S_WR_REPLAY_BUFFER */   "Replay Buffer",
	/* S_WR_REPLAY_SAVE */     "Save Replay",
	/* S_WR_REACTIVITY */      "Reactivity",
	/* S_WR_TRAILS */          "Trails",
	/* S_WR_MOOD */            "Mood",
	/* S_WR_LATENCY */         "Latency Lead (ms)",
	/* S_WR_LIGHTSHOW */       "Lightshow",
	/* S_WR_AUTOPRESET */      "Auto-Preset",
	/* S_WR_AUTOSCALE */       "Auto-Scale",
	/* S_WR_TITLEREVEAL */     "Title Reveal",
	/* S_WR_LYRICS_PREFIX */   "Lyrics: ",
	/* S_WR_ARTISTIMAGES */    "Artist Images",
	/* S_WR_VIDEO */           "Music Video",
	/* S_WR_SCENEBROWSER */    "Scene Browser",
	/* S_WR_LYRICS_OFF */      "Off",
	/* S_WR_LYRICS_SCROLL */   "Scroll",
	/* S_WR_LYRICS_KARAOKE */  "Karaoke",

	// ---- Setup tool ----
	/* S_SETUP_WINDOW_TITLE */    "Kaleidoscope Setup",
	/* S_SETUP_GROUP_START */     "Startup",
	/* S_SETUP_LASTUSED */        "(last used)",
	/* S_SETUP_STARTCONFIG */     "Start configuration:",
	/* S_SETUP_REMOTEPORT_OFF */  "Off",
	/* S_SETUP_REMOTEPORT */      "Web remote port:",
	/* S_SETUP_GROUP_LANGUAGE */  "Language",
	/* S_SETUP_LANGUAGE_LABEL */  "Language:",
	/* S_SETUP_LANG_DE */         "German",
	/* S_SETUP_LANG_EN */         "English",
	/* S_SETUP_GROUP_ONLINE */    "Optional Online Extras (Internet Access)",
	/* S_SETUP_LYRICSMODE_LABEL */"Lyrics:",
	/* S_SETUP_LYRICS_KINETIC */  "Line-entry animation (karaoke)",
	/* S_SETUP_ARTISTIMAGES */    "Show artist images",
	/* S_SETUP_VIDEO */           "Auto-search music video (YouTube via yt-dlp)",
	/* S_SETUP_VIDEO_HINT */      "Needs \"artist images\" on (shares the same corner slot) and yt-dlp on PATH.",
	/* S_SETUP_GROUP_BEHAVIOR */  "Behaviour",
	/* S_SETUP_AUTOCONFIG */      "Auto-preset by mood",
	/* S_SETUP_AUTOSCALE */       "Adaptive render scale (FPS-based)",
	/* S_SETUP_NOWPLAYING */      "Title reveal on track change",
	/* S_SETUP_LIGHTSHOW */       "Lightshow (stage-lamp overlay)",
	/* S_SETUP_GROUP_TUNE */      "Picture/Sound Fine-Tuning",
	/* S_SETUP_REACTIVITY */      "Reactivity:",
	/* S_SETUP_TRAILS */          "Trails:",
	/* S_SETUP_MOOD */            "Mood:",
	/* S_SETUP_MS_SUFFIX */       " ms",
	/* S_SETUP_LATENCY */         "Latency lead:",
	/* S_SETUP_RENDERSCALE */     "Render scale:",
	/* S_SETUP_STEREO_OFF */      "Off",
	/* S_SETUP_STEREO_SBS */      "Side-by-Side",
	/* S_SETUP_STEREO_TB */       "Top-Bottom",
	/* S_SETUP_STEREO_ANA */      "Anaglyph (Red/Cyan)",
	/* S_SETUP_STEREOMODE */      "Stereoscopy:",
	/* S_SETUP_STEREODEPTH */     "Stereo depth:",
	/* S_SETUP_SAVE */            "Save",
	/* S_SETUP_CLOSE */           "Close",
	/* S_SETUP_NO_SETTINGS_YET */ "No saved settings found yet - showing defaults.",
	/* S_SETUP_SAVED_OK */        "Saved - takes effect the next time Kaleidoscope.exe starts.",
	/* S_SETUP_SAVE_FAILED */     "Could not save: ",
};

} // namespace

void Strings::setLanguage( Lang lang ) { g_lang = lang; }
Lang Strings::language() { return g_lang; }

Lang Strings::fromCode( const char *code )
{
	return ( code && _stricmp( code, "en" ) == 0 ) ? Lang::EN : Lang::DE;
}

const char *Strings::toCode( Lang lang )
{
	return ( lang == Lang::EN ) ? "en" : "de";
}

const char *Strings::T( StrId id )
{
	if( id < 0 || id >= S_COUNT )
		return "";
	return ( g_lang == Lang::EN ) ? kEN[id] : kDE[id];
}
