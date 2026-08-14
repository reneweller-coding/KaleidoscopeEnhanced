#ifndef PRESENTPASS_H
#define PRESENTPASS_H

// Finaler Present-Pass, herausgelöst aus FilterShader (Refactor 3/4 Teil b).
//
// Aufgaben (unverändert aus dem alten paint()-Schwanz):
//  - Photosensitivitäts-Limiter: mittlere Frame-Luminanz (grobe Mip, Readback
//    nur jeden 3. Frame) begrenzt, wie schnell die GESAMThelligkeit steigen
//    darf (~2.0 Luma/s); der Scale kann nur abdunkeln, nie aufhellen.
//  - GPU-Perzentil-Auto-Exposure (CfxHistogram.comp -> SSBO Bindepunkt 3,
//    liest Present.frag direkt - kein CPU-Sync).
//  - Zweipass-Gauß-Bloom in Viertel-Auflösung.
//  - Present.frag: Upscale Render- -> Display-Auflösung, Mood-Grade,
//    virtuelle Kamera, Stereo-Reprojektion, Lightshow, CAS-Schärfung,
//    Blackout/Break/Fade-Dimmung und der Titel-Reveal.
//
// Fail-safe wie immer: schlägt das Setup fehl, bleibt ready() false und der
// Aufrufer rendert das Combine-Ergebnis direkt auf den Screen.
//
// Qt-frei (RendererCore-Baustein): der Titel wird als fertige RGBA-Pixel
// übergeben (die Qt-Textrenderei bleibt beim Aufrufer).

#include "glcore.h"
#include "AudioFeatures.h"

class PresentPass
{
public:
	/** Alles anlegen (GL-Kontext aktuell); idempotent. Formate = die der
	 *  übrigen Offscreen-Texturen der Pipeline. */
	void setup( int renderW, int renderH,
	            GLenum internalFmt, GLenum fmt, GLenum type );

	/** Leichter Resize: final + Bloom-Texturen auf neue Render-Auflösung
	 *  nachziehen (nur wenn bereits angelegt - Verhalten wie zuvor). */
	void resize( int renderW, int renderH,
	             GLenum internalFmt, GLenum fmt, GLenum type );

	bool   ready()     const { return m_safetyReady; }
	/** Combine-Ziel: der finale FBO (wenn ready), sonst muss der Aufrufer
	 *  direkt in seinen Default-FBO rendern. */
	GLuint targetFbo() const { return m_fboFinal; }
	GLuint finalTex()  const { return m_texFinal; }

	// ---- Titel-Reveal ----
	/** Fertig gerendertes RGBA8-Bild hochladen; startet die Reveal-Uhr neu. */
	void setTitleImage( const void *rgba, int w, int h );
	void setTitleStyle( int style, float seed ) { m_titleStyle = style; m_titleSeed = seed; }
	/** Reveal-Uhr läuft auf der WANDzeit weiter (spielt über Freeze/Stop). */
	void advanceTitle( float dtWall ) { m_titleAge += dtWall; }

	// ---- Lyrics-/Künstlerbild-Overlay (Qt-Seite liefert fertige Pixel) ----
	void setLyricsImage( const void *rgba, int w, int h );
	void setArtistImage( const void *rgba, int w, int h );

	/** Frame-Eingaben für run() - alles Werte, die weiterhin der Pipeline/
	 *  den Statics von FilterShader gehören. */
	struct Inputs
	{
		GLuint source       = 0;    // fertiges Frame (Trail-Ausgang), render-res
		GLuint targetFbo    = 0;    // QOpenGLWidget-Default-FBO
		int    renderW = 0, renderH = 0;
		int    displayW = 0, displayH = 0;
		const AudioFeatures *fx = nullptr;   // bereits gegatete audioFx
		float  dtFrame      = 0.f;  // ggf. Break-skaliert (wie zuvor)
		float  dtWall       = 0.f;
		float  globalTime   = 0.f;
		float  chasePhase   = 0.f;
		// Virtuelle Kamera (Regie-Layer, berechnet der Aufrufer)
		float  camZoom = 1.f, camRot = 0.f, camOffX = 0.f, camOffY = 0.f;
		bool   stereoPacked = false;
		int    stereoMode   = 0;
		float  stereoDepth  = 1.f;
		// Dimm-Kanäle
		bool   blackout     = false;
		float  breakSmooth  = 0.f;
		float  fadeOutEnv   = 0.f;
		// Look-Regler
		float  moodStrength = 1.f;
		float  lightShow    = 0.f;
		float  renderScale  = 1.f;
		// Lyrics-Overlay (Alpha 0 = aus; Hl-V0 < 0 = kein Karaoke-Highlight)
		float  lyricsAlpha   = 0.f;
		float  lyricsScrollV = 0.f;
		float  lyricsAspect  = 1.f;
		float  lyricsHlV0    = -1.f;
		float  lyricsHlV1    = -1.f;
		float  lyricsHlProg  = 0.f;
		// Künstlerbild-Overlay
		float  artistAlpha   = 0.f;
		float  artistAspect  = 1.f;
	};

	/** Den kompletten Present ausführen (Limiter, AutoExposure, Bloom,
	 *  Present.frag in Display-Auflösung).  Nur rufen wenn ready(). */
	void run( const Inputs &in );

private:
	void updateFinalTexture( int w, int h, GLenum internalFmt, GLenum fmt, GLenum type );

	static const GLenum kAttach = GL_COLOR_ATTACHMENT0;

	// ---- Finaler FBO + Present-Programm ----
	GLuint	m_fboFinal       = 0;
	GLuint	m_texFinal       = 0;
	GLuint	m_presentProgId  = 0;
	GLint	m_presentTexUni  = -1;
	GLint	m_presentResUni  = -1;
	GLint	m_presentScaleUni= -1;
	GLint	m_presentCentroidUni = -1;
	GLint	m_presentValenceUni  = -1;
	GLint	m_presentLevelUni    = -1;
	GLint	m_presentFluxUni     = -1;
	GLint	m_presentHueUni      = -1;
	GLint	m_presentBeatUni     = -1;
	GLint	m_presentDownbeatUni = -1;
	GLint	m_presentOnsetUni    = -1;
	GLint	m_presentTimeUni     = -1;
	GLint	m_presentChaseUni    = -1;
	GLint	m_presentLampsUni    = -1;
	GLint	m_presentSwellUni    = -1;
	GLint	m_presentBarPhaseUni = -1;
	GLint	m_presentBloomTexUni = -1;
	GLint	m_presentUseBloomUni = -1;
	GLint	m_presentCamZoomUni  = -1;
	GLint	m_presentCamRotUni   = -1;
	GLint	m_presentCamOffUni   = -1;
	GLint	m_presentTitleTexUni    = -1;
	GLint	m_presentTitlePhaseUni  = -1;
	GLint	m_presentTitleAspectUni = -1;
	GLint	m_presentTitleStyleUni  = -1;
	GLint	m_presentTitleSeedUni   = -1;
	GLint	m_presentStereoModeUni  = -1;
	GLint	m_presentStereoDepthUni = -1;
	GLint	m_presentStereoSrcUni   = -1;

	// ---- Limiter-/Belichtungs-Zustand ----
	float	m_prevMeanLum     = -1.f;   // <0 = uninitialisiert
	bool	m_safetyReady     = false;
	int		m_safetyFrame     = 0;
	float	m_lastSafetyScale = 1.f;
	float	m_safetyAccumDt   = 0.f;
	float	m_blackSmooth     = 0.f;    // geslewter Blackout-Pegel 0..1
	GLuint	m_autoExpBuf   = 0;         // 4 floats: exposure, p50, p98, pad
	GLuint	m_autoExpProg  = 0;
	bool	m_autoExpTried = false;

	// ---- Bloom ----
	GLuint	m_texBloom[2]  = { 0, 0 };
	GLuint	m_fboBloom[2]  = { 0, 0 };
	GLuint	m_bloomProgId  = 0;
	GLint	m_bloomTexUni    = -1;
	GLint	m_bloomResUni    = -1;
	GLint	m_bloomDirUni    = -1;
	GLint	m_bloomThreshUni = -1;
	bool	m_bloomReady   = false;
	int		m_bloomW = 0, m_bloomH = 0;

	// ---- Titel-Reveal ----
	GLuint	m_titleTex    = 0;
	float	m_titleAge    = 999.f;
	float	m_titleAspect = 4.f;
	int		m_titleStyle  = 0;
	float	m_titleSeed   = 0.f;

	// ---- Lyrics / Künstlerbild ----
	GLuint	m_lyricsTex = 0;
	GLuint	m_artistTex = 0;
	GLint	m_presentLyricsTexUni    = -1;
	GLint	m_presentLyricsAlphaUni  = -1;
	GLint	m_presentLyricsScrollUni = -1;
	GLint	m_presentLyricsAspectUni = -1;
	GLint	m_presentLyricsHlUni     = -1;
	GLint	m_presentArtistTexUni    = -1;
	GLint	m_presentArtistAlphaUni  = -1;
	GLint	m_presentArtistAspectUni = -1;
};

#endif
