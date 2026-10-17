#version 330 core
/*****************************************************************************\
 *                              QuaternionFractalHopfLoom.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  QUATERNION FRACTAL HOPF LOOM: 4D hypercomplex quaternion Julia fractal sliced dynamically and projected via
 *  continuous Hopf fibration into interlocking self-similar 3D/2D nested torus weaves and iridescent optical
 *  filaments.
 *
 *    audioAdvance -> navigates hypercomplex 4D slice coordinates (w-axis orbit)
 *    audioPhase   -> twists Hopf fibration projection angles
 *    audioKick    -> flashes fractal boundary orbit-trap contact points
 *    audioSwell   -> deepens fractal iteration glow & luminous field density
 *    audioCentroid-> shifts orbit-trap distance palette spectra
 *
 *  Per-activation variety:
 *    iterP    float fractal iteration depth & detail        (6.0..14.0)
 *    sliceP   float 4D quaternion hyper-rotation speed      (0.3..1.5)
 *    trapP    float orbit trap geometry scale & sharpness   (0.5..2.2)
 *    hopfP    float Hopf fibration fiber winding density    (1.0..3.5)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float iterP;  ///< Iter knob: fractal iteration depth & detail, 6..14.
uniform float sliceP; ///< Slice knob: 4D quaternion hyper-rotation speed, 0.3..1.5.
uniform float trapP;  ///< Trap knob: orbit trap geometry scale & sharpness, 0.5..2.2.
uniform float hopfP;  ///< Hopf knob: Hopf fibration fiber winding density, 1..3.5.

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
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
}

/**  Quaternion multiplication: q1 * q2
 *
 * @param a  One quaternion. (in)
 * @param b  The other. (in)
 *
 * @return
 *   The product a b.
 **/
vec4 qMul( vec4 a, vec4 b )
{
    return vec4(
        a.x * b.x - a.y * b.y - a.z * b.z - a.w * b.w,
        a.x * b.y + a.y * b.x + a.z * b.w - a.w * b.z,
        a.x * b.z - a.y * b.w + a.z * b.x + a.w * b.y,
        a.x * b.w + a.y * b.z - a.z * b.y + a.w * b.x );
}

/**  Quaternion square: q^2
 *
 * @param q  The quaternion. (in)
 *
 * @return
 *   q^2.
 **/
vec4 qSquare( vec4 q )
{
    return vec4(
        q.x * q.x - dot( q.yzw, q.yzw ),
        2.0 * q.x * q.yzw );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.3 + audioAdvance * 0.35;

    // Hopf fibration coordinates
    // A whole-number Hopf winding, otherwise r*sin(theta) jumps at the atan cut
    // (the reported edge on the left).
    float hopf_winding = max( 1.0, floor( ( hopfP > 0.01 ? hopfP : 2.0 ) + 0.5 ) );
    float r = length( uv );
    float theta = atan( uv.y, uv.x ) * hopf_winding + audioPhase;

    // Hyper-slice rotation in 4D: C parameter
    float slice_speed = ( sliceP > 0.01 ? sliceP : 0.8 );
    vec4  C = vec4(
        -0.2 + 0.15 * cos( t * slice_speed ),
        0.55 + 0.1 * sin( t * slice_speed * 0.7 ),
        0.25 * sin( t * 0.5 + audioPhase ),
        -0.15 * cos( t * 0.4 ) );

    // Initial quaternion state Z0
    vec4 z = vec4(
        uv.x * 1.5,
        uv.y * 1.5,
        r * sin( theta ) * 0.5,
        r * cos( theta ) * 0.5 );

    float trap_scale = ( trapP > 0.01 ? trapP : 1.2 );
    float trap_dist = 1e5;
    float trap_cross = 1e5;

    float max_it = ( iterP > 1.0 ? iterP : 9.0 );
    float it_count = 0.0;

    for ( float i = 0.0; i < 14.0; i += 1.0 )
    {
        if ( i >= max_it )
            break;
        if ( dot( z, z ) > 8.0 )
            break;

        z = qSquare( z ) + C;

        // Orbit traps: spherical and cross-plane
        float d_sphere = abs( length( z ) - trap_scale );
        float d_cross = min( abs( z.x * z.y ), abs( z.z * z.w ) );

        trap_dist = min( trap_dist, d_sphere );
        trap_cross = min( trap_cross, d_cross );
        it_count = i;
    }

    // Smooth iteration metric & potential
    float smooth_it = it_count - log( max( 1.0, log( dot( z, z ) ) * 0.5 ) ) / log( 2.0 );

    // Optical trap glow synthesis.  The cross trap min(|x*y|,|z*w|) is
    // near zero for almost EVERY orbit (any single component crossing
    // zero suffices), so its falloff must be sharp and its gain modest --
    // the original 12.0/2.2 pairing lit the entire frame to white.
    float glow_sphere = exp( -trap_dist * 7.0 ) * ( 0.8 + 0.5 * audioMid );
    float glow_cross = exp( -trap_cross * 60.0 ) * ( 1.0 + 2.5 * audioKick );

    // Palette assignment
    vec3 col_sphere = imgPalette( fract( trap_dist * 0.35 + smooth_it * 0.1 + audioCentroid ) );
    vec3 col_cross = imgPalette( fract( trap_cross * 0.8 + t * 0.05 + 0.5 ) );
    vec3 col_field = imgPalette( fract( smooth_it * 0.15 + t * 0.04 ) );

    // Sample background photo
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg * 0.5;
    col += col_field * ( smoothstep( 0.0, max_it, smooth_it ) * 0.9 + 0.15 ) * ( 0.85 + 0.4 * audioSwell );
    col += col_sphere * glow_sphere * 1.2;
    col += col_cross * glow_cross * 1.2;
    col += imgPalette( audioAdvance * 0.1 ) * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
