#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file KilonovaRadioactiveAfterglow.frag
 * @brief KILONOVA RADIOACTIVE AFTERGLOW: Binary neutron star merger fireball.
 * Expanding relativistic ejecta cloud synthesis of heavy r-process elements (gold, platinum),
 * lanthanide-rich line opacity absorption, shock break-out gamma flash, and photo texturing.
 *   audioAdvance -> drives relativistic ejecta fireball expansion & turbulent billows
 *   audioKick    -> ignites gamma-ray burst shock break-out flashes
 *   audioSwell   -> swells dense radioactive core thermal luminosity
 *   audioBass    -> undulates magneto-hydrodynamic ejecta filament tearing
 *   audioCentroid-> shifts lanthanide absorption edge spectra
 *
 * Per-activation variety:
 *   ejectaP  float merger ejecta velocity & turbulence scale (0.6..2.0)
 *   coreP    float radioactive central engine hotness       (0.8..2.5)
 *   lanthP   float lanthanide opacity absorption strength   (0.5..2.2)
 *   shockP   float shock break-out ray intensity           (0.4..1.8)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
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

uniform float ejectaP; ///< Ejecta knob: merger ejecta velocity & turbulence scale (0.6..2.0).
uniform float coreP;   ///< Fold core class knob of the 3D chain, 0..1.
uniform float lanthP;  ///< Lanth knob: lanthanide opacity absorption strength, 0.5..2.2.
uniform float shockP;  ///< Shock knob: shock break-out ray intensity, 0.4..1.8.

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

/**  Tints a colour toward the house palette at t, keeping its brightness.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.35 + audioAdvance * 0.35;

    float r = length( uv );
    float theta = atan( uv.y, uv.x );

    // Turbulent fractal ejecta noise
    float scale = ( ejectaP > 0.01 ? ejectaP : 1.2 );
    vec2  p = uv * scale;
    float turb = 0.0;
    float amp = 0.5;
    vec2  shift = vec2( cos( t * 0.4 ), sin( t * 0.3 ) ) * 0.2;

    for ( int i = 0; i < 4; ++i )
    {
        p = vec2( p.x * cos( 0.6 ) - p.y * sin( 0.6 ), p.x * sin( 0.6 ) + p.y * cos( 0.6 ) ) * 1.8 + shift;
        turb += amp * ( sin( p.x * 2.5 + t ) * cos( p.y * 2.5 - t ) );
        amp *= 0.5;
    }

    float ejecta_dist = r + turb * 0.12 * ( 0.8 + 0.5 * audioBass );

    // Core radioactive engine (thermal glow)
    float core_radius = 0.15 * ( coreP > 0.01 ? coreP : 1.0 ) * ( 1.0 + 0.3 * audioSubBass );
    float core_glow = exp( -ejecta_dist / max( core_radius, 0.01 ) ) * ( 1.0 + 2.5 * audioKick );

    // Lanthanide opacity curtain (outer absorbing shells)
    float lanth_opacity = ( lanthP > 0.01 ? lanthP : 1.2 );
    float shell = exp( -abs( ejecta_dist - 0.45 ) * 6.0 * lanth_opacity );

    // Shock break-out rays
    float rays = pow( sin( theta * 8.0 + turb * 3.0 + t * 1.5 ) * 0.5 + 0.5, 3.0 );
    rays *= exp( -r * 2.0 ) * ( shockP > 0.01 ? shockP : 1.0 ) * ( 0.8 + 1.2 * audioHigh );

    // Color synthesis: Incandescent gold/platinum core tinted toward photo palette
    vec3 gold_core = vec3( 1.0, 0.75, 0.2 );
    vec3 deep_crimson = vec3( 0.7, 0.12, 0.08 );
    vec3 lanthanide_purple = vec3( 0.4, 0.05, 0.55 );

    vec3 core_color = palTint( gold_core, 0.05, 0.22 );
    vec3 shell_color = palTint( mix( deep_crimson, lanthanide_purple, shell ), ejecta_dist * 0.3, 0.28 );
    vec3 ray_color = palTint( vec3( 1.0, 0.9, 0.7 ), audioCentroid, 0.25 );

    // Background photo texture
    vec2 bg_uv = gl_FragCoord.xy / resolution;
    vec3 bg = img( bg_uv ) * 0.25;

    vec3 col = bg;
    col += shell_color * shell * ( 0.9 + 0.6 * audioSwell );
    col += core_color * core_glow * 2.5;
    col += ray_color * rays * 1.4;
    col += palTint( vec3( 1.0, 0.4, 0.1 ), turb * 0.2, 0.25 ) * ( audioKick * 0.4 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    col *= 0.71; // measured luma 0.707: knee, not a linear trim
    col /= 1.0 + 0.45 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
