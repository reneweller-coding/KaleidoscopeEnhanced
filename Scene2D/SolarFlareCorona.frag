#version 330 core
/*****************************************************************************\
 *                              SolarFlareCorona.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SOLAR FLARE CORONA: Extreme close-up of a turbulent stellar photosphere, incandescent plasma convection cells,
 *  magnetic coronal loops, and explosive coronal mass ejections erupting across the screen.
 *
 *    audioSubBass -> expands radial solar flare shockwaves
 *    audioKick    -> flashes incandescent core nuclear ignition
 *    audioMid     -> ripples magnetic flux loops & plasma convection
 *    audioHigh    -> excites fine coronal filaments & solar sparks
 *
 *  Per-activation variety:
 *    turbulenceP  float plasma vortex turbulence multiplier (0.5..2.0)
 *    heatP        float thermal color intensity             (0.6..1.8)
 *    flareP       float coronal prominence reach            (0.5..2.2)
 *    hueP         float stellar color grading               (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;    ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;    ///< Overall loudness, 0..1.
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;  ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;  ///< Sub-bass band level, 0..1.
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioMid;      ///< Mid band level, 0..1.
uniform float audioHigh;     ///< High band level, 0..1.
uniform float audioFlux;     ///< Spectral flux (how fast the spectrum changes), 0..1.

uniform float turbulenceP;    ///< Turbulence knob: plasma vortex turbulence multiplier (0.5..2.0).
uniform float heatP;          ///< Heat knob: thermal color intensity, 0.6..1.8.
uniform float flareP;         ///< Flare knob: coronal prominence reach, 0.5..2.2.
uniform float hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 456.23, 789.12 ) );
    p += dot( p, p + 56.78 );
    return fract( p.x * p.y );
}

/**  Smooth 2D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value.
 **/
float noise2D( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}

/**  2D curl noise for realistic turbulent magnetic plasma advection
 *
 * @param p  The point. (in)
 *
 * @return
 *   The flow vector.
 **/
vec2 curlNoise( vec2 p )
{
    const float eps = 0.05;
    float       n1 = noise2D( p + vec2( 0.0, eps ) );
    float       n2 = noise2D( p - vec2( 0.0, eps ) );
    float       n3 = noise2D( p + vec2( eps, 0.0 ) );
    float       n4 = noise2D( p - vec2( eps, 0.0 ) );
    return vec2( n1 - n2, -( n3 - n4 ) ) / ( 2.0 * eps );
}

/**  Fractal noise of five rotated octaves for the plasma.
 *
 * @param p     The point. (in)
 * @param turb  Turbulence (warp of each octave). (in)
 *
 * @return
 *   The noise value, about 0..1.
 **/
float fbmPlasma( vec2 p, float turb )
{
    float v = 0.0;
    float a = 0.5;
    mat2  rot = mat2( 0.866, -0.5, 0.5, 0.866 );
    for ( int i = 0; i < 5; ++i )
    {
        vec2 c = curlNoise( p * 0.8 );
        v += a * noise2D( p + c * ( 0.4 * turb ) );
        p = rot * p * 2.1 + vec2( 1.7, 2.3 );
        a *= 0.5;
    }
    return v;
}

/**  Blackbody thermal incandescent color curve.
 *
 * @param t  The temperature value (about -1.1..3.3). (in)
 *
 * @return
 *   The colour (RGB).
 *
 * The ramps used to be 0.0-0.8 / 0.3-1.4 / 0.8-2.2 while `total_thermal` below
 * never dropped under about 1.2 anywhere in the frame -- a constant core_heat
 * floor plus a granule term whose MEAN was 0.77. So the red channel's
 * smoothstep was hard at 1.0 for every single pixel, green nearly so, and the
 * Reinhardt tone-map then squeezed what little was left into a band about 0.05
 * wide: one uniform orange, measured contrast 0.035. The scene had no
 * temperature range at all, because the curve's whole working range sat below
 * the coldest point of the picture.
 *
 * The ramps now span the temperature distribution the scene ACTUALLY produces
 * (about -1.1 at the cold limb to +3.3 in the core), so the photosphere runs
 * black -> deep red -> orange -> white-hot across the frame.
 **/
vec3 blackbody( float t )
{
    t = clamp( t, -2.0, 3.4 );
    vec3 c = vec3( 0.0 );
    c.r = smoothstep( -0.15, 1.35, t ) * 1.5;
    c.g = smoothstep( 0.45, 2.05, t ) * 1.2;
    c.b = smoothstep( 1.25, 3.00, t ) * 1.5;
    return c;
}

/**  Weight that closes atan's cut: 0 over most of the circle, 1 at a = pi.
 *
 * @param a  The angle, -pi..pi. (in)
 *
 * @return
 *   The weight, 0..1.
 *
 * A noise of an angle from atan() does not repeat after a turn and tears along the cut; mixed toward the same noise of
 * a - 2*pi near a = pi it meets, at the cut, exactly the value on the other side (17.10.2026).
 **/
float seamW( float a )
{
    return smoothstep( 2.5, 3.14159265, a );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float turb = ( turbulenceP > 0.0 ) ? turbulenceP : 1.0;
    float heat = ( heatP > 0.0 ) ? heatP : 1.0;
    float flr = ( flareP > 0.0 ) ? flareP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length( uv );
    float a = atan( uv.y, uv.x );

    float t = time * 0.25 + audioAdvance * 0.15;

    // Photosphere limb curvature: huge stellar core filling bottom/center
    vec2 p = uv * ( 1.8 + 0.3 * sin( t * 0.2 ) );

    // Magnetic twisting rotation
    float spin = ( 0.2 + 0.4 / ( r + 0.4 ) ) * ( time * 0.2 + audioPhase * 0.5 );
    mat2  rot = mat2( cos( spin ), -sin( spin ), sin( spin ), cos( spin ) );
    vec2  p_rot = rot * p;

    // Photosphere granular convection cells
    float cells = fbmPlasma( p_rot * 3.5, turb );
    float cells2 = fbmPlasma( p_rot * 7.0 + vec2( t * 0.5, -t * 0.3 ), turb * 1.2 );
    float granules = ( cells * 0.6 + cells2 * 0.4 );

    // Coronal mass ejection / magnetic prominence arches
    int   promen_count = 6;
    float promen_glow = 0.0;
    for ( int k = 0; k < promen_count; ++k )
    {
        float p_angle = float( k ) * ( 6.2831853 / float( promen_count ) ) + t * 0.1;
        float diff_a = mod( a - p_angle + 3.14159, 6.2831853 ) - 3.14159;

        // Loop curve formula
        float arch_r = 0.65 + 0.3 * sin( t * 2.0 + float( k ) * 2.5 ) + audioSubBass * 0.4 * flr;
        float arch_h = 0.25 * sin( max( 0.0, 3.14159 - abs( diff_a ) * 6.0 ) );
        float d_arch = abs( r - ( arch_r + arch_h ) ) + abs( diff_a ) * 0.2;

        promen_glow += ( 0.012 / ( d_arch * d_arch + 0.003 ) ) * ( 0.8 + audioKick * 1.5 );
    }

    // Solar thermal temperature calculation.
    // `granules` is a positive fbm with mean ~0.44, so `granules * 1.6` was a
    // uniform +0.7 pedestal under the whole frame rather than a convection
    // pattern. Centring it makes the intergranular lanes genuinely COLDER than
    // their surroundings -- which is what a photosphere looks like, and what
    // gives the surface its contrast. core_heat falls off faster so the limb and
    // corona are dark instead of already saturated.
    float core_heat = exp( -r * ( 2.4 / heat ) ) * 2.1;
    float surface_heat = ( granules - 0.44 ) * 2.4 + promen_glow * 0.45;
    float shockwave = sin( r * 20.0 - t * 6.0 - audioSubBass * 8.0 ) * exp( -r * 2.0 ) * audioKick * 1.8;

    float total_thermal = core_heat + surface_heat + shockwave;

    // Thermal color radiance
    vec3 col = blackbody( total_thermal );

    // Sunspot magnetic dark filaments
    float sunspots = smoothstep( 0.72, 0.85, fbmPlasma( p_rot * 2.0 + vec2( t * 0.1 ), turb * 0.8 ) );
    col *= ( 1.0 - sunspots * 0.65 );

    // Background cosmic corona rays & solar wind
    float corona_rays = pow( mix( noise2D( vec2( a * 5.0 + t * 0.4, r * 2.0 - t * 1.5 ) ),
                                  noise2D( vec2( ( a - 6.2831853 ) * 5.0 + t * 0.4, r * 2.0 - t * 1.5 ) ),
                                  seamW( a ) ),
                             2.0 );
    vec3  corona_col = palTint( mix( vec3( 1.0, 0.4, 0.1 ), vec3( 0.9, 0.1, 0.4 ), sin( a * 3.0 + t ) * 0.5 + 0.5 ),
                                0.10, 0.20 );
    col += corona_col * corona_rays * ( 0.6 + audioSwell * 0.8 ) * exp( -r * 0.8 );

    // Sample texture with thermal distortion
    vec2 photo_uv = st + curlNoise( p_rot * 2.0 ) * 0.02 * ( 1.0 + audioMid * 1.5 );
    vec3 photo = img( clamp( photo_uv, 0.0, 1.0 ) );
    col += photo * ( 0.25 + 0.3 * audioLevel ) * vec3( 1.2, 0.9, 0.4 );

    // Incandescent solar flares & sparks.
    // The seed used to step at floor(time * 4.00) -- a completely new noise
    // field 25 times a second, i.e. video static, well past the 8 Hz ceiling for
    // fine detail. 6 steps/second reads as sparks; the hard audioHigh > 0.4 gate
    // is now a smoothstep so the whole spark field cannot pop on and off.
    float spark_gate = smoothstep( 0.32, 0.55, audioHigh );
    if ( spark_gate > 0.001 )
    {
        // Runde Funken statt ganzer uv-Zellen (Quadrat-Pixel).
        vec2  kg = uv * 50.0;
        vec2  kid = floor( kg );
        vec2  kf = fract( kg ) - 0.5;
        float spark = hash21( kid + vec2( floor( time * 4.00 ), 3.0 ) );
        vec2  kp = ( vec2( fract( spark * 7.3 ), fract( spark * 13.7 ) ) - 0.5 ) * 0.7;
        float kd = dot( kf - kp, kf - kp );
        col += vec3( 1.5, 1.2, 0.8 ) * smoothstep( 0.965, 0.985, spark )
               * exp( -kd * 70.0 ) * audioHigh * 1.8 * spark_gate;
    }

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Viewport edge glow & tone map
    col = col / ( col + vec3( 1.0 ) ); // Filmic Reinhardt tone mapping
    col = pow( col, vec3( 0.85 ) );

    fragColor = vec4( col, 1.0 );
}
