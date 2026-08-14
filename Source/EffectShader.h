#ifndef EFFECT_SHADER_H
#define EFFECT_SHADER_H

#include <QtGui/qopengl.h>
#include <QtCore/QElapsedTimer>
#include <QtCore/QThread>
#include "stdinc.h"
#include "Uniform.h"
#include "AudioFeatures.h"
#include "ExprEval.h"

//Basic Class for effects
class EffectShader
{
public:
	EffectShader();
	EffectShader( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	EffectShader( const QString &filenameFragmentShader, unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	~EffectShader();
	
	
	//virtual void initUniforms(int width, int height) = 0; // initialize GLSL - shader programs
	//virtual void setUniforms( float time, float interpolation, GLint texPointUni1, GLint m_texPointUni2 ) = 0; // setting uniforms
	virtual void resetParameters();
	virtual void draw(); // draw scene
	virtual void enableShader(); // draw scene

	void startInterpolators();
	
	void cleanShaderPrograms();//delete shaders

	
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs

	// ---- Lazy compilation ----
	// prepare() only records the render size (no GL); the expensive compile
	// runs on first use (ensureCompiled, called from enableShader) or during
	// the host's per-frame warm-up.  A 70-shader preset therefore starts
	// instantly instead of blocking for seconds.
	void prepare( int width, int height ) { m_width = width; m_height = height; }
	void ensureCompiled()
	{
		if( m_glReady ) return;
		initUniforms( m_width, m_height );   // virtual: derived locations too
		m_glReady = true;
		m_usesSim = m_usesFluid = m_usesSmoke3D = m_usesSSM = m_usesPhysarum = -1;
		m_usesSpectro = -1;
	}
	bool isCompiled() const { return m_glReady; }

	// Hot-reload (dev aid): recompile this effect's fragment shader from disk.
	// Not-yet-compiled (lazy) programs are left alone — their eventual compile
	// reads the new source anyway.
	void reloadShader()
	{
		if( !m_glReady )
			return;
		cleanShaderPrograms();
		m_sh_prog_id = 0;
		m_glReady    = false;
		ensureCompiled();
	}

	// Update the reported render-target resolution without recompiling the shader
	// or touching any GL objects.  Used on window resize.
	void setSize( int width, int height ) { m_width = width; m_height = height; }

	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	virtual void checkGLErrors( const char *label ); // check and print gl errors to stderr

	void addUniform( const QString &name, float minf, float maxf );
	void addUniform( const QString &name, int minf, int maxf );
	void addUniform( const QString &name, float pro );

	// FORMULA LAYER (the MilkDrop lesson): attach a per-frame expression that
	// is evaluated against the live audio features and uploaded as the float
	// uniform `name` — presets can script mappings without shader edits.
	// Evaluated in applyAudioFeatures AFTER the random params, so a formula
	// deliberately overrides a <float> of the same name.
	void addExpression( const QString &name, const QString &formula );

	/**
	 * Upload dedicated audio uniforms AFTER setUniforms() has run, while the
	 * shader program is still active.
	 *
	 * Motion is delivered as pre-integrated, continuous phase offsets
	 * (audioPhase / audioAdvance from FilterShader::paint) rather than by scaling
	 * the speed/speedTunnel uniforms.  Scaling those used to remap the whole
	 * time*speed phase per-frame and caused violent flicker; the base speeds are
	 * now left untouched so they advance smoothly.
	 *
	 * Shaders that don't declare a given audio uniform get location -1, so the
	 * corresponding upload is silently skipped.
	 */
	virtual void applyAudioFeatures(const AudioFeatures &features);
		
	void addUniformInterpolator( const QString &name, float interpolatorMinMinf,
							  float interpolatorMinMaxf,
							  float interpolatorMaxMinf,
							  float interpolatorMaxMaxf );

	unsigned int getTimeSolo();
	unsigned int getTimeInterpolation();

	void setComplexity( unsigned int complexity ) {m_complexity = complexity;};
	unsigned int getComplexity() {return m_complexity;};
	void setProbability( float probability ){ m_probability = probability; };
	bool useShader();

	// True if this effect's fragment shader samples the reaction-diffusion field
	// (declares the "texSim" uniform).  Cached on first query.  Lets the host run
	// the GPU simulation only while an effect that displays it is on screen.
	bool usesSim();

	// Same for the fluid simulation ("texFluid" uniform, unit 8).
	bool usesFluid();

	// Same for the volumetric smoke/fire simulation ("texSmoke3D" uniform, unit 9).
	bool usesSmoke3D();

	// Same for the self-similarity matrix ("texSSM" uniform, unit 10).
	bool usesSSM();
	virtual bool usesSpectro();

	// Same for the Physarum trail map ("texPhysarum" uniform, unit 11).
	bool usesPhysarum();
	// Bit k set = this shader declares kCfxInfo[k].sampler (compute-FX sims).
	unsigned int cfxMask();

	// The fragment-shader file this effect uses (for the debug overlay).
	const char* fragmentName() const { return m_fragmentShaderFilename ? m_fragmentShaderFilename : "?"; }

	// True for REAL 3D scenes (Scene3DShader): geometry + perspective camera.
	// The host uses this for the true-stereo path (per-eye rendering).
	virtual bool is3D() const { return false; }

	// ---- Song-structure memory ----
	// Snapshot / restore of all rolled per-activation parameter values, so a
	// recognised section (chorus #2 = chorus #1) replays the exact same look.
	std::vector<float> snapshotParameters() const
	{
		std::vector<float> v;
		v.reserve(m_uniforms.size());
		for (const Uniform *u : m_uniforms) v.push_back(u->snapshotValue());
		return v;
	}
	void restoreParameters(const std::vector<float> &v)
	{
		for (size_t i = 0; i < m_uniforms.size() && i < v.size(); ++i)
			m_uniforms[i]->restoreValue(v[i]);
	}

	// ---- Mood tags (config attribute mood="dark,calm,...") ----
	enum MoodFlags {
		MOOD_DARK = 1, MOOD_BRIGHT = 2, MOOD_CALM = 4, MOOD_AGGRESSIVE = 8
	};
	void setMoodFlags(unsigned int f) { m_moodFlags = f; }
	unsigned int moodFlags() const    { return m_moodFlags; }

protected:
	unsigned int getInterpolatedTime( unsigned int minTime, unsigned int maxTime );
	void drawWindow();

	unsigned int	m_width; // Combine width
	unsigned int	m_height; // Combine height

	//Shader and Uniforms
	GLuint			m_sh_prog_id; // id of shader program
	GLint			m_texPointUni1;
	GLint			m_texPointUni2;
	GLint			m_texSizeRcpUni;	
	GLint			m_timeUni;
    GLint			m_interpolationUni; //Interpolation between the Combines

	char*			m_vertexShaderFilename;
	char*			m_fragmentShaderFilename;


	
	unsigned int  m_timeSolo;
	unsigned int  m_timeInterpolation;

	unsigned int  m_minTimeSolo;
	unsigned int  m_maxTimeSolo;
	unsigned int  m_minTimeInterpolation;
	unsigned int  m_maxTimeInterpolation;

	unsigned int  m_complexity;

	float	m_probability;

	int		m_usesSim = -1;      // -1 = not yet queried, 0/1 = cached result
	int		m_usesFluid = -1;    // same caching for the fluid field
	int		m_usesSmoke3D = -1;  // same caching for the volumetric smoke/fire field
	int		m_usesSSM = -1;      // same caching for the self-similarity matrix
	int		m_usesSpectro = -1;  // ... and for the scrolling spectrogram history
	int		m_usesPhysarum = -1; // same caching for the Physarum trail map
	unsigned int	m_cfxMask = 0;   // compute-FX sampler bits (see cfxMask())
	GLuint		m_cfxProg = 0;   // program the mask was resolved for

	bool	m_glReady = false;      // lazy compile: program built yet?

	// Cached audio-uniform locations: applyAudioFeatures used to do ~45
	// glGetUniformLocation string lookups per shader per FRAME.  Cached per
	// program id (auto-refreshes after recompile / hot reload).
	// Sized with headroom over AL_COUNT — the array is indexed by the enum, so
	// it has to stay ahead of it as uniforms are added.
	struct AudioLocCache { GLuint progId = 0; GLint L[96]; };
	AudioLocCache m_audioLocs;

	// Formula-layer expressions (uniform name -> compiled program).
	struct ExprEntry
	{
		QString     name;
		ExprProgram prog;
		GLint       loc    = -1;
		GLuint      progId = 0;
	};
	std::vector<ExprEntry> m_exprs;
	float m_exprTime     = 0.f;      // time as passed to setUniforms
	float m_exprSeeds[3] = { 0.5f, 0.5f, 0.5f };   // re-rolled per activation

	unsigned int m_moodFlags = 0;   // MoodFlags bitmask (0 = untagged/neutral)

	std::vector< Uniform *> m_uniforms;

};


#endif