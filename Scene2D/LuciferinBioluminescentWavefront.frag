#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file LuciferinBioluminescentWavefront.frag
 * @brief LUCIFERIN BIOLUMINESCENT WAVEFRONT: Nocturnal ocean surf populated by dinoflagellates
 * (Noctiluca scintillans). Hydrodynamic shear stresses on breaking wave crests trigger
 * enzymatic luciferase-luciferin blue-green photon flashes, foam caustics, and water ripples.
 *   audioAdvance -> drives oceanic swell drift & shoreward wave-breaking velocity
 *   audioKick    -> triggers violent wave crest collapse & explosive shear light bursts
 *   audioFlux    -> excites sparkling dinoflagellate micro-plankton point flashes
 *   audioSwell   -> thickens deep oceanic swell volumetric depth & haze
 *   audioCentroid-> shifts bio-enzymatic photon emission spectrum (cyan to emerald)
 *
 * Per-activation variety:
 *   waveP    float ocean wave steepness & breaker density   (0.6..2.2)
 *   shearP   float hydrodynamic shear activation threshold (0.5..2.0)
 *   foamP    float bioluminescent foam persistence scale  (0.8..2.5)
 *   sparkP   float plankton micro-scintillation density    (1.0..3.5)
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

uniform float waveP; ///< Wave knob.
uniform float shearP;
uniform float foamP;
uniform float sparkP;

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

/**  Pseudo random hash for plankton sparkles
 *
 * @param p  The input. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash( vec2 p )
{
    p = fract( p * vec2( 123.34, 456.21 ) );
    p += dot( p, p + 45.32 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  uv = ( gl_FragCoord.xy - 0.5 * resolution ) / min( resolution.x, resolution.y );
    float t = time * 0.4 + audioAdvance * 0.35;

    // Wave coordinate transformation
    float wave_steepness = ( waveP > 0.01 ? waveP : 1.2 );
    vec2  p = uv * 2.5;
    p.x += sin( p.y * 1.5 + t * 0.5 ) * 0.25;

    // Trochoidal / Gerstner-like wave profile simulation
    float wave1 = sin( p.y * 3.5 - t * 2.2 + sin( p.x * 2.0 ) * 0.5 );
    float wave2 = sin( p.y * 7.0 - t * 3.5 + cos( p.x * 4.0 ) * 0.3 ) * 0.5;
    float wave3 = sin( p.y * 14.0 - t * 5.0 + sin( p.x * 8.0 ) * 0.2 ) * 0.25;

    float wave_height = ( wave1 + wave2 + wave3 ) * wave_steepness;

    // Hydrodynamic shear rate ~ spatial gradient of wave surface
    float d_wave = abs( dFdx( wave_height ) ) + abs( dFdy( wave_height ) );
    float shear_thresh = ( shearP > 0.01 ? shearP : 1.0 );
    float shear_activation = smoothstep( 0.04 * shear_thresh, 0.18 * shear_thresh, d_wave );

    // Breaking wave crest detector (cusp regions where wave > threshold)
    float crest = smoothstep( 0.8, 1.4, wave_height + d_wave * 3.0 );

    // Turbulent bioluminescent foam trails
    float foam_persistence = ( foamP > 0.01 ? foamP : 1.5 );
    float foam_noise = sin( p.x * 12.0 + p.y * 6.0 - t * 2.0 ) * cos( p.x * 8.0 - p.y * 10.0 + t );
    float foam = smoothstep( 0.2, 0.8, crest + foam_noise * 0.4 ) * foam_persistence;

    // Micro-plankton twinkling scintillation
    float spark_density = 40.0 * ( sparkP > 0.01 ? sparkP : 1.5 );
    vec2  grid_id = floor( p * spark_density );
    float h = hash( grid_id );
    float spark_flash = pow( max( 0.0, sin( h * 6.28 + t * 6.0 + audioFlux * 4.0 ) ), 12.0 );
    spark_flash *= smoothstep( 0.1, 0.6, shear_activation + crest ) * ( 0.8 + 2.0 * audioHigh );

    // Base ocean deep color tinted with photo palette
    vec3 deep_water = vec3( 0.01, 0.04, 0.12 );
    vec3 ocean_base = palTint( deep_water, 0.7, 0.2 );

    // Dinoflagellate bioluminescence color: Vibrant cyan-emerald identity tinted by photo
    vec3 bio_cyan = vec3( 0.05, 0.95, 0.85 );
    vec3 bio_emerald = vec3( 0.1, 1.0, 0.45 );
    vec3 bio_color = palTint( mix( bio_cyan, bio_emerald, sin( audioCentroid * 3.14 ) * 0.5 + 0.5 ), wave_height * 0.2,
                              0.28 );

    // Background photo texturing (refracted through water surface)
    vec2 refr_uv = gl_FragCoord.xy / resolution + vec2( dFdx( wave_height ), dFdy( wave_height ) ) * 0.05;
    vec3 bg_photo = img( fract( refr_uv ) ) * 0.25;

    vec3 col = ocean_base + bg_photo * ( 0.6 + 0.4 * audioSwell );
    col += bio_color * shear_activation * 1.5;
    col += bio_color * crest * ( 1.5 + 3.0 * audioKick );
    col += mix( bio_color, vec3( 0.8, 1.0, 0.95 ), 0.5 ) * foam * 1.8;
    col += vec3( 0.7, 1.0, 0.9 ) * spark_flash * 2.5;
    col += bio_color * ( audioKick * 0.35 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
