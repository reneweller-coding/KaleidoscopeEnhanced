#version 330 core
/*****************************************************************************\
 *                              FireWhirlTornado.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FIRE WHIRL TORNADO: Volumetric 3D rotating fire tornado with helical flame column, turbulent soot/ash advection,
 *  rising ember sparks, and blackbody thermal radiation gradient with audio-reactive explosive bursts.
 *
 *    audioAdvance -> accelerates tornado vortex swirl & thermal updraft
 *    audioKick    -> triggers explosive fireball detonations in the core
 *    audioBass    -> widens tornado base and convective vortex reach
 *    audioCentroid-> shifts flame temperature (deep orange to white-hot)
 *
 *  Per-activation variety:
 *    tornadoP float fire vortex radius & height         (0.5..2.2)
 *    heatP    float blackbody core thermal radiance    (0.5..2.0)
 *    speedP   float vortex angular rotation speed      (0.5..2.0)
 *    hueP     float thermal chromatic palette offset   (0..6.28)
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float tornadoP; ///< Tornado knob: fire vortex radius & height, 0.5..2.2.
uniform float heatP;    ///< Heat knob: blackbody core thermal radiance, 0.5..2.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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


/**  IMG-PALETTE (house standard): colours come from a rotating arc in the CURRENT slideshow image, so every
 * activation inherits a fresh palette from the photos; the arc follows the musical key (audioChromaHue is circular-
 * slewed = jump-free) with a slow advance drift, valence shapes saturation.
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


/**  House tint: bend a colour toward the photo palette while keeping its luminance -- the identity look survives,
 * only the hue follows the photos.
 *
 * @param c  The colour. (in)
 * @param t  Position on the palette, 0..1. (in)
 * @param k  Strength of the tint, 0..1. (in)
 *
 * @return
 *   The tinted colour.
 **/
vec3 palTint( vec3 c, float t, float k )
{
    vec3 tp = imgPalette( t );
    tp *= dot( c, vec3( 0.3333 ) ) / max( dot( tp, vec3( 0.3333 ) ), 1e-3 );
    return mix( c, tp, k );
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

/**  3D Noise for volumetric fire
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash31( vec3 p )
{
    p = fract( p * 0.3183099 + 0.1 );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}

/**  Smooth 3D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value.
 **/
float noise3D( vec3 p )
{
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
        mix( mix( hash31( i + vec3( 0, 0, 0 ) ), hash31( i + vec3( 1, 0, 0 ) ), f.x ),
             mix( hash31( i + vec3( 0, 1, 0 ) ), hash31( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
        mix( mix( hash31( i + vec3( 0, 0, 1 ) ), hash31( i + vec3( 1, 0, 1 ) ), f.x ),
             mix( hash31( i + vec3( 0, 1, 1 ) ), hash31( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
        f.z );
}

/**  Fractal noise of four octaves for the flames.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, about 0..1.
 **/
float fireFBM( vec3 p )
{
    float v = 0.0;
    float a = 0.5;
    vec3  shift = vec3( 100.0 );
    for ( int i = 0; i < 4; ++i )
    {
        v += a * noise3D( p );
        p = p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float trn = ( tornadoP > 0.0 ) ? tornadoP : 1.0;
    float ht = ( heatP > 0.0 ) ? heatP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.45 * spd + audioAdvance * 0.25;

    // Raymarching camera
    vec3 ro = vec3( 0.0, -0.2, -2.5 );
    vec3 rd = normalize( vec3( uv, 1.2 ) );

    // Volumetric flame raymarch
    vec3  p = ro;
    float accum_flame = 0.0;
    float accum_smoke = 0.0;
    float step_size = 0.08;

    for ( int i = 0; i < 35; ++i )
    {
        p += rd * step_size;
        float y = p.y;
        float r = length( p.xz );

        // Tornado funnel profile: r(y) narrows near base, flares at top
        float funnel_r = ( 0.25 + 0.35 * pow( max( y + 1.0, 0.0 ), 1.2 ) ) * trn + 0.1 * audioBass;

        // Upward vortex motion: the noise is sampled in a frame that twists with the height and turns with time --
        // the same swirl as theta * 2 + y * 2 - t * 6, without the angle's cut (18.10.2026: the noise of atan()
        // stood as a seam down the funnel).
        float tw = y - t * 3.0;
        vec2  q = mat2( cos( tw ), sin( tw ), -sin( tw ), cos( tw ) ) * p.xz;
        vec3  vortex_coord = vec3( q.x * 4.0, y * 3.0 - t * 4.0, q.y * 4.0 );

        float fbm_val = fireFBM( vortex_coord );

        // Distance to funnel core
        float dist_to_funnel = abs( r - funnel_r * fbm_val );
        float flame = exp( -dist_to_funnel * 8.0 ) * exp( -abs( y ) * 1.2 );
        accum_flame += flame * step_size;

        // Smoke envelope
        float smoke = exp( -dist_to_funnel * 3.0 ) * ( 1.0 - flame );
        accum_smoke += smoke * step_size;
    }

    // Photo texture mapping warped by thermal updraft
    vec2 photo_warp = st
                      + vec2( sin( uv.y * 6.0 + t * 2.0 ), cos( uv.x * 6.0 - t * 2.0 ) ) * 0.04 * ( 1.0 + audioKick );
    vec3 photo = img( 1.0 - abs( 1.0 - 2.0 * fract( photo_warp * 0.5 ) ) ); // mirrored at the edges, no seam

    // Blackbody thermal flame colors (red -> orange -> yellow -> white-hot)
    vec3 fire_color = palTint(
        mix( vec3( 0.8, 0.15, 0.02 ), vec3( 1.0, 0.65, 0.1 ), clamp( accum_flame * 1.5, 0.0, 1.0 ) ),
        0.08 * clamp( accum_flame * 1.5, 0.0, 1.0 ), 0.20 );
    // The white-hot core only where the flame is dense, and never all white: a wide funnel (tornadoP 2.2) summed
    // to a flame of several units and the frame went one flat white.
    float flame_i = 1.0 - exp( -accum_flame * 2.2 ); // saturating: the funnel's density, 0..1
    fire_color = mix( fire_color, vec3( 1.0, 0.92, 0.78 ),
                      0.6 * smoothstep( 0.55, 1.0, flame_i * ( 0.8 + 0.2 * ht ) + 0.25 * audioKick ) );

    // Combine visualizer.  The fire leads (18.10.2026): the photo at 0.7 filled the frame and the flame, at its
    // accumulated density, was a faint tint over it -- the whirl did not read as fire.  The photo is a dim, smoky
    // ground now and the flame stronger, saturating.
    vec3 col = mix( photo * 0.22, vec3( 0.05, 0.035, 0.03 ), clamp( accum_smoke * 0.8, 0.0, 1.0 ) );
    col += flame_i * fire_color * ( 1.5 + audioSwell * 0.6 );

    // Rising ember sparks
    // Sparks around the funnel only, rising, brighter on the kick (18.10.2026): a fourth power of a coarse fbm at
    // kick x 3 lit glowing blobs over the whole frame on every beat -- a full-frame flicker.
    float ember_f = fireFBM( vec3( uv.x * 22.0, uv.y * 14.0 - t * 5.0, t * 1.5 ) );
    float embers = smoothstep( 0.62, 0.78, ember_f ) * exp( -abs( uv.x ) * 3.5 )
                   * ( 0.25 + 0.8 * audioKick + 0.4 * audioHigh );
    col += embers * vec3( 1.0, 0.75, 0.3 ) * 0.9;

    // A tint, not a turn of the whole palette: fire stays fire (a full rotation made it green or blue).
    if ( hue > 0.001 )
        col = hueRot( col, 0.15 * sin( hue ) );

    // Vignette
    float vig = smoothstep( 1.3, 0.35, length( uv ) );
    col *= vig;

    fragColor = vec4( col, 1.0 );
}
