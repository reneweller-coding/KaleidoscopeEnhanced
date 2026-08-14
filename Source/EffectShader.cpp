#include <float.h>

#include "shader_setup.h"
#include "EffectShader.h"
#include "ComputeFX.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

// Constructor
EffectShader::EffectShader( const QString &filenameFragmentShader, unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation ):
m_minTimeSolo(minTimeSolo)
, m_maxTimeSolo(maxTimeSolo)
, m_minTimeInterpolation(minTimeInterpolation)
, m_maxTimeInterpolation(maxTimeInterpolation)
, m_complexity(1)
, m_probability(1.0)
{

	QByteArray ba = filenameFragmentShader.toLocal8Bit();
	const char* name = ba.data();//toAscii().constData();

	m_vertexShaderFilename = "..\\standard.vert";
	//m_fragmentShaderFilename = ba.data();//filenameFragmentShader.toLocal8Bit().data();

	m_fragmentShaderFilename = (char *) malloc(sizeof(char)*(filenameFragmentShader.size()+1) );
	sprintf( m_fragmentShaderFilename, "%s\0", ba.data() );


	m_uniforms.clear();

	
	m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
	m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );
}



// Constructor
EffectShader::EffectShader( )
{
	m_vertexShaderFilename = "..\\standard.vert";
}

// Constructor
EffectShader::EffectShader( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation ):
m_minTimeSolo(minTimeSolo)
, m_maxTimeSolo(maxTimeSolo)
, m_minTimeInterpolation(minTimeInterpolation)
, m_maxTimeInterpolation(maxTimeInterpolation)
, m_complexity(1)
, m_probability(1.0)
{
	m_vertexShaderFilename = "..\\standard.vert";

	m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
	m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );
}

// Destructor
EffectShader::~EffectShader()
{
	cleanShaderPrograms();	
}


float EffectShader::s_depthValid[2] = { 0.f, 0.f };
float EffectShader::s_shadowPass = 0.f;
float EffectShader::s_shadowExtent = EffectShader::kShadowExtent;
float EffectShader::s_lightDir[3] = { 0.45f, 0.80f, -0.40f };
float EffectShader::s_lightM[16] = { 1.f, 0.f, 0.f, 0.f,  0.f, 1.f, 0.f, 0.f,
                                     0.f, 0.f, 1.f, 0.f,  0.f, 0.f, 0.f, 1.f };

void EffectShader::cleanShaderPrograms()
{
	glDeleteProgram(m_sh_prog_id);
}


void EffectShader::resetParameters()
{
	m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
	m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );

	for( unsigned int i = 0; i < m_uniforms.size(); i++ )
		m_uniforms[i]->resetParameters( (float) ( m_timeSolo + 2 * m_timeInterpolation ) );

	// Fresh per-activation seeds for the formula layer (seed1..seed3).
	for( int i = 0; i < 3; i++ )
		m_exprSeeds[i] = (float) qrand() / (float) RAND_MAX;
}


void EffectShader::enableShader( )
{
	ensureCompiled();          // lazy: compile on first use (see prepare())
	glUseProgram( m_sh_prog_id );
}


void EffectShader::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2  )
{
	m_exprTime = time;              // formula layer reads this frame's time
	glUniform1i( m_texPointUni1, texLoc1 );		// Combine Unit 0, nicht mit texId verwechseln
	glUniform1i( m_texPointUni2, texLoc2 );		// Combine Unit 0, nicht mit texId verwechseln
	glUniform2f( m_texSizeRcpUni, (float) m_width, (float) m_height );
	glUniform1f( m_timeUni, time );
    glUniform1f( m_interpolationUni, interpolation );

	
	for( unsigned int i = 0; i < m_uniforms.size(); i++ )
		m_uniforms[i]->setUniform();
	
	m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
	m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );

}


void EffectShader::startInterpolators()
{
	for( unsigned int i = 0; i < m_uniforms.size(); i++ )
		m_uniforms[i]->startInterpolator();
}


void EffectShader::draw( )
{
	drawWindow();
}


void EffectShader::drawWindow()
{
	// Core profile: fullscreen triangle via the shared Fullscreen.vert
	// (the VAO lives in filterShader.cpp — one empty VAO for all passes).
	extern GLuint fullscreenVAO();
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
}


/**
 * Sets up the GLSL runtime and creates shader.
 */
void EffectShader::initUniforms(int width, int height)
{	
	m_width = width;
	m_height = height;

	checkGLErrors("loadShader 1");

	// load and compile shader
	m_sh_prog_id = setShaders( m_vertexShaderFilename, m_fragmentShaderFilename );
	m_texPointUni1 = glGetUniformLocation( m_sh_prog_id, "tex0" );
	m_texPointUni2 = glGetUniformLocation( m_sh_prog_id, "tex1" );
	m_texSizeRcpUni = glGetUniformLocation( m_sh_prog_id, "resolution" );
	m_timeUni = glGetUniformLocation( m_sh_prog_id, "time" );
	m_interpolationUni = glGetUniformLocation( m_sh_prog_id, "interpolation" );


	unsigned int nr = (unsigned int) m_uniforms.size();
	
	for( unsigned int i = 0; i < m_uniforms.size(); i++ )
		m_uniforms[i]->initUniform( m_sh_prog_id );

	checkGLErrors("loadShader 2");
}


/**
 * Checks for OpenGL errors.
 * Extremely useful debugging function: When developing, 
 * make sure to call this after almost every GL call.
 */
void EffectShader::checkGLErrors( const char *label )
{
    GLenum errCode = glGetError();
    if ( errCode == GL_NO_ERROR )
		return;

	// gluErrorString returns NULL for codes it does not know (newer GL) —
	// fputs(NULL) crashed the app the moment such an error occurred.
	const char *msg = (const char *) gluErrorString( errCode );
	fprintf( stderr, "OpenGL ERROR: %s (0x%04x, label: %s)\n",
	         msg ? msg : "?", (unsigned) errCode, label ? label : "?" );
}


void EffectShader::addUniform( const QString &name, float minf, float maxf )
{
	Uniform *u = new Uniform( name, BASE_TYPE_FLOAT );
	u->setMinMax( minf, maxf );
	u->resetParameters();
	m_uniforms.push_back( u );
}

void EffectShader::addUniform( const QString &name, int minf, int maxf )
{
	Uniform *u = new Uniform( name, BASE_TYPE_INT );
	u->setMinMax( minf, maxf );
	u->resetParameters();
	m_uniforms.push_back( u );
}

void EffectShader::addUniform( const QString &name, float pro )
{
	Uniform *u = new Uniform( name, BASE_TYPE_BOOL );
	u->setProbability( pro );
	u->resetParameters();
	m_uniforms.push_back( u );
}



void EffectShader::addUniformInterpolator( const QString &name, float interpolatorMinMinf,
						  float interpolatorMinMaxf,
						  float interpolatorMaxMinf,
						  float interpolatorMaxMaxf )
{
	Uniform *u = new Uniform( name, BASE_TYPE_INTERPOLATOR_FLOAT );
	u->setInterpolator( interpolatorMinMinf, interpolatorMinMaxf, interpolatorMaxMinf, interpolatorMaxMaxf, (float) ( m_timeSolo + 2* m_timeInterpolation ) );
	u->resetParameters();
	m_uniforms.push_back( u );
}




unsigned int EffectShader::getTimeSolo()
{
	return m_timeSolo; //getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );

}

unsigned int EffectShader::getTimeInterpolation()
{
	
	return m_timeInterpolation; //getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );
}


unsigned int EffectShader::getInterpolatedTime( unsigned int minTime, unsigned int maxTime )
{
	// min == max in the config would be qrand() % 0 → integer div-by-zero crash.
	return (maxTime > minTime) ? minTime + (qrand() % (maxTime - minTime)) : minTime;
}


// ---------------------------------------------------------------------------
// applyAudioFeatures
// Called after setUniforms() while the shader program is still active.
//
// IMPORTANT – why we no longer scale speed/speedTunnel here:
//   Those uniforms are multiplied by the absolute 'time' uniform inside the
//   shaders (phase = time*speed).  Scaling them per-frame therefore remapped
//   the WHOLE accumulated phase every time the audio changed, producing large
//   discontinuous jumps – the "wild flicker".  Audio-driven motion is now
//   delivered as pre-integrated, continuous phase offsets (audioPhase /
//   audioAdvance), computed once per frame in FilterShader::paint().  The base
//   speed/speedTunnel uniforms keep advancing smoothly and untouched.
//
// This function only uploads dedicated audio uniforms.  glGetUniformLocation
// returns -1 for any uniform a shader does not declare, so the corresponding
// upload is silently skipped (e.g. plain combine shaders react to nothing).
// ---------------------------------------------------------------------------
// Audio-uniform name table for the per-program location cache below
// (indices = the AL_* enum; order must match).
namespace {
enum AudioLoc {
    AL_PHASE, AL_ADVANCE, AL_BEAT, AL_LEVEL, AL_SIDES, AL_FLIP, AL_CENTROID,
    AL_FLUX, AL_SUBBASS, AL_BASS, AL_LOWMID, AL_MID, AL_UPPERMID, AL_HIGH,
    AL_ROLLOFF, AL_SPREAD, AL_MODE, AL_PITCH, AL_AROUSAL, AL_VALENCE,
    AL_HCDF, AL_ROUGH, AL_SHARP, AL_ONSET, AL_DOWNBEAT, AL_BEATPH,
    AL_STEREO, AL_DPITCH, AL_MUSIC, AL_STBANDL, AL_STBANDR, AL_CHROMA,
    AL_SWELL, AL_BARPH, AL_AMBIENT, AL_KICK, AL_SNARE, AL_HAT, AL_TRANS,
    AL_SPECTRUM, AL_TEXSIM, AL_TEXFLUID, AL_BUILDUP, AL_DROP, AL_WAVE,
    AL_BASSREL, AL_MIDREL, AL_TREBREL, AL_DAYPHASE, AL_TEXSMOKE3D,
    AL_CHROMA12, AL_FLATNESS, AL_ZCR, AL_TEXSSM, AL_SSMHEAD, AL_SSMFILL,
    AL_TEXPHYS, AL_FADEOUT, AL_MELODY, AL_MELODYHEAD,
    AL_TEXSPECTRO, AL_SPECTROHEAD, AL_SPECTROFILL,
    AL_TEXDEPTH0, AL_TEXDEPTH1, AL_DEPTHVALID, AL_NEARFAR, AL_TANHALFFOV,
    AL_TEXSHADOW, AL_LIGHTM, AL_SHADOWPASS, AL_LIGHTDIR, AL_SHADOWTEXEL,
    AL_OITPASS, AL_SHADOWEXTENT, AL_COUNT
};
const char *kAudioLocNames[AL_COUNT] = {
    "audioPhase", "audioAdvance", "audioBeat", "audioLevel", "sides",
    "audioFlip", "audioCentroid", "audioFlux", "audioSubBass", "audioBass",
    "audioLowMid", "audioMid", "audioUpperMid", "audioHigh", "audioRolloff",
    "audioSpread", "audioMode", "audioPitch", "audioArousal", "audioValence",
    "audioHarmChange", "audioRoughness", "audioSharpness", "audioOnset",
    "audioDownbeat", "audioBeatPhase", "audioStereo", "audioDeltaPitch",
    "audioMusic", "audioStereoL", "audioStereoR", "audioChromaHue",
    "audioSwell", "audioBarPhase", "audioAmbient", "audioKick", "audioSnare",
    "audioHat", "transStyle", "audioSpectrum", "texSim", "texFluid",
    "audioBuildUp", "audioDrop", "audioWave", "audioBassRel", "audioMidRel",
    "audioTrebRel", "dayPhase", "texSmoke3D", "audioChroma", "audioFlatness",
    "audioZCR", "texSSM", "ssmHead", "ssmFill", "texPhysarum",
    "audioFadeOut", "audioMelody", "audioMelodyHead",
    "texSpectro", "spectroHead", "spectroFill",
    "texDepth0", "texDepth1", "depthValid", "nearFar", "tanHalfFov",
    "texShadow", "lightM", "shadowPass", "lightDir", "shadowTexel",
    "oitPass", "shadowExtent"
};
}

void EffectShader::applyAudioFeatures(const AudioFeatures &f)
{
    // Per-program LOCATION CACHE: this used to perform ~45 string-keyed
    // glGetUniformLocation lookups per shader per FRAME - the single biggest
    // CPU cost in the render loop.  Locations are looked up once per program
    // and auto-refresh when the program id changes (recompile / hot reload).
    if (m_audioLocs.progId != m_sh_prog_id)
    {
        for (int i = 0; i < AL_COUNT; ++i)
            m_audioLocs.L[i] = glGetUniformLocation(m_sh_prog_id, kAudioLocNames[i]);
        m_audioLocs.progId = m_sh_prog_id;
    }
    const GLint *L = m_audioLocs.L;

    if (L[AL_KICK]     >= 0) glUniform1f(L[AL_KICK],     f.onsetKick);
    if (L[AL_SNARE]    >= 0) glUniform1f(L[AL_SNARE],    f.onsetSnare);
    if (L[AL_HAT]      >= 0) glUniform1f(L[AL_HAT],      f.onsetHat);
    if (L[AL_TRANS]    >= 0) glUniform1i(L[AL_TRANS],    f.transStyle);
    if (L[AL_AROUSAL]  >= 0) glUniform1f(L[AL_AROUSAL],  f.arousal);
    if (L[AL_VALENCE]  >= 0) glUniform1f(L[AL_VALENCE],  f.valence);
    if (L[AL_HCDF]     >= 0) glUniform1f(L[AL_HCDF],     f.harmonicChange);
    if (L[AL_ROUGH]    >= 0) glUniform1f(L[AL_ROUGH],    f.roughness);
    if (L[AL_SHARP]    >= 0) glUniform1f(L[AL_SHARP],    f.sharpness);
    if (L[AL_ONSET]    >= 0) glUniform1f(L[AL_ONSET],    f.onsetStrength);
    if (L[AL_DOWNBEAT] >= 0) glUniform1f(L[AL_DOWNBEAT], f.downbeat);
    if (L[AL_BEATPH]   >= 0) glUniform1f(L[AL_BEATPH],   f.beatPhase);
    if (L[AL_STEREO]   >= 0) glUniform1f(L[AL_STEREO],   f.stereoWidth);
    if (L[AL_DPITCH]   >= 0) glUniform1f(L[AL_DPITCH],   f.deltaPitch);
    if (L[AL_MUSIC]    >= 0) glUniform1f(L[AL_MUSIC],    f.musicPresence);
    if (L[AL_STBANDL]  >= 0) glUniform3f(L[AL_STBANDL],  f.stereoLowL, f.stereoMidL, f.stereoHighL);
    if (L[AL_STBANDR]  >= 0) glUniform3f(L[AL_STBANDR],  f.stereoLowR, f.stereoMidR, f.stereoHighR);
    if (L[AL_CHROMA]   >= 0) glUniform1f(L[AL_CHROMA],   f.chromaHue);
    if (L[AL_SWELL]    >= 0) glUniform1f(L[AL_SWELL],    f.swell);
    if (L[AL_BARPH]    >= 0) glUniform1f(L[AL_BARPH],    f.barPhase);
    if (L[AL_AMBIENT]  >= 0) glUniform1f(L[AL_AMBIENT],  f.ambientFactor);
    if (L[AL_SPECTRUM] >= 0) glUniform1fv(L[AL_SPECTRUM], AudioFeatures::kSpectrumBands, f.spectrum);
    if (L[AL_WAVE]     >= 0) glUniform1fv(L[AL_WAVE],     AudioFeatures::kWavePoints,   f.wave);
    if (L[AL_BASSREL]  >= 0) glUniform1f(L[AL_BASSREL],  f.bassRel);
    if (L[AL_MIDREL]   >= 0) glUniform1f(L[AL_MIDREL],   f.midRel);
    if (L[AL_TREBREL]  >= 0) glUniform1f(L[AL_TREBREL],  f.trebRel);
    if (L[AL_DAYPHASE] >= 0) glUniform1f(L[AL_DAYPHASE], f.dayPhase);
    if (L[AL_CHROMA12] >= 0) glUniform1fv(L[AL_CHROMA12], 12, f.chroma);
    if (L[AL_FADEOUT]  >= 0) glUniform1f(L[AL_FADEOUT],  f.fadeOut);
    if (L[AL_MELODY]   >= 0) glUniform1fv(L[AL_MELODY], AudioFeatures::kMelodyLen, f.melody);
    if (L[AL_MELODYHEAD] >= 0) glUniform1f(L[AL_MELODYHEAD], f.melodyHead);
    if (L[AL_FLATNESS] >= 0) glUniform1f(L[AL_FLATNESS], f.spectralFlatness);
    if (L[AL_ZCR]      >= 0) glUniform1f(L[AL_ZCR],      f.zeroCrossingRate);

    // ---- FORMULA LAYER: evaluate the preset's <expr> mappings ----
    // Runs AFTER the random <float> params (setUniforms), so a formula on
    // the same uniform name deliberately takes over.
    if (!m_exprs.empty())
    {
        float v[ExprVars::V_COUNT];
        v[ExprVars::V_TIME]     = m_exprTime;
        v[ExprVars::V_BASS]     = f.bassLevel;
        v[ExprVars::V_MID]      = 0.5f * (f.lowMidLevel + f.midLevel);
        v[ExprVars::V_TREB]     = 0.5f * (f.upperMidLevel + f.highLevel);
        v[ExprVars::V_BASSREL]  = f.bassRel;
        v[ExprVars::V_MIDREL]   = f.midRel;
        v[ExprVars::V_TREBREL]  = f.trebRel;
        v[ExprVars::V_SUBBASS]  = f.subBassLevel;
        v[ExprVars::V_HIGH]     = f.highLevel;
        v[ExprVars::V_LEVEL]    = f.overallLevel;
        v[ExprVars::V_KICK]     = f.onsetKick;
        v[ExprVars::V_SNARE]    = f.onsetSnare;
        v[ExprVars::V_HAT]      = f.onsetHat;
        v[ExprVars::V_ONSET]    = f.onsetStrength;
        v[ExprVars::V_BEAT]     = f.beatDecay;
        v[ExprVars::V_BEATPH]   = f.beatPhase;
        v[ExprVars::V_BARPH]    = f.barPhase;
        v[ExprVars::V_DOWNBEAT] = f.downbeat;
        v[ExprVars::V_SWELL]    = f.swell;
        v[ExprVars::V_BUILDUP]  = f.buildUp;
        v[ExprVars::V_DROP]     = f.dropPulse;
        v[ExprVars::V_CHROMA]   = f.chromaHue;
        v[ExprVars::V_CENTROID] = f.spectralCentroid;
        v[ExprVars::V_FLUX]     = f.spectralFlux;
        v[ExprVars::V_AROUSAL]  = f.arousal;
        v[ExprVars::V_VALENCE]  = f.valence;
        v[ExprVars::V_AMBIENT]  = f.ambientFactor;
        v[ExprVars::V_RHYTHM]   = f.rhythmStrength;
        v[ExprVars::V_MUSIC]    = f.musicPresence;
        v[ExprVars::V_ADVANCE]  = f.audioAdvance;
        v[ExprVars::V_PHASE]    = f.audioRotPhase;
        v[ExprVars::V_DAYPHASE] = f.dayPhase;
        v[ExprVars::V_FLATNESS] = f.spectralFlatness;
        v[ExprVars::V_ZCR]      = f.zeroCrossingRate;
        v[ExprVars::V_FADEOUT]  = f.fadeOut;
        v[ExprVars::V_SEED1]    = m_exprSeeds[0];
        v[ExprVars::V_SEED2]    = m_exprSeeds[1];
        v[ExprVars::V_SEED3]    = m_exprSeeds[2];

        for (ExprEntry &e : m_exprs)
        {
            if (e.progId != m_sh_prog_id)
            {
                QByteArray nm = e.name.toLatin1();
                e.loc    = glGetUniformLocation(m_sh_prog_id, nm.constData());
                e.progId = m_sh_prog_id;
            }
            if (e.loc >= 0 && e.prog.valid())
                glUniform1f(e.loc, e.prog.eval(v));
        }
    }
    if (L[AL_TEXSIM]      >= 0) glUniform1i(L[AL_TEXSIM],      7);   // RD field (unit 7)
    if (L[AL_TEXFLUID]    >= 0) glUniform1i(L[AL_TEXFLUID],    8);   // fluid dye (unit 8)
    if (L[AL_TEXSMOKE3D]  >= 0) glUniform1i(L[AL_TEXSMOKE3D],  9);   // smoke/fire volume (unit 9)
    if (L[AL_TEXSSM]      >= 0) glUniform1i(L[AL_TEXSSM],     10);   // self-similarity matrix
    if (L[AL_TEXPHYS]     >= 0) glUniform1i(L[AL_TEXPHYS],    11);   // Physarum trail map
    // Unit 28 sits above the ComputeFX block (12..27).  A shader only ever has
    // a handful of these active at once, so the per-stage unit limit is never
    // the binding constraint — the numbering just has to stay collision-free.
    if (L[AL_TEXSPECTRO]  >= 0) glUniform1i(L[AL_TEXSPECTRO], 28);   // spectrogram history
    // The two scene depth buffers, as the combine stage sees them.  depthValid
    // says whether each one actually holds a 3D scene's geometry — a 2D effect
    // leaves the far plane there, and a depth-driven combine has to know the
    // difference between "everything is far away" and "there is no depth".
    if (L[AL_TEXDEPTH0]   >= 0) glUniform1i(L[AL_TEXDEPTH0],  29);
    if (L[AL_TEXDEPTH1]   >= 0) glUniform1i(L[AL_TEXDEPTH1],  30);
    if (L[AL_DEPTHVALID]  >= 0) glUniform2f(L[AL_DEPTHVALID],
                                            s_depthValid[0], s_depthValid[1]);
    if (L[AL_NEARFAR]     >= 0) glUniform2f(L[AL_NEARFAR],
                                            kSceneNear, kSceneFar);
    if (L[AL_TANHALFFOV]  >= 0) glUniform1f(L[AL_TANHALFFOV], kSceneTanHalfFovY);
    if (L[AL_TEXSHADOW]   >= 0) glUniform1i(L[AL_TEXSHADOW],  31);
    if (L[AL_LIGHTM]      >= 0) glUniformMatrix4fv(L[AL_LIGHTM], 1, GL_FALSE, s_lightM);
    if (L[AL_SHADOWPASS]  >= 0) glUniform1f(L[AL_SHADOWPASS],  s_shadowPass);
    if (L[AL_LIGHTDIR]    >= 0) glUniform3f(L[AL_LIGHTDIR], s_lightDir[0],
                                            s_lightDir[1], s_lightDir[2]);
    if (L[AL_SHADOWTEXEL] >= 0) glUniform1f(L[AL_SHADOWTEXEL], 1.f / 2048.f);
    if (L[AL_OITPASS]     >= 0) glUniform1f(L[AL_OITPASS],     s_oitPass);
    if (L[AL_SHADOWEXTENT]>= 0) glUniform1f(L[AL_SHADOWEXTENT], s_shadowExtent);
    if (L[AL_SSMHEAD]     >= 0) glUniform1f(L[AL_SSMHEAD],  f.ssmHead);
    if (L[AL_SSMFILL]     >= 0) glUniform1f(L[AL_SSMFILL],  f.ssmFill);
    if (L[AL_SPECTROHEAD] >= 0) glUniform1f(L[AL_SPECTROHEAD], f.spectroHead);
    if (L[AL_SPECTROFILL] >= 0) glUniform1f(L[AL_SPECTROFILL], f.spectroFill);
    if (L[AL_BUILDUP]  >= 0) glUniform1f(L[AL_BUILDUP],  f.buildUp);
    if (L[AL_DROP]     >= 0) glUniform1f(L[AL_DROP],     f.dropPulse);
    if (L[AL_PHASE]    >= 0) glUniform1f(L[AL_PHASE],    f.audioRotPhase);
    if (L[AL_ADVANCE]  >= 0) glUniform1f(L[AL_ADVANCE],  f.audioAdvance);
    if (L[AL_BEAT]     >= 0) glUniform1f(L[AL_BEAT],     f.beatDecay);
    if (L[AL_LEVEL]    >= 0) glUniform1f(L[AL_LEVEL],    f.overallLevel);
    if (L[AL_SIDES]    >= 0) glUniform1i(L[AL_SIDES],    int(f.smoothedSides + 0.5f));
    if (L[AL_FLIP]     >= 0) glUniform1f(L[AL_FLIP],     f.audioFlip);
    if (L[AL_CENTROID] >= 0) glUniform1f(L[AL_CENTROID], f.spectralCentroid);
    if (L[AL_FLUX]     >= 0) glUniform1f(L[AL_FLUX],     f.spectralFlux);
    if (L[AL_SUBBASS]  >= 0) glUniform1f(L[AL_SUBBASS],  f.subBassLevel);
    if (L[AL_BASS]     >= 0) glUniform1f(L[AL_BASS],     f.bassLevel);
    if (L[AL_LOWMID]   >= 0) glUniform1f(L[AL_LOWMID],   f.lowMidLevel);
    if (L[AL_MID]      >= 0) glUniform1f(L[AL_MID],      f.midLevel);
    if (L[AL_UPPERMID] >= 0) glUniform1f(L[AL_UPPERMID], f.upperMidLevel);
    if (L[AL_HIGH]     >= 0) glUniform1f(L[AL_HIGH],     f.highLevel);
    if (L[AL_ROLLOFF]  >= 0) glUniform1f(L[AL_ROLLOFF],  f.spectralRolloff);
    if (L[AL_SPREAD]   >= 0) glUniform1f(L[AL_SPREAD],   f.spectralSpread);
    if (L[AL_MODE]     >= 0) glUniform1f(L[AL_MODE],     f.musicalMode);
    if (L[AL_PITCH]    >= 0) glUniform1f(L[AL_PITCH],    f.dominantPitch);
}


void EffectShader::addExpression( const QString &name, const QString &formula )
{
	ExprEntry e;
	e.name = name;
	QString ctx = QString("%1:%2").arg(m_fragmentShaderFilename ?
	                                   m_fragmentShaderFilename : "?").arg(name);
	if (e.prog.compile(formula, ctx))
	{
		m_exprs.push_back(e);
		fprintf(stderr, "Expr OK: %s = %s\n", qPrintable(ctx),
		        qPrintable(formula));
	}

	for (int i = 0; i < 3; i++)
		m_exprSeeds[i] = (float) qrand() / (float) RAND_MAX;
}

bool EffectShader::useShader()
{
	float prob = (float) (qrand()) / (float) RAND_MAX;

	if( prob <= m_probability )
	{
		return true;
	}
	return false;
}

bool EffectShader::usesSim()
{
	if( !m_glReady )
		return false;   // lazy: not compiled -> can't be on screen yet
	if( m_usesSim < 0 )
		m_usesSim = ( m_sh_prog_id != 0 &&
		              glGetUniformLocation( m_sh_prog_id, "texSim" ) >= 0 ) ? 1 : 0;
	return m_usesSim == 1;
}

bool EffectShader::usesFluid()
{
	if( !m_glReady )
		return false;
	if( m_usesFluid < 0 )
		m_usesFluid = ( m_sh_prog_id != 0 &&
		                glGetUniformLocation( m_sh_prog_id, "texFluid" ) >= 0 ) ? 1 : 0;
	return m_usesFluid == 1;
}

bool EffectShader::usesSmoke3D()
{
	if( !m_glReady )
		return false;
	if( m_usesSmoke3D < 0 )
		m_usesSmoke3D = ( m_sh_prog_id != 0 &&
		                  glGetUniformLocation( m_sh_prog_id, "texSmoke3D" ) >= 0 ) ? 1 : 0;
	return m_usesSmoke3D == 1;
}

bool EffectShader::usesSSM()
{
	if( !m_glReady )
		return false;
	if( m_usesSSM < 0 )
		m_usesSSM = ( m_sh_prog_id != 0 &&
		              glGetUniformLocation( m_sh_prog_id, "texSSM" ) >= 0 ) ? 1 : 0;
	return m_usesSSM == 1;
}

float EffectShader::s_oitPass = 0.f;

bool EffectShader::usesOit()
{
	if( !m_glReady )
		return false;
	if( m_usesOit < 0 )
		m_usesOit = ( m_sh_prog_id != 0 &&
		              glGetUniformLocation( m_sh_prog_id, "oitPass" ) >= 0 ) ? 1 : 0;
	return m_usesOit == 1;
}

bool EffectShader::usesShadow()
{
	if( !m_glReady )
		return false;
	if( m_usesShadow < 0 )
		m_usesShadow = ( m_sh_prog_id != 0 &&
		                 glGetUniformLocation( m_sh_prog_id, "texShadow" ) >= 0 ) ? 1 : 0;
	return m_usesShadow == 1;
}

bool EffectShader::usesSpectro()
{
	if( !m_glReady )
		return false;
	if( m_usesSpectro < 0 )
		m_usesSpectro = ( m_sh_prog_id != 0 &&
		                  glGetUniformLocation( m_sh_prog_id, "texSpectro" ) >= 0 ) ? 1 : 0;
	return m_usesSpectro == 1;
}

bool EffectShader::usesPhysarum()
{
	if( !m_glReady )
		return false;
	if( m_usesPhysarum < 0 )
		m_usesPhysarum = ( m_sh_prog_id != 0 &&
		                   glGetUniformLocation( m_sh_prog_id, "texPhysarum" ) >= 0 ) ? 1 : 0;
	return m_usesPhysarum == 1;
}

// Which compute-FX sims does this shader want?  One bit per CfxKind, resolved
// once per program: a shader opts in purely by DECLARING the sampler (same
// convention as texSim/texFluid above).  The sampler's texture unit is bound
// here too — sampler uniforms never change, so once per program is enough.
unsigned int EffectShader::cfxMask()
{
	if( !m_glReady || m_sh_prog_id == 0 )
		return 0;
	if( m_cfxProg != m_sh_prog_id )
	{
		m_cfxProg = m_sh_prog_id;
		m_cfxMask = 0;
		GLint prev = 0;
		glGetIntegerv( GL_CURRENT_PROGRAM, &prev );
		glUseProgram( m_sh_prog_id );
		for( int k = 0; k < CFX_COUNT; ++k )
		{
			GLint loc = glGetUniformLocation( m_sh_prog_id, kCfxInfo[k].sampler );
			if( loc >= 0 )
			{
				m_cfxMask |= ( 1u << k );
				glUniform1i( loc, kCfxInfo[k].unit );
			}
		}
		glUseProgram( GLuint( prev ) );
	}
	return m_cfxMask;
}