#include <cstdio>

#include "PresentPass.h"
#include "shader_setup.h"

// Gemeinsames Fullscreen-Dreieck (gl_VertexID-VAO), definiert in filterShader.cpp.
extern GLuint fullscreenVAO();

static void drawFullscreen()
{
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
}

static bool fbStatusOk()
{
	return true; // wie FilterShader::checkFramebufferStatus (rwrwtest profiling)
}

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
		m_presentProgId   = setShaders( "..\\standard.vert", "..\\Blend\\Present.frag" );
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
		m_bloomProgId    = setShaders( "..\\standard.vert", "..\\Blend\\BloomBlur.frag" );
		m_bloomTexUni    = glGetUniformLocation( m_bloomProgId, "tex" );
		m_bloomResUni    = glGetUniformLocation( m_bloomProgId, "resolution" );
		m_bloomDirUni    = glGetUniformLocation( m_bloomProgId, "dir" );
		m_bloomThreshUni = glGetUniformLocation( m_bloomProgId, "threshold" );
	}
	m_bloomReady = bloomOk && (m_bloomProgId != 0) && (m_bloomTexUni >= 0);
}

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
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glBindTexture( GL_TEXTURE_2D, 0 );
	m_titleAspect = float(w) / float(h);
	m_titleAge    = 0.f;
}

void PresentPass::run( const Inputs &in )
{
	if( !m_safetyReady || !in.fx )
		return;
	const AudioFeatures &audioFx = *in.fx;

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

	// ---- GPU percentile auto-exposure (Blend/CfxHistogram.comp) ----
	// Writes into an SSBO that Present.frag reads directly, so unlike the
	// mean-luminance limiter above it costs no GPU->CPU sync at all.
	if( !m_autoExpTried )
	{
		m_autoExpTried = true;
		m_autoExpProg = setComputeShader( "..\\Blend\\CfxHistogram.comp" );
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
