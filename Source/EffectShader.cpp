#include <float.h>

#include "shader_setup.h"
#include "EffectShader.h"

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
}


void EffectShader::enableShader( )
{
	ensureCompiled();          // lazy: compile on first use (see prepare())
	glUseProgram( m_sh_prog_id );
}


void EffectShader::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2  )
{
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
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );

	glMatrixMode(GL_PROJECTION);
	glLoadIdentity();
	gluOrtho2D(0,m_width,0,m_height);
	glMatrixMode(GL_MODELVIEW);
	glLoadIdentity();
	glPolygonMode( GL_FRONT, GL_FILL );

	glBegin(GL_QUADS);
	glTexCoord2f(0,0); glVertex2f(0,0);
	glTexCoord2f(1,0); glVertex2f(m_width,0);
	glTexCoord2f(1,1); glVertex2f(m_width,m_height);
	glTexCoord2f(0,1); glVertex2f(0,m_height);
	glEnd();
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

	fputs( "OpenGL ERROR: ", stderr);
	fputs( (char*)gluErrorString(errCode), stderr);
	fputs( " (label: ", stderr);
	fputs( label, stderr);
	fputs( ")\n", stderr);
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
    AL_SPECTRUM, AL_TEXSIM, AL_TEXFLUID, AL_COUNT
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
    "audioHat", "transStyle", "audioSpectrum", "texSim", "texFluid"
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
    if (L[AL_TEXSIM]   >= 0) glUniform1i(L[AL_TEXSIM],   7);   // RD field (unit 7)
    if (L[AL_TEXFLUID] >= 0) glUniform1i(L[AL_TEXFLUID], 8);   // fluid dye (unit 8)
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