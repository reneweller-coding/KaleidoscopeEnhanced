# -*- coding: utf-8 -*-
"""Chain runner, 3D mode (ChainLab3D, "// @chain3d" in its final shader).

Per frame:
 1. geometry pass -- Engine/ChainPass/Geom_ChainLab3D.frag with the world's
    classes (#define SPEC_SP0 ...), built by the helper process (ShaderForge)
    and loaded as a program binary -- into a G-buffer (hit point, distance,
    normal, AO);
 2. per projection plane: Start3D (the chain's input and time offset from
    the G-buffer), then the colour chain as passes (as in the 2D lab);
 3. the lab's own final shader: colour, relief, light, fog.
A structure fade waits at 0 % until the variant with both worlds exists and at
100 % until the one after it does -- nothing jumps, and nothing compiles on
the render thread.  Without the helper the variant is built here (blocking)."""
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

# ---------------------------------------------------------------- shader_setup: blocking build from text
rw("Source/shader_setup.h", [(
"""bool   shaderVariantFailed( const char *frag_source, const std::string &defines );
""",
"""bool   shaderVariantFailed( const char *frag_source, const std::string &defines );
/// @brief Builds a fullscreen program from fragment TEXT now (blocking; cached by text). 0 on failure (logged).
GLuint shaderBuildFromText( const std::string &fragText );
""")])
rw("Source/shader_setup.cpp", [(
"""bool shaderVariantFailed( const char *frag_source, const std::string &defines )
{""",
"""GLuint shaderBuildFromText( const std::string &fragText )
{
	static std::map<std::string, GLuint> built;
	auto it = built.find( fragText );
	if( it != built.end() ) return it->second;
	GLuint prog = glCreateProgram();
	glAttachShader( prog, fullscreenVertShader() );
	GLuint fs = glCreateShader( GL_FRAGMENT_SHADER );
	const GLchar *p = fragText.c_str();
	glShaderSource( fs, 1, &p, NULL );
	glCompileShader( fs );
	printShaderInfoLog( fs );
	glAttachShader( prog, fs );
	const GLuint ok = linkOrFail( prog );
	glDeleteShader( fs );
	built[fragText] = ok;
	return ok;
}

bool shaderVariantFailed( const char *frag_source, const std::string &defines )
{""")])

# ---------------------------------------------------------------- EffectShader.h
rw("Source/EffectShader.h", [(
"""	int		m_chainBake = 0;            ///< > 0: the chain is baked over [0,1]^2 at this size ("// @chainbake N" in the final shader).""",
"""	int		m_chainBake = 0;            ///< > 0: the chain is baked over [0,1]^2 at this size ("// @chainbake N" in the final shader).
	bool	m_chain3D = false;          ///< "// @chain3d": the 3D lab's deferred passes (geometry, three plane chains, shading).
	std::string m_geomSrc;              ///< Engine/ChainPass/Geom_<name>.frag: the geometry pass, world classes as #if selections.
	GLuint	m_gbFbo = 0, m_gbTex[2] = {};   ///< G-buffer: hit point + distance, normal + AO (RGBA32F).
	int		m_gbW = 0, m_gbH = 0;
	float	m_geomWait = 0.f;           ///< Seconds a structure fade has waited for its geometry variant.
	/// @brief The geometry program for a walk state (world 0 = shown, world 1 = faded to); 0 while the helper builds it.
	GLuint	geomProgram( const float *x0, const float *x1, const bool *fading );
	/// @brief The 3D lab's passes (see runChainPasses).
	void	runChain3D( const AudioFeatures &f );""")])

C = []
C.append(("""				if( char *t = textFileRead( m_compileFile ) )
				{
					if( const char *b = strstr( t, "// @chainbake " ) )
						m_chainBake = atoi( b + 14 );
					free( t );
				}""",
"""				if( char *t = textFileRead( m_compileFile ) )
				{
					if( const char *b = strstr( t, "// @chainbake " ) )
						m_chainBake = atoi( b + 14 );
					m_chain3D = strstr( t, "// @chain3d" ) != nullptr;
					free( t );
				}
				if( m_chain3D )
				{
					const std::string g = "..\\\\Engine\\\\ChainPass\\\\Geom_" + base + ".frag";
					if( char *t = textFileRead( g.c_str() ) ) { m_geomSrc = t; free( t ); }
					else m_chain3D = false;
				}"""))
# run the 3D passes instead of the flat ones
C.append(("""    if( m_compileFile && m_glReady )
        runChainPasses( f );""",
"""    if( m_compileFile && m_glReady )
    {
        if( m_chain3D ) runChain3D( f );
        else            runChainPasses( f );
    }"""))
# structure fades wait for their geometry variant
C.append(("""			// a bound variant without this fade's target: wait at 0 %
			if( variantBound && m_walk.f[s] <= 0.f && want != m_specBound )""",
"""			// 3D lab: a structure fade waits at 0 % for the geometry variant with both worlds
			if( m_chain3D && isStructure( s ) && m_walk.f[s] <= 0.f && m_geomWait < 8.f
			    && !geomProgram( m_walk.x0, m_walk.x1, m_walk.fading ) )
			{
				m_geomWait += dt;
				goto upload;
			}
			// a bound variant without this fade's target: wait at 0 %
			if( variantBound && m_walk.f[s] <= 0.f && want != m_specBound )"""))
C.append(("""			m_walk.f[s] += dt * m_walk.rate / m_walk.fadeDur[s];     // music time: never backwards, never a jump
			if( m_walk.f[s] >= 1.f && variantBound )""",
"""			m_walk.f[s] += dt * m_walk.rate / m_walk.fadeDur[s];     // music time: never backwards, never a jump
			if( m_chain3D && isStructure( s ) && m_walk.f[s] >= 1.f && m_geomWait < 8.f )
			{
				// ... and at 100 % for the variant of the world after it
				float x0[9]; bool fd[9];
				for( int o = 0; o < kWalkN; ++o ) { x0[o] = m_walk.x0[o]; fd[o] = m_walk.fading[o]; }
				x0[s] = m_walk.x1[s]; fd[s] = false;
				if( !geomProgram( x0, m_walk.x1, fd ) )
				{
					m_walk.f[s] = 1.f;
					m_geomWait += dt;
					goto upload;
				}
			}
			if( m_chain3D && isStructure( s ) ) m_geomWait = 0.f;
			if( m_walk.f[s] >= 1.f && variantBound )"""))
C.append(("""std::string EffectShader::specDefines( const float *x0, const float *x1, const bool *fading ) const
{""",
"""// ---- 3D lab ------------------------------------------------------------------
GLuint EffectShader::geomProgram( const float *x0, const float *x1, const bool *fading )
{
	static const int   kSt[3]   = { 5, 6, 7 };
	static const char *kName[3] = { "SP", "CO", "BO" };
	std::string d;
	char buf[96];
	for( int i = 0; i < 3; ++i )
	{
		auto o = m_chainOrd.find( kWalkKnob[ kSt[i] ] );
		if( o == m_chainOrd.end() || o->second.empty() ) return 0;
		const int n = (int) o->second.size();
		const int p0 = classPos( x0[ kSt[i] ], n );
		const int p1 = fading[ kSt[i] ] ? classPos( x1[ kSt[i] ], n ) : p0;
		snprintf( buf, sizeof buf, "#define SPEC_%s0 %d\\n#define SPEC_%s1 %d\\n", kName[i], o->second[p0], kName[i], o->second[p1] );
		d += buf;
	}
	std::string src = m_geomSrc;
	const size_t nl = src.find( '\\n' );
	src.insert( nl == std::string::npos ? src.size() : nl + 1, d );
	if( shaderForgeAvailable() )
	{
		bool failed = false;
		const GLuint p = shaderForgeGet( src, &failed );
		if( p || !failed ) return p;
	}
	return shaderBuildFromText( src );                 // no helper (or it failed): build here, blocking
}

void EffectShader::runChain3D( const AudioFeatures &f )
{
	static const char kStage[4] = { 'A', 'B', 'C', 'D' };
	static const int  kWeak[4]  = { 0, 2, 1, 2 };
	parseChainSource();
	for( int s = 0; s < 4; ++s )
		if( m_chainOrd.find( kWalkKnob[s] ) == m_chainOrd.end() ) return;
	const bool fixedOrder = m_permCodes.size() != 24;
	const GLuint geom = geomProgram( m_walk.x0, m_walk.x1, m_walk.fading );

	GLint vp[4], drawFb = 0, readFb = 0, activeTex = 0, vao = 0;
	glGetIntegerv( GL_VIEWPORT, vp );
	glGetIntegerv( 0x8CA6, &drawFb );
	glGetIntegerv( 0x8CAA, &readFb );
	glGetIntegerv( 0x84E0, &activeTex );
	glGetIntegerv( 0x85B5, &vao );
	const GLboolean blend = glIsEnabled( GL_BLEND ), depth = glIsEnabled( GL_DEPTH_TEST ), scissor = glIsEnabled( GL_SCISSOR_TEST );
	const int W = vp[2] > 0 ? vp[2] : 1, H = vp[3] > 0 ? vp[3] : 1;

	auto makeTex = [&]( GLuint tex ) {
		glBindTexture( GL_TEXTURE_2D, tex );
		glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA32F, W, H, 0, GL_RGBA, GL_FLOAT, nullptr );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE );
	};
	if( W != m_cpW || H != m_cpH || !m_cpTex[0] )
	{
		if( m_cpTex[0] ) { glDeleteTextures( 8, m_cpTex ); glDeleteFramebuffers( 8, m_cpFbo ); }
		glGenTextures( 8, m_cpTex );
		glGenFramebuffers( 8, m_cpFbo );
		for( int i = 0; i < 8; ++i )
		{
			makeTex( m_cpTex[i] );
			glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[i] );
			glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_cpTex[i], 0 );
		}
		if( m_gbTex[0] ) { glDeleteTextures( 2, m_gbTex ); glDeleteFramebuffers( 1, &m_gbFbo ); }
		glGenTextures( 2, m_gbTex );
		glGenFramebuffers( 1, &m_gbFbo );
		glBindFramebuffer( GL_FRAMEBUFFER, m_gbFbo );
		for( int i = 0; i < 2; ++i )
		{
			makeTex( m_gbTex[i] );
			glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_TEXTURE_2D, m_gbTex[i], 0 );
		}
		m_cpW = W; m_cpH = H;
	}
	glDisable( GL_BLEND ); glDisable( GL_DEPTH_TEST ); glDisable( GL_SCISSOR_TEST );
	glViewport( 0, 0, W, H );
	glBindVertexArray( fullscreenVAO() );

	// 1. Geometry into the G-buffer (no program yet: every pixel misses -- fog).
	glBindFramebuffer( GL_FRAMEBUFFER, m_gbFbo );
	const GLenum bufs[2] = { GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT1 };
	glDrawBuffers( 2, bufs );
	if( geom )
	{
		glUseProgram( geom );
		auto loc = [&]( const char *n ) { return glGetUniformLocation( geom, n ); };
		for( const Uniform *u : m_uniforms )
		{
			const std::string &nm = u->getName();
			if( !nm.empty() && nm.back() == 'P' )
			{
				const GLint l = loc( nm.c_str() );
				if( l >= 0 ) glUniform1f( l, u->snapshotValue() );
			}
		}
		GLint l;
		if( ( l = loc( "resolution" ) ) >= 0 )   glUniform2f( l, (float) m_width, (float) m_height );
		if( ( l = loc( "sceneTime" ) ) >= 0 )    glUniform1f( l, m_lastSceneTime );
		if( ( l = loc( "sceneAdvance" ) ) >= 0 ) glUniform1f( l, f.audioAdvance - m_advanceAtReset );
		if( ( l = loc( "audioAdvance" ) ) >= 0 ) glUniform1f( l, f.audioAdvance );
		if( ( l = loc( "audioPhase" ) ) >= 0 )   glUniform1f( l, f.audioRotPhase );
		if( ( l = loc( "audioSpread" ) ) >= 0 )  glUniform1f( l, f.spectralSpread );
		if( ( l = loc( "audioSwell" ) ) >= 0 )   glUniform1f( l, f.swell );
		if( ( l = loc( "audioKick" ) ) >= 0 )    glUniform1f( l, f.onsetKick );
		if( ( l = loc( "audioMode" ) ) >= 0 )    glUniform1f( l, f.musicalMode );
		if( ( l = loc( "audioLevel" ) ) >= 0 )   glUniform1f( l, f.overallLevel );
		if( ( l = loc( "walkHost" ) ) >= 0 )     glUniform1f( l, m_walk.active ? 1.f : 0.f );
		static const char *kW[3] = { "walkSpace", "walkCore", "walkBody" };
		for( int i = 0; i < 3; ++i )
			if( ( l = loc( kW[i] ) ) >= 0 )
			{
				const int s = 5 + i;
				glUniform3f( l, m_walk.x0[s], m_walk.fading[s] ? m_walk.x1[s] : m_walk.x0[s], m_walk.fading[s] ? m_walk.f[s] : 0.f );
			}
		if( ( l = loc( "camHost" ) ) >= 0 )      glUniform1f( l, m_camHostLoc >= 0 ? 1.f : 0.f );
		if( ( l = loc( "camZ" ) ) >= 0 )         glUniform1f( l, m_cam.z );
		if( ( l = loc( "camGaze" ) ) >= 0 )      glUniform3f( l, (float) m_cam.g0, (float) m_cam.g1, m_cam.f );
		glDrawArrays( GL_TRIANGLES, 0, 3 );
	}
	else
	{
		const GLfloat miss[4] = { 0.f, 0.f, 0.f, -1.f }, up[4] = { 0.f, 0.f, 1.f, 1.f };
		glClearBufferfv( GL_COLOR, 0, miss );
		glClearBufferfv( GL_COLOR, 1, up );
	}
	glDrawBuffers( 1, bufs );

	// 2. The colour chain once per projection plane, from the G-buffer.
	float speedP = 0.5f, solidP = 0.f;
	for( const Uniform *u : m_uniforms )
	{
		if( u->getName() == "speedP" ) speedP = u->snapshotValue();
		if( u->getName() == "solidP" ) solidP = u->snapshotValue();
	}
	int start = -1;
	auto pass = [&]( const std::string &file, int in, int inB, int out, float subV, float mixF ) {
		const PassProg &p = passProg( file );
		if( !p.prog ) return;
		glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[out] );
		glUseProgram( p.prog );
		glActiveTexture( GL_TEXTURE0 + 41 );
		glBindTexture( GL_TEXTURE_2D, in >= 0 ? m_cpTex[in] : glcoreDummyTex2D() );
		glActiveTexture( GL_TEXTURE0 + 42 );
		glBindTexture( GL_TEXTURE_2D, inB >= 0 ? m_cpTex[inB] : glcoreDummyTex2D() );
		glActiveTexture( GL_TEXTURE0 + 47 );
		glBindTexture( GL_TEXTURE_2D, start >= 0 ? m_cpTex[start] : glcoreDummyTex2D() );
		if( p.texIn >= 0 )     glUniform1i( p.texIn, 41 );
		if( p.texB >= 0 )      glUniform1i( p.texB, 42 );
		if( p.texStart >= 0 )  glUniform1i( p.texStart, 47 );
		if( p.useStart >= 0 )  glUniform1i( p.useStart, start >= 0 ? 1 : 0 );
		if( p.firstPass >= 0 ) glUniform1i( p.firstPass, in < 0 ? 1 : 0 );
		if( p.subV >= 0 )      glUniform1f( p.subV, subV );
		if( p.mixF >= 0 )      glUniform1f( p.mixF, mixF );
		if( p.chainOff >= 0 )  glUniform2f( p.chainOff, 0.f, 0.f );
		if( p.bakeSize >= 0 )  glUniform1f( p.bakeSize, 0.f );
		if( p.res >= 0 )       glUniform2f( p.res, (float) m_width, (float) m_height );
		if( p.sceneTime >= 0 ) glUniform1f( p.sceneTime, m_lastSceneTime );
		if( p.adv >= 0 )       glUniform1f( p.adv, f.audioAdvance );
		if( p.phase >= 0 )     glUniform1f( p.phase, f.audioRotPhase );
		if( p.spread >= 0 )    glUniform1f( p.spread, f.spectralSpread );
		if( p.speed >= 0 )     glUniform1f( p.speed, speedP );
		glDrawArrays( GL_TRIANGLES, 0, 3 );
	};
	unsigned busy = 0;
	auto freeTex = [&]( unsigned also ) { for( int i = 0; i < 8; ++i ) if( !( ( busy | also ) & ( 1u << i ) ) ) return i; return 0; };
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
				if( p0 == 0 ) continue;
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
		if( cur < 0 )
		{
			cur = freeTex( 0 );
			pass( "..\\\\Engine\\\\ChainPass\\\\Id.frag", -1, -1, cur, 0.f, 0.f );
		}
		return cur;
	};
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
	const PassProg &st = passProg( "..\\\\Engine\\\\ChainPass\\\\Start3D.frag" );
	const GLint stG = glGetUniformLocation( st.prog, "texGPos" ), stPl = glGetUniformLocation( st.prog, "plane" ),
	            stSd = glGetUniformLocation( st.prog, "solidP" );
	const int code = fixedOrder ? 228 : m_permCodes[ classPos( m_walk.x0[8], 24 ) ];
	int res[3];
	for( int pl = 0; pl < 3; ++pl )
	{
		start = -1;
		const int s0 = freeTex( 0 );
		glBindFramebuffer( GL_FRAMEBUFFER, m_cpFbo[s0] );
		glUseProgram( st.prog );
		glActiveTexture( GL_TEXTURE0 + 45 );
		glBindTexture( GL_TEXTURE_2D, m_gbTex[0] );
		if( stG >= 0 )  glUniform1i( stG, 45 );
		if( stPl >= 0 ) glUniform1i( stPl, pl );
		if( stSd >= 0 ) glUniform1f( stSd, solidP );
		glDrawArrays( GL_TRIANGLES, 0, 3 );
		start = s0;
		busy |= 1u << s0;
		int r = runOrder( code );
		if( w > 0.f )
		{
			const int out = freeTex( 1u << r );
			pass( "..\\\\Engine\\\\ChainPass\\\\Fallback.frag", r, -1, out, 0.f, w );
			r = out;
		}
		busy &= ~( 1u << s0 );
		busy |= 1u << r;
		res[pl] = r;
	}
	start = -1;

	// 3. Restore, and hand the G-buffer and the three chains to the lab's last pass.
	glBindFramebuffer( 0x8CA9, drawFb );
	glBindFramebuffer( 0x8CA8, readFb );
	glViewport( vp[0], vp[1], vp[2], vp[3] );
	if( blend ) glEnable( GL_BLEND );
	if( depth ) glEnable( GL_DEPTH_TEST );
	if( scissor ) glEnable( GL_SCISSOR_TEST );
	glBindVertexArray( (GLuint) vao );
	glUseProgram( m_sh_prog_id );
	static const int   kUnit[5] = { 45, 46, 40, 43, 44 };
	static const char *kSam[5]  = { "texGPos", "texGNrm", "texChain0", "texChain1", "texChain2" };
	const GLuint texs[5] = { m_gbTex[0], m_gbTex[1], m_cpTex[ res[0] ], m_cpTex[ res[1] ], m_cpTex[ res[2] ] };
	for( int i = 0; i < 5; ++i )
	{
		glActiveTexture( GL_TEXTURE0 + kUnit[i] );
		glBindTexture( GL_TEXTURE_2D, texs[i] );
		const GLint l = glGetUniformLocation( m_sh_prog_id, kSam[i] );
		if( l >= 0 ) glUniform1i( l, kUnit[i] );
	}
	const GLint lo = glGetUniformLocation( m_sh_prog_id, "chainOff" );
	if( lo >= 0 ) glUniform2f( lo, (float) vp[0], (float) vp[1] );
	glActiveTexture( (GLenum) activeTex );
}

std::string EffectShader::specDefines( const float *x0, const float *x1, const bool *fading ) const
{"""))
C.append(("""	GLint texIn = -1, texB = -1, firstPass = -1, subV = -1, mixF = -1, chainOff = -1, bakeSize = -1,""",
          """	GLint texIn = -1, texB = -1, firstPass = -1, subV = -1, mixF = -1, chainOff = -1, bakeSize = -1, texStart = -1, useStart = -1,"""))
C.append(("""	p.bakeSize = glGetUniformLocation( p.prog, "bakeSize" );""",
          """	p.bakeSize = glGetUniformLocation( p.prog, "bakeSize" );
	p.texStart = glGetUniformLocation( p.prog, "texStart" );
	p.useStart = glGetUniformLocation( p.prog, "useStart" );"""))
rw("Source/EffectShader.cpp", C)

p = os.path.join(ROOT, "Source", "EffectShader.cpp")
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
if '#include "ShaderForge.h"' not in s:
    s = s.replace('#include "shader_setup.h"' + nl, '#include "shader_setup.h"' + nl + '#include "ShaderForge.h"' + nl, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
