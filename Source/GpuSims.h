/**
 * @file GpuSims.h
 * @brief GPU-resident procedural simulations (reaction-diffusion, fluid dye, volumetric smoke/fire, Physarum) plus two host-computed ring histories (self-similarity matrix, spectrogram), all feeding fixed global sampler units consumed by the scene/combine shaders.
 */
#ifndef GPUSIMS_H
#define GPUSIMS_H

// GPU-Simulationen, herausgelöst aus FilterShader (Refactor 3/4, 2026-08-14).
//
// Fünf lebende Felder + zwei Host-Historien, die Effekte über globale
// Sampler-Units anzapfen:
//   Reaction-Diffusion (Gray-Scott, 320², RGBA16F-Ping-Pong)  -> "texSim",     Unit 7
//   Fluid (Curl-Noise-Farbstoff-Advektion, 512²)              -> "texFluid",   Unit 8
//   Smoke3D (gekacheltes Pseudo-3D-Feuer/Rauch-Atlas 320x256) -> "texSmoke3D", Unit 9
//   SSM (Selbstähnlichkeits-Matrix, host-berechnet, 256²)     -> "texSSM",     Unit 10
//   Physarum (1M Agenten + 1024²-Trail-Map)                   -> "texPhysarum",Unit 11
//   Spektrogramm-Ring (32 Bänder x 256 Zeilen, host-gefüllt)  -> "texSpectro", Unit 28
//
// Alle GPU-Sims folgen demselben Fail-Safe-Muster: schlägt das Setup fehl,
// bleibt ihr ready-Flag false und der anzeigende Effekt degradiert sichtbar,
// aber crashfrei. Die Host-Historien (SSM/Spectro) akkumulieren IMMER (billig,
// und die Struktur muss existieren, BEVOR der Effekt erscheint); Textur-Upload
// und Stepping der GPU-Sims passieren nur bei Bedarf (usesX-Gating macht der
// Aufrufer und übergibt Demand).
//
// Bewusst Qt-frei - dieser Baustein gehört zum späteren RendererCore.

#include "glcore.h"
#include "AudioFeatures.h"

/**
 * @brief Owns and steps every GPU-resident procedural simulation sampled by the visualizer's shaders.
 *
 * Runs four ping-ponged fullscreen-fragment-shader simulations (Gray-Scott
 * reaction-diffusion, curl-noise fluid-dye advection, tiled pseudo-3D
 * smoke/fire, and a Physarum agent+trail sim) plus two cheap host-computed
 * ring histories (a chroma/spectral self-similarity matrix and a scrolling
 * spectrogram), and binds each one's newest texture to a fixed global
 * sampler unit (7-11, 28) every frame. Every simulation follows the same
 * fail-safe pattern: if its setup fails, its `*Ready` flag stays false and
 * the consuming effect degrades visibly but without crashing. Deliberately
 * kept free of Qt so it can move into a later, Qt-independent RendererCore.
 */
class GpuSims
{
public:
	/** Welche Sims dieser Frame wirklich braucht (usesSim/usesFluid/... des
	 *  aktiven und ggf. einblendenden Effekts, ermittelt vom Aufrufer). */
	/**
	 * @brief Per-frame flags telling run() which simulations are actually needed this frame.
	 *
	 * Filled by the caller from the active (and any cross-fading) effect's
	 * usesSim/usesFluid/... flags, so idle simulations are skipped instead
	 * of stepped every frame regardless of whether they are visible.
	 */
	struct Demand
	{
		bool rd       = false;   ///< Step the Gray-Scott reaction-diffusion sim and bind texSim (unit 7).
		bool fluid    = false;   ///< Step the curl-noise fluid/dye sim and bind texFluid (unit 8).
		bool smoke3D  = false;   ///< Step the tiled pseudo-3D smoke/fire sim and bind texSmoke3D (unit 9).
		bool physarum = false;   ///< Step the Physarum agent/trail sim and bind texPhysarum (unit 11).
		bool ssm      = false;   ///< Upload/bind the self-similarity matrix texture (unit 10) if dirty.
		bool spectro  = false;   ///< Upload/bind the spectrogram ring texture (unit 28) if rows are pending.
	};

	/** Frame-Kontext aus der Pipeline: integrierte Phasen (anti-flicker) und
	 *  die Bildquellen, die der Fluid-Sim als Farbstoff dienen. */
	/**
	 * @brief Per-frame pipeline context: integrated time phases plus the image(s) the fluid sim uses as dye.
	 *
	 * globalTime/audioAdvance are already integrated ("anti-flicker") phase
	 * accumulators rather than raw absolute time (see the project-wide
	 * audio-reactive phase convention: never multiply absolute time by an
	 * audio-varying factor, integrate the rate instead) -- they are meant
	 * to be consumed as-is, not scaled further by an audio-varying factor.
	 */
	struct Frame
	{
		float  globalTime   = 0.f;   ///< Integrated wall-clock phase (see phase convention note above).
		float  audioAdvance = 0.f;   ///< Integrated audio-reactive advance phase (bass/onset driven); used for jump-free wandering flow fields / emitter motion.
		GLuint dyeTexA      = 0;   // aktuelles Bild (oder Live-Textur)   ///< Current source image (or live texture) sampled as fluid-sim dye.
		GLuint dyeTexB      = 0;   // eingeblendetes nächstes Bild        ///< Next/incoming source image cross-faded in as dye.
		float  dyeInterp    = 1.f;   ///< Cross-fade factor between dyeTexA and dyeTexB (0 = pure A, 1 = pure B).
	};

	/** Alle Sim-Ressourcen anlegen (GL-Kontext aktuell); idempotent, wird aus
	 *  FilterShader::setupSafety()/reinit gerufen. */
	/**
	 * @brief Creates/validates all GPU simulation resources (FBOs, textures, shader programs).
	 *
	 * Idempotent: existing GL objects are reused rather than recreated on a
	 * repeated call. Requires a current GL context. Called from
	 * FilterShader::setupSafety() and whenever the GL context is
	 * reinitialised.
	 */
	void setupAll();

	/** Ein Frame: Historien fortschreiben (immer), benötigte Sims steppen und
	 *  ihre neuesten Felder auf die globalen Units 7-11/28 binden.
	 *  Lässt GL_TEXTURE0 als aktive Unit zurück (wie der alte Inline-Code:
	 *  die Folge-Pässe setzen ihre Units selbst). */
	/**
	 * @brief Advances one frame: always updates the host histories, steps only the demanded GPU sims, and (re)binds their newest textures to the fixed global sampler units.
	 * @param audio Current audio-reactive feature snapshot driving every sim's parameters.
	 * @param dt Frame delta time in seconds; paces the host histories (SSM/spectrogram).
	 * @param need Which simulations this frame actually requires.
	 * @param f Per-frame pipeline context (integrated phases, dye source images).
	 *
	 * Leaves GL_TEXTURE0 as the active unit on return, matching the old
	 * inline FilterShader::paint() code -- the caller's follow-up passes
	 * set their own units.
	 */
	void run( const AudioFeatures &audio, float dt, const Demand &need, const Frame &f );

	// ---- Ring-Buchhaltung für die audioFx-Uniforms (Export VOR run()!) ----
	/** @brief Normalized [0,1) write-head position in the self-similarity ring, for the audioFx uniform. Must be read BEFORE run() advances the ring. @return Head position as a fraction of kSSMSize. */
	float ssmHeadNorm()     const { return float(m_ssmHead)  / float(kSSMSize); }
	/** @brief Normalized [0,1] fraction of the self-similarity ring populated so far. @return Fill fraction of kSSMSize. */
	float ssmFillNorm()     const { return float(m_ssmCount) / float(kSSMSize); }
	/** Kontinuierliche "Jetzt"-T-Koordinate des Spektrogramm-Rings: hinkt dem
	 *  Schreibkopf bewusst 2 Zeilen hinterher und faltet den Sub-Zeilen-Anteil
	 *  ein, damit das Terrain nicht alle 80 ms vorwärts ruckt (Details siehe
	 *  alte paint()-Kommentare). */
	/**
	 * @brief Continuous "now" T-coordinate of the spectrogram ring, for the audioFx uniform.
	 *
	 * Deliberately lags the write head by 2 rows and folds in the
	 * sub-row fraction so the terrain does not visibly jump forward every
	 * kSpectroStride (~80ms) tick (see the old paint() comments for the
	 * original derivation).
	 * @return Normalized [0,1) time coordinate into the spectrogram ring texture.
	 */
	float spectroHeadNorm() const
	{
		float frac = m_spectroAccum / kSpectroStride;
		if( frac < 0.f ) frac = 0.f; else if( frac > 1.f ) frac = 1.f;
		return ( float(m_spectroHead) - 1.5f + frac ) / float(kSpectroH);
	}
	/** @brief Normalized [0,1] fraction of the spectrogram ring's history populated so far. @return Fill fraction of kSpectroH. */
	float spectroFillNorm() const { return float(m_spectroCount) / float(kSpectroH); }

private:
	/** @brief Creates the reaction-diffusion ping-pong FBOs/textures and compiles the Gray-Scott step shader. Idempotent and fail-safe: on any failure m_rdReady stays false. */
	void setupReactionDiffusion();
	/**
	 * @brief Advances the Gray-Scott reaction-diffusion sim by one PDE step into the next ping-pong buffer.
	 * @param a Current audio features; drives the feed/kill parameter wander and the reagent-injection trigger.
	 */
	void stepReactionDiffusion( const AudioFeatures &a );
	/** @brief Creates the fluid-dye ping-pong FBOs/textures and compiles the curl-noise advection shader. Idempotent and fail-safe: on any failure m_fluidReady stays false. */
	void setupFluid();
	/**
	 * @brief Advances the curl-noise dye advection by one step, blending the current/next source image in as dye.
	 * @param a Current audio features; drives the swirl impulse and dye-injection amount.
	 * @param f Per-frame context supplying the integrated flow phase and the two dye source textures.
	 */
	void stepFluid( const AudioFeatures &a, const Frame &f );
	/** @brief Creates the smoke/fire tiled-atlas ping-pong FBOs/textures and compiles the sim shader. Idempotent and fail-safe: on any failure m_smoke3DReady stays false. */
	void setupSmoke3D();
	/**
	 * @brief Advances the smoke/fire volume by one full frame: a horizontal pass (turbulence/injection) followed by a vertical pass (buoyancy), each its own ping-pong swap.
	 * @param a Current audio features; drives turbulence and fuel-injection strength.
	 * @param f Per-frame context supplying time and the integrated emitter-wander phase.
	 */
	void stepSmoke3D( const AudioFeatures &a, const Frame &f );
	/**
	 * @brief Runs one sub-step of the smoke/fire PDE (horizontal or vertical half) into the next ping-pong buffer.
	 * @param a Current audio features; drives per-cell turbulence and base-cell fuel injection.
	 * @param f Per-frame context (time, integrated emitter-wander phase).
	 * @param subStep Which half of the PDE this pass computes (0 = horizontal turbulence/injection/decay, 1 = vertical buoyant rise/cross-cell softening); forwarded to the shader as-is.
	 */
	void stepSmoke3DPass( const AudioFeatures &a, const Frame &f, float subStep );
	/** @brief Creates the Physarum agent/trail ping-pong buffers and the three programs (agent update, point-deposit, diffuse -- with an optional GL4.3 compute-shader fast path for diffuse). Idempotent and fail-safe: on any failure m_physReady stays false. */
	void setupPhysarum();
	/**
	 * @brief Advances the Physarum slime-mould sim by one frame: agents sense/turn/move, deposit pheromone points, then the trail map diffuses and evaporates.
	 * @param a Current audio features; drives agent speed/sensor angle/turn rate/scatter and deposit amount.
	 * @param f Per-frame context; supplies time to the agent-update shader.
	 */
	void stepPhysarum( const AudioFeatures &a, const Frame &f );
	/**
	 * @brief Accumulates one row/column of the self-similarity matrix roughly every kSSMStride seconds, from a normalized chroma + coarse spectral-shape feature vector.
	 * @param a Current audio features (chroma bins and spectrum) that source the feature vector.
	 * @param dt Frame delta time in seconds; paces the accumulation.
	 *
	 * Runs unconditionally every frame (cheap, CPU-only) regardless of
	 * whether the SelfSimilarity effect is currently visible, so its
	 * history already exists (not starting from black) the moment the
	 * effect appears.
	 */
	void stepSSM( const AudioFeatures &a, float dt );
	/**
	 * @brief Pushes newly-due rows of the scrolling spectrogram history from the current spectrum.
	 * @param a Current audio features (normalized spectrum bands) that source each new row.
	 * @param dt Frame delta time in seconds; paces row emission.
	 *
	 * Emits multiple rows in one call (capped at 8) if more than
	 * kSpectroStride seconds have accumulated (e.g. after a hitch), so
	 * scroll speed stays independent of frame rate; a very long stall
	 * resyncs instead of catching up.
	 */
	void stepSpectro( const AudioFeatures &a, float dt );
	/** @brief Lazily creates the SSM texture (unit 10) and re-uploads it whole whenever the matrix data is dirty. */
	void bindSSMTexture();       // Unit 10: Textur (lazy) anlegen + Upload bei dirty
	/** @brief Lazily creates the spectrogram texture (unit 28) and uploads only the rows written since the last upload (split into two uploads if the pending run straddles the ring wrap). */
	void bindSpectroTexture();   // Unit 28: dito, mit Teil-Upload der neuen Zeilen

	/** @brief Clears the currently-bound FBO and draws the shared fullscreen triangle; the common draw call used by every simulation's fragment-shader step. */
	static void drawFullscreen();
	static const GLenum kAttach = GL_COLOR_ATTACHMENT0;   ///< Color attachment point used by every simulation's ping-pong FBOs.

	// ---- Reaction-Diffusion (Gray-Scott) ----
	static const int kRDSize = 320;   ///< Reaction-diffusion grid width/height in texels (fixed, window-independent, so it stays cheap on a weak iGPU).
	GLuint	m_fboRD[2]    = { 0, 0 };   ///< Ping-pong framebuffers wrapping m_texRD[0]/[1].
	GLuint	m_texRD[2]    = { 0, 0 };   ///< Ping-pong RGBA16F state textures; the newest one is bound as texSim (unit 7) when ready.
	int		m_rdIdx       = 0;   ///< Index of the buffer written by the NEXT step; the newest finished state is m_texRD[1 - m_rdIdx].
	GLuint	m_rdProgId    = 0;   ///< Gray-Scott step fragment shader program.
	GLint	m_rdPrevUni   = -1;   ///< Uniform location: previous-state sampler (texPrev).
	GLint	m_rdResUni    = -1;   ///< Uniform location: grid resolution.
	GLint	m_rdSeedUni   = -1;   ///< Uniform location: seed-pattern trigger (1 on the very first step only).
	GLint	m_rdFeedUni   = -1;   ///< Uniform location: Gray-Scott feed rate.
	GLint	m_rdKillUni   = -1;   ///< Uniform location: Gray-Scott kill rate.
	GLint	m_rdInjectUni = -1;   ///< Uniform location: reagent-injection trigger (onset/beat driven).
	bool	m_rdReady     = false;   ///< True once setup succeeded; gates stepping and texture binding.
	bool	m_rdSeeded    = false;   ///< False until the first step has written the seed pattern.

	// ---- Fluid (Curl-Noise-Farbstoff) ----
	static const int kFluidSize = 512;   ///< Fluid-dye grid width/height in texels (fixed, window-independent).
	GLuint	m_fboFluid[2]     = { 0, 0 };   ///< Ping-pong framebuffers wrapping m_texFluid[0]/[1].
	GLuint	m_texFluid[2]     = { 0, 0 };   ///< Ping-pong RGBA16F state textures; the newest one is bound as texFluid (unit 8) when ready.
	int		m_fluidIdx        = 0;   ///< Index of the buffer written by the NEXT step; the newest finished state is m_texFluid[1 - m_fluidIdx].
	GLuint	m_fluidProgId     = 0;   ///< Curl-noise advection step fragment shader program.
	GLint	m_fluidPrevUni    = -1;   ///< Uniform location: previous-state sampler (texPrev).
	GLint	m_fluidTex0Uni    = -1;   ///< Uniform location: current dye source image sampler (tex0 = Frame::dyeTexA).
	GLint	m_fluidTex1Uni    = -1;   ///< Uniform location: incoming dye source image sampler (tex1 = Frame::dyeTexB).
	GLint	m_fluidInterpUni  = -1;   ///< Uniform location: cross-fade factor between tex0/tex1 (Frame::dyeInterp).
	GLint	m_fluidResUni     = -1;   ///< Uniform location: grid resolution.
	GLint	m_fluidSeedUni    = -1;   ///< Uniform location: seed-pattern trigger (1 on the very first step only).
	GLint	m_fluidPhaseUni   = -1;   ///< Uniform location: integrated flow-field phase driving swirl evolution.
	GLint	m_fluidImpulseUni = -1;   ///< Uniform location: bass/beat-driven swirl impulse strength.
	GLint	m_fluidInjectUni  = -1;   ///< Uniform location: onset-driven dye-injection amount.
	bool	m_fluidReady      = false;   ///< True once setup succeeded; gates stepping and texture binding.
	bool	m_fluidSeeded     = false;   ///< False until the first step has written the seed pattern.

	// ---- Smoke3D (gekachelter Pseudo-3D-Atlas) ----
	static const int kSmoke3DTile = 64;   ///< Side length in texels of one 2D "slice" tile of the pseudo-3D atlas.
	static const int kSmoke3DCols = 5;    ///< Number of tile columns in the atlas grid.
	static const int kSmoke3DRows = 4;    ///< Number of tile rows in the atlas grid.
	static const int kSmoke3DW = kSmoke3DTile * kSmoke3DCols;   // 320   ///< Full atlas texture width in texels.
	static const int kSmoke3DH = kSmoke3DTile * kSmoke3DRows;   // 256   ///< Full atlas texture height in texels.
	GLuint	m_fboSmoke3D[2]        = { 0, 0 };   ///< Ping-pong framebuffers wrapping m_texSmoke3D[0]/[1].
	GLuint	m_texSmoke3D[2]        = { 0, 0 };   ///< Ping-pong RGBA16F state textures; the newest one is bound as texSmoke3D (unit 9) when ready.
	int		m_smoke3DIdx           = 0;   ///< Index of the buffer written by the NEXT pass; the newest finished state is m_texSmoke3D[1 - m_smoke3DIdx].
	GLuint	m_smoke3DProgId        = 0;   ///< Smoke/fire PDE step fragment shader program (shared by both the horizontal and vertical sub-passes).
	GLint	m_smoke3DPrevUni       = -1;   ///< Uniform location: previous-state sampler (texPrev).
	GLint	m_smoke3DResUni        = -1;   ///< Uniform location: atlas resolution.
	GLint	m_smoke3DSeedUni       = -1;   ///< Uniform location: seed-pattern trigger (1 on the very first step only).
	GLint	m_smoke3DSubUni        = -1;   ///< Uniform location: sub-step selector (0 = horizontal, 1 = vertical half of the PDE).
	GLint	m_smoke3DTimeUni       = -1;   ///< Uniform location: global time.
	GLint	m_smoke3DTurbUni       = -1;   ///< Uniform location: per-cell turbulence strength (treble/onset driven).
	GLint	m_smoke3DInjectUni     = -1;   ///< Uniform location: base-cell fuel-injection strength (bass/kick/drop driven).
	GLint	m_smoke3DEmitPhaseUni  = -1;   ///< Uniform location: integrated audio-advance phase driving wandering emitter positions.
	bool	m_smoke3DReady         = false;   ///< True once setup succeeded; gates stepping and texture binding.
	bool	m_smoke3DSeeded        = false;   ///< False until the first step has written the seed pattern.

	// ---- Physarum (Agenten + Trail-Map) ----
	static const int kPhysAgentsSide = 1024;  // 1 048 576 Agenten   ///< Side length of the square agent-state texture; one texel = one agent.
	static const int kPhysTrailSize  = 1024;   ///< Side length in texels of the pheromone trail map.
	GLuint	m_texPhysAgents[2] = { 0, 0 };   ///< Ping-pong RGBA16F agent-state textures (position/heading encoded per texel).
	GLuint	m_fboPhysAgents[2] = { 0, 0 };   ///< Ping-pong framebuffers wrapping m_texPhysAgents[0]/[1].
	GLuint	m_texPhysTrail[2]  = { 0, 0 };   ///< Ping-pong RGBA16F pheromone trail-map textures; the newest one is bound as texPhysarum (unit 11) when ready.
	GLuint	m_fboPhysTrail[2]  = { 0, 0 };   ///< Ping-pong framebuffers wrapping m_texPhysTrail[0]/[1].
	int		m_physAgentIdx = 0;   ///< Index of the agent buffer written by the NEXT update; newest state is m_texPhysAgents[1 - m_physAgentIdx].
	int		m_physTrailIdx = 0;   ///< Index of the trail buffer written by the NEXT diffuse pass; newest state is m_texPhysTrail[1 - m_physTrailIdx].
	GLuint	m_physAgentProgId   = 0;   ///< Agent sense/turn/move fragment shader program.
	GLuint	m_physDepositProgId = 0;   ///< Point-sprite pheromone-deposit shader program (real vertex shader, one GL_POINT per agent).
	GLuint	m_physDiffuseProgId = 0;   ///< Trail diffuse+evaporate fragment shader program (fallback path when the compute shader is unavailable).
	GLuint	m_physVBO = 0;   ///< Static vertex buffer of per-agent texel coordinates, one point per agent, used by the deposit pass.
	GLuint	m_physDepVAO = 0;   // Core-Profile: Attrib-State der Deposit-Points   ///< VAO holding the deposit pass's vertex attribute state (required by the core profile).
	GLuint	m_physDiffuseCompId = 0;   // Compute-Diffuse (0 = Fragment-Fallback)   ///< GL4.3 compute-shader program for the trail diffuse step; 0 means the fragment-shader fallback is used instead.
	GLint	m_physDifCTrailUni = -1;   ///< Compute path uniform location: previous trail-map sampler.
	GLint	m_physDifCResUni   = -1;   ///< Compute path uniform location: trail-map resolution.
	GLint	m_physDifCDecayUni = -1;   ///< Compute path uniform location: per-frame trail decay/evaporation factor.
	GLint	m_physAgentTexUni   = -1;   ///< Agent shader uniform location: previous agent-state sampler.
	GLint	m_physAgentTrailUni = -1;   ///< Agent shader uniform location: current trail-map sampler (sensing input).
	GLint	m_physAgentResUni   = -1;   ///< Agent shader uniform location: agent-texture resolution.
	GLint	m_physAgentSeedUni  = -1;   ///< Agent shader uniform location: seed-pattern trigger (1 on the very first step only).
	GLint	m_physAgentTimeUni  = -1;   ///< Agent shader uniform location: global time.
	GLint	m_physAgentSpeedUni = -1;   ///< Agent shader uniform location: agent movement speed (overall level / kick driven).
	GLint	m_physAgentSensAUni = -1;   ///< Agent shader uniform location: sensor cone angle (spectral-centroid driven).
	GLint	m_physAgentSensDUni = -1;   ///< Agent shader uniform location: sensor sampling distance.
	GLint	m_physAgentTurnUni  = -1;   ///< Agent shader uniform location: turning rate (onset-strength driven).
	GLint	m_physAgentScatUni  = -1;   ///< Agent shader uniform location: random scatter amount, triggered on hard kicks.
	GLint	m_physDepAgentsUni  = -1;   ///< Deposit shader uniform location: agent-state sampler (read to place each point).
	GLint	m_physDepAmtUni     = -1;   ///< Deposit shader uniform location: pheromone amount deposited per agent (onset-strength driven).
	GLint	m_physDepAttr       = -1;   ///< Deposit shader attribute location: per-vertex agent texel coordinate (aTexel).
	GLint	m_physDifTrailUni   = -1;   ///< Fragment diffuse-path uniform location: previous trail-map sampler.
	GLint	m_physDifResUni     = -1;   ///< Fragment diffuse-path uniform location: trail-map resolution.
	GLint	m_physDifDecayUni   = -1;   ///< Fragment diffuse-path uniform location: per-frame trail decay/evaporation factor.
	bool	m_physReady  = false;   ///< True once setup succeeded; gates stepping and texture binding.
	bool	m_physSeeded = false;   ///< False until the first step has written the seed pattern.

	// ---- SSM (host-berechnete Selbstähnlichkeits-Matrix) ----
	static const int kSSMSize   = 256;   ///< Ring capacity (feature-vector history length) and side length of the resulting similarity matrix texture.
	static const int kSSMDims   = 20;    ///< Dimensionality of each stored feature vector (12 chroma bins + 8 coarse spectral-shape bins).
	static constexpr float kSSMStride = 0.35f;   ///< Seconds between successive feature-vector samples pushed into the ring.
	float			m_ssmVecs[kSSMSize][kSSMDims] = {};   ///< Ring buffer of unit-normalized feature vectors, one row per ring slot.
	unsigned char	m_ssmData[kSSMSize * kSSMSize] = {};   ///< Byte similarity matrix (row-major); mirrored symmetrically on every update. Uploaded verbatim to m_texSSM.
	int				m_ssmHead   = 0;   ///< Next ring slot to be written.
	int				m_ssmCount  = 0;   ///< Number of ring slots populated so far (saturates at kSSMSize).
	float			m_ssmAccum  = 0.f;   ///< Seconds accumulated toward the next kSSMStride sample.
	GLuint			m_texSSM    = 0;   ///< Lazily-created R8 texture (unit 10) holding m_ssmData.
	bool			m_ssmDirty  = false;   ///< True when m_ssmData has changed since the last upload to m_texSSM.

	// ---- Spektrogramm-Ring (host-gefüllt) ----
	static const int kSpectroW = AudioFeatures::kSpectrumBands;   // 32   ///< Spectrogram texture width: one column per spectrum band.
	static const int kSpectroH = 256;                             // ~20 s   ///< Spectrogram ring depth (rows of history).
	static constexpr float kSpectroStride = 0.08f;   ///< Seconds between successive spectrogram rows pushed into the ring.
	unsigned char	m_spectroData[kSpectroH * kSpectroW] = {};   ///< Byte spectrogram ring buffer (row-major, one row per time slice). Uploaded (in part) to m_texSpectro.
	int				m_spectroHead  = 0;   ///< Next ring row to be written.
	int				m_spectroCount = 0;   ///< Number of ring rows populated so far (saturates at kSpectroH).
	float			m_spectroAccum = 0.f;   ///< Seconds accumulated toward the next kSpectroStride row.
	int				m_spectroPend  = 0;   ///< Number of rows written since the last texture upload, still pending (capped at kSpectroH).
	GLuint			m_texSpectro   = 0;   ///< Lazily-created R8 texture (unit 28) holding m_spectroData.
};

#endif
