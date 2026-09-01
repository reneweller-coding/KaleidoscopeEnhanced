/**
 * @file PresentPass.h
 * @brief Final present/composite pass: photosensitivity limiter, GPU
 *        auto-exposure, bloom, and Present.frag (upscale, mood grade,
 *        virtual camera, stereo reprojection, title reveal, lyrics/artist
 *        overlays, time-direction effects).
 */
#ifndef PRESENTPASS_H
#define PRESENTPASS_H

// Finaler Present-Pass, herausgelöst aus RenderPipeline (Refactor 3/4 Teil b).
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

/**
 * @brief The final present/composite stage of the render pipeline.
 *
 * PresentPass owns everything that used to live at the tail of
 * RenderPipeline::paint(): the photosensitivity brightness limiter, the GPU
 * percentile auto-exposure compute pass, a two-pass quarter-resolution
 * Gaussian bloom, a frame-history ring (for time-echo/rewind), and finally
 * Present.frag itself, which upscales the render-resolution result to
 * display resolution while applying the mood grade, virtual camera, stereo
 * reprojection, CAS sharpening, title reveal, and lyrics/artist overlays.
 * setup() is idempotent and fail-safe: if any part of it fails, ready()
 * stays false and the caller is expected to render the combine result
 * straight to the screen instead of calling run(). The class is Qt-free (a
 * RendererCore building block) — the title/lyrics/artist images arrive as
 * already-rendered RGBA pixel buffers; Qt text rendering stays with the
 * caller.
 */
class PresentPass
{
public:
	/** @return Spatial spread of the last measured frame (0 = flat surface).
	 *
	 * Falls out of the exposure's existing 64-pixel readback, so it costs
	 * nothing.  A live number for the one question a rendered scan takes
	 * four minutes to answer: is this scene showing anything at all? */
	float	liveStructure() const { return m_liveStd; }
	/** @return Mean absolute change against the previous measured frame. */
	float	liveMotion()    const { return m_liveMotion; }

	/** Alles anlegen (GL-Kontext aktuell); idempotent. Formate = die der
	 *  übrigen Offscreen-Texturen der Pipeline. */
	/**
	 * @brief Create the final FBO, the present/bloom shader programs, and the bloom FBOs. Idempotent, safe to call every frame during startup.
	 * @param renderW Render-resolution width (source resolution, before display upscale).
	 * @param renderH Render-resolution height.
	 * @param internalFmt GL internal format matching the rest of the pipeline's offscreen textures.
	 * @param fmt GL pixel format matching the rest of the pipeline's offscreen textures.
	 * @param type GL pixel data type matching the rest of the pipeline's offscreen textures.
	 */
	void setup( int renderW, int renderH,
	            GLenum internalFmt, GLenum fmt, GLenum type );

	/** Leichter Resize: final + Bloom-Texturen auf neue Render-Auflösung
	 *  nachziehen (nur wenn bereits angelegt - Verhalten wie zuvor). */
	/**
	 * @brief Resize the final and bloom textures to a new render resolution, without recreating programs. Only touches textures already allocated by setup().
	 * @param renderW New render-resolution width.
	 * @param renderH New render-resolution height.
	 * @param internalFmt GL internal format (as passed to setup()).
	 * @param fmt GL pixel format (as passed to setup()).
	 * @param type GL pixel data type (as passed to setup()).
	 */
	void resize( int renderW, int renderH,
	             GLenum internalFmt, GLenum fmt, GLenum type );

	bool   ready()     const { return m_safetyReady; }   ///< True once setup() succeeded; run() is a no-op otherwise.
	/** Combine-Ziel: der finale FBO (wenn ready), sonst muss der Aufrufer
	 *  direkt in seinen Default-FBO rendern. */
	GLuint targetFbo() const { return m_fboFinal; }   ///< The intermediate FBO the combine pass should render into when ready() (else render straight to the default FBO).
	GLuint finalTex()  const { return m_texFinal; }   ///< The mipmapped final-frame texture backing targetFbo().

	// ---- Titel-Reveal ----
	/** Fertig gerendertes RGBA8-Bild hochladen; startet die Reveal-Uhr neu. */
	/**
	 * @brief Upload a finished RGBA8 title image and restart the reveal clock.
	 * @param rgba Pointer to tightly packed RGBA8 pixel data.
	 * @param w Image width in pixels.
	 * @param h Image height in pixels.
	 */
	void setTitleImage( const void *rgba, int w, int h );
	/**
	 * @brief Set the title reveal animation style and its per-reveal random seed.
	 * @param style Style index consumed by Present.frag's title-reveal branch.
	 * @param seed Per-reveal random seed forwarded to the shader.
	 */
	void setTitleStyle( int style, float seed ) { m_titleStyle = style; m_titleSeed = seed; }
	/** Reveal-Uhr läuft auf der WANDzeit weiter (spielt über Freeze/Stop). */
	/**
	 * @brief Advance the title reveal clock by wall-clock time (keeps playing through freeze/stop).
	 * @param dtWall Wall-clock seconds elapsed since the last call.
	 */
	void advanceTitle( float dtWall ) { m_titleAge += dtWall; }

	// ---- Lyrics-/Künstlerbild-Overlay (Qt-Seite liefert fertige Pixel) ----
	/**
	 * @brief Upload/replace the lyrics overlay image (RGBA8, caller-rendered).
	 * @param rgba Pointer to tightly packed RGBA8 pixel data.
	 * @param w Image width in pixels.
	 * @param h Image height in pixels.
	 */
	void setLyricsImage( const void *rgba, int w, int h );
	/**
	 * @brief Upload/replace the artist-image overlay (RGBA8, caller-rendered).
	 * @param rgba Pointer to tightly packed RGBA8 pixel data.
	 * @param w Image width in pixels.
	 * @param h Image height in pixels.
	 */
	void setArtistImage( const void *rgba, int w, int h );
	/**
	 * @brief Overrides the artist-image corner slot with an EXTERNALLY-owned GL texture (a video frame) instead of the CPU-uploaded m_artistTex, for the music-video PiP feature.
	 * @param texId GL texture id to bind for this and subsequent frames (owned by the caller, e.g. VideoPiP -- NOT deleted by PresentPass), or 0 to clear the override and fall back to the normal artist-image texture.
	 *
	 * Call every frame while a video is active (the id can change frame to frame as the video
	 * decoder produces new frames) and with 0 once it stops, so the corner reverts to the
	 * ordinary artist-image rotation. Reuses the exact same corner position/blend GLSL in
	 * Present.frag (artistTex/artistAlpha/artistAspect) -- from the shader's point of view this
	 * is just a different texture, so no shader change was needed.
	 */
	void setArtistExternalTexture( GLuint texId );

	/** Frame-Eingaben für run() - alles Werte, die weiterhin der Pipeline/
	 *  den Statics von RenderPipeline gehören. */
	/**
	 * @brief Per-frame inputs to run(); everything here still belongs to the pipeline/RenderPipeline's statics, not to PresentPass itself.
	 */
	struct Inputs
	{
		GLuint source       = 0;    // fertiges Frame (Trail-Ausgang), render-res   ///< Finished frame to present (trail-pass output), at render resolution.
		GLuint targetFbo    = 0;    // QOpenGLWidget-Default-FBO   ///< Destination FBO for the final upscaled draw (usually the widget's default FBO).
		int    renderW = 0, renderH = 0;    ///< Render (source) resolution.
		int    displayW = 0, displayH = 0;  ///< Display (destination) resolution.
		const AudioFeatures *fx = nullptr;   // bereits gegatete audioFx   ///< Already-gated audio features driving the mood grade/beat visuals; run() is a no-op if null.
		float  dtFrame      = 0.f;  // ggf. Break-skaliert (wie zuvor)   ///< Frame delta time, possibly break-scaled (as before); drives the limiter accumulation.
		/** @brief True while the scheduler is cross-fading between scenes.
		 *
		 *  The auto-exposure adapts FAST during a fade and slowly otherwise.
		 *  Only the scheduler can supply this: a luminance-based cut detector
		 *  is blind to a crossfade by construction (the median moves ~2% per
		 *  frame) and would meanwhile misfire on strobes inside one scene. */
		bool   sceneFade    = false;
		/** @brief True only while the scheduler's cross-fade itself runs (no
		 *  post-fade tail). Gates the exposure's fast MEASUREMENT: during the
		 *  tail only the gain may still move fast to finish its walk -- the
		 *  measurement must already be slow again, or a beat flash landing in
		 *  the tail yanks the exposure and reads as the scene abruptly dimming
		 *  a moment after the change. */
		bool   sceneFadeStrict = false;
		/** @brief True for exactly ONE frame: the first after a scene fade ends.
		 *
		 *  The exposure's percentile EMAs snap to this frame's raw values. The
		 *  fade-time fast smoothing can only ever track the MIX, and the mix
		 *  reaches the new scene's statistics in its very last moment -- left
		 *  to the slow standing tau, the measurement then crept toward the new
		 *  scene for seconds, and the gain visibly dimmed the picture after the
		 *  change (worst arriving from a near-black scene, where the gain sits
		 *  pinned). This frame is 100%% the new scene, so its raw percentiles
		 *  are the honest measurement. */
		bool   expoSnap = false;
		/** @brief During a scene fade: the INCOMING scene's own composite.
		 *
		 *  The auto-exposure measures this instead of the presented mix while
		 *  a fade runs. Measuring the mix cannot work by construction: its
		 *  median is dominated by the outgoing scene until the fade's last
		 *  moments, so for a bright scene arriving over a dark one the wanted
		 *  gain stays pinned at maxGain almost to the end and the whole
		 *  correction lands in the final tenth -- fast makes it a visible
		 *  crash, slow makes it a visible crawl, and both were reported.
		 *  Measuring the destination makes the gain glide across the whole
		 *  fade. 0 outside fades (measure in.source as always). */
		unsigned int fadeMeasureTex = 0;
		float  dtWall       = 0.f;   ///< Wall-clock frame delta time (drives blackout slew and history-ring cadence).
		float  globalTime   = 0.f;   ///< Global shader time uniform.
		float  chasePhase   = 0.f;   ///< Chase-light phase uniform.
		// Virtuelle Kamera (Regie-Layer, berechnet der Aufrufer)
		float  camZoom = 1.f, camRot = 0.f, camOffX = 0.f, camOffY = 0.f;   ///< Virtual-camera zoom/rotation/offset (computed by the caller's director layer).
		bool   stereoPacked = false;   ///< True if the source frame already holds a packed stereo pair.
		int    stereoMode   = 0;       ///< Stereo output mode (e.g. off/SBS/TB/anaglyph) forwarded to Present.frag.
		float  stereoDepth  = 1.f;     ///< Stereo depth/separation strength.
		// Dimm-Kanäle
		bool   blackout     = false;    ///< VJ blackout ('b'): slewed to full black.
		float  breakSmooth  = 0.f;      ///< Smoothed "break" dim amount (music breakdown).
		float  fadeOutEnv   = 0.f;      ///< Detected song fade-out envelope; dims the picture slightly.
		// Look-Regler
		float  moodStrength = 1.f;    ///< Scales how far the mood-grade uniforms deviate from neutral.
		float  lightShow    = 0.f;    ///< Lightshow/chase-lamp intensity uniform.
		float  renderScale  = 1.f;    ///< Render-to-display scale factor; drives the CAS sharpening amount when < 1.
		// Lyrics-Overlay (Alpha 0 = aus; Hl-V0 < 0 = kein Karaoke-Highlight)
		float  lyricsAlpha   = 0.f;    ///< Lyrics overlay opacity (0 = off).
		float  lyricsScrollV = 0.f;    ///< Lyrics vertical scroll position.
		float  lyricsAspect  = 1.f;    ///< Lyrics image aspect ratio.
		float  lyricsHlV0    = -1.f;   ///< Karaoke highlight band start V (< 0 = no highlight).
		float  lyricsHlV1    = -1.f;   ///< Karaoke highlight band end V.
		float  lyricsHlProg  = 0.f;    ///< Karaoke highlight progress 0..1 across the band.
		float  lyricsUScale  = 1.f;    ///< Nominal / actual lyrics-texture width (<=1); keeps text size stable when the texture was widened for an overflowing line.
		float  lyricsFocusV0 = -1.f;   ///< Vertical band of the line currently being read (-1 = none); the horizontal marquee applies only here.
		float  lyricsFocusV1 = -1.f;   ///< End of the focused line's vertical band.
		float  lyricsScrollU = 0.f;    ///< Horizontal marquee offset (texture-U units) for the focused line.
		// Künstlerbild-Overlay
		float  artistAlpha   = 0.f;    ///< Artist-image overlay opacity (0 = off).
		float  artistAspect  = 1.f;    ///< Artist image aspect ratio.
		// ---- Zeit-Regie (Frame-History-Ring) ----
		// rewindSecs > 0: statt des Live-Bilds den Ring-Frame von vor N
		// Sekunden zeigen (Drop-Rewind / Break-Scrub); rewindMix blendet.
		float  rewindSecs    = 0.f;   ///< Seconds back in the history ring to show instead of the live frame.
		float  rewindMix     = 0.f;   ///< Blend amount for the rewound frame (drop-rewind / break-scrub).
		// Zeitecho: Geisterschicht von vor echoDelay Sekunden (Screen-Blend).
		float  echoAmt       = 0.f;   ///< Time-echo ghost-layer blend amount.
		float  echoDelay     = 1.4f;  ///< Time-echo delay in seconds (looked up in the history ring).
		// Build-up-"Atem anhalten": Entsättigen + Dimmen + Vignette 0..1.
		float  breath        = 0.f;   ///< "Held breath" build-up effect: desaturate + dim + vignette, 0..1.
		// CinemaScope-Letterbox 0..1 (Balken je ~11% Bildhöhe bei 1).
		float  letterbox     = 0.f;   ///< CinemaScope letterbox amount 0..1 (bars ~11% of frame height at 1).
		// Bass-Schockwelle: expandierender Verzerrungsring.
		float  shockR        = 9.f;   ///< Bass-shockwave ring radius.
		float  shockAmp      = 0.f;   ///< Bass-shockwave distortion amplitude.
		// Kinetik: Sekunden seit Wechsel der aktiven Karaoke-Zeile.
		float  lyricsLineAge = 999.f;   ///< Seconds since the active karaoke line last changed (drives a "slam" kinetic accent).
		// Cover-Palette (dominante Künstlerbild-Farben) + Stärke.
		float  paletteAmt    = 0.f;         ///< Strength of the cover-art palette grade.
		float  paletteA[3]   = { 0.f, 0.f, 0.f };   ///< Dominant cover-art color A (RGB).
		float  paletteB[3]   = { 0.f, 0.f, 0.f };   ///< Dominant cover-art color B (RGB).
		// 2.5D-Parallaxe: Tiefentextur der aktiven Szene + Stärke (geslewt).
		GLuint sceneDepthTex = 0;   ///< Active scene's depth texture for 2.5D parallax (0 = none).
		float  depthPar      = 0.f;   ///< Parallax strength (slewed by the caller).
		float  nearZ = 0.5f, farZ = 220.f;   ///< Near/far plane distances used to interpret sceneDepthTex.
	};

	/** Den kompletten Present ausführen (Limiter, AutoExposure, Bloom,
	 *  Present.frag in Display-Auflösung).  Nur rufen wenn ready(). */
	/**
	 * @brief Run the full present sequence: history capture, brightness limiter, auto-exposure, bloom, then Present.frag at display resolution.
	 * @param in Frame inputs; no-op if !ready() or in.fx is null.
	 */
	void run( const Inputs &in );

private:
	/**
	 * @brief (Re)allocate the mipmapped final-frame texture at the given size.
	 *
	 * Mipmaps give the brightness limiter a cheap whole-frame average
	 * luminance to sample (via a small mip level) without a full-resolution
	 * readback.
	 * @param w Texture width.
	 * @param h Texture height.
	 * @param internalFmt GL internal format.
	 * @param fmt GL pixel format.
	 * @param type GL pixel data type.
	 */
	void updateFinalTexture( int w, int h, GLenum internalFmt, GLenum fmt, GLenum type );

	static const GLenum kAttach = GL_COLOR_ATTACHMENT0;   ///< Color attachment point used by every FBO in this class.

	// ---- Finaler FBO + Present-Programm ----
	GLuint	m_fboFinal       = 0;   ///< Final intermediate FBO (targetFbo()).
	GLuint	m_texFinal       = 0;   ///< Mipmapped final-frame texture backing m_fboFinal.
	GLuint	m_presentProgId  = 0;   ///< Present.frag shader program.
	GLint	m_presentTexUni  = -1;   ///< Uniform location: source frame texture ("tex").
	GLint	m_presentResUni  = -1;   ///< Uniform location: display resolution ("resolution").
	GLint	m_presentScaleUni= -1;   ///< Uniform location: combined brightness scale ("scale").
	GLint	m_presentCentroidUni = -1;   ///< Uniform location: audio spectral centroid ("audioCentroid").
	GLint	m_presentValenceUni  = -1;   ///< Uniform location: audio valence ("audioValence").
	GLint	m_presentArousalUni  = -1;   ///< Uniform location: audio arousal ("audioArousal"); canon: arousal drives saturation.
	GLint	m_presentLevelUni    = -1;   ///< Uniform location: audio overall level ("audioLevel").
	GLint	m_presentFluxUni     = -1;   ///< Uniform location: audio spectral flux ("audioFlux").
	GLint	m_presentHueUni      = -1;   ///< Uniform location: audio chroma hue ("audioChromaHue").
	GLint	m_presentBeatUni     = -1;   ///< Uniform location: beat decay envelope ("audioBeat").
	GLint	m_presentDownbeatUni = -1;   ///< Uniform location: downbeat pulse ("audioDownbeat").
	GLint	m_presentOnsetUni    = -1;   ///< Uniform location: onset strength ("audioOnset").
	GLint	m_presentTimeUni     = -1;   ///< Uniform location: global shader time ("time").
	GLint	m_presentChaseUni    = -1;   ///< Uniform location: chase-light phase ("audioChase").
	GLint	m_presentLampsUni    = -1;   ///< Uniform location: lightshow intensity ("lightShow").
	GLint	m_presentSwellUni    = -1;   ///< Uniform location: audio swell ("audioSwell").
	GLint	m_presentBarPhaseUni = -1;   ///< Uniform location: bar phase ("audioBarPhase").
	GLint	m_presentBloomTexUni = -1;   ///< Uniform location: bloom texture ("bloomTex").
	GLint	m_presentUseBloomUni = -1;   ///< Uniform location: bloom-enabled flag ("useBloom").
	GLint	m_presentCamZoomUni  = -1;   ///< Uniform location: virtual-camera zoom ("camZoom").
	GLint	m_presentCamRotUni   = -1;   ///< Uniform location: virtual-camera rotation ("camRot").
	GLint	m_presentCamOffUni   = -1;   ///< Uniform location: virtual-camera offset ("camOff").
	GLint	m_presentTitleTexUni    = -1;   ///< Uniform location: title image texture ("titleTex").
	GLint	m_presentTitlePhaseUni  = -1;   ///< Uniform location: title reveal phase 0..1, 2 = off ("titlePhase").
	GLint	m_presentTitleAspectUni = -1;   ///< Uniform location: title image aspect ratio ("titleAspect").
	GLint	m_presentTitleStyleUni  = -1;   ///< Uniform location: title reveal style index ("titleStyle").
	GLint	m_presentTitleSeedUni   = -1;   ///< Uniform location: title reveal random seed ("titleSeed").
	GLint	m_presentStereoModeUni  = -1;   ///< Uniform location: stereo output mode ("stereoMode").
	GLint	m_presentStereoDepthUni = -1;   ///< Uniform location: stereo depth/separation ("stereoDepth").
	GLint	m_presentStereoSrcUni   = -1;   ///< Uniform location: source-already-packed-stereo flag ("stereoSource").

	// ---- Limiter-/Belichtungs-Zustand ----
	float	m_prevMeanLum     = -1.f;   // <0 = uninitialisiert   ///< Previous sampled mean luminance (< 0 = not yet initialised).
	float	m_liveStd    = 0.f;   ///< Spatial spread of the same 64-pixel sample: 'is there anything to see'.
	float	m_liveMotion = 0.f;   ///< Mean |delta| against the previous sample: 'is anything moving'.
	float	m_prevSample[64] = {};  ///< Previous frame's luma sample, for m_liveMotion.
	bool	m_havePrevSample = false;
	bool	m_safetyReady     = false;   ///< True once setup() succeeded (gates run() and ready()).
	int		m_safetyFrame     = 0;   ///< Frame counter used to sample the mean-luminance readback every 3rd frame.
	float	m_lastSafetyScale = 1.f;   ///< Brightness scale from the last luminance sample, reused on skipped frames.
	float	m_safetyAccumDt   = 0.f;   ///< Accumulated dtFrame since the last luminance sample (keeps the per-second rise limit correct).
	float	m_blackSmooth     = 0.f;    // geslewter Blackout-Pegel 0..1   ///< Slewed blackout level 0..1.
	GLuint	m_autoExpBuf   = 0;         // 4 floats: exposure, p50, p98, pad   ///< SSBO holding { exposure, p50, p98, pad } written by CfxHistogram.comp.
	GLuint	m_autoExpProg  = 0;   ///< CfxHistogram.comp compute program (0 if unavailable).
	bool	m_autoExpTried = false;   ///< True once auto-exposure program creation has been attempted (tried only once).

	// ---- Bloom ----
	GLuint	m_texBloom[2]  = { 0, 0 };   ///< Ping-pong bloom textures (quarter resolution).
	GLuint	m_fboBloom[2]  = { 0, 0 };   ///< FBOs backing m_texBloom.
	GLuint	m_bloomProgId  = 0;   ///< BloomBlur.frag shader program.
	GLint	m_bloomTexUni    = -1;   ///< Uniform location: bloom source texture ("tex").
	GLint	m_bloomResUni    = -1;   ///< Uniform location: bloom pass resolution ("resolution").
	GLint	m_bloomDirUni    = -1;   ///< Uniform location: blur direction ("dir").
	GLint	m_bloomThreshUni = -1;   ///< Uniform location: bright-pass threshold ("threshold").
	bool	m_bloomReady   = false;   ///< True once the bloom FBOs/program were created successfully.
	int		m_bloomW = 0, m_bloomH = 0;   ///< Bloom texture resolution (render resolution / 4, floor 8).

	// ---- Titel-Reveal ----
	GLuint	m_titleTex    = 0;   ///< Uploaded title image texture.
	float	m_titleAge    = 999.f;   ///< Seconds since setTitleImage() (reveal clock; large = inactive).
	float	m_titleAspect = 4.f;   ///< Title image aspect ratio.
	int		m_titleStyle  = 0;   ///< Title reveal style index.
	float	m_titleSeed   = 0.f;   ///< Title reveal random seed.

	// ---- Frame-History-Ring (Zeitecho / Drop-Rewind) ----
	// 2D-Array-Textur (Drittel-Auflösung, RGBA8) mit den letzten ~3 s des
	// fertigen Bilds, ~30 Aufnahmen/s per FBO-Blit.  Fällt SOFT aus: ohne
	// die GL-Einstiegspunkte bleibt m_histReady false und Echo/Rewind sind
	// einfach unsichtbar.
	/**
	 * @brief Blit the current source frame into the next slot of the frame-history ring, at a fixed ~1/30 s wall-clock cadence.
	 *
	 * Soft-fails: if the required GL entry points (glTexImage3D,
	 * glFramebufferTextureLayer, glBlitFramebuffer) are missing, m_histReady
	 * stays false and every caller of the ring (rewind/echo) becomes a no-op.
	 * Lazily (re)allocates the GL_TEXTURE_2D_ARRAY when the derived
	 * one-third resolution changes.
	 * @param sourceTex Freshly rendered frame texture to capture.
	 * @param renderW Render width (used to derive the ring's one-third resolution).
	 * @param renderH Render height (used to derive the ring's one-third resolution).
	 * @param dtWall Wall-clock seconds since the last call; accumulated against the fixed ~30 Hz capture cadence.
	 */
	void	captureHistory( GLuint sourceTex, int renderW, int renderH, float dtWall );
	/**
	 * @brief Convert a "seconds back" offset into a ring layer index, clamped to what the ring currently holds.
	 * @param secs Seconds back in time to look up.
	 * @return Layer index into the history-ring array texture.
	 */
	float	historyLayerBack( float secs ) const;   // Sek. zurück -> Layer-Index
	static const int kHistLayers = 96;              // ~3.2 s bei 30 Hz   ///< Number of ring layers (~3.2 s of history at 30 Hz).
	GLuint	m_histTex    = 0;   ///< GL_TEXTURE_2D_ARRAY holding the ring's frames.
	GLuint	m_histFboDst = 0;      // Ziel: jeweiliger Ring-Layer   ///< FBO used as blit destination (bound to the current ring layer).
	GLuint	m_histFboSrc = 0;      // Quelle: das frische Frame   ///< FBO used as blit source (bound to the fresh frame texture).
	int		m_histW = 0, m_histH = 0;   ///< Ring texture resolution (render resolution / 3, floor 32).
	int		m_histHead   = 0;      // nächster Schreib-Slot   ///< Next write slot (ring head).
	int		m_histCount  = 0;      // gefüllte Slots (<= kHistLayers)   ///< Number of filled slots so far (<= kHistLayers).
	float	m_histAccum  = 0.f;    // Wandzeit seit letzter Aufnahme   ///< Wall-clock seconds accumulated since the last capture.
	bool	m_histReady  = false;   ///< True once the required GL entry points were confirmed present.
	bool	m_histTried  = false;   ///< True once availability has been checked (checked only once).
	GLint	m_presentHistTexUni  = -1;   ///< Uniform location: history-ring array sampler ("histTex", always bound to unit 5).
	GLint	m_presentRewindUni   = -1;   // vec2( mix, layer )   ///< Uniform location: rewind (mix, layer) ("rewind").
	GLint	m_presentEchoUni     = -1;   // vec2( amt, layer )   ///< Uniform location: time-echo (amount, layer) ("echo").
	GLint	m_presentBreathUni   = -1;   ///< Uniform location: "held breath" amount ("breath").
	GLint	m_presentDropUni     = -1;   ///< Uniform location: drop pulse ("audioDrop").
	GLint	m_presentLetterUni   = -1;   ///< Uniform location: letterbox amount ("letterbox").
	GLint	m_presentShockUni    = -1;   // vec2( radius, amp )   ///< Uniform location: bass shockwave (radius, amplitude) ("shock").
	GLint	m_presentLineAgeUni  = -1;   ///< Uniform location: karaoke line age ("lyricsLineAge").
	GLint	m_presentPalAUni     = -1;   ///< Uniform location: cover palette color A ("paletteA").
	GLint	m_presentPalBUni     = -1;   ///< Uniform location: cover palette color B ("paletteB").
	GLint	m_presentPalAmtUni   = -1;   ///< Uniform location: cover palette strength ("paletteAmt").
	GLint	m_presentSceneDepthUni = -1; // Unit 6   ///< Uniform location: scene depth sampler ("sceneDepth", always bound to unit 6).
	GLint	m_presentDepthParUni = -1;   ///< Uniform location: parallax strength ("depthPar").
	GLint	m_presentNearFar2Uni = -1;   ///< Uniform location: near/far plane distances ("nearFar2").

	// ---- Lyrics / Künstlerbild ----
	GLuint	m_lyricsTex = 0;   ///< Uploaded lyrics overlay texture.
	GLuint	m_artistTex = 0;   ///< Uploaded artist-image overlay texture.
	GLuint	m_artistExternalTex = 0;   ///< Set via setArtistExternalTexture(); 0 = no override (use m_artistTex), else a caller-owned texture (video PiP frame) shown in its place.
	GLint	m_presentLyricsTexUni    = -1;   ///< Uniform location: lyrics texture ("lyricsTex").
	GLint	m_presentLyricsAlphaUni  = -1;   ///< Uniform location: lyrics opacity ("lyricsAlpha").
	GLint	m_presentLyricsScrollUni = -1;   ///< Uniform location: lyrics scroll position ("lyricsScrollV").
	GLint	m_presentLyricsAspectUni = -1;   ///< Uniform location: lyrics image aspect ratio ("lyricsAspect").
	GLint	m_presentLyricsHlUni     = -1;   ///< Uniform location: karaoke highlight band + progress ("lyricsHl").
	GLint	m_presentLyricsUScaleUni = -1;   ///< Uniform location: nominal/actual texture width ratio ("lyricsUScale").
	GLint	m_presentLyricsFocusUni  = -1;   ///< Uniform location: focused-line vertical band ("lyricsFocusV").
	GLint	m_presentLyricsScrollUUni = -1;  ///< Uniform location: focused-line horizontal marquee offset ("lyricsScrollU").
	GLint	m_presentArtistTexUni    = -1;   ///< Uniform location: artist-image texture ("artistTex").
	GLint	m_presentArtistAlphaUni  = -1;   ///< Uniform location: artist-image opacity ("artistAlpha").
	GLint	m_presentArtistAspectUni = -1;   ///< Uniform location: artist-image aspect ratio ("artistAspect").
};

#endif
