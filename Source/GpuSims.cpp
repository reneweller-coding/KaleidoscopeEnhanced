/**
 * @file GpuSims.cpp
 * @brief Implementation of GpuSims: sets up and steps the ping-ponged fullscreen-fragment-shader GPU simulations and the two host-computed ring histories described in GpuSims.h.
 */
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

#include "GpuSims.h"
#include "shader_setup.h"

// Gemeinsames Fullscreen-Dreieck (gl_VertexID-VAO), definiert in RenderPipeline.cpp.
extern GLuint fullscreenVAO();   ///< Shared gl_VertexID-based fullscreen-triangle VAO, defined in RenderPipeline.cpp and reused by every sim pass via drawFullscreen().

#ifndef GL_VERTEX_PROGRAM_POINT_SIZE
#define GL_VERTEX_PROGRAM_POINT_SIZE 0x8642
#endif

// Lokale Pendants der (aus Performance-Gründen ohnehin stillgelegten)
// RenderPipeline-Prüfhelfer - identisches Verhalten, keine Abhängigkeit.
/** @brief Local stand-in for RenderPipeline's framebuffer-completeness check; always returns true (the real check is disabled for profiling reasons, see RenderPipeline::checkFramebufferStatus). @return Always true. */
static bool fbStatusOk()
{
	return true; // wie RenderPipeline::checkFramebufferStatus (rwrwtest profiling)
}

/** @brief Local stand-in for RenderPipeline's glGetError polling; intentionally a no-op (disabled for profiling reasons, see RenderPipeline::checkGLErrors). Its unnamed call-site-label parameter is unused. */
static void glErrCheck( const char * /*label*/ )
{
	// wie RenderPipeline::checkGLErrors: deaktiviert (rwrwtest profiling)
}

/** @brief Clears the currently-bound FBO and draws the shared fullscreen triangle. Common draw call issued by every simulation's fragment-shader step. */
void GpuSims::drawFullscreen()
{
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
}

/** @brief Creates/validates all four GPU simulations' resources (FBOs, textures, shader programs). Idempotent; requires a current GL context. */
void GpuSims::setupAll()
{
	// GPU reaction-diffusion simulation buffers + shader.
	setupReactionDiffusion();

	// GPU fluid (curl-noise dye advection) buffers + shader.
	setupFluid();

	// GPU volumetric fire/smoke (tiled-atlas pseudo-3D) buffers + shader.
	setupSmoke3D();

	// Physarum slime-mould simulation (agents + trail map).
	setupPhysarum();
}

/**
 * @brief Advances one frame: always updates the host histories, steps only the demanded GPU sims, and (re)binds their newest textures to the fixed global sampler units.
 * @param audio Current audio-reactive feature snapshot driving every sim's parameters.
 * @param dt Frame delta time in seconds; paces the host histories (SSM/spectrogram).
 * @param need Which simulations this frame actually requires.
 * @param f Per-frame pipeline context (integrated phases, dye source images).
 */
void GpuSims::run( const AudioFeatures &audio, float dt, const Demand &need, const Frame &f )
{
	// Reihenfolge, Sub-Step-Zahlen und Unit-Bindings exakt wie der alte
	// Inline-Block in RenderPipeline::paint().
	if( need.rd && m_rdReady )
	{
		// Several PDE sub-steps per frame so the pattern develops quickly and
		// fills the whole field with lively, evolving structure.
		for( int s = 0; s < 6; ++s )
			stepReactionDiffusion( audio );
		glActiveTexture( GL_TEXTURE7 );
		glBindTexture( GL_TEXTURE_2D, m_texRD[1 - m_rdIdx] );   // newest state
	}

	if( need.fluid && m_fluidReady )
	{
		stepFluid( audio, f );
		glActiveTexture( GL_TEXTURE8 );
		glBindTexture( GL_TEXTURE_2D, m_texFluid[1 - m_fluidIdx] );
	}

	if( need.smoke3D && m_smoke3DReady )
	{
		stepSmoke3D( audio, f );
		glActiveTexture( GL_TEXTURE9 );
		glBindTexture( GL_TEXTURE_2D, m_texSmoke3D[1 - m_smoke3DIdx] );
	}

	if( need.physarum && m_physReady )
	{
		stepPhysarum( audio, f );
		stepPhysarum( audio, f );       // 2 sub-steps: the net develops faster
		glActiveTexture( GL_TEXTURE11 );
		glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[1 - m_physTrailIdx] );
		glActiveTexture( GL_TEXTURE0 );   // see stepFluid(): leave unit 0 selected
	}

	// Historien akkumulieren IMMER; Textur nur bei Bedarf anlegen/hochladen.
	stepSSM( audio, dt );
	if( need.ssm )
		bindSSMTexture();

	stepSpectro( audio, dt );
	if( need.spectro )
		bindSpectroTexture();
}

/**
 * @brief Creates the reaction-diffusion ping-pong FBOs/textures and compiles the Gray-Scott step shader.
 *
 * Create the two RGBA16F ping-pong buffers and the Gray-Scott step shader.  The
 * grid is a fixed, modest size (independent of the window) so it stays cheap even
 * on a weak iGPU.  On any failure m_rdReady stays false and effects that sample
 * the simulation fall back to the source image.
 */
void GpuSims::setupReactionDiffusion()
{
	if( m_rdProgId == 0 )
	{
		m_rdProgId    = setShaders( "..\\standard.vert", "..\\Engine\\ReactionDiffusionSim.frag" );
		m_rdPrevUni   = glGetUniformLocation( m_rdProgId, "texPrev" );
		m_rdResUni    = glGetUniformLocation( m_rdProgId, "resolution" );
		m_rdSeedUni   = glGetUniformLocation( m_rdProgId, "seedMode" );
		m_rdFeedUni   = glGetUniformLocation( m_rdProgId, "feed" );
		m_rdKillUni   = glGetUniformLocation( m_rdProgId, "kill" );
		m_rdInjectUni = glGetUniformLocation( m_rdProgId, "inject" );
	}

	bool rdOk = (m_rdProgId != 0) && (m_rdPrevUni >= 0);
	for( int i = 0; i < 2 && rdOk; ++i )
	{
		if( m_texRD[i] == 0 ) glGenTextures( 1, &m_texRD[i] );
		glBindTexture( GL_TEXTURE_2D, m_texRD[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kRDSize, kRDSize, 0,
		              GL_RGBA, GL_FLOAT, NULL );
		if( m_fboRD[i] == 0 ) glGenFramebuffers( 1, &m_fboRD[i] );
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboRD[i] );
		glFramebufferTexture2D( GL_FRAMEBUFFER, kAttach,
		                           GL_TEXTURE_2D, m_texRD[i], 0 );
		if( !fbStatusOk() ) rdOk = false;
	}
	glBindFramebuffer( GL_FRAMEBUFFER, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );

	m_rdReady  = rdOk;
	m_rdSeeded = false;   // first step writes the seed pattern
	glErrCheck("setupReactionDiffusion()");
}

/**
 * @brief Creates the fluid-dye ping-pong FBOs/textures and compiles the curl-noise advection shader.
 *
 * Create the fluid dye ping-pong buffers and the advection shader.  Same
 * fail-safe pattern as the RD sim: on any failure m_fluidReady stays false and
 * Fluid.frag degrades to its image fallback.
 */
void GpuSims::setupFluid()
{
	if( m_fluidProgId == 0 )
	{
		m_fluidProgId     = setShaders( "..\\standard.vert", "..\\Engine\\FluidSim.frag" );
		m_fluidPrevUni    = glGetUniformLocation( m_fluidProgId, "texPrev" );
		m_fluidTex0Uni    = glGetUniformLocation( m_fluidProgId, "tex0" );
		m_fluidTex1Uni    = glGetUniformLocation( m_fluidProgId, "tex1" );
		m_fluidInterpUni  = glGetUniformLocation( m_fluidProgId, "interpolation" );
		m_fluidResUni     = glGetUniformLocation( m_fluidProgId, "resolution" );
		m_fluidSeedUni    = glGetUniformLocation( m_fluidProgId, "seedMode" );
		m_fluidPhaseUni   = glGetUniformLocation( m_fluidProgId, "flowPhase" );
		m_fluidImpulseUni = glGetUniformLocation( m_fluidProgId, "impulse" );
		m_fluidInjectUni  = glGetUniformLocation( m_fluidProgId, "injectAmt" );
	}

	bool ok = (m_fluidProgId != 0) && (m_fluidPrevUni >= 0);
	for( int i = 0; i < 2 && ok; ++i )
	{
		if( m_texFluid[i] == 0 ) glGenTextures( 1, &m_texFluid[i] );
		glBindTexture( GL_TEXTURE_2D, m_texFluid[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kFluidSize, kFluidSize, 0,
		              GL_RGBA, GL_FLOAT, NULL );
		if( m_fboFluid[i] == 0 ) glGenFramebuffers( 1, &m_fboFluid[i] );
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboFluid[i] );
		glFramebufferTexture2D( GL_FRAMEBUFFER, kAttach,
		                           GL_TEXTURE_2D, m_texFluid[i], 0 );
		if( !fbStatusOk() ) ok = false;
	}
	glBindFramebuffer( GL_FRAMEBUFFER, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );

	m_fluidReady  = ok;
	m_fluidSeeded = false;
	glErrCheck("setupFluid()");
}

/**
 * @brief Advances the curl-noise dye advection by one step into the next ping-pong buffer.
 * @param audio Current audio features; drives the swirl impulse and dye-injection amount.
 * @param f Per-frame context supplying the integrated flow phase and the two dye source textures.
 *
 * Advance the dye advection by one step into the next ping-pong buffer.
 */
void GpuSims::stepFluid(const AudioFeatures &audio, const Frame &f)
{
	if( !m_fluidReady )
		return;

	const int cur  = m_fluidIdx;
	const int prev = 1 - m_fluidIdx;

	glBindFramebuffer( GL_FRAMEBUFFER, m_fboFluid[cur] );
	glViewport( 0, 0, kFluidSize, kFluidSize );
	glUseProgram( m_fluidProgId );

	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texFluid[prev] );
	// The dye sources are the two cross-fading photographs, and the second one
	// does not exist yet on the first frames (nor at all with a single image).
	// Binding 0 there left the sampler incomplete for the whole draw.
	glActiveTexture( GL_TEXTURE1 );
	glBindTexture( GL_TEXTURE_2D, f.dyeTexA ? f.dyeTexA : glcoreDummyTex2D() );
	glActiveTexture( GL_TEXTURE2 );
	glBindTexture( GL_TEXTURE_2D, f.dyeTexB ? f.dyeTexB : glcoreDummyTex2D() );
	glUniform1i( m_fluidPrevUni, 0 );
	if( m_fluidTex0Uni   >= 0 ) glUniform1i( m_fluidTex0Uni, 1 );
	if( m_fluidTex1Uni   >= 0 ) glUniform1i( m_fluidTex1Uni, 2 );
	if( m_fluidInterpUni >= 0 ) glUniform1f( m_fluidInterpUni, f.dyeInterp );
	if( m_fluidResUni    >= 0 ) glUniform2f( m_fluidResUni, (float)kFluidSize, (float)kFluidSize );
	if( m_fluidSeedUni   >= 0 ) glUniform1f( m_fluidSeedUni, m_fluidSeeded ? 0.f : 1.f );
	// Flow field evolution rides the integrated phase (jump-free); the
	// slew-limited bass powers the swirl, onsets inject extra dye.
	if( m_fluidPhaseUni   >= 0 ) glUniform1f( m_fluidPhaseUni,
	                                          f.globalTime * 0.05f + f.audioAdvance * 0.20f );
	if( m_fluidImpulseUni >= 0 ) glUniform1f( m_fluidImpulseUni,
	                                          audio.bassLevel * 0.7f + audio.beatDecay * 0.3f );
	if( m_fluidInjectUni  >= 0 ) glUniform1f( m_fluidInjectUni,
	                                          0.012f + 0.020f * audio.onsetStrength );

	drawFullscreen();

	// Unit 0, not a stray unbind. The old glBindTexture(0) here ran with
	// unit 2 still selected and so left THAT unit empty while this program
	// stayed bound with tex1 pointing at it -- an incomplete sampler for
	// every following validation, which the driver reported by the hundred.
	// glActiveTexture is global state; a function that moves it owes the
	// next caller a reset, or that caller's unqualified glBindTexture lands
	// on a unit it never asked for.
	glActiveTexture( GL_TEXTURE0 );
	m_fluidSeeded = true;
	m_fluidIdx    = prev;   // newest state is now m_texFluid[1 - m_fluidIdx]
}

/**
 * @brief Creates the smoke/fire tiled-atlas ping-pong FBOs/textures and compiles the sim shader.
 *
 * Create the smoke/fire ping-pong buffers and the sim shader.  Same fail-safe
 * pattern as RD/Fluid: on any failure m_smoke3DReady stays false and
 * VolumetricFire.frag degrades to an empty (black) field.
 */
void GpuSims::setupSmoke3D()
{
	if( m_smoke3DProgId == 0 )
	{
		m_smoke3DProgId       = setShaders( "..\\standard.vert", "..\\Engine\\Smoke3DSim.frag" );
		m_smoke3DPrevUni      = glGetUniformLocation( m_smoke3DProgId, "texPrev" );
		m_smoke3DResUni       = glGetUniformLocation( m_smoke3DProgId, "resolution" );
		m_smoke3DSeedUni      = glGetUniformLocation( m_smoke3DProgId, "seedMode" );
		m_smoke3DSubUni       = glGetUniformLocation( m_smoke3DProgId, "subStep" );
		m_smoke3DTimeUni      = glGetUniformLocation( m_smoke3DProgId, "time" );
		m_smoke3DTurbUni      = glGetUniformLocation( m_smoke3DProgId, "turbulence" );
		m_smoke3DInjectUni    = glGetUniformLocation( m_smoke3DProgId, "injectAmt" );
		m_smoke3DEmitPhaseUni = glGetUniformLocation( m_smoke3DProgId, "emitterPhase" );
	}

	bool ok = (m_smoke3DProgId != 0) && (m_smoke3DPrevUni >= 0);
	for( int i = 0; i < 2 && ok; ++i )
	{
		if( m_texSmoke3D[i] == 0 ) glGenTextures( 1, &m_texSmoke3D[i] );
		glBindTexture( GL_TEXTURE_2D, m_texSmoke3D[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kSmoke3DW, kSmoke3DH, 0,
		              GL_RGBA, GL_FLOAT, NULL );
		if( m_fboSmoke3D[i] == 0 ) glGenFramebuffers( 1, &m_fboSmoke3D[i] );
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboSmoke3D[i] );
		glFramebufferTexture2D( GL_FRAMEBUFFER, kAttach,
		                           GL_TEXTURE_2D, m_texSmoke3D[i], 0 );
		if( !fbStatusOk() ) ok = false;
	}
	glBindFramebuffer( GL_FRAMEBUFFER, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );

	m_smoke3DReady  = ok;
	m_smoke3DSeeded = false;
	glErrCheck("setupSmoke3D()");
}

/**
 * @brief Runs one sub-step of the smoke/fire PDE (horizontal or vertical half) into the next ping-pong buffer.
 * @param audio Current audio features; drives per-cell turbulence and base-cell fuel injection.
 * @param f Per-frame context (time, integrated emitter-wander phase).
 * @param subStep Which half of the PDE this pass computes (0 = horizontal, 1 = vertical); forwarded to the shader as-is.
 *
 * One sub-step (horizontal turbulence+injection, or vertical buoyancy) into the
 * next ping-pong buffer.  Calling this twice per frame (see stepSmoke3D) with
 * the two different subStep values advances both halves of the PDE.
 */
void GpuSims::stepSmoke3DPass(const AudioFeatures &audio, const Frame &f, float subStep)
{
	const int cur  = m_smoke3DIdx;
	const int prev = 1 - m_smoke3DIdx;

	glBindFramebuffer( GL_FRAMEBUFFER, m_fboSmoke3D[cur] );
	glViewport( 0, 0, kSmoke3DW, kSmoke3DH );
	glUseProgram( m_smoke3DProgId );

	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texSmoke3D[prev] );
	glUniform1i( m_smoke3DPrevUni, 0 );
	if( m_smoke3DResUni  >= 0 ) glUniform2f( m_smoke3DResUni, (float)kSmoke3DW, (float)kSmoke3DH );
	if( m_smoke3DSeedUni >= 0 ) glUniform1f( m_smoke3DSeedUni, m_smoke3DSeeded ? 0.f : 1.f );
	if( m_smoke3DSubUni  >= 0 ) glUniform1f( m_smoke3DSubUni, subStep );
	if( m_smoke3DTimeUni >= 0 ) glUniform1f( m_smoke3DTimeUni, f.globalTime );
	// Treble/onset energy drives per-cell turbulence; kick/bass/drop drives how
	// hard fresh fuel is injected at the base cells.
	if( m_smoke3DTurbUni >= 0 ) glUniform1f( m_smoke3DTurbUni,
	                                         0.8f + 1.8f * audio.highLevel + 1.4f * audio.onsetStrength
	                                              + 1.2f * audio.onsetKick );
	if( m_smoke3DInjectUni >= 0 ) glUniform1f( m_smoke3DInjectUni,
	                                           0.20f + 0.40f * audio.bassLevel
	                                                 + 0.90f * audio.onsetKick
	                                                 + 0.70f * audio.dropPulse );
	// Wandering emitter positions ride the integrated advance phase (jump-free).
	if( m_smoke3DEmitPhaseUni >= 0 ) glUniform1f( m_smoke3DEmitPhaseUni, f.audioAdvance * 0.5f );

	drawFullscreen();

	glBindTexture( GL_TEXTURE_2D, 0 );
	m_smoke3DSeeded = true;
	m_smoke3DIdx    = prev;
}

/**
 * @brief Advances the smoke/fire volume by one full frame: a horizontal pass followed by a vertical pass, each its own ping-pong swap.
 * @param audio Current audio features, forwarded unchanged to both sub-step passes.
 * @param f Per-frame context, forwarded unchanged to both sub-step passes.
 *
 * Advance the fire/smoke volume by one full frame: a horizontal pass followed
 * by a vertical pass, each its own ping-pong swap (mirrors the RD sim's
 * multi-substep-per-frame pattern so structure develops quickly).
 */
void GpuSims::stepSmoke3D(const AudioFeatures &audio, const Frame &f)
{
	if( !m_smoke3DReady )
		return;

	stepSmoke3DPass( audio, f, 0.f );   // horizontal: turbulence + injection + decay
	stepSmoke3DPass( audio, f, 1.f );   // vertical: buoyant rise + cross-cell softening
}

/**
 * @brief Creates the Physarum agent/trail buffers and the three programs (agent update, deposit, diffuse).
 *
 * Create the Physarum buffers + the three programs.  Same fail-safe pattern
 * as RD/Fluid/Smoke3D: any failure leaves m_physReady false and the display
 * effect degrades to a dark field.
 */
void GpuSims::setupPhysarum()
{
	if( m_physAgentProgId == 0 )
	{
		m_physAgentProgId   = setShaders( "..\\standard.vert", "..\\Engine\\PhysarumAgents.frag" );
		m_physAgentTexUni   = glGetUniformLocation( m_physAgentProgId, "texAgents" );
		m_physAgentTrailUni = glGetUniformLocation( m_physAgentProgId, "texTrail" );
		m_physAgentResUni   = glGetUniformLocation( m_physAgentProgId, "resolution" );
		m_physAgentSeedUni  = glGetUniformLocation( m_physAgentProgId, "seedMode" );
		m_physAgentTimeUni  = glGetUniformLocation( m_physAgentProgId, "time" );
		m_physAgentSpeedUni = glGetUniformLocation( m_physAgentProgId, "speed" );
		m_physAgentSensAUni = glGetUniformLocation( m_physAgentProgId, "sensAngle" );
		m_physAgentSensDUni = glGetUniformLocation( m_physAgentProgId, "sensDist" );
		m_physAgentTurnUni  = glGetUniformLocation( m_physAgentProgId, "turnRate" );
		m_physAgentScatUni  = glGetUniformLocation( m_physAgentProgId, "scatter" );
	}
	if( m_physDepositProgId == 0 )
	{
		// The deposit pass needs a REAL vertex shader (VTF) — setShadersVF.
		m_physDepositProgId = setShadersVF( "..\\Engine\\PhysarumDeposit.vert",
		                                    "..\\Engine\\PhysarumDeposit.frag" );
		m_physDepAgentsUni  = glGetUniformLocation( m_physDepositProgId, "texAgents" );
		m_physDepAmtUni     = glGetUniformLocation( m_physDepositProgId, "depositAmt" );
		m_physDepAttr       = glGetAttribLocation(  m_physDepositProgId, "aTexel" );
	}
	if( m_physDiffuseProgId == 0 )
	{
		m_physDiffuseProgId = setShaders( "..\\standard.vert", "..\\Engine\\PhysarumDiffuse.frag" );
		m_physDifTrailUni   = glGetUniformLocation( m_physDiffuseProgId, "texTrail" );
		m_physDifResUni     = glGetUniformLocation( m_physDiffuseProgId, "resolution" );
		m_physDifDecayUni   = glGetUniformLocation( m_physDiffuseProgId, "decay" );

		// Proof port of the GL 4.3 compute path: same diffuse as an image-
		// store kernel.  Soft-fails to 0 -> the fragment pass above stays.
		m_physDiffuseCompId = setComputeShader( "..\\Engine\\PhysarumDiffuse.comp" );
		if( m_physDiffuseCompId )
		{
			m_physDifCTrailUni = glGetUniformLocation( m_physDiffuseCompId, "texTrail" );
			m_physDifCResUni   = glGetUniformLocation( m_physDiffuseCompId, "resolution" );
			m_physDifCDecayUni = glGetUniformLocation( m_physDiffuseCompId, "decay" );
		}
		fprintf( stderr, "PHYSARUM diffuse: %s path\n",
		         m_physDiffuseCompId ? "compute" : "fragment" );
	}

	bool ok = m_physAgentProgId != 0 && m_physDepositProgId != 0
	       && m_physDiffuseProgId != 0 && m_physAgentTexUni >= 0
	       && m_physDepAttr >= 0;

	for( int i = 0; i < 2 && ok; ++i )
	{
		if( m_texPhysAgents[i] == 0 ) glGenTextures( 1, &m_texPhysAgents[i] );
		glBindTexture( GL_TEXTURE_2D, m_texPhysAgents[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kPhysAgentsSide, kPhysAgentsSide,
		              0, GL_RGBA, GL_FLOAT, NULL );
		if( m_fboPhysAgents[i] == 0 ) glGenFramebuffers( 1, &m_fboPhysAgents[i] );
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboPhysAgents[i] );
		glFramebufferTexture2D( GL_FRAMEBUFFER, kAttach,
		                           GL_TEXTURE_2D, m_texPhysAgents[i], 0 );
		if( !fbStatusOk() ) ok = false;

		if( m_texPhysTrail[i] == 0 ) glGenTextures( 1, &m_texPhysTrail[i] );
		glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[i] );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA16F, kPhysTrailSize, kPhysTrailSize,
		              0, GL_RGBA, GL_FLOAT, NULL );
		if( m_fboPhysTrail[i] == 0 ) glGenFramebuffers( 1, &m_fboPhysTrail[i] );
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboPhysTrail[i] );
		glFramebufferTexture2D( GL_FRAMEBUFFER, kAttach,
		                           GL_TEXTURE_2D, m_texPhysTrail[i], 0 );
		if( !fbStatusOk() ) ok = false;
		if( ok )
		{
			glClearColor( 0.f, 0.f, 0.f, 0.f );
			glClear( GL_COLOR_BUFFER_BIT );
		}
	}

	// One point per agent; the only attribute is the agent's texel coord.
	if( ok && m_physVBO == 0 )
	{
		std::vector<float> v;
		v.reserve( size_t(kPhysAgentsSide) * kPhysAgentsSide * 2 );
		for( int y = 0; y < kPhysAgentsSide; ++y )
			for( int x = 0; x < kPhysAgentsSide; ++x )
			{
				v.push_back( (x + 0.5f) / float(kPhysAgentsSide) );
				v.push_back( (y + 0.5f) / float(kPhysAgentsSide) );
			}
		glGenBuffers( 1, &m_physVBO );
		glBindBuffer( GL_ARRAY_BUFFER, m_physVBO );
		glBufferData( GL_ARRAY_BUFFER, GLsizeiptr(v.size() * sizeof(float)),
		              v.data(), GL_STATIC_DRAW );
		glBindBuffer( GL_ARRAY_BUFFER, 0 );
	}
	if( ok && m_physDepVAO == 0 )
	{
		glGenVertexArrays( 1, &m_physDepVAO );
		glBindVertexArray( m_physDepVAO );
		glBindBuffer( GL_ARRAY_BUFFER, m_physVBO );
		glEnableVertexAttribArray( GLuint(m_physDepAttr) );
		glVertexAttribPointer( GLuint(m_physDepAttr), 2, GL_FLOAT, GL_FALSE,
		                       2 * sizeof(float), (const void *) 0 );
		glBindVertexArray( 0 );
		glBindBuffer( GL_ARRAY_BUFFER, 0 );
	}

	glBindFramebuffer( GL_FRAMEBUFFER, 0 );
	glBindTexture( GL_TEXTURE_2D, 0 );
	m_physReady  = ok;
	m_physSeeded = false;
	glErrCheck("setupPhysarum()");
}

/**
 * @brief Advances the Physarum slime-mould sim by one frame: agent update, pheromone deposit, then trail diffuse+evaporate.
 * @param audio Current audio features; drives agent speed/sensor angle/turn rate/scatter and deposit amount.
 * @param f Per-frame context; supplies time to the agent-update shader.
 *
 * One full Physarum frame: agents sense/turn/move (ping-pong), deposit their
 * pheromone points, then the trail map diffuses + evaporates (ping-pong).
 */
void GpuSims::stepPhysarum(const AudioFeatures &audio, const Frame &f)
{
	if( !m_physReady )
		return;

	const int aCur  = m_physAgentIdx, aPrev = 1 - m_physAgentIdx;
	const int tCur  = m_physTrailIdx, tPrev = 1 - m_physTrailIdx;

	// ---- 1) Agent update ----
	glBindFramebuffer( GL_FRAMEBUFFER, m_fboPhysAgents[aCur] );
	glViewport( 0, 0, kPhysAgentsSide, kPhysAgentsSide );
	glUseProgram( m_physAgentProgId );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texPhysAgents[aPrev] );
	glActiveTexture( GL_TEXTURE1 );
	glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[tPrev] );
	glUniform1i( m_physAgentTexUni, 0 );
	if( m_physAgentTrailUni >= 0 ) glUniform1i( m_physAgentTrailUni, 1 );
	if( m_physAgentResUni   >= 0 ) glUniform2f( m_physAgentResUni,
	                                            (float)kPhysAgentsSide, (float)kPhysAgentsSide );
	if( m_physAgentSeedUni  >= 0 ) glUniform1f( m_physAgentSeedUni, m_physSeeded ? 0.f : 1.f );
	if( m_physAgentTimeUni  >= 0 ) glUniform1f( m_physAgentTimeUni, f.globalTime );
	// Audio character: bright material makes tight directed veins, loud
	// passages speed the swarm up, hard kicks scatter part of it.
	if( m_physAgentSpeedUni >= 0 ) glUniform1f( m_physAgentSpeedUni,
	                                            0.0016f + 0.0022f * audio.overallLevel
	                                                    + 0.0018f * audio.onsetKick );
	if( m_physAgentSensAUni >= 0 ) glUniform1f( m_physAgentSensAUni,
	                                            0.75f - 0.35f * audio.spectralCentroid );
	if( m_physAgentSensDUni >= 0 ) glUniform1f( m_physAgentSensDUni, 0.014f );
	if( m_physAgentTurnUni  >= 0 ) glUniform1f( m_physAgentTurnUni,
	                                            0.30f + 0.25f * audio.onsetStrength );
	if( m_physAgentScatUni  >= 0 ) glUniform1f( m_physAgentScatUni,
	                                            ( audio.onsetKick > 0.75f ) ? 0.10f : 0.f );
	drawFullscreen();

	// ---- 2) Deposit: 65k points into the CURRENT trail (additive) ----
	glBindFramebuffer( GL_FRAMEBUFFER, m_fboPhysTrail[tPrev] );
	glViewport( 0, 0, kPhysTrailSize, kPhysTrailSize );
	glUseProgram( m_physDepositProgId );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texPhysAgents[aCur] );
	if( m_physDepAgentsUni >= 0 ) glUniform1i( m_physDepAgentsUni, 0 );
	if( m_physDepAmtUni    >= 0 ) glUniform1f( m_physDepAmtUni,
	                                           0.06f + 0.05f * audio.onsetStrength );
	glEnable( GL_BLEND );
	glBlendFunc( GL_ONE, GL_ONE );
	glEnable( GL_VERTEX_PROGRAM_POINT_SIZE );
	glBindVertexArray( m_physDepVAO );
	glDrawArrays( GL_POINTS, 0, kPhysAgentsSide * kPhysAgentsSide );
	glBindVertexArray( 0 );
	glDisable( GL_VERTEX_PROGRAM_POINT_SIZE );
	glDisable( GL_BLEND );

	// ---- 3) Diffuse + evaporate into the other trail buffer ----
	const float difDecay = 0.94f + 0.02f * audio.ambientFactor;
	if( m_physDiffuseCompId )
	{
		// Compute path: identical kernel, image store instead of an FBO pass.
		glUseProgram( m_physDiffuseCompId );
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[tPrev] );
		if( m_physDifCTrailUni >= 0 ) glUniform1i( m_physDifCTrailUni, 0 );
		if( m_physDifCResUni   >= 0 ) glUniform2f( m_physDifCResUni,
		                                           (float)kPhysTrailSize, (float)kPhysTrailSize );
		if( m_physDifCDecayUni >= 0 ) glUniform1f( m_physDifCDecayUni, difDecay );
		glBindImageTexture( 0, m_texPhysTrail[tCur], 0, GL_FALSE, 0,
		                    GL_WRITE_ONLY, GL_RGBA16F );
		glDispatchCompute( GLuint(kPhysTrailSize / 16), GLuint(kPhysTrailSize / 16), 1 );
		// The written trail is next SAMPLED (agents/display) and rendered
		// INTO by the deposit pass — fence both kinds of downstream access.
		glMemoryBarrier( GL_TEXTURE_FETCH_BARRIER_BIT | GL_FRAMEBUFFER_BARRIER_BIT );
	}
	else
	{
		glBindFramebuffer( GL_FRAMEBUFFER, m_fboPhysTrail[tCur] );
		glUseProgram( m_physDiffuseProgId );
		glActiveTexture( GL_TEXTURE0 );
		glBindTexture( GL_TEXTURE_2D, m_texPhysTrail[tPrev] );
		if( m_physDifTrailUni >= 0 ) glUniform1i( m_physDifTrailUni, 0 );
		if( m_physDifResUni   >= 0 ) glUniform2f( m_physDifResUni,
		                                          (float)kPhysTrailSize, (float)kPhysTrailSize );
		if( m_physDifDecayUni >= 0 ) glUniform1f( m_physDifDecayUni, difDecay );
		drawFullscreen();
	}

	glBindTexture( GL_TEXTURE_2D, 0 );
	m_physSeeded   = true;
	m_physAgentIdx = aPrev;
	m_physTrailIdx = tPrev;
}

/**
 * @brief Accumulates one row/column of the self-similarity matrix roughly every kSSMStride seconds.
 * @param a Current audio features (chroma bins and spectrum) that source the feature vector.
 * @param dt Frame delta time in seconds; paces the accumulation.
 *
 * Accumulate the self-similarity matrix: every kSSMStride seconds push one
 * feature vector (12 chroma bins + 8 coarse spectral-shape dims, unit-
 * normalised) into the ring and fill its row+column with sharpened cosine
 * similarity.  CPU-only and cheap, so it runs EVERY frame regardless of what
 * is on screen — the history must exist BEFORE the SelfSimilarity effect
 * appears, not start from black.
 */
void GpuSims::stepSSM(const AudioFeatures &a, float dt)
{
	m_ssmAccum += dt;
	if( m_ssmAccum < kSSMStride )
		return;
	m_ssmAccum = fmodf( m_ssmAccum, kSSMStride );

	float v[kSSMDims];
	for( int i = 0; i < 12; ++i )
		v[i] = a.chroma[i];
	// Coarse spectral shape: 32 bands averaged down to 8 (weighted a touch
	// below the chroma so HARMONY dominates the structure comparison).
	for( int i = 0; i < 8; ++i )
	{
		float s = 0.f;
		for( int k = 0; k < 4; ++k )
			s += a.spectrum[i * 4 + k];
		v[12 + i] = s * 0.125f;
	}
	float n2 = 0.f;
	for( int i = 0; i < kSSMDims; ++i ) n2 += v[i] * v[i];
	if( n2 < 1e-8f )
		return;                        // silence: keep the last written entry
	float inv = 1.f / sqrtf( n2 );
	for( int i = 0; i < kSSMDims; ++i ) v[i] *= inv;

	const int h = m_ssmHead;
	memcpy( m_ssmVecs[h], v, sizeof(v) );
	for( int j = 0; j < kSSMSize; ++j )
	{
		float d = 0.f;
		for( int i = 0; i < kSSMDims; ++i )
			d += v[i] * m_ssmVecs[j][i];
		d = ( d < 0.f ) ? 0.f : d;
		d = d * d * d;                 // sharpen: only real similarity stays bright
		unsigned char byte = (unsigned char)( d * 255.f + 0.5f );
		m_ssmData[h * kSSMSize + j] = byte;   // row
		m_ssmData[j * kSSMSize + h] = byte;   // column (symmetric)
	}
	m_ssmHead  = ( h + 1 ) % kSSMSize;
	if( m_ssmCount < kSSMSize ) ++m_ssmCount;
	m_ssmDirty = true;
}

/**
 * @brief Pushes newly-due rows of the scrolling spectrogram history from the current spectrum.
 * @param a Current audio features (normalized spectrum bands) that source each new row.
 * @param dt Frame delta time in seconds; paces row emission.
 *
 * Push one row of the spectrogram history.  Several rows can fall due in a
 * single frame after a hitch, hence the while loop — dropping them instead
 * would make the scroll speed depend on the frame rate.
 */
void GpuSims::stepSpectro(const AudioFeatures &a, float dt)
{
	m_spectroAccum += dt;
	int rows = 0;
	while( m_spectroAccum >= kSpectroStride && rows < 8 )
	{
		m_spectroAccum -= kSpectroStride;
		++rows;

		unsigned char *dst = m_spectroData + size_t(m_spectroHead) * kSpectroW;
		for( int i = 0; i < kSpectroW; ++i )
		{
			// The bands are already self-normalised 0..1; the mild curve lifts
			// the quiet ones so the far end of the history does not flatten.
			float v = a.spectrum[i];
			v = ( v <= 0.f ) ? 0.f : powf( v, 0.75f );
			if( v > 1.f ) v = 1.f;
			dst[i] = (unsigned char)( v * 255.f + 0.5f );
		}
		m_spectroHead = ( m_spectroHead + 1 ) % kSpectroH;
		if( m_spectroCount < kSpectroH ) ++m_spectroCount;
		if( m_spectroPend < kSpectroH ) ++m_spectroPend;
	}
	if( m_spectroAccum > kSpectroStride * 8.f )
		m_spectroAccum = 0.f;             // a long stall: resync rather than catch up
}

/**
 * @brief Advances the Gray-Scott reaction-diffusion sim by one step into the next ping-pong buffer.
 * @param audio Current audio features; drives the feed/kill parameter wander and the reagent-injection trigger.
 *
 * Advance the Gray-Scott simulation by one step into the next ping-pong buffer.
 */
void GpuSims::stepReactionDiffusion(const AudioFeatures &audio)
{
	if( !m_rdReady )
		return;

	const int cur  = m_rdIdx;
	const int prev = 1 - m_rdIdx;

	glBindFramebuffer( GL_FRAMEBUFFER, m_fboRD[cur] );
	glViewport( 0, 0, kRDSize, kRDSize );
	glUseProgram( m_rdProgId );

	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, m_texRD[prev] );
	glUniform1i( m_rdPrevUni, 0 );
	if( m_rdResUni  >= 0 ) glUniform2f( m_rdResUni, (float)kRDSize, (float)kRDSize );
	if( m_rdSeedUni >= 0 ) glUniform1f( m_rdSeedUni, m_rdSeeded ? 0.f : 1.f );

	// Wander Pearson's Gray-Scott parameter space with the music (the
	// research-paper mapping): the spectral centroid slides the KILL rate so
	// bright material morphs the tissue toward worm-like meanders and dark
	// material toward coral/spot patterns, while bass transients pulse the
	// FEED rate — sudden extra feed reads as cell division (mitosis bursts).
	// Both stay clamped inside the stable valley around the old fixed point
	// (F=0.0545, k=0.062) so the simulation can neither die out nor explode.
	float rdKill = 0.0660f - 0.0070f * audio.spectralCentroid;
	float rdFeed = 0.0500f + 0.0120f * audio.swell
	             + 0.0160f * audio.beatDecay;
	rdKill = std::min( std::max( rdKill, 0.058f ), 0.066f );
	rdFeed = std::min( std::max( rdFeed, 0.035f ), 0.070f );
	if( m_rdFeedUni >= 0 ) glUniform1f( m_rdFeedUni, rdFeed );
	if( m_rdKillUni >= 0 ) glUniform1f( m_rdKillUni, rdKill );
	// Onsets / beats inject fresh reagent so the field blossoms with the music.
	float inject = (audio.onsetStrength > 0.2f || audio.beatDecay > 0.3f) ? 1.f : 0.f;
	if( m_rdInjectUni >= 0 ) glUniform1f( m_rdInjectUni, inject );

	drawFullscreen();

	glBindTexture( GL_TEXTURE_2D, 0 );
	m_rdSeeded = true;
	m_rdIdx    = prev;   // ping-pong swap; newest state is now m_texRD[1 - m_rdIdx]
}

// SSM-Textur (Unit 10): lazy anlegen, bei Änderung komplett hochladen.
/** @brief Lazily creates the SSM texture (unit 10) and re-uploads it whole whenever the matrix data is dirty. */
void GpuSims::bindSSMTexture()
{
	if( m_texSSM == 0 )
	{
		glGenTextures( 1, &m_texSSM );
		glBindTexture( GL_TEXTURE_2D, m_texSSM );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_R8, kSSMSize, kSSMSize, 0,
		              GL_RED, GL_UNSIGNED_BYTE, NULL );
	}
	glActiveTexture( GL_TEXTURE10 );
	glBindTexture( GL_TEXTURE_2D, m_texSSM );
	if( m_ssmDirty )
	{
		glPixelStorei( GL_UNPACK_ALIGNMENT, 1 );
		glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0, kSSMSize, kSSMSize,
		                 GL_RED, GL_UNSIGNED_BYTE, m_ssmData );
		glPixelStorei( GL_UNPACK_ALIGNMENT, 4 );
		m_ssmDirty = false;
	}
	glActiveTexture( GL_TEXTURE0 );   // see stepFluid()
}

// Spektrogramm-Textur (Unit 28): lazy anlegen, nur die seit dem letzten
// Upload geschriebenen Zeilen hochladen (ggf. am Ring-Wrap gesplittet).
/**
 * @brief Lazily creates the spectrogram texture (unit 28) and uploads only the rows written since the last upload.
 *
 * A freshly-created texture uploads the whole ring (m_spectroPend forced to
 * kSpectroH). Otherwise only the pending run of rows is uploaded, split
 * into two glTexSubImage2D calls when that run straddles the ring's wrap
 * (i.e. the newest rows are physically split between the end and the
 * start of m_spectroData).
 */
void GpuSims::bindSpectroTexture()
{
	if( m_texSpectro == 0 )
	{
		glGenTextures( 1, &m_texSpectro );
		glBindTexture( GL_TEXTURE_2D, m_texSpectro );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
		// S = frequency: clamped, or the lowest band would bleed into the
		// highest across the seam.  T = time: repeats, because it is a ring.
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_R8, kSpectroW, kSpectroH, 0,
		              GL_RED, GL_UNSIGNED_BYTE, NULL );
		m_spectroPend = kSpectroH;    // fresh texture: upload the whole ring
	}
	glActiveTexture( GL_TEXTURE28 );
	glBindTexture( GL_TEXTURE_2D, m_texSpectro );
	if( m_spectroPend > 0 )
	{
		glPixelStorei( GL_UNPACK_ALIGNMENT, 1 );
		if( m_spectroPend >= kSpectroH )
		{
			glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0, kSpectroW, kSpectroH,
			                 GL_RED, GL_UNSIGNED_BYTE, m_spectroData );
		}
		else
		{
			// Only the rows written since the last upload; the block can
			// straddle the ring's wrap, so it may need two uploads.
			int first = ( m_spectroHead - m_spectroPend + kSpectroH ) % kSpectroH;
			int run   = ( first + m_spectroPend > kSpectroH )
			          ? kSpectroH - first : m_spectroPend;
			glTexSubImage2D( GL_TEXTURE_2D, 0, 0, first, kSpectroW, run,
			                 GL_RED, GL_UNSIGNED_BYTE,
			                 m_spectroData + size_t(first) * kSpectroW );
			if( run < m_spectroPend )
				glTexSubImage2D( GL_TEXTURE_2D, 0, 0, 0, kSpectroW,
				                 m_spectroPend - run, GL_RED, GL_UNSIGNED_BYTE,
				                 m_spectroData );
		}
		glPixelStorei( GL_UNPACK_ALIGNMENT, 4 );
		m_spectroPend = 0;
	}
	glActiveTexture( GL_TEXTURE0 );   // see stepFluid()
}
