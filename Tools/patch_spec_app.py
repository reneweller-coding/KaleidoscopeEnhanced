# -*- coding: utf-8 -*-
"""App side of the chain labs' specialised variants (see
Tools/scenegen/patch_spec*.py for the shader side).

shader_setup: shaderVariantStart / shaderVariantTake / shaderVariantFailed --
a background build of a fragment file with "#define"s after its #version line.

EffectShader:
* parseChainSource reads "// @chainord <knob> b0|b1|..." (position -> branch).
* stepChainWalk keeps the wanted variant (the classes shown and faded to of
  stages A..D and the 3D lab's space / core / body), starts its build, and
  hands it to enableShader, which binds it at the START of the next frame
  (before setUniforms, so every uniform of that frame goes to it).
* While a variant is bound a fade waits at 0 % until the variant with its
  target exists, and at 100 % until the variant after it exists -- in both
  states the picture is exactly what it should be, so nothing jumps.
* A variant that takes longer than 4 s or fails: back to the generic program
  for the rest of the activation.
* Only plain EffectShader objects (derived classes cache more uniform
  locations than bindProgram re-resolves), only with background compile, and
  not in the shader's own one-stage walk (morphP 0.15..0.5)."""
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

# ---------------------------------------------------------------- shader_setup
rw("Source/shader_setup.h", [(
"""bool shaderPrebuildReady( const char *frag_source );   ///< True if setShaders() for this file would be a cache hit.
""",
"""bool shaderPrebuildReady( const char *frag_source );   ///< True if setShaders() for this file would be a cache hit.
// Specialised variants (chain labs): the fragment file with `defines` inserted
// after its #version line, built in the background like shaderPrebuildStart().
/// @brief Starts the variant's background build (no-op if built or building). False without background compile.
bool   shaderVariantStart( const char *frag_source, const std::string &defines );
/// @brief The variant's program once built, with a reference taken (release with shaderProgramRelease()); 0 while building.
GLuint shaderVariantTake( const char *frag_source, const std::string &defines );
/// @brief True if the variant's build failed (its log is printed once).
bool   shaderVariantFailed( const char *frag_source, const std::string &defines );
""")])

rw("Source/shader_setup.cpp", [
("""int shaderPrebuildPoll()
{
	for( auto it = s_prebuild.begin(); it != s_prebuild.end(); )
	{
		GLint done = 0;
		glGetProgramiv( it->second.prog, GL_COMPLETION_STATUS_KHR, &done );
		if( !done ) { ++it; continue; }
		GLint linked = 0;
		glGetProgramiv( it->second.prog, GL_LINK_STATUS, &linked );
		glDeleteShader( it->second.fs );     // flagged; freed with the program
		if( linked )
			progStore( it->second.key, it->second.prog );
		else
			glDeleteProgram( it->second.prog );   // the blocking path will build it again and log why
		it = s_prebuild.erase( it );
	}
	return (int) s_prebuild.size();
}""",
"""static std::map<std::string, int> s_variantFailed;   ///< variant keys whose build failed (no retry)

int shaderPrebuildPoll()
{
	for( auto it = s_prebuild.begin(); it != s_prebuild.end(); )
	{
		GLint done = 0;
		glGetProgramiv( it->second.prog, GL_COMPLETION_STATUS_KHR, &done );
		if( !done ) { ++it; continue; }
		GLint linked = 0;
		glGetProgramiv( it->second.prog, GL_LINK_STATUS, &linked );
		if( !linked && it->second.key.compare( 0, 4, "FSV|" ) == 0 )
		{
			// a variant has no blocking twin that would log it later: log it now
			fprintf( stderr, "SHADER: variant build failed: %.120s\\n", it->second.key.c_str() );
			printShaderInfoLog( it->second.fs );
			printProgramInfoLog( it->second.prog );
			s_variantFailed[it->second.key] = 1;
		}
		glDeleteShader( it->second.fs );     // flagged; freed with the program
		if( linked )
			progStore( it->second.key, it->second.prog );
		else
			glDeleteProgram( it->second.prog );   // the blocking path will build it again and log why
		it = s_prebuild.erase( it );
	}
	return (int) s_prebuild.size();
}

bool shaderVariantStart( const char *frag_source, const std::string &defines )
{
	if( !parallelCompile() ) return false;
	const std::string key = progKey( "FSV", frag_source, defines.c_str(), 0, 0, 0 );
	if( s_progByKey.count( key ) || s_prebuild.count( key ) || s_variantFailed.count( key ) ) return true;
	GLchar *src = textFileRead( frag_source );
	if( !src ) return false;
	std::string text( src );
	free( src );
	const size_t nl = text.find( '\\n' );                  // after "#version ..."
	text.insert( nl == std::string::npos ? text.size() : nl + 1, defines );
	PrebuildJob j;
	j.key  = key;
	j.prog = glCreateProgram();
	glAttachShader( j.prog, fullscreenVertShader() );
	j.fs = glCreateShader( GL_FRAGMENT_SHADER );
	const GLchar *p = text.c_str();
	glShaderSource( j.fs, 1, &p, NULL );
	glCompileShader( j.fs );                 // no status query: that would block
	glAttachShader( j.prog, j.fs );
	glLinkProgram( j.prog );
	s_prebuild[key] = j;
	return true;
}

GLuint shaderVariantTake( const char *frag_source, const std::string &defines )
{
	shaderPrebuildPoll();
	const std::string key = progKey( "FSV", frag_source, defines.c_str(), 0, 0, 0 );
	auto it = s_progByKey.find( key );
	if( it == s_progByKey.end() ) return 0;
	++s_progRefs[it->second];
	return it->second;
}

bool shaderVariantFailed( const char *frag_source, const std::string &defines )
{
	return s_variantFailed.count( progKey( "FSV", frag_source, defines.c_str(), 0, 0, 0 ) ) != 0;
}"""),
])

# ---------------------------------------------------------------- EffectShader.h
rw("Source/EffectShader.h", [(
"""	int		m_chainParsed = -1;         ///< chainInfo(): -1 = source not read yet, 0 = no chain classes, 1 = parsed.
""",
"""	// ---- Specialised variants of the chain labs ----
	// One lab shader holds every class; the GPU reserves registers for the
	// heaviest branch on every pixel.  A variant with the classes on screen
	// built in runs 2.5-6x faster (3D lab: 5.1 -> 1.3 ms for the same world).
	std::map<std::string, std::vector<int>> m_chainOrd;   ///< Stage knob -> branch per position, from "// @chainord".
	GLuint	m_genericProg = 0;          ///< The generic program while a variant is bound (0: none bound).
	std::string m_specBound;            ///< Defines of the bound variant ("" = generic).
	std::string m_specNextKey;          ///< Variant to bind at the start of the next frame (enableShader).
	GLuint	m_specNext = 0;             ///< Its program.
	std::map<std::string, GLuint> m_specProgs;   ///< Built variants this effect holds a reference to.
	std::vector<std::string> m_specLru;          ///< Their keys, least recently wanted first.
	float	m_specWait = 0.f;           ///< Seconds a fade has been held for a variant (timeout 4 s).
	bool	m_specOff = false;          ///< Variants given up for this activation (timeout / failure).
	float	m_walkMorph = 0.f;          ///< morphP of this activation (the shader walks on its own at 0.15..0.5).
	bool	m_walkProgSwap = false;     ///< The last program change was a variant switch: the walk keeps its state.
	bool	m_specRevert = false;       ///< Back to the generic program at the start of the next frame.
	/// @brief The defines of the variant for a walk state (stage classes shown and faded to); "" if not specialisable.
	std::string specDefines( const float *x0, const float *x1, const bool *fading ) const;
	/// @brief Makes `prog` this effect's program and re-resolves the base uniform locations (program must be usable).
	void bindProgram( GLuint prog );
	/// @brief Drops every variant (back to the generic program); with release, also frees them.
	void dropVariants( bool release );
	int		m_chainParsed = -1;         ///< chainInfo(): -1 = source not read yet, 0 = no chain classes, 1 = parsed.
""")])

# ---------------------------------------------------------------- EffectShader.cpp
CPP = []
CPP.append(("""void EffectShader::cleanShaderPrograms()
{""",
"""void EffectShader::cleanShaderPrograms()
{
	dropVariants( true );       // back to the generic program, variants released"""))
CPP.append(("""void EffectShader::enableShader( )
{
	ensureCompiled();          // lazy: compile on first use (see prepare())
	glUseProgram( m_sh_prog_id );
}""",
"""void EffectShader::enableShader( )
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
}"""))
# activation: variants allowed again; morph remembered
CPP.append(("""		m_walkHostLoc = glGetUniformLocation( m_sh_prog_id, "walkHost" );
		m_walk.pending = true;
	}""",
"""		m_walkHostLoc = glGetUniformLocation( m_sh_prog_id, "walkHost" );
		if( !m_walkProgSwap )                       // a variant switch is not a new activation
			m_walk.pending = true;
		m_walkProgSwap = false;
	}"""))
CPP.append(("""	float morph = -1.f;
	for( const Uniform *u : m_uniforms )
		if( u->getName() == "morphP" ) morph = u->snapshotValue();
	m_walk.active = ( m_walkHostLoc >= 0 && morph >= 0.5f );""",
"""	float morph = -1.f;
	for( const Uniform *u : m_uniforms )
		if( u->getName() == "morphP" ) morph = u->snapshotValue();
	m_walk.active = ( m_walkHostLoc >= 0 && morph >= 0.5f );
	m_walkMorph = morph;
	m_specOff = false;
	m_specWait = 0.f;"""))
# parse @chainord
CPP.append(("""				// "// @chainopening chainAP 9|10|13": the classes streaming into an opening (flat labs only)""",
"""				// "// @chainord chainAP 11|5|20|...": position -> branch (for the specialised variants)
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
				// "// @chainopening chainAP 9|10|13": the classes streaming into an opening (flat labs only)"""))
# the variant logic around the fade advance
CPP.append(("""	// Advance the fades and upload: (shown, target, progress) per stage.
	for( int s = 0; s < kWalkN; ++s )
	{
		if( m_walk.fading[s] )
		{
			m_walk.f[s] += dt * m_walk.rate / m_walk.fadeDur[s];     // music time: never backwards, never a jump
			if( m_walk.f[s] >= 1.f )
			{""",
"""	// Specialised variant (specDefines): while one is bound, a fade waits at
	// 0 % until the variant with its target is bound, and at 100 % until the
	// one after it is.  The wanted variant is requested after the fades moved
	// on (below the loop) and bound at the start of the next frame.
	const bool specOn = !m_specOff && !m_chainOrd.empty() && typeid( *this ) == typeid( EffectShader )
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
			{"""))
CPP.append(("""		if( m_walkLoc[s] >= 0 )
			glUniform3f( m_walkLoc[s], m_walk.x0[s], m_walk.fading[s] ? m_walk.x1[s] : m_walk.x0[s],
			             m_walk.fading[s] ? m_walk.f[s] : 0.f );
	}
}""",
"""	upload:
		if( m_walkLoc[s] >= 0 )
			glUniform3f( m_walkLoc[s], m_walk.x0[s], m_walk.fading[s] ? m_walk.x1[s] : m_walk.x0[s],
			             m_walk.fading[s] ? m_walk.f[s] : 0.f );
	}
	// The variant for the state the fades left: start its build, bind it at
	// the start of the next frame (unless a 100 % hold already asked for one).
	if( specOn )
	{
		const std::string now = specDefines( m_walk.x0, m_walk.x1, m_walk.fading );
		if( !now.empty() && now != m_specBound && m_specNextKey.empty() )
		{
			auto it = m_specProgs.find( now );
			GLuint prog = it != m_specProgs.end() ? it->second : 0;
			if( !prog && shaderVariantStart( m_fragmentShaderFilename, now ) )
			{
				prog = shaderVariantTake( m_fragmentShaderFilename, now );
				if( prog ) m_specProgs[now] = prog;
				else if( shaderVariantFailed( m_fragmentShaderFilename, now ) ) { m_specOff = true; m_specRevert = true; }
			}
			if( prog ) { m_specNext = prog; m_specNextKey = now; }
		}
		if( !now.empty() )
		{
			m_specLru.erase( std::remove( m_specLru.begin(), m_specLru.end(), now ), m_specLru.end() );
			m_specLru.push_back( now );
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
		fprintf( stderr, "%s: specialised variant too slow, generic program\\n", fragmentName() );
		m_specOff = true;
		m_specRevert = true;
		m_specWait = 0.f;
	}
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
		snprintf( buf, sizeof buf, "#define SPEC_%s0 %d\\n#define SPEC_%s1 %d\\n", kSpecName[i], o->second[p0], kSpecName[i], o->second[p1] );
		out += buf;
	}
	return out;
}"""))
rw("Source/EffectShader.cpp", CPP)

# includes
p = os.path.join(ROOT, "Source", "EffectShader.cpp")
s = io.open(p, encoding="utf-8", newline="").read()
if "#include <typeinfo>" not in s:
    s = s.replace("#include <chrono>", "#include <chrono>\n#include <typeinfo>\n#include <algorithm>", 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
