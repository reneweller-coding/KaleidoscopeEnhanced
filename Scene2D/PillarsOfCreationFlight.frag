#version 330 core
/*****************************************************************************\
 *                              PillarsOfCreationFlight.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  PILLARS OF CREATION FLIGHT: A majestic, slow flight through colossal columns of interstellar dust and gas.
 *
 *  Newborn stars within the pillars illuminate the dense clouds and react to the beat.
 *
 *    audioAdvance -> flight speed through the nebula
 *    audioKick    -> flashes from newly ignited protostars
 *    audioSwell   -> ambient brightness of the dust clouds
 *    audioChromaHue-> palette offset for the nebula gas
 *
 *  Per-activation variety:
 *    dustP float density and complexity of the dust pillars (0.5..1.5)
 *    starP float intensity of the newborn stars (0.5..2.0)
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
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).

uniform float dustP; ///< Dust knob: density and complexity of the dust pillars (0.5..1.5).
uniform float starP; ///< Star knob: intensity of the newborn stars (0.5..2.0).
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    n = fract( n * 0.1031 );
    n *= n + 33.33;
    n *= n + n;
    return fract( n );
}
/**  Pseudo-random number 0..1 from a 3D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash31( vec3 p )
{
    p = fract( p * 0.1031 );
    p += dot( p, p.zyx + 31.32 );
    return fract( ( p.x + p.y ) * p.z );
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dp = ( dustP > 0.01 ? dustP : 1.0 );
    float sp = ( starP > 0.01 ? starP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // The flight runs on the scene's own clocks.  Until 17.10.2026 it ran on `time` and `audioAdvance`, both counted
    // since the program started: after some minutes of a show the camera stood hundreds of units deep, the sine
    // hashes above lost their precision there, and the pillars fell apart into a flat fog with flat facets in it
    // (the screening measured a structure of 0.006).  The hashes are sine-free now as well.
    float drift = sceneTime * 0.5 + sceneAdvance * 2.0;

    vec3 ro = vec3( 0.0, 0.0, drift );

    // Slow, majestic camera pan
    vec3 ta = ro + vec3( sin( sceneTime * 0.1 ) * 0.3, cos( sceneTime * 0.15 ) * 0.2, 1.0 );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    float roll = 0.1 * sin( sceneTime * 0.05 );
    vec2  ruv = mat2( cos( roll ), -sin( roll ), sin( roll ), cos( roll ) ) * uv;
    vec3  rd = normalize( ruv.x * uu + ruv.y * vv + 1.0 * ww );

    vec3 col = vec3( 0.0 );

    vec3 dust_color1 = imgPalette( 0.2 + audioCentroid * 0.1 ); // deep browns/reds
    vec3 dust_color2 = imgPalette( 0.6 + audioCentroid * 0.2 ); // brighter greens/cyans
    vec3 star_color = imgPalette( 0.9 + audioKick * 0.1 );      // hot white/blue

    // Volumetric raymarching for the nebula pillars
    float d = 0.0;
    vec3  p;
    float density_accum = 0.0;

    // Ambient light coming from behind the pillars
    vec3 light_dir = normalize( vec3( 0.5, 0.5, 1.0 ) );

    for ( int i = 0; i < 45; ++i )
    {
        p = ro + rd * d;

        // The pillars: columns on a loose lattice in x/z, thicker at the base and capped at a height of their own,
        // the camera's lane (x = 0) between two rows.  Until 17.10.2026 the field was sin(x)cos(z) + sin(y) plus
        // 1.5 fbm, above the threshold almost everywhere: the camera stood inside the dust and saw a flat fog after
        // three steps.
        vec2 cell = vec2( 10.0, 14.0 );
        vec2 cid = floor( p.xz / cell );
        vec2 lc = mod( p.xz, cell ) - 0.5 * cell;
        lc -= ( vec2( hash11( dot( cid, vec2( 1.0, 57.0 ) ) ), hash11( dot( cid, vec2( 1.0, 57.0 ) ) + 7.0 ) ) - 0.5 )
              * vec2( 2.5, 6.0 );
        float rad = 1.5 + 0.9 * hash11( dot( cid, vec2( 1.0, 57.0 ) ) + 3.0 ) - 0.06 * p.y;
        float top = 1.5 + 3.5 * hash11( dot( cid, vec2( 1.0, 57.0 ) ) + 5.0 );
        float column = max( length( lc ) - rad, p.y - top );

        // Fractal detail frays the surface: dust, not a cylinder.
        float detail = fbm( p * 0.8 * dp );
        float shape = -column + ( detail - 0.5 ) * 1.8;
        float density = smoothstep( 0.0, 0.7, shape ) * dp;
        // The bright rims where the stars' light eats into the dust (the photoevaporation fronts).
        col += dust_color2 * exp( -abs( shape ) * 5.0 ) * 0.035 * ( 1.0 - density_accum ) * ( 1.0 + audioSwell );

        if ( density > 0.01 )
        {
            // Self-shadowing approximation inside the cloud
            float shadow = fbm( p * 1.5 + light_dir * 0.5 );

            vec3 local_col = mix( dust_color1, dust_color2, detail );

            // Lighting
            float lum = ( 0.45 + shadow * 1.1 ) * ( 1.0 + audioSwell );
            local_col *= lum;

            // Newborn stars embedded in the dust: a soft round glow around a jittered point in a 1.5-unit cell -- the
            // ray integrates the Gaussian into a round disc.  Until 17.10.2026 whole 0.2-unit cells lit up (squares on
            // the screen), and a kick re-rolled which cells flashed four times a second.
            vec3  sc = floor( p / 1.5 );
            float sh = hash31( sc );
            if ( sh > 0.88 )
            {
                vec3  sp3 = ( sc + 0.2 + 0.6 * vec3( hash31( sc + 1.7 ), hash31( sc + 4.1 ), hash31( sc + 9.3 ) ) )
                            * 1.5;
                float g = exp( -dot( p - sp3, p - sp3 ) / 0.09 );
                float pulse = 0.6 + 0.4 * sin( sceneTime * 2.0 + sh * 100.0 );
                col += star_color * g * pulse * ( 1.0 + 1.5 * audioKick ) * sp * 0.8 * ( 1.0 - density_accum );
            }

            // Accumulate
            float alpha = density * 0.35;
            col += local_col * alpha * ( 1.0 - density_accum );
            density_accum += alpha;

            if ( density_accum > 0.95 )
                break;
        }

        // Variable step size based on density
        d += max( 0.2, 0.5 - density * 0.3 );
        if ( d > 30.0 )
            break;
    }

    // Background glow (the ionizing radiation from massive O-type stars off-camera)
    vec3 bg_glow = dust_color2 * ( 0.1 + audioSwell * 0.2 ) * smoothstep( -1.0, 1.0, rd.y );
    col += bg_glow * ( 1.0 - density_accum );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
