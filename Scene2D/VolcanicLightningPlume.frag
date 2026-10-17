#version 330 core
/*****************************************************************************\
 *                              VolcanicLightningPlume.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  VOLCANIC LIGHTNING PLUME: Volumetric explosive volcanic ash column rising into the night sky with glowing basalt
 *  magma fountains, turbulent curl-noise smoke billowing, and branched electrostatic volcanic lightning discharges.
 *
 *    audioKick    -> triggers explosive volcanic eruption burst & branched lightning
 *    audioSubBass -> rumbles seismic ground tremors and lava fountain height
 *    audioHigh    -> sparks electrostatic lightning branches and crackles
 *    audioSwell   -> billows ash column into the upper atmosphere
 *
 *  Per-activation variety:
 *    eruptionP float lava fountain height & power           (0.5..2.0)
 *    smokeP    float ash density and billow turbulence      (0.5..1.8)
 *    boltP     float electrostatic lightning intensity      (0.5..2.2)
 *    hueP      float magma and lightning hue rotation       (0..6.28)
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

uniform float eruptionP;      ///< Eruption knob: lava fountain height & power, 0.5..2.
uniform float smokeP;         ///< Smoke knob: ash density and billow turbulence, 0.5..1.8.
uniform float boltP;          ///< Bolt knob: electrostatic lightning intensity, 0.5..2.2.
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
    p = fract( p * vec2( 324.65, 156.34 ) );
    p += dot( p, p + 45.32 );
    return fract( p.x * p.y );
}

/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}

/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec2 p )
{
    float v = 0.0;
    float a = 0.5;
    mat2  rot = mat2( 0.8, 0.6, -0.6, 0.8 );
    for ( int i = 0; i < 5; ++i )
    {
        v += a * noise( p );
        p = rot * p * 2.0 + vec2( 100.0 );
        a *= 0.5;
    }
    return v;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float erp = ( eruptionP > 0.0 ) ? eruptionP : 1.0;
    float smk = ( smokeP > 0.0 ) ? smokeP : 1.0;
    float blt = ( boltP > 0.0 ) ? boltP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 + audioAdvance * 0.2;

    // Volcano caldera ground profile at bottom
    float caldera_y = -0.38 - 0.15 * abs( uv.x );
    float is_ground = step( uv.y, caldera_y );

    // Eruption plume coordinate system (billowing upwards from caldera center)
    vec2  plume_coord = vec2( uv.x, uv.y - caldera_y );
    float plume_radius = ( 0.08 + 0.35 * max( plume_coord.y, 0.0 ) ) * smk;

    // Upward turbulence
    vec2  billow_uv = vec2( plume_coord.x * 3.0, plume_coord.y * 2.0 - t * 1.5 );
    float billow = fbm( billow_uv + fbm( billow_uv * 2.0 ) );

    // Ash plume density
    float plume_dist = abs( plume_coord.x ) / max( plume_radius, 0.01 );
    float ash_density = smoothstep( 1.2, 0.2, plume_dist ) * smoothstep( 0.0, 0.2, plume_coord.y ) * billow;

    // Lava fountain at the vent mouth
    float fountain_height = ( 0.25 + 0.35 * audioSubBass + 0.2 * audioKick ) * erp;
    float lava_dist = length( vec2( plume_coord.x * 3.0, max( plume_coord.y - fountain_height * 0.5, 0.0 ) ) );
    float lava_glow = ( 0.015 / ( lava_dist * lava_dist + 0.005 ) ) * ( 1.0 + audioKick * 3.0 );
    vec3  lava_col = palTint( mix( vec3( 1.0, 0.2, 0.0 ), vec3( 1.0, 0.9, 0.3 ), clamp( lava_glow * 0.3, 0.0, 1.0 ) ),
                              0.06, 0.18 )
                     * lava_glow;

    // Branched Volcanic Lightning discharges inside the ash plume
    float lightning_flash = 0.0;
    if ( audioHigh > 0.35 || audioKick > 0.5 )
    {
        // Lightning is a large bright structure: treat as full-frame,
        // 3 Hz. 12 re-rolls a second read as flicker, not weather.
        float bolt_seed = floor( time * 3.00 );
        float bolt_path = ( noise( vec2( plume_coord.y * 15.0, bolt_seed ) ) - 0.5 ) * 0.3;
        float bolt_dist = abs( plume_coord.x - bolt_path );
        float bolt = ( 0.0015 * blt ) / ( bolt_dist * bolt_dist + 0.0001 );
        bolt *= step( 0.05, plume_coord.y ) * step( plume_coord.y, 0.85 );
        lightning_flash = bolt * ( audioHigh + audioKick * 2.0 );
    }
    vec3 lightning_col = vec3( 0.5, 0.8, 1.0 ) * lightning_flash * 2.0;

    // Dark ash smoke with internal orange fire scattering
    vec3 ash_col = mix( vec3( 0.04, 0.03, 0.03 ), vec3( 0.8, 0.25, 0.05 ), ash_density * exp( -plume_coord.y * 1.5 ) );
    ash_col *= ash_density;

    // Background sky and photo blending
    vec3 bg_photo = img( st );
    vec3 sky_col = vec3( 0.01, 0.02, 0.05 ) + bg_photo * 0.2;

    // Ground basalt silhouette
    vec3 ground_col = vec3( 0.02, 0.02, 0.03 );
    if ( is_ground > 0.5 )
    {
        // Glowing lava fissures on the volcano slope
        float fissure = smoothstep( 0.7, 0.95, noise( uv * 20.0 ) );
        ground_col += vec3( 1.0, 0.3, 0.05 ) * fissure * ( 0.8 + 0.4 * audioBass );
    }

    vec3 col = mix( sky_col, ash_col, clamp( ash_density * 1.5, 0.0, 1.0 ) );
    col += lava_col + lightning_col;
    col = mix( col, ground_col, is_ground );

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    fragColor = vec4( col, 1.0 );
}
