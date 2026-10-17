#version 330 core
/*****************************************************************************\
 *                              WormholeMirrorWeave.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  A first-person flight through a wormhole made of 20 glowing ribbons -- unlike the existing RibbonTunnel (ribbons
 *  simply distributed evenly around a steady tube), these ribbons are placed with REAL mirror-kaleidoscope symmetry
 *  (index-picked wedge + alternating mirror, same construction as ParticleTunnelFlight.vert) and the tube's own
 *  radius pulses through periodic pinch points along its length -- a true wormhole throat silhouette, not a steady
 *  pipe.
 *
 *  Camera flies straight down the tube axis, riding the same weave the ribbons follow.
 *
 *    audioAdvance -> forward flight speed (integrated, jump-free)
 *    audioBass    -> throat pinch depth
 *    audioKick    -> brief radius shockwave near the camera
 *    audioPhase   -> ribbon twist / kaleidoscope spin
 *
 *  @author René Weller
 */

in vec4 attrA; ///< x = t [0,1] along the tube, y = side (-1/+1), w = ribbon index (0..19)
in vec4 attrB; ///< 4 random seeds in [0,1)

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform int       sidesP;        ///< kaleidoscope wedge count (0 -> 6; 4..8)
uniform float     speedP;        ///< flight speed multiplier (0 -> 1.0; 0.6..1.7)
uniform float     pinchP;        ///< throat pinch depth (0 -> 0.6; 0.4..0.8)
uniform int       throatsP;      ///< pinch points per tube loop (0 -> 3; 2..5)
uniform float     hueP;          ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

out vec3  vCol;  ///< Colour (from the vertex stage).
out float vSide; ///< Which side of a strip (from the vertex stage).

const float TubeLen = 40.0;    ///< Length of the tube (world units).
const float NumRibbons = 20.0; ///< Number of ribbons.

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

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
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
    float t = attrA.x;
    float side = attrA.y;
    float ri = attrA.w;
    vec4  seeds = attrB;

    float sides_v = ( sidesP < 4 ) ? 6.0 : float( sidesP );
    float speed_v = ( speedP <= 0.01 ) ? 1.0 : speedP;
    float pinch_v = ( pinchP <= 0.01 ) ? 0.6 : pinchP;
    float throats_v = ( throatsP < 2 ) ? 3.0 : float( throatsP );

    // Mirror-kaleidoscope ribbon placement: each ribbon belongs to one of
    // sides_v wedges (picked by index, not randomly), alternating wedges
    // mirrored -- real symmetry, not just even rotational spacing.
    float per_wedge = NumRibbons / sides_v;
    float wedge = 6.2831853 / sides_v;
    float copy = mod( floor( ri / per_wedge ), sides_v );
    float frac = mod( ri, per_wedge ) / per_wedge;
    float base_ang = frac * wedge * 0.5;
    float mirrored = ( mod( copy, 2.0 ) < 0.5 ) ? base_ang : ( wedge * 0.5 - base_ang );
    float ang0 = mirrored + copy * wedge;

    float cam_z = time * 5.5 * speed_v + audioAdvance * 14.0 * speed_v;
    float z = mod( t * TubeLen - cam_z, TubeLen );

    // Twist + kaleidoscope spin, integrated.
    float twist = z * 0.05 + audioPhase * 0.3 + time * 0.01;
    float ang = ang0 + twist;

    // Wormhole throat: radius pulses through periodic pinch points along
    // the tube (a real hourglass silhouette repeating down its length),
    // deepened by the bass and briefly shocked outward on a kick.
    float pinch_phase = z * ( 6.2831853 * throats_v / TubeLen );
    float throat = 1.0 - pinch_v * ( 1.0 + 0.35 * audioBass ) * pow( 0.5 + 0.5 * cos( pinch_phase ), 3.0 );
    // Floor kept well clear of zero: a pinch point that closes down near the
    // camera's own z would bring ribbons close enough to the lens to smear
    // additively across the whole peripheral field of view (a blown-out
    // white wash framing the tunnel instead of a clean throat silhouette).
    float rad = 2.4 * max( throat, 0.34 );

    vec2 c2 = vec2( cos( ang ), sin( ang ) ) * rad;
    vec2 tangent = vec2( -sin( ang ), cos( ang ) );
    c2 += tangent * side * ( 0.22 + 0.14 * seeds.y );

    vec3 vp = vec3( c2.x, c2.y, z );
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if ( z < 0.6 )
        gl_Position = vec4( 0.0, 0.0, -3.0, 1.0 ); // clip segments behind the camera

    vSide = side;
    vec3 col = imgPalette( 0.5 + 0.5 * sin( ang0 * sides_v * 0.5 + z * 0.08 ) ) * 1.5;
    col = mix( col, vec3( 1.0, 0.9, 0.6 ), clamp( audioKick * exp( -z * 0.4 ), 0.0, 1.0 ) );
    if ( hueP > 0.001 )
        col = hueRot( col, hueP );
    vCol = col;
}
