#version 400 core
/**
 * @file GlacierTessellation.tese
 * @brief Tessellation-evaluation stage companion to GlacierTessellation.frag -- see that file's header for
 * this scene's description.
 */
/// GlacierTessellation.tese — Tessellation Evaluation Stage
layout( quads, fractional_odd_spacing, ccw ) in;

in vec2 tcUV[];   ///< UV (from the tessellation control stage).
in vec4 tcSeed[]; ///< Seed (from the tessellation control stage).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioDrop;         ///< Drop envelope: high after a detected drop, decaying.
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

uniform float waveHP; ///< Wave height knob.
uniform float camHP;  ///< Camera height knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vWorld;    ///< World position (from the vertex stage).
out vec2  vUV;       ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vCrevasse; ///< Crevasse (from the vertex stage).

const vec2 Extent = vec2( 240.0, 320.0 ); ///< Size of the tessellated ground patch (x, z in world units).

/**  Height of the glacier: cliffs, wave ripples and crevasses.
 *
 * @param p         Position (x, z). (in)
 * @param t         Time. (in)
 * @param crevasse  Receives the crevasse strength. (out)
 *
 * @return
 *   The height.
 **/
float glacierHeight( vec2 p, float t, out float crevasse )
{
    float wh = ( waveHP > 0.0 ) ? waveHP : 1.0;

    // Mountainous ice cliffs & shelf
    float base_cliff = pow( abs( p.x ) / 100.0, 1.8 ) * 45.0;

    // Wave ripples across ice
    float wave1 = sin( p.y * 0.04 - t * 2.0 + p.x * 0.03 ) * 3.5;
    float wave2 = cos( p.y * 0.02 + t * 1.5 - p.x * 0.05 ) * 2.5;

    // Crevasses / fault lines
    float crack_pattern = sin( p.x * 0.15 + sin( p.y * 0.08 ) * 3.0 );
    crevasse = smoothstep( 0.85, 0.98, abs( crack_pattern ) );

    int   band = int( clamp( abs( p.x ) / 120.0 * 31.0, 0.0, 31.0 ) );
    float h = ( base_cliff + wave1 + wave2 ) * ( 1.0 + audioSpectrum[band] * 0.8 ) * wh;
    h -= crevasse * 6.0; // Deep drop into crevasse

    // Glacial surge on sub-bass
    h += audioSubBass * 4.0 * sin( p.y * 0.05 - t * 3.0 );
    h += audioKick * 3.0 * crevasse;

    return h;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 u0 = mix( tcUV[0], tcUV[1], gl_TessCoord.x );
    vec2 u1 = mix( tcUV[3], tcUV[2], gl_TessCoord.x );
    vec2 uv = mix( u0, u1, gl_TessCoord.y );

    float cam_z = time * 7.0 + audioAdvance * 14.0;
    float x = ( uv.x - 0.5 ) * Extent.x;
    float z_rel = uv.y * Extent.y + 2.0;
    float z_abs = z_rel + cam_z;

    float t = time * 0.3 + audioAdvance * 0.1;
    float crevasse_val;
    float h = glacierHeight( vec2( x, z_abs ), t, crevasse_val );

    vec3 world_p = vec3( x, h, z_rel );

    // Compute surface normal via finite difference
    const float eps = 0.5;
    float       dummy;
    float       h_x = glacierHeight( vec2( x + eps, z_abs ), t, dummy );
    float       h_z = glacierHeight( vec2( x, z_abs + eps ), t, dummy );
    vec3        n = normalize( vec3( ( h - h_x ) / eps, 1.0, ( h - h_z ) / eps ) );

    // Camera space
    float cam_h = ( camHP > 0.0 ) ? camHP : 9.0;
    float swing = sin( time * 0.12 ) * 5.0; // was 15: the sweep carried the camera into the valley walls
    // Ride a smoothed ice height at the camera's own position: a FIXED
    // altitude sat below the wave crests, so ridges regularly swept through
    // the lens. Only the audio-free base terms are sampled here -- a kick
    // must never bump the camera.
    float cam_base = pow( abs( swing ) / 100.0, 1.8 ) * 45.0
                     + sin( cam_z * 0.04 - t * 2.0 + swing * 0.03 ) * 3.5
                     + cos( cam_z * 0.02 + t * 1.5 - swing * 0.05 ) * 2.5;
    vec3  vp = vec3( x - swing, h - ( cam_base + cam_h ), z_rel );

    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vNormal = n;
    vWorld = world_p;
    vUV = uv;
    vCrevasse = crevasse_val;
}
