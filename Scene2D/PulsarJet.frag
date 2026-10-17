#version 330 core
/*****************************************************************************\
 *                              PulsarJet.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PULSAR JET: A highly energetic, rapidly spinning neutron star emitting blinding relativistic jets.
 *
 *  The accretion disk and jets pulsate violently to the music's beat, while the camera orbits the system.
 *
 *    audioAdvance -> camera orbit speed around the pulsar
 *    audioKick    -> intense energy pulses traveling along the jet
 *    audioSwell   -> brightness of the accretion disk and surrounding gas
 *    audioChromaHue-> base palette offset for the extreme energy radiation
 *
 *  Per-activation variety:
 *    energyP float overall energy output / brightness (0.7..1.5)
 *    spinP float base rotation speed of the pulsar (0.5..2.0)
 *    hueP float palette offset (0..6.28)
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

uniform float energyP; ///< Energy knob: overall energy output / brightness (0.7..1.5).
uniform float spinP;   ///< Spin knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Pseudo-random number 0..1 from a float.
 *
 * @param n  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float n )
{
    return fract( sin( n * 127.1 ) * 43758.5453 );
}
/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise( vec3 p )
{
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix( mix( hash11( n + 0.0 ), hash11( n + 1.0 ), f.x ),
             mix( hash11( n + 57.0 ), hash11( n + 58.0 ), f.x ), f.y ),
        mix( mix( hash11( n + 113.0 ), hash11( n + 114.0 ), f.x ),
             mix( hash11( n + 170.0 ), hash11( n + 171.0 ), f.x ), f.y ),
        f.z );
}

/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec3 p )
{
    float f = 0.0, a = 0.5;
    for ( int i = 0; i < 5; ++i )
    {
        f += a * noise( p );
        p *= 2.0;
        a *= 0.5;
    }
    return f;
}

/**  2D rotation matrix.
 *
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat2 rot( float a )
{
    float s = sin( a ), c = cos( a );
    return mat2( c, -s, s, c );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float ep = ( energyP > 0.01 ? energyP : 1.0 );
    float sp = ( spinP > 0.01 ? spinP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.1 + audioAdvance * 0.2;

    // Camera orbit
    vec3 ro = vec3( 3.0 * cos( t ), 1.0 * sin( t * 0.5 ), 3.0 * sin( t ) );
    vec3 ta = vec3( 0.0 );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    // Extreme camera shake on kicks
    float shake = 0.0; // kick camera jitter removed (V7d)
    vec2  shake_uv = uv + vec2( hash11( time * 100.0 ), hash11( time * 100.0 + 1.0 ) ) * shake - ( shake * 0.5 );

    vec3 rd = normalize( shake_uv.x * uu + shake_uv.y * vv + 1.5 * ww );

    // Raymarching volumetric energy field
    float d = 0.0;
    vec3  p;
    vec3  col = vec3( 0.0 );

    vec3 core_color = imgPalette( 0.8 + audioCentroid * 0.2 );
    vec3 jet_color = imgPalette( 0.1 + audioKick * 0.1 );

    // Tilt the system
    mat2 tilt = rot( 0.5 );

    // Fast rotation of the pulsar
    float fast_spin = time * 10.0 * sp + audioPhase * 5.0;

    for ( int i = 0; i < 60; ++i )
    {
        p = ro + rd * d;

        // System transform
        vec3 sp = p;
        sp.yz = tilt * sp.yz;
        sp.xz = rot( fast_spin ) * sp.xz;

        // Accretion disk
        float r = length( sp.xz );
        float disk = abs( sp.y ) - 0.05 * ( 1.0 + r ); // flares outward slightly
        float disk_dens = smoothstep( 2.0, 0.5, r ) * smoothstep( 0.1, 0.5, r );
        float disk_noise = fbm( vec3( sp.xz * 5.0, time * 2.0 ) );

        if ( disk < 0.1 && disk_dens > 0.0 )
        {
            float alpha = ( 0.1 - disk ) * 10.0 * disk_dens * disk_noise;
            col += core_color * alpha * ( 1.0 + audioSwell * 2.0 ) * ep * 0.05;
        }

        // Central star (core)
        float core_dist = length( sp );
        if ( core_dist < 0.2 )
        {
            float core_alpha = ( 0.2 - core_dist ) * 20.0;
            col += vec3( 1.0, 0.9, 0.8 ) * core_alpha * ep * 0.2;
        }

        // Jets
        float jet_radius = 0.05 + abs( sp.y ) * 0.1; // jets widen
        float jet = length( sp.xz ) - jet_radius;
        if ( jet < 0.0 && abs( sp.y ) > 0.15 )
        {
            // Pulses traveling up/down the jet
            float pulse = step( 0.8, fract( abs( sp.y ) * 2.0 - time * 20.0 - audioKick * 2.0 ) );
            float jet_noise = fbm( vec3( sp.xz * 10.0, sp.y - time * 30.0 ) );

            float alpha = ( 0.0 - jet ) * 20.0 * jet_noise;
            float fade = exp( -abs( sp.y ) * 0.5 );

            col += jet_color * alpha * fade * ( 1.0 + pulse * 5.0 * audioKick ) * ep * 0.1;
        }

        // Volumetric scattering/halo
        col += core_color * exp( -core_dist * 3.0 ) * ( 0.01 + audioSwell * 0.02 ) * ep;

        d += 0.05 + d * 0.02; // step size
        if ( d > 8.0 )
            break;
    }

    // Add intense starfield background
    vec3 bg_col = vec3( 0.0 );
    for ( int i = 0; i < 2; ++i )
    {
        float sc = 80.0 + 50.0 * float( i );
        vec3  st = rd * sc;
        vec3  cell = floor( st );
        vec3  f = fract( st ) - 0.5;
        if ( hash11( dot( cell, vec3( 12.3, 45.6, 78.9 ) ) ) > 0.98 )
        {
            bg_col += mix( jet_color, core_color, hash11( cell.x ) ) * exp( -length( f ) * length( f ) * 400.0 );
        }
    }
    col += bg_col * ( 0.2 + audioSwell * 0.5 );

    // Vignette / brightness boost
    col *= 1.5;

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
