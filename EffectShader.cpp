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


	m_uniforms.empty();

	
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


	unsigned int nr = m_uniforms.size();
	
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
	return minTime + (qrand() % (maxTime - minTime));
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
void EffectShader::applyAudioFeatures(const AudioFeatures &f)
{
    // Integrated, jump-free motion phases (computed in FilterShader::paint).
    GLint locPhase    = glGetUniformLocation(m_sh_prog_id, "audioPhase");
    GLint locAdvance  = glGetUniformLocation(m_sh_prog_id, "audioAdvance");

    GLint locBeat     = glGetUniformLocation(m_sh_prog_id, "audioBeat");
    GLint locLevel    = glGetUniformLocation(m_sh_prog_id, "audioLevel");
    GLint locSides    = glGetUniformLocation(m_sh_prog_id, "sides");
    GLint locFlip     = glGetUniformLocation(m_sh_prog_id, "audioFlip");
    GLint locCentroid = glGetUniformLocation(m_sh_prog_id, "audioCentroid");
    GLint locFlux     = glGetUniformLocation(m_sh_prog_id, "audioFlux");
    // 6-band extras (only used by dark-ambient shaders; -1 → no-op for others)
    GLint locSubBass  = glGetUniformLocation(m_sh_prog_id, "audioSubBass");
    GLint locBass     = glGetUniformLocation(m_sh_prog_id, "audioBass");
    GLint locLowMid   = glGetUniformLocation(m_sh_prog_id, "audioLowMid");
    GLint locMid      = glGetUniformLocation(m_sh_prog_id, "audioMid");
    GLint locUpperMid = glGetUniformLocation(m_sh_prog_id, "audioUpperMid");
    GLint locHigh     = glGetUniformLocation(m_sh_prog_id, "audioHigh");
    // FFT-derived features (opt-in; -1 → no-op for shaders that don't declare them)
    GLint locRolloff  = glGetUniformLocation(m_sh_prog_id, "audioRolloff");
    GLint locSpread   = glGetUniformLocation(m_sh_prog_id, "audioSpread");
    GLint locMode     = glGetUniformLocation(m_sh_prog_id, "audioMode");
    GLint locPitch    = glGetUniformLocation(m_sh_prog_id, "audioPitch");
    // Thayer mood axes + extra timbre features (used by the mood-driven shaders).
    GLint locArousal  = glGetUniformLocation(m_sh_prog_id, "audioArousal");
    GLint locValence  = glGetUniformLocation(m_sh_prog_id, "audioValence");
    GLint locHCDF     = glGetUniformLocation(m_sh_prog_id, "audioHarmChange");
    GLint locRough    = glGetUniformLocation(m_sh_prog_id, "audioRoughness");
    GLint locSharp    = glGetUniformLocation(m_sh_prog_id, "audioSharpness");
    GLint locOnset    = glGetUniformLocation(m_sh_prog_id, "audioOnset");
    GLint locDownbeat = glGetUniformLocation(m_sh_prog_id, "audioDownbeat");
    GLint locBeatPh   = glGetUniformLocation(m_sh_prog_id, "audioBeatPhase");
    GLint locStereo   = glGetUniformLocation(m_sh_prog_id, "audioStereo");
    GLint locDPitch   = glGetUniformLocation(m_sh_prog_id, "audioDeltaPitch");
    GLint locMusic    = glGetUniformLocation(m_sh_prog_id, "audioMusic");
    // Stereo-separated spectrum: per-channel (low,mid,high) band energies.
    GLint locStBandL  = glGetUniformLocation(m_sh_prog_id, "audioStereoL");
    GLint locStBandR  = glGetUniformLocation(m_sh_prog_id, "audioStereoR");

    if (locArousal  >= 0) glUniform1f(locArousal,  f.arousal);
    if (locValence  >= 0) glUniform1f(locValence,  f.valence);
    if (locHCDF     >= 0) glUniform1f(locHCDF,     f.harmonicChange);
    if (locRough    >= 0) glUniform1f(locRough,    f.roughness);
    if (locSharp    >= 0) glUniform1f(locSharp,    f.sharpness);
    if (locOnset    >= 0) glUniform1f(locOnset,    f.onsetStrength);
    if (locDownbeat >= 0) glUniform1f(locDownbeat, f.downbeat);
    if (locBeatPh   >= 0) glUniform1f(locBeatPh,   f.beatPhase);
    if (locStereo   >= 0) glUniform1f(locStereo,   f.stereoWidth);
    if (locDPitch   >= 0) glUniform1f(locDPitch,   f.deltaPitch);
    if (locMusic    >= 0) glUniform1f(locMusic,    f.musicPresence);
    if (locStBandL  >= 0) glUniform3f(locStBandL,  f.stereoLowL, f.stereoMidL, f.stereoHighL);
    if (locStBandR  >= 0) glUniform3f(locStBandR,  f.stereoLowR, f.stereoMidR, f.stereoHighR);
    if (locPhase    >= 0) glUniform1f(locPhase,    f.audioRotPhase);
    if (locAdvance  >= 0) glUniform1f(locAdvance,  f.audioAdvance);
    if (locBeat     >= 0) glUniform1f(locBeat,     f.beatDecay);
    if (locLevel    >= 0) glUniform1f(locLevel,    f.overallLevel);
    if (locSides    >= 0) glUniform1i(locSides,    int(f.smoothedSides + 0.5f)); // smoothed steps
    if (locFlip     >= 0) glUniform1f(locFlip,     f.audioFlip);
    if (locCentroid >= 0) glUniform1f(locCentroid, f.spectralCentroid);
    if (locFlux     >= 0) glUniform1f(locFlux,     f.spectralFlux);
    if (locSubBass  >= 0) glUniform1f(locSubBass,  f.subBassLevel);
    if (locBass     >= 0) glUniform1f(locBass,     f.bassLevel);
    if (locLowMid   >= 0) glUniform1f(locLowMid,   f.lowMidLevel);
    if (locMid      >= 0) glUniform1f(locMid,      f.midLevel);
    if (locUpperMid >= 0) glUniform1f(locUpperMid, f.upperMidLevel);
    if (locHigh     >= 0) glUniform1f(locHigh,     f.highLevel);
    // FFT-derived
    if (locRolloff  >= 0) glUniform1f(locRolloff,  f.spectralRolloff);
    if (locSpread   >= 0) glUniform1f(locSpread,   f.spectralSpread);
    if (locMode     >= 0) glUniform1f(locMode,     f.musicalMode);
    if (locPitch    >= 0) glUniform1f(locPitch,    f.dominantPitch);
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