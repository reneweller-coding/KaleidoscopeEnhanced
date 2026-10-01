# -*- coding: utf-8 -*-
"""The chain runner (user, 01.10.2026: "build a small shader for every
transform and apply them one after the other").

A chain lab with a generated Engine/ChainPass/Final_<name>.frag compiles that
small shader instead of its all-classes uber-shader, and every frame the
effect runs its chain as passes (Engine/ChainPass/<stage><branch>.frag) into
RG32F coordinate textures, from the walk state the app already keeps:
stage fades (two passes + Mix), the order fade (two chains + Mix), the weak-
chain lattice (Fallback).  The result is bound as texChain (unit 40).  The
editor and the catalogue keep the uber-shader (Scene2D/<name>.frag).
KALEIDO_NO_CHAINPASS=1 turns it off."""
import io, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def rw(path, pairs):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding="utf-8", newline="").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    for a, b in pairs:
        assert s.count(a) == 1, (path, a[:70])
        s = s.replace(a, b)
    if crlf:
        s = s.replace("\n", "\r\n")
    io.open(p, "w", encoding="utf-8", newline="").write(s)

rw("Source/EffectShader.h", [
("""	const char *fragmentFile() const { return m_fragmentShaderFilename; }""",
 """	const char *fragmentFile() const { return m_compileFile ? m_compileFile : m_fragmentShaderFilename; }"""),
("""	int		m_chainParsed = -1;         ///< chainInfo(): -1 = source not read yet, 0 = no chain classes, 1 = parsed.
""",
"""	// ---- Chain runner: the lab's chain as one small pass per transform ----
	char   *m_compileFile = nullptr;    ///< Engine/ChainPass/Final_<name>.frag when this lab runs its chain as passes (else null: the fragment file itself).
	GLuint	m_cpFbo[5] = {}, m_cpTex[5] = {};   ///< RG32F coordinate textures (ping-pong plus fade temporaries).
	int		m_cpW = 0, m_cpH = 0;       ///< Their size (the target viewport).
	std::vector<int> m_permCodes;       ///< The 24 stage orders (base-4 digits), from "int permCode(int i)".
	float	m_lastSceneTime = 0.f;      ///< sceneTime as uploaded this frame (the passes need the same value).
	/// @brief Runs this frame's chain as passes and binds the result as texChain (program must be bound; restores the GL state it touches).
	void runChainPasses( const AudioFeatures &f );
	int		m_chainParsed = -1;         ///< chainInfo(): -1 = source not read yet, 0 = no chain classes, 1 = parsed.
"""),
])

C = []
# constructor: the generated final shader, when present
C.append(("""	// Optional per-scene bake compute shader: "X.frag" -> "X.comp", sibling of""",
"""	// A chain lab with a generated pass shader set runs its chain as passes
	// (runChainPasses) and compiles the small final shader instead of its
	// all-classes uber-shader (which the editor and the catalogue keep).
	{
		std::string s = filenameFragmentShader;
		size_t a = s.find_last_of( "\\\\/" );
		std::string base = s.substr( a == std::string::npos ? 0 : a + 1 );
		size_t d = base.rfind( ".frag" );
		if( d != std::string::npos ) base = base.substr( 0, d );
		const std::string fin = "..\\\\Engine\\\\ChainPass\\\\Final_" + base + ".frag";
		if( !getenv( "KALEIDO_NO_CHAINPASS" ) )
			if( FILE *fp = fopen( fin.c_str(), "rb" ) )
			{
				fclose( fp );
				m_compileFile = (char *) malloc( fin.size() + 1 );
				strcpy( m_compileFile, fin.c_str() );
			}
	}

	// Optional per-scene bake compute shader: "X.frag" -> "X.comp", sibling of"""))
C.append(("""	m_sh_prog_id = setShaders( m_vertexShaderFilename, m_fragmentShaderFilename );""",
          """	m_sh_prog_id = setShaders( m_vertexShaderFilename, m_compileFile ? m_compileFile : m_fragmentShaderFilename );"""))
C.append(("""	if( m_sceneTimeUni >= 0 )
		glUniform1f( m_sceneTimeUni, time - m_activationTime );""",
"""	m_lastSceneTime = time - m_activationTime;
	if( m_sceneTimeUni >= 0 )
		glUniform1f( m_sceneTimeUni, time - m_activationTime );"""))
# a lab running as passes walks with the app from morphP 0.15 (no shader walk left)
C.append(("""	m_walk.active = ( m_walkHostLoc >= 0 && morph >= 0.5f );
	m_walkMorph = morph;""",
"""	m_walk.active = ( m_walkHostLoc >= 0 && morph >= ( m_compileFile ? 0.15f : 0.5f ) );
	m_walkMorph = morph;"""))
# permCode parse
C.append(("""				// "// @chainord chainAP 11|5|20|...": position -> branch (for the specialised variants)""",
"""				// "int permCode(int i) { if (i == 0) return 228; ... }": the 24 stage orders
				if( line.compare( 0, 21, "int permCode(int i) {" ) == 0 && m_permCodes.empty() )
				{
					for( size_t c = 0; ( c = line.find( "return ", c ) ) != std::string::npos; c += 7 )
						m_permCodes.push_back( atoi( line.c_str() + c + 7 ) );
				}
				// "// @chainord chainAP 11|5|20|...": position -> branch (for the specialised variants)"""))
# call the runner after all of this frame's uploads
C.append(("""    // Chain labs: the music steers the walk (no-op for every other shader).
    stepChainWalk( f );
    stepChainCam( f );
""",
"""    // Chain labs: the music steers the walk (no-op for every other shader).
    stepChainWalk( f );
    stepChainCam( f );
    if( m_compileFile && m_glReady )
        runChainPasses( f );
"""))
C.append(("""std::string EffectShader::specDefines( const float *x0, const float *x1, const bool *fading ) const
{""",
"""// ---- Chain runner ----------------------------------------------------------
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
	snprintf( b, sizeof b, "..\\\\Engine\\\\ChainPass\\\\%c%d.frag", stage, branch );
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
		s_passWarm.push_back( "..\\\\Engine\\\\ChainPass\\\\Id.frag" );
		s_passWarm.push_back( "..\\\\Engine\\\\ChainPass\\\\Mix.frag" );
		s_passWarm.push_back( "..\\\\Engine\\\\ChainPass\\\\Fallback.frag" );
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
			pass( p0 == 0 ? std::string( "..\\\\Engine\\\\ChainPass\\\\Id.frag" ) : passFile( kStage[s], ord[p0] ), cur, -1, ta, v0, 0.f );
			const int tb = freeTex( keep | ( 1u << ta ) );
			pass( p1 == 0 ? std::string( "..\\\\Engine\\\\ChainPass\\\\Id.frag" ) : passFile( kStage[s], ord[p1] ), cur, -1, tb, v1, 0.f );
			const int out = freeTex( ( 1u << ta ) | ( 1u << tb ) );
			pass( "..\\\\Engine\\\\ChainPass\\\\Mix.frag", ta, tb, out, 0.f, smooth01( m_walk.f[s] ) );
			cur = out;
		}
		if( cur < 0 )                                    // every stage 'none'
		{
			cur = freeTex( 0 );
			pass( "..\\\\Engine\\\\ChainPass\\\\Id.frag", -1, -1, cur, 0.f, 0.f );
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
		pass( "..\\\\Engine\\\\ChainPass\\\\Mix.frag", res, res2, out, 0.f, smooth01( m_walk.f[8] ) );
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
		pass( "..\\\\Engine\\\\ChainPass\\\\Fallback.frag", res, -1, out, 0.f, w );
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
{"""))
rw("Source/EffectShader.cpp", C)
print("ok")
