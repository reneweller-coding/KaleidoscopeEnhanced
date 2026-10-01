/**
 * @file EffectShader.cpp
 * @brief Implementation of EffectShader: shader compile/uniform plumbing, solo/interpolation
 *        timing, the audio-feature and formula-layer uniform uploads, and the cached
 *        "usesXxx" shader-capability queries.
 */
#include <float.h>

#include "shader_setup.h"
#include "EffectShader.h"
#include "ComputeFX.h"
#include "textfile.h"
#include <string>
#include <cstring>
#include <cmath>

#include <cstdlib>
#include <chrono>
#include <typeinfo>
#include <algorithm>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

// Constructor
EffectShader::EffectShader( const std::string &filenameFragmentShader, unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation ):
m_minTimeSolo(minTimeSolo)
, m_maxTimeSolo(maxTimeSolo)
, m_minTimeInterpolation(minTimeInterpolation)
, m_maxTimeInterpolation(maxTimeInterpolation)
, m_complexity(1)
, m_probability(1.0)
{


	m_vertexShaderFilename = "..\\standard.vert";
	//m_fragmentShaderFilename = filenameFragmentShader.c_str();//filenameFragmentShader.toLocal8Bit().data();

	m_fragmentShaderFilename = (char *) malloc(sizeof(char)*(filenameFragmentShader.size()+1) );
	// The embedded "\0" in the format string is redundant: sprintf() already NUL-terminates
	// after substituting %s, so parsing stops there regardless. Harmless, kept as-is.
	sprintf( m_fragmentShaderFilename, "%s\0", filenameFragmentShader.c_str() );

	// A chain lab with a generated pass shader set runs its chain as passes
	// (runChainPasses) and compiles the small final shader instead of its
	// all-classes uber-shader (which the editor and the catalogue keep).
	{
		std::string s = filenameFragmentShader;
		size_t a = s.find_last_of( "\\/" );
		std::string base = s.substr( a == std::string::npos ? 0 : a + 1 );
		size_t d = base.rfind( ".frag" );
		if( d != std::string::npos ) base = base.substr( 0, d );
		const std::string fin = "..\\Engine\\ChainPass\\Final_" + base + ".frag";
		if( !getenv( "KALEIDO_NO_CHAINPASS" ) )
			if( FILE *fp = fopen( fin.c_str(), "rb" ) )
			{
				fclose( fp );
				m_compileFile = (char *) malloc( fin.size() + 1 );
				strcpy( m_compileFile, fin.c_str() );
			}
	}

	// Optional per-scene bake compute shader: "X.frag" -> "X.comp", sibling of
	// the fragment file (same convention as Scene3DShader's .vert/.tesc/.comp
	// derivation); the file need not exist, checked lazily in ensureBakeProg().
	{
		std::string s = filenameFragmentShader;
		size_t p = s.rfind( ".frag" );
		if( p != std::string::npos )
			s.replace( p, 5, ".comp" );
		m_bakeCompFilename = (char *) malloc( sizeof(char) * (s.size() + 1) );
		strcpy( m_bakeCompFilename, s.c_str() );
	}


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
float EffectShader::s_reviewSolo  = 0.f;
float EffectShader::s_shadowExtent = EffectShader::kShadowExtent;
float EffectShader::s_lightDir[3] = { 0.45f, 0.80f, -0.40f };
float EffectShader::s_lightM[16] = { 1.f, 0.f, 0.f, 0.f,  0.f, 1.f, 0.f, 0.f,
                                     0.f, 0.f, 1.f, 0.f,  0.f, 0.f, 0.f, 1.f };
float EffectShader::s_shadowPass2 = 0.f;
float EffectShader::s_lightDir2[3] = { -0.35f, 0.55f, 0.60f };
float EffectShader::s_lightM2[16] = { 1.f, 0.f, 0.f, 0.f,  0.f, 1.f, 0.f, 0.f,
                                      0.f, 0.f, 1.f, 0.f,  0.f, 0.f, 0.f, 1.f };

void EffectShader::cleanShaderPrograms()
{
	dropVariants( true );       // back to the generic program, variants released
	// NOT glDeleteProgram: this program may be shared. 212 of the 831 scene
	// entries reuse a program another entry compiled -- almost all of them
	// the 3D-model families, where 24 shaders carry 238 scenes. Deleting it
	// here would pull the shader out from under the others.
	shaderProgramRelease(m_sh_prog_id);
	if( m_bakeProg ) glDeleteProgram( m_bakeProg );
	if( m_bakeTex )  glDeleteTextures( 1, &m_bakeTex );

	// Leave the object in the state it had before its first compile, so that
	// calling this twice is harmless and a later ensureCompiled() actually
	// rebuilds. Without this the ids survived their objects: the effect still
	// reported itself compiled and went on drawing with a released program,
	// which the driver answers with <program> has not been linked -- and, one
	// release per call against a single acquire, the refcount underflowed and
	// took a program still in use with it.
	m_sh_prog_id = 0;
	m_bakeProg   = 0;
	m_bakeTex    = 0;
	m_glReady    = false;
}


/**
 * @brief The solo span (seconds) that sceneProgress is normalised over in review/measurement runs.
 *
 * Die Solo-Spanne, ueber die sceneProgress normiert wird.  KALEIDO_SOLO_SECS
 * pinnt sie fuer Messlaeufe, deren Fenster kuerzer ist als die Review-Spanne
 * von 25 s: mit 8 s Haltezeit sah das Screening von einer inszenierten Szene
 * nie das Ende ihres Bogens -- Assembly stand in jedem Fenster als Wolke.
 * @return KALEIDO_SOLO_SECS if set to a positive value (read once), else EffectShader::s_reviewSolo (0 outside review mode = no cap).
 */
static float soloCap()
{
	static const int env = [] { const char *e = getenv( "KALEIDO_SOLO_SECS" ); return e ? atoi( e ) : 0; }();
	return ( env > 0 ) ? float( env ) : EffectShader::s_reviewSolo;
}


void EffectShader::resetParameters()
{
	m_secCount = -1;                // section memory restarts: the first sight is no door
	// Zufall PRO SZENE statt global.  Mit KALEIDO_SEED bekommt jede
	// Aktivierung ihren eigenen Strom aus (Seed, Shadername, Auftrittszaehler).
	// Vorher hing jede Ziehung davon ab, wer VOR dieser Szene dran war: derselbe
	// Shader mass in einer Neun-Szenen-Probe 0,22 und im 112er-Chunk 0,0006,
	// und der Nachbau scheiterte, weil die Nachbarn andere waren.  Ohne
	// KALEIDO_SEED wird NICHT neu geseedet -- die Show bleibt uhrgeseedet.
	static const char *pinEnv = getenv( "KALEIDO_SEED" );
	++m_activations;
	if( pinEnv )
	{
		unsigned h = (unsigned) strtoul( pinEnv, nullptr, 10 ) ^ 2166136261u;
		for( const char *c = m_fragmentShaderFilename; c && *c; ++c )
			h = ( h ^ (unsigned)(unsigned char) *c ) * 16777619u;      // FNV-1a
		h = ( h ^ m_activations ) * 16777619u;
		srand( h ^ ( h >> 15 ) );
	}

	m_timeSolo = getInterpolatedTime( m_minTimeSolo, m_maxTimeSolo );
	m_timeInterpolation = getInterpolatedTime( m_minTimeInterpolation, m_maxTimeInterpolation );

	// Restart the sceneProgress ramp. The length is captured HERE because
	// setUniforms() re-rolls m_timeSolo every frame; the activation time is
	// left as a sentinel because this function has no time to work from, so
	// the first setUniforms() after the reset fills it in.
	m_soloAtReset    = (float) m_timeSolo;
	// Auf dem Review-Prueftisch zeigt der Scheduler jede Szene nur
	// kReviewSoloSecs lang, sceneProgress normierte aber weiter ueber die
	// gewuerfelte Solo-Spanne -- eine inszenierte Szene lief damit genau
	// dort nie zu Ende, wo man sie beurteilen will.
	if( soloCap() > 0.01f && m_soloAtReset > soloCap() )
		m_soloAtReset = soloCap();
	m_activationTime = -1.0e9f;
	m_progressT0     = -1.0e9f;
	m_advanceAtReset = -1.0e9f;   // sceneAdvance faengt neu bei 0 an
	m_sceneProgress  = 0.f;

	// The "life" budget handed to each Uniform is solo + 2*interpolation: one
	// interpolation span to fade IN, the solo span held at full value, and one
	// interpolation span to fade back OUT — so a Uniform's own randomised
	// min/max sweep can be timed to complete exactly once across the effect's
	// whole active lifetime rather than per solo/interpolation phase.
	for( unsigned int i = 0; i < m_uniforms.size(); i++ )
		m_uniforms[i]->resetParameters( (float) ( m_timeSolo + 2 * m_timeInterpolation ) );

	// Fresh per-activation seeds for the formula layer (seed1..seed3).
	for( int i = 0; i < 3; i++ )
		m_exprSeeds[i] = (float) rand() / (float) RAND_MAX;

	// Colour grade (preset entry grade="fade,grey,sepia"): one of the listed
	// looks per activation.  Entries without the attribute draw nothing, so
	// their random stream stays exactly as before.
	m_gradeMode = m_gradeModes.empty() ? 0 : m_gradeModes[ rand() % m_gradeModes.size() ];

	// A chain lab starts its walk afresh from the knobs just rolled.
	m_walk.pending = true;
	m_cam.pending  = true;

	// Unter KALEIDO_SEED protokollieren, was gezogen wurde: der Beweis, dass
	// dieselbe Szene in jeder Konfiguration dieselben Zahlen bekommt, ist
	// ein Diff dieser Zeilen -- nicht ein Bildvergleich, den die Ueberblendung
	// vom Nachbarn verfaelscht.
	if( pinEnv )
		fprintf( stderr, "SEEDED %s act=%u seeds=%.4f %.4f %.4f solo=%u" "\n",
		         m_fragmentShaderFilename, m_activations, m_exprSeeds[0], m_exprSeeds[1], m_exprSeeds[2], m_timeSolo );
}


void EffectShader::enableShader( )
{
	ensureCompiled();          // lazy: compile on first use (see prepare())
	// A specialised variant chosen last frame takes over at the START of this
	// one, before setUniforms(), so every uniform of the frame goes to it.
	if( m_specRevert )
	{
		m_specRevert = false;
		dropVariants( false );
	}
	if( m_specNext )
	{
		if( !m_genericProg ) m_genericProg = m_sh_prog_id;
		bindProgram( m_specNext );
		m_specBound = m_specNextKey;
		static const bool specLog = getenv( "KALEIDO_SPEC_LOG" ) != 0;
		if( specLog ) fprintf( stderr, "SPEC bind %u for %s\n", m_sh_prog_id, fragmentName() );
		m_specNext = 0;
		m_specNextKey.clear();
	}
	glUseProgram( m_sh_prog_id );
}

void EffectShader::bindProgram( GLuint prog )
{
	m_sh_prog_id = prog;
	glUseProgram( prog );
	m_texPointUni1     = glGetUniformLocation( prog, "tex0" );
	m_texPointUni2     = glGetUniformLocation( prog, "tex1" );
	m_texSizeRcpUni    = glGetUniformLocation( prog, "resolution" );
	m_timeUni          = glGetUniformLocation( prog, "time" );
	m_interpolationUni = glGetUniformLocation( prog, "interpolation" );
	m_progressUni      = glGetUniformLocation( prog, "sceneProgress" );
	m_sceneTimeUni     = glGetUniformLocation( prog, "sceneTime" );
	for( unsigned int i = 0; i < m_uniforms.size(); i++ )
		m_uniforms[i]->initUniform( prog );
	// every other location cache is keyed by the program id and refreshes
	// itself -- the walk's must not take the switch for a new activation
	m_walkProgSwap = true;
}

void EffectShader::dropVariants( bool release )
{
	if( m_genericProg && m_sh_prog_id != m_genericProg )
		bindProgram( m_genericProg );
	m_genericProg = 0;
	m_specBound.clear();
	m_specNext = 0;
	m_specNextKey.clear();
	m_specWait = 0.f;
	if( release )
	{
		for( auto &kv : m_specProgs )
			shaderProgramRelease( kv.second );
		m_specProgs.clear();
		m_specLru.clear();
	}
}


void EffectShader::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2  )
{
	m_exprTime = time;              // formula layer reads this frame's time
	glUniform1i( m_texPointUni1, texLoc1 );		// Combine Unit 0, nicht mit texId verwechseln
	glUniform1i( m_texPointUni2, texLoc2 );		// Combine Unit 0, nicht mit texId verwechseln
	glUniform2f( m_texSizeRcpUni, (float) m_width, (float) m_height );
	glUniform1f( m_timeUni, time );
    glUniform1f( m_interpolationUni, interpolation );

	// sceneProgress: 0 at activation, 1 at the end of the rolled solo span.
	// The length is normally captured by resetParameters(), but the FIRST
	// effect the scheduler shows is never reset -- it is simply already
	// selected when the show starts -- so without this fallback that one
	// scene would divide by zero and sit at progress 0 forever. Found by
	// rendering a single-scene probe and watching sceneProgress never move.
	if( m_soloAtReset <= 0.01f )
	{
		m_soloAtReset = (float) m_timeSolo;
		if( soloCap() > 0.01f && m_soloAtReset > soloCap() )
			m_soloAtReset = soloCap();   // same cap as resetParameters()
	}
	if( m_activationTime < -0.9e9f )
		m_activationTime = time;
	if( m_progressT0 < -0.9e9f )
		m_progressT0 = time;
	m_sceneProgress = ( m_soloAtReset > 0.01f )
	                ? ( time - m_progressT0 ) / m_soloAtReset : 0.f;
	m_sceneProgress = ( m_sceneProgress < 0.f ) ? 0.f
	                : ( m_sceneProgress > 1.f ) ? 1.f : m_sceneProgress;
	if( m_progressUni >= 0 )
		glUniform1f( m_progressUni, m_sceneProgress );

	// sceneTime: Sekunden SEIT DIESER Aktivierung, im Gegensatz zu `time`,
	// das seit dem Programmstart laeuft und nie zurueckgesetzt wird.  Wer
	// eine Kamera mit `time` vorwaerts schiebt, deren Welt aber nur nahe dem
	// Ursprung existiert, fliegt nach Minuten aus ihr heraus und zeigt nur
	// noch Hintergrund -- gemessen an einer Szene, die bei Uhr 0 eine
	// Struktur von 0.19 hat und bei Uhr 3600 noch 0.0005.  Gegen sceneTime
	// geschrieben faengt so ein Flug bei jeder Aktivierung neu an.
	m_lastSceneTime = time - m_activationTime;
	if( m_sceneTimeUni >= 0 )
		glUniform1f( m_sceneTimeUni, time - m_activationTime );

	
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
	if( usesBake() )
		stepBake( m_exprTime, m_lastAudioForBake );
	// texMandelbrot always reads unit 35 (RenderPipeline.cpp binds the
	// compute result there -- see ComputeFX::stepMandelbrot()'s comment for
	// why this bypasses the generic cfxMask() unit table); same one-line-
	// per-draw pattern as texBake just above, no per-program location cache
	// needed for a single constant.
	if( usesMandelbrot() )
	{
		GLint lTexMandelbrot = glGetUniformLocation( m_sh_prog_id, "texMandelbrot" );
		if( lTexMandelbrot >= 0 ) glUniform1i( lTexMandelbrot, 35 );
	}
	drawWindow();
}


void EffectShader::drawWindow()
{
	// Core profile: fullscreen triangle via the shared Fullscreen.vert
	// (the VAO lives in RenderPipeline.cpp — one empty VAO for all passes).
	extern GLuint fullscreenVAO();
	glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
	glBindVertexArray( fullscreenVAO() );
	glDrawArrays( GL_TRIANGLES, 0, 3 );
	glBindVertexArray( 0 );
}


/**
 * @brief Sets up the GLSL runtime and creates shader.
 *
 * Compiles the vertex+fragment program (setShaders), resolves the common
 * uniform locations, and lets every already-registered Uniform resolve its
 * own location.
 */
void EffectShader::initUniforms(int width, int height)
{	
	m_width = width;
	m_height = height;

	// Entry drain: whatever this reports happened BEFORE initUniforms, not in
	// it. The old label ("loadShader 1") read as an accusation against the
	// shader being loaded and cost real time chasing that.
	checkGLErrors("entry of initUniforms");

	// load and compile shader
	m_sh_prog_id = setShaders( m_vertexShaderFilename, m_compileFile ? m_compileFile : m_fragmentShaderFilename );
	m_texPointUni1 = glGetUniformLocation( m_sh_prog_id, "tex0" );
	m_texPointUni2 = glGetUniformLocation( m_sh_prog_id, "tex1" );
	m_texSizeRcpUni = glGetUniformLocation( m_sh_prog_id, "resolution" );
	m_timeUni = glGetUniformLocation( m_sh_prog_id, "time" );
	m_interpolationUni = glGetUniformLocation( m_sh_prog_id, "interpolation" );
	m_progressUni      = glGetUniformLocation( m_sh_prog_id, "sceneProgress" );
	m_sceneTimeUni     = glGetUniformLocation( m_sh_prog_id, "sceneTime" );


	
	for( unsigned int i = 0; i < m_uniforms.size(); i++ )
		m_uniforms[i]->initUniform( m_sh_prog_id );

	checkGLErrors("loadShader 2");
}


/**
 * Extremely useful debugging function: when developing,
 * make sure to call this after almost every GL call. The label (see the
 * declaration in EffectShader.h for the parameter list) is a short tag for the
 * checkpoint, printed with the error message.
 */
void EffectShader::checkGLErrors( const char *label )
{
    GLenum errCode = glGetError();
    if ( errCode == GL_NO_ERROR )
		return;

	// gluErrorString returns NULL for codes it does not know (newer GL) —
	// fputs(NULL) crashed the app the moment such an error occurred.
	const char *msg = (const char *) gluErrorString( errCode );
	// "noticed at", not "in": glGetError drains a GLOBAL queue, so the label
	// names the checkpoint that FOUND the error, not the call that raised it.
	// The cause lies between the previous checkpoint and this one -- and since
	// RenderPipeline::checkGLErrors() is a no-op unless KALEIDO_GL_DEBUG is
	// set, in a normal run "the previous checkpoint" can be a long way back,
	// in another subsystem entirely. Reading the label as a location has sent
	// debugging down the wrong path here more than once.
	fprintf( stderr, "OpenGL ERROR: %s (0x%04x, noticed at: %s; raised before "
	                 "this checkpoint, not necessarily here)\n",
	         msg ? msg : "?", (unsigned) errCode, label ? label : "?" );
}


// LATE REGISTRATION: initUniforms() binds each Uniform's GL location exactly
// once, at compile time.  A Uniform added AFTER the program was compiled (the
// editor's Scene3DPreview registers ranges right after setShader()) therefore
// never got a location and its per-frame upload silently no-opped — every
// per-activation param sat at GLSL's 0.0 in the whole scene3d preview, which
// degenerated camera-height/extent scenes (Ocean at swell 0 from eye level =
// black) and skewed the metric scan.  Binding immediately when a program
// already exists fixes that; in the shipped app registration happens BEFORE
// the compile, so m_sh_prog_id is 0 here and nothing changes.
void EffectShader::addUniform( const std::string &name, float minf, float maxf )
{
	Uniform *u = new Uniform( name, BASE_TYPE_FLOAT );
	u->setMinMax( minf, maxf );
	u->resetParameters();
	m_uniforms.push_back( u );
	if( m_sh_prog_id ) u->initUniform( m_sh_prog_id );
}

void EffectShader::addUniform( const std::string &name, int minf, int maxf )
{
	Uniform *u = new Uniform( name, BASE_TYPE_INT );
	u->setMinMax( minf, maxf );
	u->resetParameters();
	m_uniforms.push_back( u );
	if( m_sh_prog_id ) u->initUniform( m_sh_prog_id );
}

void EffectShader::addUniform( const std::string &name, float pro )
{
	Uniform *u = new Uniform( name, BASE_TYPE_BOOL );
	u->setProbability( pro );
	u->resetParameters();
	m_uniforms.push_back( u );
	if( m_sh_prog_id ) u->initUniform( m_sh_prog_id );
}



void EffectShader::addUniformInterpolator( const std::string &name, float interpolatorMinMinf,
						  float interpolatorMinMaxf,
						  float interpolatorMaxMinf,
						  float interpolatorMaxMaxf )
{
	Uniform *u = new Uniform( name, BASE_TYPE_INTERPOLATOR_FLOAT );
	u->setInterpolator( interpolatorMinMinf, interpolatorMinMaxf, interpolatorMaxMinf, interpolatorMaxMaxf, (float) ( m_timeSolo + 2* m_timeInterpolation ) );
	u->resetParameters();
	m_uniforms.push_back( u );
	if( m_sh_prog_id ) u->initUniform( m_sh_prog_id );
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
	// min == max in the config would be rand() % 0 → integer div-by-zero crash.
	return (maxTime > minTime) ? minTime + (rand() % (maxTime - minTime)) : minTime;
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
//   audioAdvance), computed once per frame in RenderPipeline::paint().  The base
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
    AL_SWELL, AL_BARPH, AL_AMBIENT, AL_KICK, AL_SNARE, AL_HAT,
    AL_SPECTRUM, AL_TEXSIM, AL_TEXFLUID, AL_BUILDUP, AL_DROP, AL_WAVE,
    AL_BASSREL, AL_MIDREL, AL_TREBREL, AL_DAYPHASE, AL_TEXSMOKE3D,
    AL_CHROMA12, AL_FLATNESS, AL_ZCR, AL_TEXSSM, AL_SSMHEAD, AL_SSMFILL,
    AL_TEXPHYS, AL_FADEOUT, AL_MELODY, AL_MELODYHEAD,
    AL_TEXSPECTRO, AL_SPECTROHEAD, AL_SPECTROFILL,
    AL_TEXDEPTH0, AL_TEXDEPTH1, AL_DEPTHVALID, AL_NEARFAR, AL_TANHALFFOV,
    AL_TEXSHADOW, AL_LIGHTM, AL_SHADOWPASS, AL_LIGHTDIR, AL_SHADOWTEXEL,
    AL_OITPASS, AL_SHADOWEXTENT,
    AL_TEXSHADOW2, AL_LIGHTM2, AL_SHADOWPASS2, AL_LIGHTDIR2, AL_TEXPREVFRAME,
    // audioAdvance seit DIESER Aktivierung.  `audioAdvance` selbst ist ein
    // Integrator ohne Obergrenze (m_audioAdvance += dt * advRate) und taugt
    // damit -- wie `time` -- nur als Phase, nicht als Position.  Das
    // Gegenstueck zu `sceneTime`, damit eine Szene ihren Flug musikgetrieben
    // halten kann, ohne ihm davonzufliegen.
    AL_SCENEADVANCE,
    // Die MELODIE-Tonhoehe (HPS ab 150 Hz), damit eine Szene die Melodie
    // statt des Grundtons bekommt; audioPitch bleibt der dominante Ton.
    AL_MELODYPITCH,
    // Die 8-Takt-Phrase: Position 0..1 und Sekunden bis zur naechsten Grenze
    // (= der vorhergesagte Drop).  Fuer Szenen, die auf den Drop hin zaehlen.
    AL_PHRASEPOS, AL_PHRASELEFT,
    AL_SECTIONID, AL_SECTIONPREV, AL_SECTIONAGE, AL_SECTIONKNOWN, AL_SECTIONCOUNT,
    AL_MELODYPHASE, AL_COUNT
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
    "audioHat", "audioSpectrum", "texSim", "texFluid",
    "audioBuildUp", "audioDrop", "audioWave", "audioBassRel", "audioMidRel",
    "audioTrebRel", "dayPhase", "texSmoke3D", "audioChroma", "audioFlatness",
    "audioZCR", "texSSM", "ssmHead", "ssmFill", "texPhysarum",
    "audioFadeOut", "audioMelody", "audioMelodyHead",
    "texSpectro", "spectroHead", "spectroFill",
    "texDepth0", "texDepth1", "depthValid", "nearFar", "tanHalfFov",
    "texShadow", "lightM", "shadowPass", "lightDir", "shadowTexel",
    "oitPass", "shadowExtent",
    "texShadow2", "lightM2", "shadowPass2", "lightDir2", "texPrevFrame",
    "sceneAdvance",   // Reihenfolge MUSS zum AL_-Enum passen (Tools/check_enum_tables.py)
    "audioMelodyPitch",
    "audioPhrasePos", "audioPhraseLeft",
    "audioSectionId", "audioSectionPrev", "audioSectionAge", "audioSectionKnown", "audioSectionCount",
    "audioMelodyPhase"
};
}

void EffectShader::applyAudioFeatures(const AudioFeatures &f)
{
    // Cached for stepBake(), called later from draw() -- which, unlike this
    // function, takes no AudioFeatures parameter.
    m_lastAudioForBake = f;

    // Chain labs: the music steers the walk (no-op for every other shader).
    stepChainWalk( f );
    stepChainCam( f );
    if( m_compileFile && m_glReady )
        runChainPasses( f );

    // Per-program LOCATION CACHE: this used to perform ~45 string-keyed
    // glGetUniformLocation lookups per shader per FRAME - the single biggest
    // CPU cost in the render loop.  Locations are looked up once per program
    // and auto-refresh when the program id changes (recompile / hot reload).
    if (m_audioLocs.progId != m_sh_prog_id)
    {
        for (int i = 0; i < AL_COUNT; ++i)
            m_audioLocs.L[i] = glGetUniformLocation(m_sh_prog_id, kAudioLocNames[i]);
        m_audioLocs.progId = m_sh_prog_id;

        m_powerUniform = nullptr;
        for (Uniform *u : m_uniforms)
            if (u->getName() == "power") { m_powerUniform = u; break; }
    }
    const GLint *L = m_audioLocs.L;

    // Live-modulate this scene's own "power" (superellipse/fold exponent)
    // with the beat/ambient-driven powerScale -- safe because it is a plain
    // per-frame shape parameter, not integrated over time like speed/
    // speedTunnel (see the big comment above on why those stay untouched).
    if (m_powerUniform)
        m_powerUniform->setGLValueScaled(f.powerScale);

    if (L[AL_KICK]     >= 0) glUniform1f(L[AL_KICK],     f.onsetKick);
    if (L[AL_SNARE]    >= 0) glUniform1f(L[AL_SNARE],    f.onsetSnare);
    if (L[AL_HAT]      >= 0) glUniform1f(L[AL_HAT],      f.onsetHat);
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
    if (L[AL_MELODYPHASE] >= 0) glUniform1f(L[AL_MELODYPHASE], f.melodyPhase);
    if (L[AL_FLATNESS] >= 0) glUniform1f(L[AL_FLATNESS], f.spectralFlatness);
    if (L[AL_ZCR]      >= 0) glUniform1f(L[AL_ZCR],      f.zeroCrossingRate);

    // ---- FORMULA LAYER: evaluate the preset's <expr> mappings ----
    // Runs AFTER the random <float> params (setUniforms), so a formula on
    // the same uniform name deliberately takes over.
    if (!m_exprs.empty())
    {
        float v[ExprVars::V_COUNT];
        fillExprVars(f, m_exprTime, m_exprSeeds, v);
        v[ExprVars::V_PROGRESS] = m_sceneProgress;

        for (ExprEntry &e : m_exprs)
        {
            if (e.progId != m_sh_prog_id)
            {
                e.loc    = glGetUniformLocation(m_sh_prog_id, e.name.c_str());
                e.progId = m_sh_prog_id;
            }
            if (e.loc >= 0 && e.prog.valid())
                glUniform1f(e.loc, e.prog.eval(v));
        }

        // ---- 2D CAMERA RIG: formulas named rig2Roll/rig2Zoom/rig2X/rig2Y
        // (absolute) and rig2…V (rates, HOST-INTEGRATED so audio-varying
        // rates are jump-free) are not shader uniforms — RenderPipeline reads
        // the result via rig2() and runs the Engine/Rig2D.frag transform pass
        // over this scene's finished frame.  Rates integrate once per FRAME
        // (m_exprTime is per-frame; guard against multiple passes).
        m_rig2Active = false;
        float absv[4] = { 0, 0, 0, 0 };            // roll zoom x y
        float vel[4]  = { 0, 0, 0, 0 };
        static const char *kAbs2[4] = { "rig2Roll",  "rig2Zoom",  "rig2X",  "rig2Y"  };
        static const char *kVel2[4] = { "rig2RollV", "rig2ZoomV", "rig2XV", "rig2YV" };
        for (ExprEntry &e : m_exprs)
        {
            if (!e.prog.valid()) continue;
            for (int i = 0; i < 4; ++i)
            {
                if (e.name == kAbs2[i]) { absv[i] = e.prog.eval(v); m_rig2Active = true; }
                if (e.name == kVel2[i]) { vel[i]  = e.prog.eval(v); m_rig2Active = true; }
            }
        }
        if (m_rig2Active)
        {
            if (m_exprTime != m_rig2LastT)
            {
                float dt = m_exprTime - m_rig2LastT;
                if (dt < 0.f || dt > 0.1f) dt = 0.f;   // activation / reset
                for (int i = 0; i < 4; ++i) m_rig2Acc[i] += vel[i] * dt;
                m_rig2LastT = m_exprTime;
            }
            for (int i = 0; i < 4; ++i) m_rig2[i] = absv[i] + m_rig2Acc[i];
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
    // Unit 34: last frame's fully composited image (RenderPipeline binds
    // m_texTrail[1-m_trailIdx] there once per frame, before any scene draws,
    // since the trails pass itself hasn't swapped m_trailIdx for this frame
    // yet). Opt-in the same way as texSim/texSpectro -- just declare it.
    if (L[AL_TEXPREVFRAME] >= 0) glUniform1i(L[AL_TEXPREVFRAME], 34);
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
    // Second, independent shadow-casting light (see usesShadow2()). Shares
    // shadowExtent/shadowTexel with light 1 (same box, same map resolution).
    if (L[AL_TEXSHADOW2]  >= 0) glUniform1i(L[AL_TEXSHADOW2], 32);
    if (L[AL_LIGHTM2]     >= 0) glUniformMatrix4fv(L[AL_LIGHTM2], 1, GL_FALSE, s_lightM2);
    if (L[AL_SHADOWPASS2] >= 0) glUniform1f(L[AL_SHADOWPASS2], s_shadowPass2);
    if (L[AL_LIGHTDIR2]   >= 0) glUniform3f(L[AL_LIGHTDIR2], s_lightDir2[0],
                                            s_lightDir2[1], s_lightDir2[2]);
    if (L[AL_SSMHEAD]     >= 0) glUniform1f(L[AL_SSMHEAD],  f.ssmHead);
    if (L[AL_SSMFILL]     >= 0) glUniform1f(L[AL_SSMFILL],  f.ssmFill);
    if (L[AL_SPECTROHEAD] >= 0) glUniform1f(L[AL_SPECTROHEAD], f.spectroHead);
    if (L[AL_SPECTROFILL] >= 0) glUniform1f(L[AL_SPECTROFILL], f.spectroFill);
    if (L[AL_BUILDUP]  >= 0) glUniform1f(L[AL_BUILDUP],  f.buildUp);
    if (L[AL_DROP]     >= 0) glUniform1f(L[AL_DROP],     f.dropPulse);
    if (L[AL_PHASE]    >= 0) glUniform1f(L[AL_PHASE],    f.audioRotPhase);
    if (L[AL_ADVANCE]  >= 0) glUniform1f(L[AL_ADVANCE],  f.audioAdvance);
    // Nullpunkt beim ersten Frame nach der Aktivierung merken, damit
    // sceneAdvance bei 0 anfaengt. resetParameters() setzt die Marke zurueck.
    if (m_advanceAtReset < -0.9e9f) m_advanceAtReset = f.audioAdvance;
    if (L[AL_MELODYPITCH] >= 0) glUniform1f(L[AL_MELODYPITCH], f.melodyPitch);
    if (L[AL_PHRASEPOS]   >= 0) glUniform1f(L[AL_PHRASEPOS],   f.phrasePos);
    if (L[AL_PHRASELEFT]  >= 0) glUniform1f(L[AL_PHRASELEFT],  f.phraseSecsLeft);
    // Song-structure memory for the shader: the current section's slot id, the
    // one before it, how long ago the change was, and whether the section was
    // RECOGNISED (a returning chorus) or stored as new.  The age lets a scene
    // fly through a door instead of cutting: the section only ever changes
    // ahead of the camera.  The first sight after an activation is not a
    // change (age starts large), so no door opens on scene start.
    {
        const double now = std::chrono::duration<double>( std::chrono::steady_clock::now().time_since_epoch() ).count();
        if( f.sectionCount != m_secCount )
        {
            const bool first = ( m_secCount < 0 );
            m_secPrev  = first ? f.sectionId : m_secCur;
            m_secCur   = f.sectionId;
            m_secCount = f.sectionCount;
            m_secKnown = f.sectionKnown ? 1.f : 0.f;
            m_secT0    = first ? now - 1000.0 : now;
        }
        if (L[AL_SECTIONID]    >= 0) glUniform1f(L[AL_SECTIONID],    (float) m_secCur);
        if (L[AL_SECTIONPREV]  >= 0) glUniform1f(L[AL_SECTIONPREV],  (float) m_secPrev);
        if (L[AL_SECTIONAGE]   >= 0) glUniform1f(L[AL_SECTIONAGE],   (float) ( now - m_secT0 ));
        if (L[AL_SECTIONKNOWN] >= 0) glUniform1f(L[AL_SECTIONKNOWN], m_secKnown);
        if (L[AL_SECTIONCOUNT] >= 0) glUniform1f(L[AL_SECTIONCOUNT], (float) m_secCount);
    }
    if (L[AL_SCENEADVANCE] >= 0)
        glUniform1f(L[AL_SCENEADVANCE], f.audioAdvance - m_advanceAtReset);
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


void EffectShader::fillExprVars( const AudioFeatures &f, float timeVal,
                                 const float seeds[3], float *v )
{
    v[ExprVars::V_TIME]     = timeVal;
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
    // `progress` ist KEIN Audio-Merkmal, sondern der Stand der Szene selbst.
    // fillExprVars ist static (die Seeds kommen als Parameter), deshalb wird
    // er vom Aufrufer nachgetragen -- hier steht nur der sichere Vorgabewert.
    v[ExprVars::V_PROGRESS] = 0.f;
    v[ExprVars::V_SEED1]    = seeds[0];
    v[ExprVars::V_SEED2]    = seeds[1];
    v[ExprVars::V_SEED3]    = seeds[2];
}


void EffectShader::addExpression( const std::string &name, const std::string &formula )
{
	ExprEntry e;
	e.name = name;
	std::string ctx = std::string(m_fragmentShaderFilename ?
	                              m_fragmentShaderFilename : "?") + ":" + name;
	if (e.prog.compile(formula, ctx))
	{
		m_exprs.push_back(e);
		if( formula.find( "progress" ) != std::string::npos )
			m_exprUsesProgress = true;
		fprintf(stderr, "Expr OK: %s = %s\n", ctx.c_str(),
		        formula.c_str());
	}

	for (int i = 0; i < 3; i++)
		m_exprSeeds[i] = (float) rand() / (float) RAND_MAX;
}

bool EffectShader::useShader()
{
	float prob = (float) (rand()) / (float) RAND_MAX;

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

bool EffectShader::usesProgress()
{
	// Asked BEFORE the first compile too: the scheduler's build-up rule
	// ("while the tension rises, prefer a staged scene") filters candidates
	// that have mostly never been on screen.  Answering "no" for every
	// uncompiled shader narrowed that pool to the staged scenes that had
	// already played -- so the same handful (DamascusSteelEtch,
	// SundialShadowSweep, KilnGlazeCrystals, ...) came back three and four
	// times in twelve minutes.  The source text says it without GL.
	if( !m_glReady )
	{
		if( m_srcUsesProgress < 0 )
			m_srcUsesProgress = ( m_exprUsesProgress || sourceUsesProgress() ) ? 1 : 0;
		return m_srcUsesProgress == 1;
	}
	if( m_usesProgress < 0 )
		m_usesProgress = ( m_exprUsesProgress || ( m_sh_prog_id != 0 &&
		                   glGetUniformLocation( m_sh_prog_id, "sceneProgress" ) >= 0 ) ) ? 1 : 0;
	return m_usesProgress == 1;
}

/**
 * @brief Tells from the shader SOURCE (no GL) whether this scene reads `sceneProgress`.
 *
 * Reads the fragment file and its Scene3D siblings (.vert/.geom/.tesc/.tese,
 * same stem; missing files are skipped), strips comments, and looks for the
 * name outside its `uniform` declaration -- the text-side twin of the
 * active-uniform test usesProgress() makes once the program is compiled.
 * @return True if any stage uses `sceneProgress` in code.
 */
bool EffectShader::sourceUsesProgress() const
{
	if( !m_fragmentShaderFilename )
		return false;
	std::string stem = m_fragmentShaderFilename;
	size_t dot = stem.rfind( ".frag" );
	if( dot == std::string::npos )
		return false;
	stem.erase( dot );
	static const char *exts[] = { ".frag", ".vert", ".geom", ".tesc", ".tese" };
	for( const char *ext : exts )
	{
		char *raw = textFileRead( ( stem + ext ).c_str() );
		if( !raw )
			continue;
		std::string src( raw );
		free( raw );
		// Strip /* */ and // comments: the headers name every uniform they
		// read, which would make every documented scene look staged.
		std::string code;
		code.reserve( src.size() );
		for( size_t i = 0; i < src.size(); )
		{
			if( src.compare( i, 2, "/*" ) == 0 )
			{
				size_t e = src.find( "*/", i + 2 );
				i = ( e == std::string::npos ) ? src.size() : e + 2;
			}
			else if( src.compare( i, 2, "//" ) == 0 )
			{
				size_t e = src.find( '\n', i );
				i = ( e == std::string::npos ) ? src.size() : e;
			}
			else
				code += src[i++];
		}
		for( size_t p = code.find( "sceneProgress" ); p != std::string::npos;
		     p = code.find( "sceneProgress", p + 1 ) )
		{
			size_t ls = code.rfind( '\n', p );
			ls = ( ls == std::string::npos ) ? 0 : ls + 1;
			if( code.compare( ls, 7, "uniform" ) != 0
			    && code.substr( ls, p - ls ).find( "uniform" ) == std::string::npos )
				return true;
		}
	}
	return false;
}

void EffectShader::setClimaxIn( float secs )
{
	// Keep the CURRENT progress and bend the ramp so 0.95 lands in `secs`:
	// p(now) = p0, p(now + secs) = 0.95  =>  span = secs / (0.95 - p0),
	// origin = now - p0 * span.  A plain rescale would have thrown the arc
	// backwards (pieces flying OUT again) the moment the prediction came in.
	if( m_progressT0 < -0.9e9f || m_soloAtReset <= 0.01f || secs < 1.f )
		return;
	const float p0 = m_sceneProgress;
	if( p0 >= 0.93f )
		return;                              // already there; nothing to bend
	const float span = secs / ( 0.95f - p0 );
	m_progressT0  = m_exprTime - p0 * span;
	m_soloAtReset = span;
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

bool EffectShader::usesBake()
{
	if( !m_glReady )
		return false;
	if( m_usesBake < 0 )
		m_usesBake = ( m_sh_prog_id != 0 &&
		               glGetUniformLocation( m_sh_prog_id, "texBake" ) >= 0 ) ? 1 : 0;
	return m_usesBake == 1;
}

// ---- Chain walk (host side of the chain labs' walk) ----------------------
// Stage order: A, B, C, D (the chain), S (the look); each has a rolled knob.
// Stages 5..7 (the 3D structure: space, fold core, body) exist in ChainLab3D only.
static const int   kWalkN = 9;            // + the stage order (8)
static const char *kWalkKnob[9]  = { "chainAP", "chainBP", "chainCP", "chainDP", "styleP", "spaceP", "coreP", "bodyP", "orderP" };
static const char *kWalkUni[9]   = { "walkA", "walkB", "walkC", "walkD", "walkS", "walkSpace", "walkCore", "walkBody", "walkO" };
static const char *kWalkName[9]  = { "A", "B", "C", "D", "look", "space", "core", "body", "order" };
static bool isStructure( int s ) { return s >= 5 && s <= 7; }

void EffectShader::resetChainWalk()
{
	// At most one of the stages A..D on a class that streams the picture into
	// an opening (tunnel, Droste zoom, log-polar spiral, pole stream), and that
	// one only every other time: with two or more nearly every roll of the flat
	// labs read as a tunnel.  A stage that gives its opening up moves to the
	// nearest class without one.  The half is decided from the rolled knob
	// itself (no draw from the scene's random stream), and the knobs are
	// constant for the whole activation, so this never shows as a jump.
	parseChainSource();
	bool opening = false;
	for( int s = 0; s < 4; ++s )
		for( Uniform *u : m_uniforms )
			if( u->getName() == kWalkKnob[s] && opensAt( s, u->snapshotValue() ) )
			{
				const float h = u->snapshotValue() * 9173.13f;
				if( opening || h - floorf( h ) < 0.5f )
				{
					const float v = closedClass( s, u->snapshotValue() );
					fprintf( stderr, "%s: stage %s %.3f -> %.3f (openings: at most one, half as often)\n", fragmentName(), kWalkName[s], u->snapshotValue(), v );
					u->restoreValue( v );
				}
				opening = true;
			}
	float morph = -1.f;
	for( const Uniform *u : m_uniforms )
		if( u->getName() == "morphP" ) morph = u->snapshotValue();
	m_walk.active = ( m_walkHostLoc >= 0 && morph >= ( m_compileFile ? 0.15f : 0.5f ) );
	m_walkMorph = morph;
	m_specOff = false;
	m_specWait = 0.f;
	for( int s = 0; s < kWalkN; ++s )
	{
		float v = 0.f;
		for( const Uniform *u : m_uniforms )
			if( u->getName() == kWalkKnob[s] ) v = u->snapshotValue();
		v = v < 0.f ? 0.f : ( v > 0.999f ? 0.999f : v );
		m_walk.x0[s] = m_walk.x1[s] = v;
		m_walk.f[s] = 0.f;
		m_walk.fading[s] = false;
		m_walk.hold[s] = 9.f * (float) s;          // staggered: the stages come due one after another
	}
	m_walk.lastSection = m_walk.lastDrop = -1;
	m_walk.lastPhrase  = -1.f;
	m_walk.phraseN     = 0;
	m_walk.energy   = 0.5f;
	m_walk.harmCool = 8.f;
	m_walk.sectionLook.clear();
	m_walk.hasLast  = false;
	m_walk.rng.seed( (unsigned) rand() + 1u );
}

void EffectShader::startWalk( int s, float target, float dur )
{
	if( m_walk.fading[s] || ( m_walkLoc[s] < 0 && s != 0 ) )
		return;
	// The shader mixes two whole 3D worlds while a structure stage fades: one at a time.
	if( isStructure( s ) )
		for( int o = 5; o <= 7; ++o )
			if( m_walk.fading[o] ) return;
	m_walk.x1[s]      = target < 0.f ? 0.f : ( target > 0.999f ? 0.999f : target );
	// The same on the walk: a stage fades to a class with an opening only every
	// other time, and only while no other stage shows one or is fading to one.
	if( s < 4 && opensAt( s, m_walk.x1[s] ) )
	{
		bool other = std::uniform_real_distribution<float>( 0.f, 1.f )( m_walk.rng ) < 0.5f;
		for( int o = 0; o < 4; ++o )
			if( o != s && ( opensAt( o, m_walk.x0[o] ) || ( m_walk.fading[o] && opensAt( o, m_walk.x1[o] ) ) ) )
				other = true;
		if( other )
			m_walk.x1[s] = closedClass( s, m_walk.x1[s] );
	}
	m_walk.f[s]       = 0.f;
	// dur is given at 120 BPM; with a steady beat it becomes the same number
	// of beats at the real tempo (so a fade spans whole bars of this song).
	const float bpm = 40.f + 160.f * m_lastAudioForBake.estimatedBPM;
	if( m_lastAudioForBake.estimatedBPM > 0.01f && m_lastAudioForBake.rhythmStrength > 0.35f )
		dur = floorf( dur * 2.f + 0.5f ) * 60.f / bpm;            // beats at 120 BPM -> seconds now
	m_walk.fadeDur[s] = dur > 0.3f ? dur : 0.3f;
	m_walk.fading[s]  = true;
	fprintf( stderr, "WALK %s stage %s: %.3f -> %.3f, %.1f s at music speed %.2f\n", fragmentName(), kWalkName[s],
	         m_walk.x0[s], m_walk.x1[s], m_walk.fadeDur[s], m_walk.rate );
}

static int classPos( float x, int n );

void EffectShader::stepChainWalk( const AudioFeatures &f )
{
	if( m_walkProg != m_sh_prog_id )
	{
		m_walkProg = m_sh_prog_id;
		for( int s = 0; s < kWalkN; ++s )
			m_walkLoc[s] = glGetUniformLocation( m_sh_prog_id, kWalkUni[s] );
		m_walkHostLoc = glGetUniformLocation( m_sh_prog_id, "walkHost" );
		if( !m_walkProgSwap )                       // a variant switch is not a new activation
			m_walk.pending = true;
		m_walkProgSwap = false;
	}
	if( m_walkHostLoc < 0 )
		return;                                     // not a chain lab
	if( m_walk.pending )
	{
		m_walk.pending = false;
		resetChainWalk();
	}
	glUniform1f( m_walkHostLoc, m_walk.active ? 1.f : 0.f );
	if( !m_walk.active )
		return;

	const auto now = std::chrono::steady_clock::now();
	float dt = m_walk.hasLast ? std::chrono::duration<float>( now - m_walk.last ).count() : 0.f;
	m_walk.last = now;
	m_walk.hasLast = true;
	if( dt > 0.25f ) dt = 0.016f;                   // back from a pause: no catch-up leap

	// Energy: arousal smoothed over ~8 s -- it picks the region of each class.
	m_walk.energy += ( f.arousal - m_walk.energy ) * ( dt / 8.f < 1.f ? dt / 8.f : 1.f );
	const float E = m_walk.energy;
	// Music time: the short-term energy and the flux set how fast fades and
	// holds run (a quiet passage lets a fade crawl, a burst rushes it).
	m_walk.energyFast += ( f.arousal - m_walk.energyFast ) * ( dt < 1.f ? dt : 1.f );
	m_walk.fluxS      += ( f.spectralFlux - m_walk.fluxS ) * ( dt * 2.f < 1.f ? dt * 2.f : 1.f );
	{
		// a build-up hurries the walk toward the drop
		float r = 0.35f + 0.9f * m_walk.energyFast + 1.2f * m_walk.fluxS + 0.8f * f.buildUp;
		m_walk.rate = r < 0.25f ? 0.25f : ( r > 2.5f ? 2.5f : r );
	}
	std::uniform_real_distribution<float> uni( 0.f, 1.f );
	// A target on the calm..energetic scale of the classes, with some spread.
	// (a build-up pulls the targets toward the energetic end)
	const float Eb = E + 0.3f * f.buildUp < 1.f ? E + 0.3f * f.buildUp : 1.f;
	auto pick = [&]() { return 0.08f + 0.84f * Eb + ( uni( m_walk.rng ) - 0.5f ) * 0.5f; };
	auto lerp = []( float a, float b, float t ) { return a + ( b - a ) * t; };
	auto anyFading = [&]() { for( bool b : m_walk.fading ) if( b ) return true; return false; };

	if( m_walk.lastSection < 0 )
	{
		m_walk.lastSection = f.sectionCount;        // adopt the analyzer's counters
		m_walk.lastDrop    = f.dropCount;
	}

	// 1. A new section: a new global map (often a new look too); a RETURNING
	//    section walks every stage back to the look it had the first time.
	if( f.sectionCount != m_walk.lastSection )
	{
		m_walk.lastSection = f.sectionCount;
		auto it = m_walk.sectionLook.find( f.sectionId );
		if( f.sectionKnown && f.sectionId >= 0 && it != m_walk.sectionLook.end() )
		{
			for( int s = 0; s < kWalkN; ++s )
				if( fabsf( it->second[s] - m_walk.x0[s] ) > 1e-4f )
					startWalk( s, it->second[s], 4.f );
		}
		else
		{
			startWalk( 0, pick(), 4.f );
			if( uni( m_walk.rng ) < 0.5f )
				startWalk( 4, pick(), 6.f );
			// ... and in the 3D lab often a new space or fold core: the world itself turns.
			if( uni( m_walk.rng ) < 0.6f )
				startWalk( 5 + (int) ( m_walk.rng() % 2u ), pick(), lerp( 14.f, 8.f, E ) );
		}
		if( f.sectionId >= 0 )
		{
			std::array<float, 9> look;
			for( int s = 0; s < kWalkN; ++s )
				look[s] = m_walk.fading[s] ? m_walk.x1[s] : m_walk.x0[s];
			m_walk.sectionLook[f.sectionId] = look;
		}
	}
	// 2. A drop: the frame, the warp and the look turn fast (about a bar).
	if( f.dropCount != m_walk.lastDrop )
	{
		m_walk.lastDrop = f.dropCount;
		startWalk( 0, pick(), 2.f );
		startWalk( 3, pick(), 1.5f );
		startWalk( 4, pick(), 1.5f );
	}
	// 3. A harmonic change: the symmetry or the second map.
	m_walk.harmCool -= dt;
	if( !anyFading() && m_walk.harmCool <= 0.f && f.harmonicChange > 0.55f )
	{
		startWalk( 1 + (int) ( m_walk.rng() % 2u ), pick(), lerp( 8.f, 4.f, E ) );
		m_walk.harmCool = 12.f;
	}
	// 4. Phrases (with a steady beat): every 8-bar boundary moves the chain
	//    on -- alternately a new VARIANT of one transform (the same class with
	//    other mirrors, arms, lattice: the transform itself morphs) and a new
	//    transform for the stage held longest.  The fade spans two bars.
	const bool steady = f.estimatedBPM > 0.01f && f.rhythmStrength > 0.35f;
	const bool phraseTurn = steady && m_walk.lastPhrase >= 0.f && f.phrasePos + 0.5f < m_walk.lastPhrase;
	m_walk.lastPhrase = f.phrasePos;
	if( phraseTurn && !anyFading() )
	{
		++m_walk.phraseN;
		if( m_walk.phraseN % 2 == 1 )
		{
			int cand[4], nc = 0;                        // stages A..D that show a transform (not 'none')
			for( int s = 0; s < 4; ++s )
			{
				auto it = m_chainClasses.find( kWalkKnob[s] );
				if( m_walkLoc[s] < 0 || it == m_chainClasses.end() || it->second.empty() ) continue;
				if( it->second[ classPos( m_walk.x0[s], (int) it->second.size() ) ] != "none" ) cand[nc++] = s;
			}
			if( nc > 0 )
			{
				const int s = cand[ m_walk.rng() % (unsigned) nc ];
				const int n = (int) m_chainClasses[ kWalkKnob[s] ].size();
				const int k = classPos( m_walk.x0[s], n );
				startWalk( s, ( (float) k + 0.05f + 0.9f * uni( m_walk.rng ) ) / (float) n, 4.f );
			}
		}
		else
		{
			int best = -1; float bh = -1.f;
			for( int s = 0; s <= 4; ++s )               // A..D and the look
				if( m_walkLoc[s] >= 0 && m_walk.hold[s] > bh ) { bh = m_walk.hold[s]; best = s; }
			if( best >= 0 )
				startWalk( best, pick(), 4.f );
		}
	}
	// 5. Otherwise the stage held longest walks when its time is up (sooner
	//    the more energy; the look holds longer than the chain).
	for( int s = 0; s < kWalkN; ++s )
		if( !m_walk.fading[s] ) m_walk.hold[s] += dt * m_walk.rate;
	if( !anyFading() )
	{
		int best = -1; float bestR = 1.f;
		for( int s = 0; s < kWalkN; ++s )
		{
			if( m_walkLoc[s] < 0 ) continue;            // stage absent in this shader
			// the look holds longer than the chain, the 3D structure longer still
			float r = m_walk.hold[s] / ( lerp( 70.f, 30.f, E ) * ( s == 4 ? 1.6f : ( isStructure( s ) ? 1.4f : 1.f ) ) );
			if( r >= bestR ) { bestR = r; best = s; }
		}
		if( best >= 0 )
			startWalk( best, pick(), isStructure( best ) ? lerp( 14.f, 8.f, E ) : lerp( 10.f, 5.f, E ) );
	}

	// Specialised variant (specDefines): while one is bound, a fade waits at
	// 0 % until the variant with its target is bound, and at 100 % until the
	// one after it is.  The wanted variant is requested after the fades moved
	// on (below the loop) and bound at the start of the next frame.
	// EXPERIMENTAL, off by default (KALEIDO_SPEC=1): a new variant costs a
	// 0.8-1.8 s stall on the NVIDIA driver (its compile blocks the render
	// thread even from a worker context) -- see docs/leistung-2026-10-01.md.
	static const bool specEnabled = getenv( "KALEIDO_SPEC" ) != 0;
	const bool specOn = specEnabled && !m_specOff && !m_chainOrd.empty() && typeid( *this ) == typeid( EffectShader )
	                    && ( m_walk.active || m_walkMorph < 0.15f );
	const bool variantBound = specOn && !m_specBound.empty() && m_genericProg;
	const std::string want = variantBound ? specDefines( m_walk.x0, m_walk.x1, m_walk.fading ) : std::string();
	bool held = false;

	// Advance the fades and upload: (shown, target, progress) per stage.
	for( int s = 0; s < kWalkN; ++s )
	{
		if( m_walk.fading[s] )
		{
			// a bound variant without this fade's target: wait at 0 %
			if( variantBound && m_walk.f[s] <= 0.f && want != m_specBound )
			{
				held = true;
				goto upload;
			}
			m_walk.f[s] += dt * m_walk.rate / m_walk.fadeDur[s];     // music time: never backwards, never a jump
			if( m_walk.f[s] >= 1.f && variantBound )
			{
				// the state after this fade needs its own variant: wait at 100 %
				float x0[9]; bool fd[9];
				for( int o = 0; o < kWalkN; ++o ) { x0[o] = m_walk.x0[o]; fd[o] = m_walk.fading[o]; }
				x0[s] = m_walk.x1[s]; fd[s] = false;
				const std::string after = specDefines( x0, m_walk.x1, fd );
				if( !after.empty() && after != m_specBound )
				{
					m_walk.f[s] = 1.f;
					held = true;
					auto it = m_specProgs.find( after );
					GLuint prog = it != m_specProgs.end() ? it->second : 0;
					if( !prog && shaderVariantStart( m_fragmentShaderFilename, after ) )
					{
						prog = shaderVariantTake( m_fragmentShaderFilename, after );
						if( prog ) m_specProgs[after] = prog;
					}
					if( prog && m_specNextKey != after ) { m_specNext = prog; m_specNextKey = after; }
					goto upload;
				}
			}
			if( m_walk.f[s] >= 1.f )
			{
				m_walk.x0[s] = m_walk.x1[s];
				m_walk.f[s] = 0.f;
				m_walk.fading[s] = false;
				m_walk.hold[s] = 0.f;
			}
		}
	upload:
		if( m_walkLoc[s] >= 0 )
			glUniform3f( m_walkLoc[s], m_walk.x0[s], m_walk.fading[s] ? m_walk.x1[s] : m_walk.x0[s],
			             m_walk.fading[s] ? m_walk.f[s] : 0.f );
	}
	// The variant for the state the fades left: start its build, bind it at
	// the start of the next frame (unless a 100 % hold already asked for one).
	if( specOn )
	{
		const std::string cur = specDefines( m_walk.x0, m_walk.x1, m_walk.fading );
		if( !cur.empty() && cur != m_specBound && m_specNextKey.empty() )
		{
			auto it = m_specProgs.find( cur );
			GLuint prog = it != m_specProgs.end() ? it->second : 0;
			static const bool specLog = getenv( "KALEIDO_SPEC_LOG" ) != 0;
			if( !prog && specLog && m_specProgs.find( cur ) == m_specProgs.end() ) fprintf( stderr, "SPEC want %zu bytes\n", cur.size() );
			const auto tS0 = std::chrono::steady_clock::now();
			const bool started = !prog && shaderVariantStart( m_fragmentShaderFilename, cur );
			const auto tS1 = std::chrono::steady_clock::now();
			if( started )
			{
				prog = shaderVariantTake( m_fragmentShaderFilename, cur );
				if( specLog )
				{
					const auto tS2 = std::chrono::steady_clock::now();
					const double a = std::chrono::duration<double, std::milli>( tS1 - tS0 ).count();
					const double b = std::chrono::duration<double, std::milli>( tS2 - tS1 ).count();
					if( a > 5.0 || b > 5.0 ) fprintf( stderr, "SPEC start %.1f ms  take %.1f ms\n", a, b );
				}
				if( prog ) m_specProgs[cur] = prog;
				else if( shaderVariantFailed( m_fragmentShaderFilename, cur ) ) { m_specOff = true; m_specRevert = true; }
			}
			if( prog ) { m_specNext = prog; m_specNextKey = cur; }
		}
		if( !cur.empty() )
		{
			m_specLru.erase( std::remove( m_specLru.begin(), m_specLru.end(), cur ), m_specLru.end() );
			m_specLru.push_back( cur );
			while( m_specLru.size() > 12 )                // keep a dozen variants per lab
			{
				const std::string old = m_specLru.front();
				m_specLru.erase( m_specLru.begin() );
				auto it = m_specProgs.find( old );
				if( it != m_specProgs.end() && old != m_specBound && old != m_specNextKey )
				{
					shaderProgramRelease( it->second );
					m_specProgs.erase( it );
				}
			}
		}
	}
	else if( m_genericProg )
		m_specRevert = true;
	// A variant that keeps a fade waiting for more than 4 s (a slow driver):
	// back to the generic program for the rest of this activation.
	m_specWait = held ? m_specWait + dt : 0.f;
	if( m_specWait > 4.f )
	{
		fprintf( stderr, "%s: specialised variant too slow, generic program\n", fragmentName() );
		m_specOff = true;
		m_specRevert = true;
		m_specWait = 0.f;
	}
}

// ---- Chain runner ----------------------------------------------------------
extern GLuint fullscreenVAO();
namespace {
struct PassProg
{
	GLuint prog = 0;
	GLint texIn = -1, texB = -1, firstPass = -1, subV = -1, mixF = -1, chainOff = -1,
	      res = -1, sceneTime = -1, adv = -1, phase = -1, spread = -1, speed = -1;
};
std::map<std::string, PassProg> s_passProgs;      ///< pass shader file -> program and locations
std::vector<std::string>        s_passWarm;       ///< pass files still to build in the background
bool                            s_passWarmInit = false;

std::string passFile( char stage, int branch )
{
	char b[64];
	snprintf( b, sizeof b, "..\\Engine\\ChainPass\\%c%d.frag", stage, branch );
	return b;
}

const PassProg &passProg( const std::string &file )
{
	auto it = s_passProgs.find( file );
	if( it != s_passProgs.end() )
		return it->second;
	PassProg p;
	p.prog = setShaders( nullptr, file.c_str() );   // a cache hit once the background build is done
	p.texIn = glGetUniformLocation( p.prog, "texIn" );
	p.texB = glGetUniformLocation( p.prog, "texB" );
	p.firstPass = glGetUniformLocation( p.prog, "firstPass" );
	p.subV = glGetUniformLocation( p.prog, "subV" );
	p.mixF = glGetUniformLocation( p.prog, "mixF" );
	p.chainOff = glGetUniformLocation( p.prog, "chainOff" );
	p.res = glGetUniformLocation( p.prog, "resolution" );
	p.sceneTime = glGetUniformLocation( p.prog, "sceneTime" );
	p.adv = glGetUniformLocation( p.prog, "audioAdvance" );
	p.phase = glGetUniformLocation( p.prog, "audioPhase" );
	p.spread = glGetUniformLocation( p.prog, "audioSpread" );
	p.speed = glGetUniformLocation( p.prog, "speedP" );
	return s_passProgs[file] = p;
}
float smooth01( float x ) { x = x < 0.f ? 0.f : ( x > 1.f ? 1.f : x ); return x * x * ( 3.f - 2.f * x ); }
} // namespace

void EffectShader::runChainPasses( const AudioFeatures &f )
{
	static const char kStage[4] = { 'A', 'B', 'C', 'D' };
	static const int  kWeak[4]  = { 0, 2, 1, 2 };        // positions up to which a class barely changes the photo (gIdW in the shader)
	parseChainSource();
	for( int s = 0; s < 4; ++s )
		if( m_chainOrd.find( kWalkKnob[s] ) == m_chainOrd.end() ) return;
	if( m_permCodes.size() != 24 ) return;

	// Pass shaders: built in the background a few at a time, once per session.
	if( !s_passWarmInit )
	{
		s_passWarmInit = true;
		for( int s = 0; s < 4; ++s )
			for( int b : m_chainOrd[ kWalkKnob[s] ] )
				s_passWarm.push_back( passFile( kStage[s], b ) );
		s_passWarm.push_back( "..\\Engine\\ChainPass\\Id.frag" );
		s_passWarm.push_back( "..\\Engine\\ChainPass\\Mix.frag" );
		s_passWarm.push_back( "..\\Engine\\ChainPass\\Fallback.frag" );
	}
	while( !s_passWarm.empty() && shaderPrebuildPoll() < 4 )
	{
		const std::string w = s_passWarm.back();
		s_passWarm.pop_back();
		if( !shaderPrebuildStart( w.c_str() ) ) { s_passWarm.clear(); break; }   // no background compile: build on use
	}

	// GL state this function changes, restored at the end.
	GLint vp[4], drawFb = 0, readFb = 0, activeTex = 0, vao = 0;
	glGetIntegerv( GL_VIEWPORT, vp );
	glGetIntegerv( 0x8CA6 /* GL_DRAW_FRAMEBUFFER_BINDING */, &drawFb );
	glGetIntegerv( 0x8CAA /* GL_READ_FRAMEBUFFER_BINDING */, &readFb );
	glGetIntegerv( 0x84E0 /* GL_ACTIVE_TEXTURE */, &activeTex );
	glGetIntegerv( 0x85B5 /* GL_VERTEX_ARRAY_BINDING */, &vao );
	const GLboolean blend = glIsEnabled( GL_BLEND ), depth = glIsEnabled( GL_DEPTH_TEST ), scissor = glIsEnabled( GL_SCISSOR_TEST );

	const int W = vp[2] > 0 ? vp[2] : 1, H = vp[3] > 0 ? vp[3] : 1;
	if( W != m_cpW || H != m_cpH || !m_cpTex[0] )
	{
		if( m_cpTex[0] ) { glDeleteTextures( 5, m_cpTex ); glDeleteFramebuffers( 5, m_cpFbo ); }
		glGenTextures( 5, m_cpTex );
		glGenFramebuffers( 5, m_cpFbo );
		for( int i = 0; i < 5; ++i )
		{
			glBindTexture( GL_TEXTURE_2D, m_cpTex[i] );
			glTexImage2D( GL_TEXTURE_2D, 0, GL_RG32F, W, H, 0, GL_RG, GL_FLOAT, nullptr );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
			glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
			glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[i] );
			glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_cpTex[i], 0 );
		}
		m_cpW = W; m_cpH = H;
	}
	glDisable( GL_BLEND ); glDisable( GL_DEPTH_TEST ); glDisable( GL_SCISSOR_TEST );
	glViewport( 0, 0, W, H );
	glBindVertexArray( fullscreenVAO() );

	float speedP = 0.5f;
	for( const Uniform *u : m_uniforms )
		if( u->getName() == "speedP" ) speedP = u->snapshotValue();

	// One pass: `file` reads texture `in` (-1: start from the screen) [and `inB`], writes `out`.
	auto pass = [&]( const std::string &file, int in, int inB, int out, float subV, float mixF ) {
		const PassProg &p = passProg( file );
		if( !p.prog ) return;
		glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[out] );
		glUseProgram( p.prog );
		glActiveTexture( GL_TEXTURE0 + 41 );
		glBindTexture( GL_TEXTURE_2D, in >= 0 ? m_cpTex[in] : glcoreDummyTex2D() );
		glActiveTexture( GL_TEXTURE0 + 42 );
		glBindTexture( GL_TEXTURE_2D, inB >= 0 ? m_cpTex[inB] : glcoreDummyTex2D() );
		if( p.texIn >= 0 )     glUniform1i( p.texIn, 41 );
		if( p.texB >= 0 )      glUniform1i( p.texB, 42 );
		if( p.firstPass >= 0 ) glUniform1i( p.firstPass, in < 0 ? 1 : 0 );
		if( p.subV >= 0 )      glUniform1f( p.subV, subV );
		if( p.mixF >= 0 )      glUniform1f( p.mixF, mixF );
		if( p.chainOff >= 0 )  glUniform2f( p.chainOff, (float) vp[0], (float) vp[1] );
		if( p.res >= 0 )       glUniform2f( p.res, (float) m_width, (float) m_height );
		if( p.sceneTime >= 0 ) glUniform1f( p.sceneTime, m_lastSceneTime );
		if( p.adv >= 0 )       glUniform1f( p.adv, f.audioAdvance );
		if( p.phase >= 0 )     glUniform1f( p.phase, f.audioRotPhase );
		if( p.spread >= 0 )    glUniform1f( p.spread, f.spectralSpread );
		if( p.speed >= 0 )     glUniform1f( p.speed, speedP );
		glDrawArrays( GL_TRIANGLES, 0, 3 );
	};
	unsigned busy = 0;                                   // textures holding a result still needed
	auto freeTex = [&]( unsigned also ) { for( int i = 0; i < 5; ++i ) if( !( ( busy | also ) & ( 1u << i ) ) ) return i; return 0; };

	// The chain in one order; returns the texture holding its coordinate.
	auto runOrder = [&]( int code ) -> int {
		int cur = -1;
		for( int pos = 0; pos < 4; ++pos )
		{
			const int s = ( code >> ( 2 * pos ) ) & 3;
			const std::vector<int> &ord = m_chainOrd[ kWalkKnob[s] ];
			const int n = (int) ord.size();
			const float x0 = m_walk.x0[s], x1 = m_walk.x1[s];
			const int p0 = classPos( x0, n );
			const float v0 = ( x0 < 0.f ? 0.f : ( x0 > 0.9999f ? 0.9999f : x0 ) ) * n - (float) p0;
			const bool fade = m_walk.active && m_walk.fading[s] && m_walk.f[s] > 0.f;
			const unsigned keep = cur >= 0 ? ( 1u << cur ) : 0u;
			if( !fade )
			{
				if( p0 == 0 ) continue;                  // 'none': the next pass mirrors its input itself
				const int out = freeTex( keep );
				pass( passFile( kStage[s], ord[p0] ), cur, -1, out, v0, 0.f );
				cur = out;
				continue;
			}
			const int p1 = classPos( x1, n );
			const float v1 = ( x1 < 0.f ? 0.f : ( x1 > 0.9999f ? 0.9999f : x1 ) ) * n - (float) p1;
			const int ta = freeTex( keep );
			pass( p0 == 0 ? std::string( "..\\Engine\\ChainPass\\Id.frag" ) : passFile( kStage[s], ord[p0] ), cur, -1, ta, v0, 0.f );
			const int tb = freeTex( keep | ( 1u << ta ) );
			pass( p1 == 0 ? std::string( "..\\Engine\\ChainPass\\Id.frag" ) : passFile( kStage[s], ord[p1] ), cur, -1, tb, v1, 0.f );
			const int out = freeTex( ( 1u << ta ) | ( 1u << tb ) );
			pass( "..\\Engine\\ChainPass\\Mix.frag", ta, tb, out, 0.f, smooth01( m_walk.f[s] ) );
			cur = out;
		}
		if( cur < 0 )                                    // every stage 'none'
		{
			cur = freeTex( 0 );
			pass( "..\\Engine\\ChainPass\\Id.frag", -1, -1, cur, 0.f, 0.f );
		}
		return cur;
	};

	auto orderCode = [&]( float x ) { return m_permCodes[ classPos( x, 24 ) ]; };
	int res = runOrder( orderCode( m_walk.x0[8] ) );
	const bool orderFade = m_walk.active && m_walk.fading[8] && m_walk.f[8] > 0.f
	                       && classPos( m_walk.x1[8], 24 ) != classPos( m_walk.x0[8], 24 );
	if( orderFade )
	{
		busy = 1u << res;
		const int res2 = runOrder( orderCode( m_walk.x1[8] ) );
		busy = 0;
		const int out = freeTex( ( 1u << res ) | ( 1u << res2 ) );
		pass( "..\\Engine\\ChainPass\\Mix.frag", res, res2, out, 0.f, smooth01( m_walk.f[8] ) );
		res = out;
	}
	// Never an empty chain: where the stages are 'none' or too weak, the calm lattice fades in.
	float w = 1.f;
	for( int s = 0; s < 4; ++s )
	{
		const int n = (int) m_chainOrd[ kWalkKnob[s] ].size();
		const int p0 = classPos( m_walk.x0[s], n );
		if( m_walk.active && m_walk.fading[s] && m_walk.f[s] > 0.f )
		{
			const float fs = smooth01( m_walk.f[s] );
			const int p1 = classPos( m_walk.x1[s], n );
			w *= ( p0 <= kWeak[s] ? 1.f - fs : 0.f ) + ( p1 <= kWeak[s] ? fs : 0.f );
		}
		else
			w *= p0 <= kWeak[s] ? 1.f : 0.f;
	}
	if( w > 0.f )
	{
		const int out = freeTex( 1u << res );
		pass( "..\\Engine\\ChainPass\\Fallback.frag", res, -1, out, 0.f, w );
		res = out;
	}

	// Restore, and hand the result to the lab.
	glBindFramebuffer( 0x8CA9 /* GL_DRAW_FRAMEBUFFER */, drawFb );
	glBindFramebuffer( 0x8CA8 /* GL_READ_FRAMEBUFFER */, readFb );
	glViewport( vp[0], vp[1], vp[2], vp[3] );
	if( blend ) glEnable( GL_BLEND );
	if( depth ) glEnable( GL_DEPTH_TEST );
	if( scissor ) glEnable( GL_SCISSOR_TEST );
	glBindVertexArray( (GLuint) vao );
	glUseProgram( m_sh_prog_id );
	glActiveTexture( GL_TEXTURE0 + 40 );
	glBindTexture( GL_TEXTURE_2D, m_cpTex[res] );
	const GLint lt = glGetUniformLocation( m_sh_prog_id, "texChain" );
	const GLint lo = glGetUniformLocation( m_sh_prog_id, "chainOff" );
	if( lt >= 0 ) glUniform1i( lt, 40 );
	if( lo >= 0 ) glUniform2f( lo, (float) vp[0], (float) vp[1] );
	glActiveTexture( (GLenum) activeTex );
}

std::string EffectShader::specDefines( const float *x0, const float *x1, const bool *fading ) const
{
	// stage index (kWalkKnob) -> macro stem
	static const int   kSpecStage[7] = { 0, 1, 2, 3, 5, 6, 7 };
	static const char *kSpecName[7]  = { "A", "B", "C", "D", "SP", "CO", "BO" };
	std::string out;
	char buf[64];
	for( int i = 0; i < 7; ++i )
	{
		const int s = kSpecStage[i];
		auto o = m_chainOrd.find( kWalkKnob[s] );
		if( o == m_chainOrd.end() || o->second.empty() )
			continue;
		const int n = (int) o->second.size();
		const int p0 = classPos( x0[s], n );
		const int p1 = fading[s] ? classPos( x1[s], n ) : p0;
		snprintf( buf, sizeof buf, "#define SPEC_%s0 %d\n#define SPEC_%s1 %d\n", kSpecName[i], o->second[p0], kSpecName[i], o->second[p1] );
		out += buf;
	}
	return out;
}

void EffectShader::parseChainSource()
{
	if( m_chainParsed < 0 )
	{
		m_chainParsed = 0;
		char *src = m_fragmentShaderFilename ? textFileRead( m_fragmentShaderFilename ) : nullptr;
		if( src )
		{
			const std::string text( src );
			free( src );
			size_t a = 0;
			while( a < text.size() )
			{
				size_t b = text.find( '\n', a );
				if( b == std::string::npos ) b = text.size();
				std::string line = text.substr( a, b - a );
				a = b + 1;
				if( !line.empty() && line.back() == '\r' ) line.pop_back();
				static const std::string tag = "// @chainclasses ";
				if( line.compare( 0, tag.size(), tag ) == 0 )
				{
					const std::string rest = line.substr( tag.size() );
					const size_t sp = rest.find( ' ' );
					if( sp == std::string::npos ) continue;
					std::vector<std::string> names;
					size_t c = sp + 1;
					while( c <= rest.size() )
					{
						size_t d = rest.find( '|', c );
						if( d == std::string::npos ) d = rest.size();
						names.push_back( rest.substr( c, d - c ) );
						c = d + 1;
					}
					m_chainClasses[ rest.substr( 0, sp ) ] = names;
					m_chainParsed = 1;
				}
				// "int permCode(int i) { if (i == 0) return 228; ... }": the 24 stage orders
				if( line.compare( 0, 21, "int permCode(int i) {" ) == 0 && m_permCodes.empty() )
				{
					for( size_t c = 0; ( c = line.find( "return ", c ) ) != std::string::npos; c += 7 )
						m_permCodes.push_back( atoi( line.c_str() + c + 7 ) );
				}
				// "// @chainord chainAP 11|5|20|...": position -> branch (for the specialised variants)
				static const std::string otag = "// @chainord ";
				if( line.compare( 0, otag.size(), otag ) == 0 )
				{
					const std::string rest = line.substr( otag.size() );
					const size_t sp = rest.find( ' ' );
					std::vector<int> br;
					if( sp != std::string::npos )
						for( size_t c = sp + 1; c < rest.size(); )
						{
							size_t d = rest.find( '|', c );
							if( d == std::string::npos ) d = rest.size();
							if( d > c ) br.push_back( atoi( rest.c_str() + c ) );
							c = d + 1;
						}
					m_chainOrd[ rest.substr( 0, sp ) ] = br;
				}
				// "// @chainopening chainAP 9|10|13": the classes streaming into an opening (flat labs only)
				static const std::string ztag = "// @chainopening ";
				if( line.compare( 0, ztag.size(), ztag ) == 0 )
				{
					const std::string rest = line.substr( ztag.size() );
					const size_t sp = rest.find( ' ' );
					std::vector<int> pos;
					if( sp != std::string::npos )
						for( size_t c = sp + 1; c < rest.size(); )
						{
							size_t d = rest.find( '|', c );
							if( d == std::string::npos ) d = rest.size();
							if( d > c ) pos.push_back( atoi( rest.c_str() + c ) );
							c = d + 1;
						}
					m_chainOpening[ rest.substr( 0, sp ) ] = pos;
				}
				// frozen likes: "const float chainAP = 0.4752;"
				static const std::string ctag = "const float ";
				if( line.compare( 0, ctag.size(), ctag ) == 0 )
				{
					const size_t eq = line.find( '=' );
					if( eq != std::string::npos )
					{
						std::string name = line.substr( ctag.size(), eq - ctag.size() );
						while( !name.empty() && name.back() == ' ' ) name.pop_back();
						m_chainConsts[ name ] = (float) atof( line.c_str() + eq + 1 );
					}
				}
			}
		}
	}
}

// Class position of a knob value, exactly as the shader's pickStage().
static int classPos( float x, int n )
{
	int k = (int)( ( x < 0.f ? 0.f : ( x > 1.f ? 1.f : x ) ) * n );
	return k > n - 1 ? n - 1 : k;
}

bool EffectShader::opensAt( int s, float x ) const
{
	auto c = m_chainOpening.find( kWalkKnob[s] );
	auto n = m_chainClasses.find( kWalkKnob[s] );
	if( c == m_chainOpening.end() || n == m_chainClasses.end() || n->second.empty() )
		return false;
	const int k = classPos( x, (int) n->second.size() );
	for( int p : c->second )
		if( p == k ) return true;
	return false;
}

float EffectShader::closedClass( int s, float x ) const
{
	auto n = m_chainClasses.find( kWalkKnob[s] );
	if( n == m_chainClasses.end() || n->second.empty() )
		return x;
	const int cnt = (int) n->second.size();
	const int k = classPos( x, cnt );
	const float sub = x * cnt - (float) k;          // the sub-variant (arms, mirrors ...) stays
	for( int d = 1; d < cnt; ++d )
		for( int sign = -1; sign <= 1; sign += 2 )
		{
			const int j = k + sign * d;
			if( j < 0 || j >= cnt ) continue;
			const float v = ( (float) j + ( sub < 0.f ? 0.f : ( sub > 0.99f ? 0.99f : sub ) ) ) / (float) cnt;
			if( !opensAt( s, v ) ) return v;
		}
	return x;
}

// ---- Camera host of the 3D chains --------------------------------------------
// Speed of the flight per gaze -- the order of gazeAngles() in the shader:
// ahead, right window, slanted down, left window, slanted up, floating, orthographic.
static const int   kGazeN = 7;
static const float kGazeSpeed[kGazeN] = { 1.f, 0.7f, 0.85f, 0.7f, 0.85f, 0.08f, 0.5f };

void EffectShader::stepChainCam( const AudioFeatures &f )
{
	if( m_camProg != m_sh_prog_id )
	{
		m_camProg    = m_sh_prog_id;
		m_camHostLoc = glGetUniformLocation( m_sh_prog_id, "camHost" );
		m_camZLoc    = glGetUniformLocation( m_sh_prog_id, "camZ" );
		m_camGazeLoc = glGetUniformLocation( m_sh_prog_id, "camGaze" );
	}
	if( m_camHostLoc < 0 || m_camZLoc < 0 || m_camGazeLoc < 0 )
		return;                                     // not a 3D chain
	float speedP = 0.5f, camP = 0.f;
	for( const Uniform *u : m_uniforms )
	{
		if( u->getName() == "speedP" ) speedP = u->snapshotValue();
		if( u->getName() == "camP" )   camP   = u->snapshotValue();
	}
	const auto now = std::chrono::steady_clock::now();
	if( m_cam.pending )
	{
		m_cam.pending = false;
		m_cam.rng.seed( (unsigned) now.time_since_epoch().count() | 1u );   // not from the scene's rand() stream
		m_cam.z  = std::uniform_real_distribution<float>( 0.f, 500.f )( m_cam.rng );   // a fresh stretch of the world
		m_cam.g0 = m_cam.g1 = (int)( ( camP < 0.f ? 0.f : ( camP > 0.999f ? 0.999f : camP ) ) * kGazeN );
		m_cam.f  = 0.f;
		m_cam.hold = 0.f;
		m_cam.holdDur = std::uniform_real_distribution<float>( 120.f, 300.f )( m_cam.rng );
		m_cam.hasLast = false;
	}
	float dt = m_cam.hasLast ? std::chrono::duration<float>( now - m_cam.last ).count() : 0.f;
	float dAdv = m_cam.hasLast ? f.audioAdvance - m_cam.lastAdv : 0.f;
	m_cam.last = now;
	m_cam.lastAdv = f.audioAdvance;
	m_cam.hasLast = true;
	if( dt > 0.25f ) dt = 0.016f;                   // back from a pause: no catch-up leap
	if( dAdv < 0.f || dAdv > 1.f ) dAdv = 0.f;

	// The gaze: hold, then pan to another one (never the same).
	if( m_cam.g1 == m_cam.g0 )
	{
		m_cam.hold += dt;
		if( m_cam.hold >= m_cam.holdDur )
		{
			m_cam.g1 = ( m_cam.g0 + 1 + (int)( m_cam.rng() % (unsigned)( kGazeN - 1 ) ) ) % kGazeN;
			m_cam.f = 0.f;
			m_cam.panDur = std::uniform_real_distribution<float>( 40.f, 60.f )( m_cam.rng );
			fprintf( stderr, "CAM %s gaze %d -> %d, %.0f s pan\n", fragmentName(), m_cam.g0, m_cam.g1, m_cam.panDur );
		}
	}
	else
	{
		m_cam.f += dt / m_cam.panDur;
		if( m_cam.f >= 1.f )
		{
			m_cam.g0 = m_cam.g1;
			m_cam.f = 0.f;
			m_cam.hold = 0.f;
			m_cam.holdDur = std::uniform_real_distribution<float>( 120.f, 300.f )( m_cam.rng );
		}
	}
	// The flight: the shader's old closed form (0.15 + 0.25 speedP) * time +
	// 1.5 * audioAdvance, differentiated, times the speed of the gaze.
	const float s  = m_cam.f * m_cam.f * ( 3.f - 2.f * m_cam.f );   // smoothstep, as the shader pans
	const float sp = kGazeSpeed[m_cam.g0] + ( kGazeSpeed[m_cam.g1] - kGazeSpeed[m_cam.g0] ) * s;
	const float speedK = 0.15f + 0.25f * ( speedP < 0.f ? 0.f : ( speedP > 1.f ? 1.f : speedP ) );
	m_cam.z += sp * ( speedK * dt + 1.5f * dAdv );

	glUniform1f( m_camHostLoc, 1.f );
	glUniform1f( m_camZLoc, m_cam.z );
	glUniform3f( m_camGazeLoc, (float) m_cam.g0, (float) m_cam.g1, m_cam.f );
}

std::string EffectShader::chainInfo()
{
	parseChainSource();
	if( m_chainParsed != 1 )
		return std::string();

	// The rolled value of a knob (or its frozen constant); -1 if the shader has neither.
	auto knobValue = [this]( const char *knob ) -> float {
		for( const Uniform *u : m_uniforms )
			if( u->getName() == knob ) return u->snapshotValue();
		auto it = m_chainConsts.find( knob );
		return it != m_chainConsts.end() ? it->second : -1.f;
	};
	auto className = [this]( const std::string &knob, float x ) -> std::string {
		auto it = m_chainClasses.find( knob );
		if( it == m_chainClasses.end() || it->second.empty() ) return "?";
		const int n = (int) it->second.size();
		int k = (int)( ( x < 0.f ? 0.f : ( x > 1.f ? 1.f : x ) ) * n );
		if( k > n - 1 ) k = n - 1;
		return it->second[k];
	};
	// Display order: the order first, then the stages, the look, the 3D structure.
	static const int   kShow[9]   = { 8, 0, 1, 2, 3, 4, 5, 6, 7 };
	static const char *kLabel[9]  = { "A", "B", "C", "D", "Look", "Raum", "Kern", "Koerper", "Reihenfolge" };
	std::string out;
	char buf[64];
	for( int i = 0; i < 9; ++i )
	{
		const int s = kShow[i];
		const float rolled = knobValue( kWalkKnob[s] );
		if( rolled < 0.f || m_chainClasses.find( kWalkKnob[s] ) == m_chainClasses.end() )
			continue;
		const bool walking = m_walk.active && ( m_walkLoc[s] >= 0 );
		const float x0 = walking ? m_walk.x0[s] : rolled;
		std::string line = std::string( "  " ) + kLabel[s];
		line.resize( 14, ' ' );
		line += className( kWalkKnob[s], x0 );
		if( walking && m_walk.fading[s] )
		{
			snprintf( buf, sizeof buf, "  (%d%%)", (int)( m_walk.f[s] * 100.f + 0.5f ) );
			const std::string to = className( kWalkKnob[s], m_walk.x1[s] );
			line += " -> " + ( to == className( kWalkKnob[s], x0 ) ? std::string( "neue Variante" ) : to ) + buf;
		}
		if( !out.empty() ) out += "\n";
		out += line;
	}
	if( !out.empty() )
	{
		snprintf( buf, sizeof buf, "%.2f", m_walk.rate );
		out = ( m_walk.active ? std::string( "  KETTE (wandert, Musiktempo " ) + buf + ")\n"
		                      : std::string( "  KETTE (fest)\n" ) ) + out;
	}
	return out;
}

void EffectShader::setGradeModes( const std::string &list )
{
	m_gradeModes.clear();
	size_t a = 0;
	while( a <= list.size() )
	{
		size_t b = list.find( ',', a );
		if( b == std::string::npos ) b = list.size();
		std::string w = list.substr( a, b - a );
		w.erase( 0, w.find_first_not_of( " \t" ) );
		w.erase( w.find_last_not_of( " \t" ) + 1 );
		if( w == "fade" )       m_gradeModes.push_back( 1 );
		else if( w == "grey" )  m_gradeModes.push_back( 2 );
		else if( w == "sepia" ) m_gradeModes.push_back( 3 );
		a = b + 1;
	}
	// The very first activation after loading does not pass through
	// resetParameters(), so roll the first grade here.
	m_gradeMode = m_gradeModes.empty() ? 0 : m_gradeModes[ rand() % m_gradeModes.size() ];
}

bool EffectShader::usesSceneLod()
{
	if( m_usesSceneLod < 0 )
	{
		m_usesSceneLod = 0;
		if( m_fragmentShaderFilename )
			if( char *src = textFileRead( m_fragmentShaderFilename ) )
			{
				m_usesSceneLod = strstr( src, "textureLod(tex0" ) ? 1 : 0;
				free( src );
			}
	}
	return m_usesSceneLod == 1;
}

bool EffectShader::usesMandelbrot()
{
	if( !m_glReady )
		return false;
	if( m_usesMandelbrot < 0 )
		m_usesMandelbrot = ( m_sh_prog_id != 0 &&
		                     glGetUniformLocation( m_sh_prog_id, "texMandelbrot" ) >= 0 ) ? 1 : 0;
	return m_usesMandelbrot == 1;
}

void EffectShader::ensureBakeProg()
{
	if( m_bakeTried )
		return;
	m_bakeTried = true;

	if( !glcoreHasCompute || !glTexImage3D || !m_bakeCompFilename )
		return;

	m_bakeProg = setComputeShader( m_bakeCompFilename );   // 0 on any failure (incl. missing file)
	if( m_bakeProg == 0 )
		return;

	glGenTextures( 1, &m_bakeTex );
	glBindTexture( GL_TEXTURE_3D, m_bakeTex );
	glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_MIN_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_MAG_FILTER, GL_LINEAR );
	glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	glTexParameteri( GL_TEXTURE_3D, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE );
	// RG32F: R = distance estimate, G = whatever per-texel extra scalar the
	// bake shader wants to carry through (e.g. an orbit-trap value for a
	// fractal's aura shading) -- the scene's own .comp decides what G means,
	// this class only owns the format and the texture's lifetime.
	glTexImage3D( GL_TEXTURE_3D, 0, GL_RG32F, kBakeRes, kBakeRes, kBakeRes,
	              0, GL_RGBA, GL_FLOAT, nullptr );
	glBindTexture( GL_TEXTURE_3D, 0 );
	m_bakeFrame = kBakeIntervalFrames;   // bake on the very first draw, not one interval late
}

void EffectShader::stepBake( float time, const AudioFeatures &audio )
{
	ensureBakeProg();
	if( m_bakeProg == 0 )
		return;

	// texBake always reads unit 33 -- set on the FRAGMENT program (already
	// current: draw() runs after enableShader()), not the compute one. Cheap
	// enough to just set every frame rather than adding a separate
	// once-per-recompile cache for one uniform.
	GLint lTexBake = glGetUniformLocation( m_sh_prog_id, "texBake" );
	if( lTexBake >= 0 ) glUniform1i( lTexBake, 33 );

	// Re-bake only every kBakeIntervalFrames frames: the bake shader itself
	// decides how much of its field is actually time-varying (typically a
	// slowly audio-morphed parameter, not the whole shape), so this interval
	// trades a small, usually imperceptible step in that drift for a large
	// reduction in how often the (comparatively expensive) bake pass runs.
	if( ++m_bakeFrame < kBakeIntervalFrames )
	{
		glActiveTexture( GL_TEXTURE0 + 33 );
		glBindTexture( GL_TEXTURE_3D, m_bakeTex );
		glActiveTexture( GL_TEXTURE0 );
		return;
	}
	m_bakeFrame = 0;

	glUseProgram( m_bakeProg );
	GLint lt = glGetUniformLocation( m_bakeProg, "time" );
	if( lt >= 0 ) glUniform1f( lt, time );
	GLint lk = glGetUniformLocation( m_bakeProg, "audioKick" );
	if( lk >= 0 ) glUniform1f( lk, audio.onsetKick );
	GLint lb = glGetUniformLocation( m_bakeProg, "audioBass" );
	if( lb >= 0 ) glUniform1f( lb, audio.bassLevel );
	GLint la = glGetUniformLocation( m_bakeProg, "audioAdvance" );
	if( la >= 0 ) glUniform1f( la, audio.audioAdvance );
	// This scene's own per-activation params (e.g. a "speedP" the fragment
	// shader ALSO reads to build its camera's own time-dependent rotation) --
	// without these, the bake shader's rotation phase can drift out of sync
	// with what the fragment shader's live camera math expects to see, since
	// both derive their own "t" from the same raw time but scaled by params
	// the compute program has no other way to know. Same by-name upload
	// Scene3DShader::runGenerator() uses for its generator.
	for( unsigned int i = 0; i < m_uniforms.size(); ++i )
	{
		GLint l = glGetUniformLocation( m_bakeProg, m_uniforms[i]->getName().c_str() );
		if( l >= 0 ) glUniform1f( l, m_uniforms[i]->snapshotValue() );
	}

	glBindImageTexture( 0, m_bakeTex, 0, GL_TRUE, 0, GL_WRITE_ONLY, GL_RG32F );
	const int groups = ( kBakeRes + 3 ) / 4;   // matches the bake shaders' local_size 4x4x4
	glDispatchCompute( groups, groups, groups );
	glMemoryBarrier( GL_TEXTURE_FETCH_BARRIER_BIT );

	glActiveTexture( GL_TEXTURE0 + 33 );
	glBindTexture( GL_TEXTURE_3D, m_bakeTex );
	glActiveTexture( GL_TEXTURE0 );
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

bool EffectShader::usesShadow2()
{
	if( !m_glReady )
		return false;
	if( m_usesShadow2 < 0 )
		m_usesShadow2 = ( m_sh_prog_id != 0 &&
		                  glGetUniformLocation( m_sh_prog_id, "texShadow2" ) >= 0 ) ? 1 : 0;
	return m_usesShadow2 == 1;
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
		// Save/restore GL_CURRENT_PROGRAM: this query can run mid-frame (first time
		// a shader is drawn), so binding this program to read+set its sampler units
		// must not leave some OTHER program active for the caller's next GL call.
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