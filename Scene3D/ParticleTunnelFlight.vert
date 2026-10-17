#version 330 core
/*****************************************************************************\
 *                              ParticleTunnelFlight.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  60,000 points arranged as rings around a long recycling tunnel, folded into a real mirror-kaleidoscope
 *  cross-section (sidesP wedges, alternating copies mirrored) instead of a plain circular tube -- genuine 3D
 *  depth/parallax through a kaleidoscopic tunnel, unlike the fragment-shader 2D folds and raymarched tunnels
 *  already in the catalogue.
 *
 *  The camera flies straight down +Z at an audio-integrated speed; each point's fixed identity Z position is
 *  wrapped modulo the tunnel length relative to the camera, so points recycle seamlessly into an infinite flight
 *  instead of ever running out.
 *
 *    audioAdvance -> forward flight speed (integrated, jump-free)
 *    audioPhase   -> cross-section spin
 *    audioKick    -> radial shockwave pulse + brief brightness flash
 *    audioSwell   -> tunnel radius breathes
 *    audioSubBass -> lateral camera sway strength
 *
 *  @author René Weller
 */

in vec4 attrA; ///< .w = point index
in vec4 attrB; ///< 4 random seeds in [0,1)

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioKick;    ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioSubBass; ///< Sub-bass band level, 0..1.
uniform float audioHigh;    ///< High band level, 0..1.

uniform int       sidesP;         ///< kaleidoscope wedge count (0 -> 6; 4..10)
uniform float     speedP;         ///< flight speed multiplier (0 -> 1.0; 0.6..1.8)
uniform float     radiusP;        ///< tunnel radius (0 -> 3.2; 2.4..4.2)
uniform float     hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4  vCol;  ///< Colour (from the vertex stage).
out float vLife; ///< Life (from the vertex stage).

const float N = 60000.0;      ///< Number of particles.
const float TunnelLen = 40.0; ///< Length of the tunnel (world units).
const float NumRings = 48.0;  ///< Number of rings.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/**  IMG-PALETTE (house standard): see Tools/SHADER_AUTHORING.md V8b.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float idx = attrA.w;
    vec4  seeds = attrB;

    float sides_v = ( sidesP < 4 ) ? 6.0 : float( sidesP );
    float speed_v = ( speedP <= 0.01 ) ? 1.0 : speedP;
    float radius_v = ( radiusP <= 0.01 ) ? 3.2 : radiusP;

    // Ring-clustered longitudinal placement: a discrete ring index (a classic
    // "rings rushing past" cadence) plus a small per-point jitter within it,
    // rather than a uniform random smear along the tunnel's length.
    float ring_idx = floor( seeds.z * NumRings );
    float ring_z = ( ring_idx + 0.5 ) / NumRings * TunnelLen;
    float base_z = ring_z + ( seeds.w - 0.5 ) * ( TunnelLen / NumRings ) * 0.7;

    // Mirror-kaleidoscope cross-section: each point belongs to one of sides_v
    // wedges (picked by point index, not randomly, so the wedge population is
    // even); its angle within the wedge comes from seeds.x, and alternating
    // wedges are mirrored -- real 3D mirror symmetry, not a fragment fold.
    float wedge = 6.2831853 / sides_v;
    float copy = mod( floor( idx / ( N / sides_v ) ), sides_v );
    float base_ang = seeds.x * wedge * 0.5;
    float mirrored = ( mod( copy, 2.0 ) < 0.5 ) ? base_ang : ( wedge * 0.5 - base_ang );
    float ang = mirrored + copy * wedge;

    // Flower-petal radius ripple (angular, mirrors the fold) + longitudinal
    // ring pulse travelling down the tunnel, both audio-breathing.
    float petals = sin( ang * sides_v ) * 0.5 + 0.5;
    float ring_pulse = sin( base_z * 0.8 - audioAdvance * 1.4 ) * 0.5 + 0.5;
    float rad = radius_v * ( 1.0 + 0.55 * audioSwell )
                    * ( 0.72 + 0.18 * petals + 0.10 * ring_pulse )
                + seeds.y * 0.35;

    // Kick shockwave: a brief radial pulse that expands outward from the
    // camera's current position, strongest near it and fading with distance.
    float cam_zflight = time * 1.6 * speed_v + audioAdvance * 2.2 * speed_v;
    float rel_z = mod( base_z - cam_zflight, TunnelLen );
    float shock = audioKick * exp( -rel_z * 0.35 );
    rad += shock * 0.6;

    // Cross-section spin: integrated audio phase, jump-free.
    float spin = audioPhase * 0.5 + time * 0.03;
    float ca = cos( spin ), sa = sin( spin );
    vec2  xy = vec2( cos( ang ) * rad, sin( ang ) * rad );
    xy = mat2( ca, -sa, sa, ca ) * xy;

    // Camera sways gently side to side (integrated), so the flight feels
    // alive instead of a dead-straight rail.
    vec2 sway = vec2( sin( audioAdvance * 0.35 ), cos( audioAdvance * 0.27 ) ) * ( 0.4 + 0.3 * audioSwell );

    // Camera stays at view-space origin looking down +Z; rel_z (already in
    // [0, TunnelLen)) is the point's distance ahead of the camera. A base
    // offset keeps the nearest ring safely beyond the near plane.
    vec3 vp = vec3( xy - sway, rel_z + 1.4 );
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point sprite size by depth and shock -- capped low (V8c): 60,000
    // additive sprites integrate area, not just gain.
    float p_size = ( 2.5 + shock * 5.0 + audioHigh * 1.5 ) * ( 26.0 / max( vp.z, 1.0 ) ); // sprite sweep
    gl_PointSize = clamp( p_size, 1.0, 30.0 );

    vec3 base_col = imgPalette( 0.5 + 0.5 * sin( ang * sides_v * 0.5 + rel_z * 0.1 ) ) * 2.0;
    base_col = mix( base_col, vec3( 1.0, 0.92, 0.55 ), clamp( shock * 1.5, 0.0, 1.0 ) );
    if ( hueP > 0.001 )
        base_col = hueRot( base_col, hueP );

    vCol = vec4( base_col, 1.0 );
    vLife = shock;
}
