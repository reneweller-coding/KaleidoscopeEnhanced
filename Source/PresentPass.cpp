/**
 * @file PresentPass.cpp
 * @brief Implementation of PresentPass: FBO/program setup, the brightness
 *        limiter, GPU auto-exposure, two-pass bloom, the frame-history ring,
 *        and the Present.frag draw call that ties it all together.
 */
#include <cstdio>
#include <cmath>

#include "PresentPass.h"
#include "shader_setup.h"

// Gemeinsames Fullscreen-Dreieck (gl_VertexID-VAO), definiert in RenderPipeline.cpp.
extern GLuint fullscreenVAO();   ///< Shared fullscreen-triangle VAO (gl_VertexID trick), defined in RenderPipeline.cpp.

/** @brief Clear and draw the shared fullscreen triangle (gl_VertexID-based, no vertex buffer). */
static void drawFullscreen()
{
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
}

/** @brief Placeholder framebuffer-completeness check (kept as a stub, matching RenderPipeline::checkFramebufferStatus's profiling behaviour).
 * @return Always true.
 */
static bool fbStatusOk()
{
	return true; // wie RenderPipeline::checkFramebufferStatus (rwrwtest profiling)
}

/** @brief Clamp a value to [lo, hi].
 * @param v Value to clamp.
 * @param lo Lower bound.
 * @param hi Upper bound.
 * @return The clamped value.
 */
static float clampf( float v, float lo, float hi )
{
	return v < lo ? lo : (v > hi ? hi : v);
}

// (Re)allocate the mipmapped final-frame texture at the current size.  Mipmaps
// give us a cheap whole-frame average luminance for the brightness limiter.
void PresentPass::updateFinalTexture( int w, int h, GLenum internalFmt, GLenum fmt, GLenum type )
{
	if( m_texFinal == 0 )
		glGenTextures( 1, &m_texFinal );
	glBindTexture( GL_TEXTURE_2D, m_texFinal );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glTexImage2D( GL_TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, NULL );
	glGenerateMipmap( GL_TEXTURE_2D );
	glBindTexture( GL_TEXTURE_2D, 0 );
}

/**
 * @brief Create (idempotently) the final FBO/texture, the Present.frag program and all its uniform locations, and the two-pass bloom FBOs/program.
 *
 * ready() (m_safetyReady) only becomes true if the final FBO is complete AND
 * the present program linked AND its "tex" uniform was found — a fail-safe
 * so a broken shader/driver leaves the caller free to fall back to rendering
 * the combine result directly. Bloom failure is tracked independently via
 * m_bloomReady: Present.frag falls back to its mip-based glow path when
 * bloom isn't available, so a bloom failure alone does not disable ready().
 */
void PresentPass::setup( int renderW, int renderH,
                         GLenum internalFmt, GLenum fmt, GLenum type )
{
	updateFinalTexture( renderW, renderH, internalFmt, fmt, type );

	if( m_fboFinal == 0 )
		glGenFramebuffers( 1, &m_fboFinal );
	glBindFramebuffer( GL_FRAMEBUFFER, m_fboFinal );
	glFramebufferTexture2D( GL_FRAMEBUFFER, kAttach,
	                           GL_TEXTURE_2D, m_texFinal, 0 );
	bool fboOk = fbStatusOk();
	glBindFramebuffer( GL_FRAMEBUFFER, 0 );

	if( m_presentProgId == 0 )
	{
		m_presentProgId   = setShaders( "..\\standard.vert", "..\\Engine\\Present.frag" );
		m_presentTexUni   = glGetUniformLocation( m_presentProgId, "tex" );
		m_presentResUni   = glGetUniformLocation( m_presentProgId, "resolution" );
		m_presentScaleUni = glGetUniformLocation( m_presentProgId, "scale" );
		m_presentCentroidUni = glGetUniformLocation( m_presentProgId, "audioCentroid" );
		m_presentValenceUni  = glGetUniformLocation( m_presentProgId, "audioValence" );
		m_presentLevelUni    = glGetUniformLocation( m_presentProgId, "audioLevel" );
		m_presentFluxUni     = glGetUniformLocation( m_presentProgId, "audioFlux" );
		m_presentHueUni      = glGetUniformLocation( m_presentProgId, "audioChromaHue" );
		m_presentBeatUni     = glGetUniformLocation( m_presentProgId, "audioBeat" );
		m_presentDownbeatUni = glGetUniformLocation( m_presentProgId, "audioDownbeat" );
		m_presentOnsetUni    = glGetUniformLocation( m_presentProgId, "audioOnset" );
		m_presentTimeUni     = glGetUniformLocation( m_presentProgId, "time" );
		m_presentChaseUni    = glGetUniformLocation( m_presentProgId, "audioChase" );
		m_presentLampsUni    = glGetUniformLocation( m_presentProgId, "lightShow" );
		m_presentSwellUni    = glGetUniformLocation( m_presentProgId, "audioSwell" );
		m_presentBarPhaseUni = glGetUniformLocation( m_presentProgId, "audioBarPhase" );
		m_presentBloomTexUni = glGetUniformLocation( m_presentProgId, "bloomTex" );
		m_presentUseBloomUni = glGetUniformLocation( m_presentProgId, "useBloom" );
		m_presentCamZoomUni  = glGetUniformLocation( m_presentProgId, "camZoom" );
		m_presentCamRotUni   = glGetUniformLocation( m_presentProgId, "camRot" );
		m_presentCamOffUni   = glGetUniformLocation( m_presentProgId, "camOff" );
		m_presentTitleTexUni    = glGetUniformLocation( m_presentProgId, "titleTex" );
		m_presentTitlePhaseUni  = glGetUniformLocation( m_presentProgId, "titlePhase" );
		m_presentTitleAspectUni = glGetUniformLocation( m_presentProgId, "titleAspect" );
		m_presentTitleStyleUni  = glGetUniformLocation( m_presentProgId, "titleStyle" );
		m_presentTitleSeedUni   = glGetUniformLocation( m_presentProgId, "titleSeed" );
		m_presentStereoModeUni  = glGetUniformLocation( m_presentProgId, "stereoMode" );
		m_presentStereoDepthUni = glGetUniformLocation( m_presentProgId, "stereoDepth" );
		m_presentStereoSrcUni   = glGetUniformLocation( m_presentProgId, "stereoSource" );
		m_presentLyricsTexUni    = glGetUniformLocation( m_presentProgId, "lyricsTex" );
		m_presentLyricsAlphaUni  = glGetUniformLocation( m_presentProgId, "lyricsAlpha" );
		m_presentLyricsScrollUni = glGetUniformLocation( m_presentProgId, "lyricsScrollV" );
		m_presentLyricsAspectUni = glGetUniformLocation( m_presentProgId, "lyricsAspect" );
		m_presentLyricsHlUni     = glGetUniformLocation( m_presentProgId, "lyricsHl" );
		m_presentArtistTexUni    = glGetUniformLocation( m_presentProgId, "artistTex" );
		m_presentArtistAlphaUni  = glGetUniformLocation( m_presentProgId, "artistAlpha" );
		m_presentArtistAspectUni = glGetUniformLocation( m_presentProgId, "artistAspect" );
		m_presentHistTexUni  = glGetUniformLocation( m_presentProgId, "histTex" );
		m_presentRewindUni   = glGetUniformLocation( m_presentProgId, "rewind" );
		m_presentEchoUni     = glGetUniformLocation( m_presentProgId, "echo" );
		m_presentBreathUni   = glGetUniformLocation( m_presentProgId, "breath" );
		m_presentDropUni     = glGetUniformLocation( m_presentProgId, "audioDrop" );
		m_presentLetterUni   = glGetUniformLocation( m_presentProgId, "letterbox" );
		m_presentShockUni    = glGetUniformLocation( m_presentProgId, "shock" );
		m_presentLineAgeUni  = glGetUniformLocation( m_presentProgId, "lyricsLineAge" );
		m_presentPalAUni     = glGetUniformLocation( m_presentProgId, "paletteA" );
		m_presentPalBUni     = glGetUniformLocation( m_presentProgId, "paletteB" );
		m_presentPalAmtUni   = glGetUniformLocation( m_presentProgId, "paletteAmt" );
		m_presentSceneDepthUni = glGetUniformLocation( m_presentProgId, "sceneDepth" );
		m_presentDepthParUni = glGetUniformLocation( m_presentProgId, "depthPar" );
		m_presentNearFar2Uni = glGetUniformLocation( m_presentProgId, "nearFar2" );
	}

	m_safetyReady = fboOk && (m_presentProgId != 0) && (m_presentTexUni >= 0);

	// ---- Two-pass Gaussian bloom: quarter-res ping-pong + blur shader ----
	// On failure m_bloomReady stays false and Present.frag falls back to the
	// mip path.
	m_bloomW = renderW / 4;  if( m_bloomW < 8 ) m_bloomW = 8;
	m_bloomH = renderH / 4;  if( m_bloomH < 8 ) m_bloomH = 8;
	bool bloomOk = true;
	for( int i = 0; i < 2; ++i )
	{
		if( m_texBloom[i] == 0 ) glGenTextures( 1, &m_texBloom[i] );
		glBindTexture( GL_TEXTURE_2D, m_texBloom[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glTexImage2D( GL_TEXTURE_2D, 0, internalFmt, m_bloomW, m_bloomH, 0,
		              fmt, type, NULL );
		if( m_fboBloom[i] == 0 ) glGenFramebuffers( 1, &m_fboBloom[i] );
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboBloom[i] );
		glFramebufferTexture2D( GL_FRAMEBUFFER, kAttach,
		                           GL_TEXTURE_2D, m_texBloom[i], 0 );
		bloomOk = bloomOk && fbStatusOk();
	}
	glBindFramebuffer( GL_FRAMEBUFFER, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );
	if( m_bloomProgId == 0 )
	{
		m_bloomProgId    = setShaders( "..\\standard.vert", "..\\Engine\\BloomBlur.frag" );
		m_bloomTexUni    = glGetUniformLocation( m_bloomProgId, "tex" );
		m_bloomResUni    = glGetUniformLocation( m_bloomProgId, "resolution" );
		m_bloomDirUni    = glGetUniformLocation( m_bloomProgId, "dir" );
		m_bloomThreshUni = glGetUniformLocation( m_bloomProgId, "threshold" );
	}
	m_bloomReady = bloomOk && (m_bloomProgId != 0) && (m_bloomTexUni >= 0);
}

/**
 * @brief Resize the final and bloom textures in place; does nothing for a texture that setup() never created.
 *
 * Mirrors the old resize() behaviour exactly: this only re-targets textures
 * that already exist (checked via the m_texFinal/m_texBloom handles being
 * non-zero) and never (re)creates FBOs or programs.
 */
void PresentPass::resize( int renderW, int renderH,
                          GLenum internalFmt, GLenum fmt, GLenum type )
{
	// Verhalten wie der alte resize(): nur nachziehen, was schon existiert.
	if( m_texFinal != 0 )
		updateFinalTexture( renderW, renderH, internalFmt, fmt, type );

	m_bloomW = renderW / 4;  if( m_bloomW < 8 ) m_bloomW = 8;
	m_bloomH = renderH / 4;  if( m_bloomH < 8 ) m_bloomH = 8;
	for( int i = 0; i < 2; ++i )
		if( m_texBloom[i] != 0 )
		{
			glBindTexture( GL_TEXTURE_2D, m_texBloom[i] );
			glTexImage2D( GL_TEXTURE_2D, 0, internalFmt, m_bloomW, m_bloomH, 0,
			              fmt, type, NULL );
		}
	glBindTexture( GL_TEXTURE_2D, 0 );
}

// RGBA8-Bild in eine (ggf. neue) Textur laden - gemeinsames Muster für
// Lyrics- und Künstlerbild-Overlay.
/** @brief Upload an RGBA8 image into a texture, creating it on first use. Shared by the lyrics and artist-image overlays.
 * @param tex Texture handle to (re)use or create (updated in place).
 * @param rgba Tightly packed RGBA8 pixel data.
 * @param w Image width in pixels.
 * @param h Image height in pixels.
 */
static void uploadRGBA( GLuint &tex, const void *rgba, int w, int h )
{
	if( tex == 0 ) glGenTextures( 1, &tex );
	glBindTexture( GL_TEXTURE_2D, tex );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0,
	              GL_RGBA, GL_UNSIGNED_BYTE, rgba );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glBindTexture( GL_TEXTURE_2D, 0 );
}

// ---- Frame-History-Ring -----------------------------------------------------
// Drittel-Auflösung reicht: Rewind trägt ohnehin einen VHS-Look (der die
// Weichheit verkauft) und das Zeitecho ist eine Geisterschicht.  96 Layer bei
// ~30 Aufnahmen/s = ~3.2 s Vergangenheit; bei 1080p-Rendering ~88 MB VRAM.
/**
 * @brief Capture the current frame into the history ring at a fixed ~30 Hz wall-clock cadence, via an FBO blit (no CPU readback).
 *
 * The availability check (m_histTried/m_histReady) runs only once — if the
 * GL_TEXTURE_2D_ARRAY / glFramebufferTextureLayer / glBlitFramebuffer entry
 * points are missing, the ring is permanently disabled for this run rather
 * than retried every frame. The one-third-resolution array texture is
 * (re)allocated lazily when the derived size changes, which also resets the
 * ring (m_histHead/m_histCount) and forces an immediate capture
 * (m_histAccum = 1.f) so the ring doesn't start out empty for ~1/30 s.
 * Capture cadence is time-accumulated (m_histAccum += dtWall, fire once it
 * crosses 1/30 s, keep the remainder via fmodf) rather than frame-counted,
 * so the effective layer spacing stays close to 1/30 s regardless of the
 * actual render frame rate.
 */
void PresentPass::captureHistory( GLuint sourceTex, int renderW, int renderH,
                                  float dtWall )
{
	if( !m_histTried )
	{
		m_histTried = true;
		m_histReady = ( glcore_glTexImage3D && glcore_glFramebufferTextureLayer
		             && glcore_glBlitFramebuffer );
		fprintf( stderr, "Frame history ring: %s\n",
		         m_histReady ? "available" : "off (GL entry points missing)" );
	}
	if( !m_histReady )
		return;

	int hw = renderW / 3;  if( hw < 32 ) hw = 32;
	int hh = renderH / 3;  if( hh < 32 ) hh = 32;
	if( m_histTex == 0 || hw != m_histW || hh != m_histH )
	{
		if( m_histTex == 0 ) glGenTextures( 1, &m_histTex );
		glBindTexture( GL_TEXTURE_2D_ARRAY, m_histTex );
		glTexImage3D( GL_TEXTURE_2D_ARRAY, 0, GL_RGBA8, hw, hh, kHistLayers,
		              0, GL_RGBA, GL_UNSIGNED_BYTE, NULL );
		glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D_ARRAY, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glBindTexture( GL_TEXTURE_2D_ARRAY, 0 );
		m_histW = hw;  m_histH = hh;
		m_histHead = 0;  m_histCount = 0;  m_histAccum = 1.f;   // sofort aufnehmen
	}
	if( m_histFboDst == 0 ) glGenFramebuffers( 1, &m_histFboDst );
	if( m_histFboSrc == 0 ) glGenFramebuffers( 1, &m_histFboSrc );

	// Fixe Aufnahme-Kadenz auf der WANDzeit - der Layer-Abstand ist dadurch
	// (näherungsweise) konstant 1/30 s, egal wie die Framerate schwankt.
	m_histAccum += dtWall;
	if( m_histAccum < 1.f / 30.f )
		return;
	m_histAccum = fmodf( m_histAccum, 1.f / 30.f );

	glBindFramebuffer( GL_READ_FRAMEBUFFER, m_histFboSrc );
	glFramebufferTexture2D( GL_READ_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
	                        GL_TEXTURE_2D, sourceTex, 0 );
	glBindFramebuffer( GL_DRAW_FRAMEBUFFER, m_histFboDst );
	glFramebufferTextureLayer( GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
	                           m_histTex, 0, m_histHead );
	glBlitFramebuffer( 0, 0, renderW, renderH, 0, 0, m_histW, m_histH,
	                   GL_COLOR_BUFFER_BIT, GL_LINEAR );
	glBindFramebuffer( GL_READ_FRAMEBUFFER, 0 );
	glBindFramebuffer( GL_DRAW_FRAMEBUFFER, 0 );

	m_histHead = ( m_histHead + 1 ) % kHistLayers;
	if( m_histCount < kHistLayers ) m_histCount++;
}

// Sekunden zurück -> Layer-Index (geklemmt auf das, was der Ring hält).
float PresentPass::historyLayerBack( float secs ) const
{
	int slots = int( secs * 30.f + 0.5f );
	if( slots > m_histCount - 1 ) slots = m_histCount - 1;
	if( slots < 1 ) slots = 1;
	int idx = ( m_histHead - slots + 2 * kHistLayers ) % kHistLayers;
	return float( idx );
}

void PresentPass::setLyricsImage( const void *rgba, int w, int h )
{
	uploadRGBA( m_lyricsTex, rgba, w, h );
}

void PresentPass::setArtistImage( const void *rgba, int w, int h )
{
	uploadRGBA( m_artistTex, rgba, w, h );
}

// Frisch gerenderten Titel hochladen; Reveal-Uhr auf 0 (Stil/Seed setzt der
// Aufrufer separat - die Musik-Zuordnung der Stile bleibt seine Sache).
void PresentPass::setTitleImage( const void *rgba, int w, int h )
{
	if( m_titleTex == 0 ) glGenTextures( 1, &m_titleTex );
	glBindTexture( GL_TEXTURE_2D, m_titleTex );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0,
	              GL_RGBA, GL_UNSIGNED_BYTE, rgba );
	// Mipmaps: einige Einflug-Stile verkleinern die Textur zeitweise (z.B.
	// "rises from depth") - ohne Mip-Kette flimmert Text bei Minifikation.
	glGenerateMipmap( GL_TEXTURE_2D );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glBindTexture( GL_TEXTURE_2D, 0 );
	m_titleAspect = float(w) / float(h);
	m_titleAge    = 0.f;
}

/**
 * @brief Run the full present sequence for one frame.
 *
 * Order of operations, and why it's this order:
 *  1. captureHistory() runs FIRST, before anything is presented, so the
 *     ring keeps recording the live frame even while a rewind is being
 *     displayed elsewhere in the pipeline.
 *  2. The brightness limiter samples a small mip of the source texture
 *     (glGetTexImage forces a GPU->CPU sync, so it only runs every 3rd
 *     frame — m_safetyAccumDt tracks the real elapsed time across the
 *     skipped frames so the ~2.0 luma/s cap stays correct either way).
 *     The computed scale can only ever darken (scale <= 1), never brighten.
 *  3. GPU percentile auto-exposure (CfxHistogram.comp) writes straight into
 *     an SSBO that Present.frag reads directly — no CPU sync at all, unlike
 *     the mip-based limiter above.
 *  4. Two-pass quarter-res Gaussian bloom (horizontal+downsample, then
 *     vertical) if the bloom setup succeeded.
 *  5. Present.frag draws at DISPLAY resolution (the only pass that is) —
 *     every optional feature (bloom, title reveal, lyrics/artist overlay,
 *     history-ring rewind/echo, scene-depth parallax) is gated both by its
 *     own runtime readiness flag and by its uniform actually resolving, so
 *     a shader missing an input is silently a no-op for that feature rather
 *     than a broken draw.
 *
 * Sampler-unit discipline: the history-ring array sampler is pinned to unit
 * 5 and the scene-depth sampler to unit 6, unconditionally — even when
 * their amount is 0 and the texture is never bound for this draw, because
 * binding two DIFFERENT sampler types (2D vs 2D array) to the same unit
 * invalidates the whole draw call on some drivers even if the sampler in
 * question is never actually sampled by the shader that frame.
 * @param in Frame inputs; the call is a no-op unless ready() and in.fx is non-null.
 */
void PresentPass::run( const Inputs &in )
{
	if( !m_safetyReady || !in.fx )
		return;
	const AudioFeatures &audioFx = *in.fx;

	// Frame-History-Ring: das frische Frame aufzeichnen, BEVOR irgendetwas
	// präsentiert wird - so speist auch ein laufender Rewind den Ring weiter
	// mit dem Live-Bild (die Pipeline rendert ja normal weiter).
	captureHistory( in.source, in.renderW, in.renderH, in.dtWall );

	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, in.source );
	glGenerateMipmap( GL_TEXTURE_2D );          // every frame (bloom samples a mip)

	// The whole-frame mean comes from a glGetTexImage readback, which forces a
	// GPU→CPU sync stall — costly on weak GPUs.  Do it only every 3rd frame and
	// reuse the brightness scale in between (dt is accumulated so the per-second
	// limit stays correct).  Photosensitivity is unaffected (slow limiter).
	m_safetyAccumDt += in.dtFrame;
	float scale = m_lastSafetyScale;
	if( (++m_safetyFrame % 3) == 0 )
	{
		int maxDim = (in.renderW > in.renderH) ? in.renderW : in.renderH;
		int lvl = 0;
		for( int d = maxDim; d > 4; d >>= 1 ) lvl++;   // a small (<=4 px) mip level
		int lw = 1, lh = 1;
		glGetTexLevelParameteriv( GL_TEXTURE_2D, lvl, GL_TEXTURE_WIDTH,  &lw );
		glGetTexLevelParameteriv( GL_TEXTURE_2D, lvl, GL_TEXTURE_HEIGHT, &lh );
		if( lw < 1 ) lw = 1;
		if( lh < 1 ) lh = 1;
		int npx = lw * lh;
		if( npx > 64 ) npx = 64;
		float buf[ 4 * 64 ];
		glGetTexImage( GL_TEXTURE_2D, lvl, GL_RGBA, GL_FLOAT, buf );
		float mean = 0.f;
		for( int i = 0; i < npx; i++ )
			mean += 0.299f*buf[i*4+0] + 0.587f*buf[i*4+1] + 0.114f*buf[i*4+2];
		mean /= float(npx);

		if( m_prevMeanLum < 0.f ) m_prevMeanLum = mean;
		float maxStep = 2.0f * m_safetyAccumDt;          // <= 2.0 luma / second
		float hi = m_prevMeanLum + maxStep;
		float clamped = (mean > hi) ? hi : mean;         // only limit RISES
		scale = (mean > 1e-4f) ? (clamped / mean) : 1.f;
		if( scale > 1.f ) scale = 1.f;                   // never brighten
		m_prevMeanLum = (mean < m_prevMeanLum) ? mean : clamped;
		m_lastSafetyScale = scale;
		m_safetyAccumDt = 0.f;
	}

	// ---- GPU percentile auto-exposure (Engine/CfxHistogram.comp) ----
	// Writes into an SSBO that Present.frag reads directly, so unlike the
	// mean-luminance limiter above it costs no GPU->CPU sync at all.
	if( !m_autoExpTried )
	{
		m_autoExpTried = true;
		m_autoExpProg = setComputeShader( "..\\Engine\\CfxHistogram.comp" );
		if( m_autoExpProg )
		{
			const float init[4] = { 1.f, 0.5f, 1.f, 0.f };
			glGenBuffers( 1, &m_autoExpBuf );
			glBindBuffer( GL_SHADER_STORAGE_BUFFER, m_autoExpBuf );
			glBufferData( GL_SHADER_STORAGE_BUFFER, sizeof(init), init, GL_DYNAMIC_COPY );
			glBindBuffer( GL_SHADER_STORAGE_BUFFER, 0 );
		}
		fprintf( stderr, "Auto-exposure: %s\n",
		         m_autoExpProg ? "histogram (GPU)" : "off" );
	}
	if( m_autoExpProg && m_autoExpBuf )
	{
		glUseProgram( m_autoExpProg );
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 3, m_autoExpBuf );
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, in.source );
		glUniform1i( glGetUniformLocation( m_autoExpProg, "texFrame" ), 0 );
		glUniform2i( glGetUniformLocation( m_autoExpProg, "size" ), in.renderW, in.renderH );
		glUniform1f( glGetUniformLocation( m_autoExpProg, "target" ), 0.26f );
		glUniform1f( glGetUniformLocation( m_autoExpProg, "maxGain" ), 1.35f );
		glUniform1f( glGetUniformLocation( m_autoExpProg, "slew" ),
		             0.9f * in.dtFrame );
		glDispatchCompute( 1, 1, 1 );
		glMemoryBarrier( GL_SHADER_STORAGE_BARRIER_BIT );
	}

	// ---- Two-pass Gaussian bloom (quarter res) ----
	// Pass 1 extracts the brights from the fresh frame + blurs horizontally
	// while downsampling; pass 2 blurs vertically.  Present adds the result.
	if( m_bloomReady )
	{
		glUseProgram( m_bloomProgId );
		glActiveTexture( GL_TEXTURE0 );

		glBindFramebuffer( GL_FRAMEBUFFER, m_fboBloom[0] );
		glViewport( 0, 0, m_bloomW, m_bloomH );
		glBindTexture( GL_TEXTURE_2D, in.source );
		glUniform1i( m_bloomTexUni, 0 );
		if( m_bloomResUni    >= 0 ) glUniform2f( m_bloomResUni, (float)m_bloomW, (float)m_bloomH );
		if( m_bloomDirUni    >= 0 ) glUniform2f( m_bloomDirUni, 1.f, 0.f );
		if( m_bloomThreshUni >= 0 ) glUniform1f( m_bloomThreshUni, 0.70f );
		drawFullscreen();

		glBindFramebuffer( GL_FRAMEBUFFER, m_fboBloom[1] );
		glBindTexture( GL_TEXTURE_2D, m_texBloom[0] );
		if( m_bloomDirUni    >= 0 ) glUniform2f( m_bloomDirUni, 0.f, 1.f );
		if( m_bloomThreshUni >= 0 ) glUniform1f( m_bloomThreshUni, 0.f );
		drawFullscreen();
	}

	// The present pass is the ONLY one at full display resolution — it upscales
	// the render-resolution result to the window.
	glBindFramebuffer( GL_FRAMEBUFFER, in.targetFbo );
	glViewport( 0, 0, in.displayW, in.displayH );
	glUseProgram( m_presentProgId );
	// The auto-exposure buffer is read by the present FRAGMENT shader, so
	// it has to stay bound at the same point the shader declares (3).
	if( m_autoExpBuf )
		glBindBufferBase( GL_SHADER_STORAGE_BUFFER, 3, m_autoExpBuf );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, in.source );
	glUniform1i( m_presentTexUni, 0 );
	if( m_bloomReady && m_presentBloomTexUni >= 0 )
	{
		glActiveTexture( GL_TEXTURE1 );
		glBindTexture( GL_TEXTURE_2D, m_texBloom[1] );
		glUniform1i( m_presentBloomTexUni, 1 );
		glActiveTexture( GL_TEXTURE0 );
	}
	if( m_presentUseBloomUni >= 0 ) glUniform1f( m_presentUseBloomUni, m_bloomReady ? 1.f : 0.f );
	if( m_presentSwellUni    >= 0 ) glUniform1f( m_presentSwellUni,    audioFx.swell );
	if( m_presentBarPhaseUni >= 0 ) glUniform1f( m_presentBarPhaseUni, audioFx.barPhase );
	if( m_presentCamZoomUni  >= 0 ) glUniform1f( m_presentCamZoomUni,  in.camZoom );
	if( m_presentCamRotUni   >= 0 ) glUniform1f( m_presentCamRotUni,   in.camRot );
	if( m_presentCamOffUni   >= 0 ) glUniform2f( m_presentCamOffUni,   in.camOffX, in.camOffY );
	if( m_presentStereoModeUni  >= 0 ) glUniform1i( m_presentStereoModeUni,  in.stereoMode );
	if( m_presentStereoDepthUni >= 0 ) glUniform1f( m_presentStereoDepthUni, in.stereoDepth );
	if( m_presentStereoSrcUni   >= 0 ) glUniform1i( m_presentStereoSrcUni,   in.stereoPacked ? 1 : 0 );
	// Track-title reveal (phase 0..1 while active; 2 = off).
	if( m_presentTitlePhaseUni >= 0 )
	{
		const float kTitleDur = 8.f;
		float ph = ( m_titleTex != 0 && m_titleAge < kTitleDur )
		         ? ( m_titleAge / kTitleDur ) : 2.f;
		glUniform1f( m_presentTitlePhaseUni, ph );
		if( ph < 1.f && m_presentTitleTexUni >= 0 )
		{
			glActiveTexture( GL_TEXTURE2 );
			glBindTexture( GL_TEXTURE_2D, m_titleTex );
			glUniform1i( m_presentTitleTexUni, 2 );
			glActiveTexture( GL_TEXTURE0 );
			if( m_presentTitleAspectUni >= 0 )
				glUniform1f( m_presentTitleAspectUni, m_titleAspect );
			if( m_presentTitleStyleUni >= 0 )
				glUniform1i( m_presentTitleStyleUni, m_titleStyle );
			if( m_presentTitleSeedUni >= 0 )
				glUniform1f( m_presentTitleSeedUni, m_titleSeed );
		}
	}
	// Lyrics- und Künstlerbild-Overlay (Units 3/4; Alpha 0 = inaktiv).
	if( m_presentLyricsAlphaUni >= 0 )
	{
		float la = ( m_lyricsTex != 0 ) ? in.lyricsAlpha : 0.f;
		glUniform1f( m_presentLyricsAlphaUni, la );
		if( la > 0.001f && m_presentLyricsTexUni >= 0 )
		{
			glActiveTexture( GL_TEXTURE3 );
			glBindTexture( GL_TEXTURE_2D, m_lyricsTex );
			glUniform1i( m_presentLyricsTexUni, 3 );
			glActiveTexture( GL_TEXTURE0 );
			if( m_presentLyricsScrollUni >= 0 ) glUniform1f( m_presentLyricsScrollUni, in.lyricsScrollV );
			if( m_presentLyricsAspectUni >= 0 ) glUniform1f( m_presentLyricsAspectUni, in.lyricsAspect );
			if( m_presentLyricsHlUni     >= 0 ) glUniform3f( m_presentLyricsHlUni,
			                                                 in.lyricsHlV0, in.lyricsHlV1, in.lyricsHlProg );
		}
	}
	if( m_presentArtistAlphaUni >= 0 )
	{
		float aa = ( m_artistTex != 0 ) ? in.artistAlpha : 0.f;
		glUniform1f( m_presentArtistAlphaUni, aa );
		if( aa > 0.001f && m_presentArtistTexUni >= 0 )
		{
			glActiveTexture( GL_TEXTURE4 );
			glBindTexture( GL_TEXTURE_2D, m_artistTex );
			glUniform1i( m_presentArtistTexUni, 4 );
			glActiveTexture( GL_TEXTURE0 );
			if( m_presentArtistAspectUni >= 0 ) glUniform1f( m_presentArtistAspectUni, in.artistAspect );
		}
	}

	// ---- Zeit-Regie: Rewind / Zeitecho / Atem-anhalten ----
	// Der Array-Sampler MUSS immer auf einer eigenen Unit stehen (5): zwei
	// Sampler-TYPEN auf derselben Unit machen den ganzen Draw ungültig,
	// auch wenn der Array-Sampler nie abgetastet wird.
	{
		if( m_presentHistTexUni >= 0 ) glUniform1i( m_presentHistTexUni, 5 );
		float rew = ( m_histReady && m_histCount > 8 )  ? in.rewindMix : 0.f;
		float ech = ( m_histReady && m_histCount > 45 ) ? in.echoAmt   : 0.f;
		if( m_histReady && ( rew > 0.001f || ech > 0.001f ) )
		{
			glActiveTexture( GL_TEXTURE5 );
			glBindTexture( GL_TEXTURE_2D_ARRAY, m_histTex );
			glActiveTexture( GL_TEXTURE0 );
		}
		if( m_presentRewindUni >= 0 )
			glUniform2f( m_presentRewindUni, rew,
			             m_histReady ? historyLayerBack( in.rewindSecs ) : 0.f );
		if( m_presentEchoUni >= 0 )
			glUniform2f( m_presentEchoUni, ech,
			             m_histReady ? historyLayerBack( in.echoDelay ) : 0.f );
		if( m_presentBreathUni >= 0 ) glUniform1f( m_presentBreathUni, in.breath );
		if( m_presentDropUni   >= 0 ) glUniform1f( m_presentDropUni, audioFx.dropPulse );
	}

	// ---- Welle 2: Letterbox, Schockwelle, Palette, Zeilen-Slam, Parallaxe ----
	{
		if( m_presentLetterUni  >= 0 ) glUniform1f( m_presentLetterUni, in.letterbox );
		if( m_presentShockUni   >= 0 ) glUniform2f( m_presentShockUni, in.shockR, in.shockAmp );
		if( m_presentLineAgeUni >= 0 ) glUniform1f( m_presentLineAgeUni, in.lyricsLineAge );
		if( m_presentPalAmtUni  >= 0 ) glUniform1f( m_presentPalAmtUni, in.paletteAmt );
		if( m_presentPalAUni    >= 0 ) glUniform3f( m_presentPalAUni,
		                                    in.paletteA[0], in.paletteA[1], in.paletteA[2] );
		if( m_presentPalBUni    >= 0 ) glUniform3f( m_presentPalBUni,
		                                    in.paletteB[0], in.paletteB[1], in.paletteB[2] );
		// Tiefen-Sampler IMMER auf eigener Unit (6) - siehe histTex-Kommentar.
		if( m_presentSceneDepthUni >= 0 ) glUniform1i( m_presentSceneDepthUni, 6 );
		float dp = ( in.sceneDepthTex != 0 ) ? in.depthPar : 0.f;
		if( dp > 0.001f )
		{
			glActiveTexture( GL_TEXTURE6 );
			glBindTexture( GL_TEXTURE_2D, in.sceneDepthTex );
			glActiveTexture( GL_TEXTURE0 );
		}
		if( m_presentDepthParUni >= 0 ) glUniform1f( m_presentDepthParUni, dp );
		if( m_presentNearFar2Uni >= 0 ) glUniform2f( m_presentNearFar2Uni, in.nearZ, in.farZ );
	}

	if( m_presentResUni   >= 0 ) glUniform2f( m_presentResUni, (float)in.displayW, (float)in.displayH );
	// VJ blackout ('b'): a slewed multiplier on the present brightness
	// scale — window, Spout output and recordings all fade together.
	{
		float blackTarget = in.blackout ? 1.f : 0.f;
		float step = in.dtWall * 3.0f;               // ~0.35 s fade
		if( step > 1.f ) step = 1.f;
		m_blackSmooth += ( blackTarget - m_blackSmooth ) * step;
	}
	// The DJ-stop also dims the held picture slightly (sells the "gasp");
	// a detected FADE-OUT dims a touch too (the room lights come down
	// with the song).
	if( m_presentScaleUni >= 0 )
		glUniform1f( m_presentScaleUni,
		             scale * (1.f - m_blackSmooth) * (1.f - 0.25f * in.breakSmooth)
		                   * (1.f - 0.20f * in.fadeOutEnv) );
	// Global mood grade — gated values (neutral in non-music mode), scaled by the
	// live mood-strength knob (deviations from neutral × moodStrength).
	float ms = in.moodStrength;
	if( m_presentCentroidUni >= 0 ) glUniform1f( m_presentCentroidUni, 0.5f + (audioFx.spectralCentroid - 0.5f) * ms );
	if( m_presentValenceUni  >= 0 ) glUniform1f( m_presentValenceUni,  0.5f + (audioFx.valence          - 0.5f) * ms );
	if( m_presentLevelUni    >= 0 ) glUniform1f( m_presentLevelUni,    audioFx.overallLevel * ms );
	if( m_presentFluxUni     >= 0 ) glUniform1f( m_presentFluxUni,     audioFx.spectralFlux * ms );
	if( m_presentHueUni      >= 0 ) glUniform1f( m_presentHueUni,      audioFx.chromaHue    * ms );
	if( m_presentBeatUni     >= 0 ) glUniform1f( m_presentBeatUni,     audioFx.beatDecay );
	if( m_presentDownbeatUni >= 0 ) glUniform1f( m_presentDownbeatUni, audioFx.downbeat );
	if( m_presentOnsetUni    >= 0 ) glUniform1f( m_presentOnsetUni,    audioFx.onsetStrength );
	// CAS sharpening compensates the upsample when renderScale < 1.
	{
		GLint locSharp = glGetUniformLocation( m_presentProgId, "sharpen" );
		GLint locTexel = glGetUniformLocation( m_presentProgId, "srcTexel" );
		float amt = (in.renderScale < 0.999f)
		          ? clampf( (1.f - in.renderScale) * 0.9f, 0.f, 0.45f ) : 0.f;
		if( locSharp >= 0 ) glUniform1f( locSharp, amt );
		if( locTexel >= 0 ) glUniform2f( locTexel, 1.f / float(in.renderW),
		                                            1.f / float(in.renderH) );
	}
	if( m_presentTimeUni     >= 0 ) glUniform1f( m_presentTimeUni,     in.globalTime );
	if( m_presentChaseUni    >= 0 ) glUniform1f( m_presentChaseUni,    in.chasePhase );
	if( m_presentLampsUni    >= 0 ) glUniform1f( m_presentLampsUni,    in.lightShow );
	drawFullscreen();
}
