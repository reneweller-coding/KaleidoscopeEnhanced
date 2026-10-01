# -*- coding: utf-8 -*-
"""Gazes 5 and 6 for the 3D chains -- floating (the camera nearly stops, the
gaze turns slowly all round) and an orthographic side view (parallel rays, no
vanishing point at all: a cross-section through the world slides past) -- and
the camera host in the app: the flight position is integrated there (time +
music, times a speed per gaze), so a gaze can slow the flight without a jump;
the app also picks the next gaze (2-5 min hold, 40-60 s pan, time only)."""
import io, os
SG = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(SG, "..", "..")

def rw(p, pairs, crlf_keep=False):
    s = io.open(p, encoding="utf-8", newline="").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    if crlf:
        s = s.replace("\n", "\r\n")
    io.open(p, "w", encoding="utf-8", newline="").write(s)

# ---------------------------------------------------------------- shader lib
OLD_GAZE = s0 = """// The gaze: where the camera looks relative to its flight.  Straight ahead
// shows the vanishing point -- a dark opening the eye keeps flying into -- so
// that is only one of five: 0 ahead, 1 out of the right window (the world
// slides past with parallax, no vanishing point), 2 slanted down ahead, 3 out
// of the left window, 4 slanted up.  The knob picks the first; the scene pans
// on to the next every ~4 minutes (a ~1 minute pan) and the gaze drifts a
// little.  Time only, never the music: the camera does not follow the audio.
vec2 gazeAngles(float k)
{
    float i = mod(k, 5.0);
    if (i > 3.5) return vec2(-0.3, 0.75);
    if (i > 2.5) return vec2(-1.35, 0.08);
    if (i > 1.5) return vec2(0.35, -0.8);
    if (i > 0.5) return vec2(1.35, -0.08);
    return vec2(0.0);
}
vec3 gazeDir(vec2 p, float cam, float time)
{
    float g = floor(clamp(cam, 0.0, 0.999) * 5.0) + 0.004 * time;
    float k = floor(g), f = smoothstep(0.75, 1.0, fract(g));
    vec2 a = mix(gazeAngles(k), gazeAngles(k + 1.0), f);   // (yaw, pitch)
    a += vec2(0.12 * sin(0.031 * time), 0.08 * sin(0.023 * time + 1.0));
    gSide = smoothstep(0.6, 1.2, abs(a.x));
    vec3 d = normalize(vec3(p, 1.1));
    d.yz = rot2(a.y) * d.yz;
    d.xz = rot2(-a.x) * d.xz;
    return d;
}"""
NEW_GAZE = """// The gaze: where the camera looks relative to its flight.  Straight ahead
// shows the vanishing point -- a dark opening the eye keeps flying into -- so
// that is only one of seven:
//   0 ahead, 1 out of the right window (the world slides past with parallax),
//   2 slanted down ahead, 3 out of the left window, 4 slanted up,
//   5 floating (the flight nearly stops, the gaze turns slowly all round),
//   6 an orthographic side view (parallel rays, no vanishing point at all:
//     a cross-section through the world slides past, the depth behind it).
// In the app the camera host (camHost) picks the gazes and integrates the
// flight (camZ, slower in some gazes -- EffectShader::stepChainCam keeps the
// speed table); elsewhere (editor renders) the knob picks the first gaze and
// the scene pans on to the next every ~4 minutes.  Time only, never the music:
// the camera does not follow the audio.
uniform float camHost;   // 1: the app drives the camera (camZ, camGaze)
uniform float camZ;      // the flight position along the path
uniform vec3 camGaze;    // (gaze shown, gaze panned to, pan 0..1)
float gOrtho = 0.0;      // orthographic share of the gaze (6)
vec3 gAxis = vec3(0.0, 0.0, 1.0);   // the view axis (world): the ortho slab is cut across it
// (yaw, pitch, ortho, carve the tube only near the camera)
vec4 gazeAngles(float k, float time)
{
    float i = mod(k, 7.0);
    if (i > 5.5) return vec4(1.5708, 0.0, 1.0, 1.0);
    if (i > 4.5) return vec4(0.035 * time, 0.3 * sin(0.019 * time), 0.0, 1.0);
    if (i > 3.5) return vec4(-0.3, 0.75, 0.0, 0.0);
    if (i > 2.5) return vec4(-1.35, 0.08, 0.0, 1.0);
    if (i > 1.5) return vec4(0.35, -0.8, 0.0, 0.0);
    if (i > 0.5) return vec4(1.35, -0.08, 0.0, 1.0);
    return vec4(0.0);
}
vec3 gazeTurn(vec3 v, vec2 a) { v.yz = rot2(a.y) * v.yz; v.xz = rot2(-a.x) * v.xz; return v; }
// The camera's flight position (the app's integrated one, or gT).
float camFlight(float gt) { return camHost > 0.5 ? camZ : gt; }
// The ray of pixel p: its direction, and its origin moved off the camera for
// the orthographic share (rays start on a plane through the camera).
vec3 gazeDir(vec2 p, float cam, float time, mat3 cf, inout vec3 ro)
{
    float k0, k1, f;
    if (camHost > 0.5) {
        k0 = camGaze.x; k1 = camGaze.y; f = smoothstep(0.0, 1.0, camGaze.z);
    } else {
        float g = floor(clamp(cam, 0.0, 0.999) * 7.0) + 0.004 * time;
        k0 = floor(g); k1 = k0 + 1.0; f = smoothstep(0.75, 1.0, fract(g));
    }
    vec4 a0 = gazeAngles(k0, time), a1 = gazeAngles(k1, time);
    a1.x += 6.2831853 * floor((a0.x - a1.x) / 6.2831853 + 0.5);   // pan the shorter way round
    vec4 a = mix(a0, a1, f);
    a.xy += (1.0 - a.z) * vec2(0.12 * sin(0.031 * time), 0.08 * sin(0.023 * time + 1.0));
    gSide = a.w;
    gOrtho = a.z;
    vec3 ax = gazeTurn(vec3(0.0, 0.0, 1.0), a.xy);
    gAxis = cf * ax;
    ro += cf * gazeTurn(vec3(p, 0.0), a.xy) * (2.2 * gOrtho);
    return cf * normalize(mix(gazeTurn(normalize(vec3(p, 1.1)), a.xy), ax, gOrtho));
}"""

OLD_FD = """    if (gSide > 0.0) tube = mix(tube, -1.0, gSide * smoothstep(3.0, 6.0, abs(p.z - gCam.z)));
    return max(smaxK(d, 0.8 * tube, 0.15), 0.3 - length(p - gCam));"""
NEW_FD = """    if (gSide > 0.0) tube = mix(tube, -1.0, gSide * smoothstep(3.0, 6.0, abs(p.z - gCam.z)));
    // The orthographic gaze starts its rays on a plane through the camera: a
    // slab across the view axis is carved free, its far face is the
    // cross-section the view shows.
    if (gOrtho > 0.0) tube = max(tube, mix(-1.0, 0.35 - abs(dot(p - gCam, gAxis)), gOrtho));
    return max(smaxK(d, 0.8 * tube, 0.15), 0.3 - length(p - gCam));"""

rw(os.path.join(SG, "gen.py"), [(OLD_GAZE, NEW_GAZE), (OLD_FD, NEW_FD)])

rw(os.path.join(SG, "make_chains3d.py"), [
    ("    mat3 cf = camFrame(gT, ro);\n", "    mat3 cf = camFrame(camFlight(gT), ro);\n"),
    ("    vec3 rd = cf * gazeDir(p, camP, sceneTime);\n", "    vec3 rd = gazeDir(p, camP, sceneTime, cf, ro);\n"),
    (" * following the 2D chain), camP (the gaze: ahead, out of a side window, slanted down or up -- it pans on\n"
     " * every few minutes), hueP.\n",
     " * following the 2D chain), camP (the first gaze: ahead, out of a side window, slanted down or up,\n"
     " * floating, an orthographic side view -- the scene pans on every few minutes), hueP.\n"),
])
rw(os.path.join(SG, "make_chainlab3d.py"), [
    (" * colour field), camP (the gaze: ahead, out of a side window, slanted down or up --\n * it pans on every few minutes), hueP.\n",
     " * colour field), camP (the first gaze: ahead, out of a side window, slanted down or up,\n"
     " * floating, an orthographic side view -- the scene pans on every few minutes), hueP.\n"),
])

# ---------------------------------------------------------------- app
H_OLD = """	int		m_chainParsed = -1;         ///< chainInfo(): -1 = source not read yet, 0 = no chain classes, 1 = parsed.
"""
H_NEW = """	/**
	 * @brief Camera host of the 3D chains (uniform camHost): the flight
	 * position and the gaze.
	 *
	 * The flight is integrated here -- time plus the music's advance, times a
	 * speed per gaze -- so a gaze can slow the flight (floating) without the
	 * camera jumping, which a closed-form position in the shader cannot.  The
	 * gaze holds 2-5 minutes, then pans 40-60 s to another one; wall-clock
	 * time only, the camera never follows the audio.
	 */
	struct ChainCam
	{
		bool  pending = true;           ///< Reset due (activation).
		float z = 0.f;                  ///< Flight position along the path.
		int   g0 = 0, g1 = 0;           ///< Gaze shown, gaze panned to (see gazeAngles in the shader).
		float f = 0.f;                  ///< Pan progress 0..1 (0 = holding g0).
		float panDur = 50.f;            ///< Pan length, seconds.
		float hold = 0.f, holdDur = 200.f;   ///< Seconds on g0, and how long it stays.
		float lastAdv = 0.f;            ///< audioAdvance of the previous frame.
		bool  hasLast = false;          ///< last/lastAdv valid.
		std::chrono::steady_clock::time_point last;   ///< Wall clock of the previous step.
		std::minstd_rand rng;           ///< Own random stream.
	} m_cam;
	GLuint	m_camProg = 0;              ///< Program the camera locations belong to.
	GLint	m_camHostLoc = -1, m_camZLoc = -1, m_camGazeLoc = -1;   ///< camHost / camZ / camGaze (-1: no camera host).
	/// @brief Advances the 3D chains' camera (flight and gaze) and uploads it (program must be bound).
	void stepChainCam( const AudioFeatures &f );
	int		m_chainParsed = -1;         ///< chainInfo(): -1 = source not read yet, 0 = no chain classes, 1 = parsed.
"""
C_CALL_OLD = """    stepChainWalk( f );
"""
C_CALL_NEW = """    stepChainWalk( f );
    stepChainCam( f );
"""
C_RESET_OLD = """	m_walk.pending = true;

	// Unter KALEIDO_SEED"""
C_RESET_NEW = """	m_walk.pending = true;
	m_cam.pending  = true;

	// Unter KALEIDO_SEED"""
C_FN_OLD = """std::string EffectShader::chainInfo()
{"""
C_FN_NEW = """// ---- Camera host of the 3D chains --------------------------------------------
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
{"""

rw(os.path.join(ROOT, "Source", "EffectShader.h"), [(H_OLD, H_NEW)])
rw(os.path.join(ROOT, "Source", "EffectShader.cpp"), [(C_CALL_OLD, C_CALL_NEW), (C_RESET_OLD, C_RESET_NEW), (C_FN_OLD, C_FN_NEW)])
print("ok")
