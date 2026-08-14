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

class GpuSims
{
public:
	/** Welche Sims dieser Frame wirklich braucht (usesSim/usesFluid/... des
	 *  aktiven und ggf. einblendenden Effekts, ermittelt vom Aufrufer). */
	struct Demand
	{
		bool rd       = false;
		bool fluid    = false;
		bool smoke3D  = false;
		bool physarum = false;
		bool ssm      = false;
		bool spectro  = false;
	};

	/** Frame-Kontext aus der Pipeline: integrierte Phasen (anti-flicker) und
	 *  die Bildquellen, die der Fluid-Sim als Farbstoff dienen. */
	struct Frame
	{
		float  globalTime   = 0.f;
		float  audioAdvance = 0.f;
		GLuint dyeTexA      = 0;   // aktuelles Bild (oder Live-Textur)
		GLuint dyeTexB      = 0;   // eingeblendetes nächstes Bild
		float  dyeInterp    = 1.f;
	};

	/** Alle Sim-Ressourcen anlegen (GL-Kontext aktuell); idempotent, wird aus
	 *  FilterShader::setupSafety()/reinit gerufen. */
	void setupAll();

	/** Ein Frame: Historien fortschreiben (immer), benötigte Sims steppen und
	 *  ihre neuesten Felder auf die globalen Units 7-11/28 binden.
	 *  Lässt GL_TEXTURE0 als aktive Unit zurück (wie der alte Inline-Code:
	 *  die Folge-Pässe setzen ihre Units selbst). */
	void run( const AudioFeatures &audio, float dt, const Demand &need, const Frame &f );

	// ---- Ring-Buchhaltung für die audioFx-Uniforms (Export VOR run()!) ----
	float ssmHeadNorm()     const { return float(m_ssmHead)  / float(kSSMSize); }
	float ssmFillNorm()     const { return float(m_ssmCount) / float(kSSMSize); }
	/** Kontinuierliche "Jetzt"-T-Koordinate des Spektrogramm-Rings: hinkt dem
	 *  Schreibkopf bewusst 2 Zeilen hinterher und faltet den Sub-Zeilen-Anteil
	 *  ein, damit das Terrain nicht alle 80 ms vorwärts ruckt (Details siehe
	 *  alte paint()-Kommentare). */
	float spectroHeadNorm() const
	{
		float frac = m_spectroAccum / kSpectroStride;
		if( frac < 0.f ) frac = 0.f; else if( frac > 1.f ) frac = 1.f;
		return ( float(m_spectroHead) - 1.5f + frac ) / float(kSpectroH);
	}
	float spectroFillNorm() const { return float(m_spectroCount) / float(kSpectroH); }

private:
	void setupReactionDiffusion();
	void stepReactionDiffusion( const AudioFeatures &a );
	void setupFluid();
	void stepFluid( const AudioFeatures &a, const Frame &f );
	void setupSmoke3D();
	void stepSmoke3D( const AudioFeatures &a, const Frame &f );
	void stepSmoke3DPass( const AudioFeatures &a, const Frame &f, float subStep );
	void setupPhysarum();
	void stepPhysarum( const AudioFeatures &a, const Frame &f );
	void stepSSM( const AudioFeatures &a, float dt );
	void stepSpectro( const AudioFeatures &a, float dt );
	void bindSSMTexture();       // Unit 10: Textur (lazy) anlegen + Upload bei dirty
	void bindSpectroTexture();   // Unit 28: dito, mit Teil-Upload der neuen Zeilen

	static void drawFullscreen();
	static const GLenum kAttach = GL_COLOR_ATTACHMENT0;

	// ---- Reaction-Diffusion (Gray-Scott) ----
	static const int kRDSize = 320;
	GLuint	m_fboRD[2]    = { 0, 0 };
	GLuint	m_texRD[2]    = { 0, 0 };
	int		m_rdIdx       = 0;
	GLuint	m_rdProgId    = 0;
	GLint	m_rdPrevUni   = -1;
	GLint	m_rdResUni    = -1;
	GLint	m_rdSeedUni   = -1;
	GLint	m_rdFeedUni   = -1;
	GLint	m_rdKillUni   = -1;
	GLint	m_rdInjectUni = -1;
	bool	m_rdReady     = false;
	bool	m_rdSeeded    = false;

	// ---- Fluid (Curl-Noise-Farbstoff) ----
	static const int kFluidSize = 512;
	GLuint	m_fboFluid[2]     = { 0, 0 };
	GLuint	m_texFluid[2]     = { 0, 0 };
	int		m_fluidIdx        = 0;
	GLuint	m_fluidProgId     = 0;
	GLint	m_fluidPrevUni    = -1;
	GLint	m_fluidTex0Uni    = -1;
	GLint	m_fluidTex1Uni    = -1;
	GLint	m_fluidInterpUni  = -1;
	GLint	m_fluidResUni     = -1;
	GLint	m_fluidSeedUni    = -1;
	GLint	m_fluidPhaseUni   = -1;
	GLint	m_fluidImpulseUni = -1;
	GLint	m_fluidInjectUni  = -1;
	bool	m_fluidReady      = false;
	bool	m_fluidSeeded     = false;

	// ---- Smoke3D (gekachelter Pseudo-3D-Atlas) ----
	static const int kSmoke3DTile = 64;
	static const int kSmoke3DCols = 5;
	static const int kSmoke3DRows = 4;
	static const int kSmoke3DW = kSmoke3DTile * kSmoke3DCols;   // 320
	static const int kSmoke3DH = kSmoke3DTile * kSmoke3DRows;   // 256
	GLuint	m_fboSmoke3D[2]        = { 0, 0 };
	GLuint	m_texSmoke3D[2]        = { 0, 0 };
	int		m_smoke3DIdx           = 0;
	GLuint	m_smoke3DProgId        = 0;
	GLint	m_smoke3DPrevUni       = -1;
	GLint	m_smoke3DResUni        = -1;
	GLint	m_smoke3DSeedUni       = -1;
	GLint	m_smoke3DSubUni        = -1;
	GLint	m_smoke3DTimeUni       = -1;
	GLint	m_smoke3DTurbUni       = -1;
	GLint	m_smoke3DInjectUni     = -1;
	GLint	m_smoke3DEmitPhaseUni  = -1;
	bool	m_smoke3DReady         = false;
	bool	m_smoke3DSeeded        = false;

	// ---- Physarum (Agenten + Trail-Map) ----
	static const int kPhysAgentsSide = 1024;  // 1 048 576 Agenten
	static const int kPhysTrailSize  = 1024;
	GLuint	m_texPhysAgents[2] = { 0, 0 };
	GLuint	m_fboPhysAgents[2] = { 0, 0 };
	GLuint	m_texPhysTrail[2]  = { 0, 0 };
	GLuint	m_fboPhysTrail[2]  = { 0, 0 };
	int		m_physAgentIdx = 0;
	int		m_physTrailIdx = 0;
	GLuint	m_physAgentProgId   = 0;
	GLuint	m_physDepositProgId = 0;
	GLuint	m_physDiffuseProgId = 0;
	GLuint	m_physVBO = 0;
	GLuint	m_physDepVAO = 0;   // Core-Profile: Attrib-State der Deposit-Points
	GLuint	m_physDiffuseCompId = 0;   // Compute-Diffuse (0 = Fragment-Fallback)
	GLint	m_physDifCTrailUni = -1;
	GLint	m_physDifCResUni   = -1;
	GLint	m_physDifCDecayUni = -1;
	GLint	m_physAgentTexUni   = -1;
	GLint	m_physAgentTrailUni = -1;
	GLint	m_physAgentResUni   = -1;
	GLint	m_physAgentSeedUni  = -1;
	GLint	m_physAgentTimeUni  = -1;
	GLint	m_physAgentSpeedUni = -1;
	GLint	m_physAgentSensAUni = -1;
	GLint	m_physAgentSensDUni = -1;
	GLint	m_physAgentTurnUni  = -1;
	GLint	m_physAgentScatUni  = -1;
	GLint	m_physDepAgentsUni  = -1;
	GLint	m_physDepAmtUni     = -1;
	GLint	m_physDepAttr       = -1;
	GLint	m_physDifTrailUni   = -1;
	GLint	m_physDifResUni     = -1;
	GLint	m_physDifDecayUni   = -1;
	bool	m_physReady  = false;
	bool	m_physSeeded = false;

	// ---- SSM (host-berechnete Selbstähnlichkeits-Matrix) ----
	static const int kSSMSize   = 256;
	static const int kSSMDims   = 20;
	static constexpr float kSSMStride = 0.35f;
	float			m_ssmVecs[kSSMSize][kSSMDims] = {};
	unsigned char	m_ssmData[kSSMSize * kSSMSize] = {};
	int				m_ssmHead   = 0;
	int				m_ssmCount  = 0;
	float			m_ssmAccum  = 0.f;
	GLuint			m_texSSM    = 0;
	bool			m_ssmDirty  = false;

	// ---- Spektrogramm-Ring (host-gefüllt) ----
	static const int kSpectroW = AudioFeatures::kSpectrumBands;   // 32
	static const int kSpectroH = 256;                             // ~20 s
	static constexpr float kSpectroStride = 0.08f;
	unsigned char	m_spectroData[kSpectroH * kSpectroW] = {};
	int				m_spectroHead  = 0;
	int				m_spectroCount = 0;
	float			m_spectroAccum = 0.f;
	int				m_spectroPend  = 0;
	GLuint			m_texSpectro   = 0;
};

#endif
