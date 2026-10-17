#version 330 core
/*****************************************************************************\
 *                              CurlAurora.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Flowing aurora curtains driven by mood: three hanging sheets, each a winding lower edge with rays standing up
 *  from it, green at the edge and magenta toward the fringe, over a night sky.
 *
 *    audioArousal  -> contrast / brightness of the curtains
 *    audioValence  -> palette (low = teal/green, high = magenta/pink)
 *    audioCentroid -> pale-blue bright tips (spectral brightness)
 *    audioLevel/SubBass -> overall glow
 *    audioPhase/Advance -> smooth, jump-free horizontal drift with the music
 *    audioBeat     -> gentle shimmer (slew-limited host-side, never strobes)
 *  The source image breathes through as a faint landscape glow and in the palette.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioArousal;   ///< Arousal of the music (energy, rhythm, brightness), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
}

/**  Smooth value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float vnoise( vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i );
    float b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) );
    float d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
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
    float s = 0.0;
    float a = 0.5;
    for ( int i = 0; i < 5; ++i )
    {
        s += a * vnoise( p );
        p *= 2.02;
        a *= 0.5;
    }
    return s;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;                         // 0..1
    vec2 p = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / resolution.y; // centred, aspect

    // Horizontal drift = smooth base time + jump-free audio phase/advance.
    float t = time * 0.05 + audioPhase * 0.30 + audioAdvance * 2.0;

    // Night sky: deep blue toward the top, the photo breathing through as a faint landscape glow.
    vec3 col = mix( vec3( 0.010, 0.016, 0.040 ), vec3( 0.002, 0.004, 0.016 ), smoothstep( -0.5, 0.5, p.y ) );
    col += img( uv ) * 0.06;

    // Curtains (17.10.2026): three hanging sheets of light, each a wavy lower edge that winds across the sky, rays
    // standing up from it and fading with height.  The old field (a vertical gradient times low-contrast noise) read
    // as a flat, murky wash -- no curtain, no ray.
    vec3  cool = vec3( 0.10, 0.85, 0.55 ); // the green of the lower edge
    vec3  warm = vec3( 0.85, 0.30, 0.75 ); // magenta / red of the upper fringe
    vec3  tip = vec3( 0.65, 0.95, 1.05 );  // pale blue
    vec3  edge_col = mix( cool, mix( cool, imgPalette( 0.15 ), 0.35 ), 0.5 + 0.5 * audioValence );
    vec3  top_col = mix( warm, imgPalette( 0.65 ), 0.35 );
    float gain = 0.75 + 0.45 * audioLevel + 0.3 * audioSubBass;
    for ( int k = 0; k < 3; ++k )
    {
        float fk = float( k );
        float depth = 1.0 - 0.28 * fk; // the nearest sheet brightest
        // The sheet's lower edge: a slow wave across the sky, its folds drifting with the music.
        float x = p.x * ( 0.9 - 0.15 * fk ) + t * ( 0.6 + 0.25 * fk ) + fk * 4.1;
        float y_edge = -0.14 + 0.15 * fk + 0.55 * ( fbm( vec2( x * 0.9, fk * 7.0 + time * 0.02 ) ) - 0.5 )
                       + 0.09 * sin( x * 2.3 + time * 0.07 + fk ) + 0.04 * sin( x * 5.1 - time * 0.05 + 2.0 * fk );
        float h = p.y - y_edge; // height above the edge
        // The edge's folds bend the rays: the coordinate along the sheet follows the fold.
        float s = x * 9.0 + 2.5 * fbm( vec2( x * 1.7, time * 0.03 + fk ) );
        // Rays: brightness varying along the sheet, constant up a ray, shimmering slowly.
        float rays = fbm( vec2( s * 2.2, time * 0.12 + fk * 3.0 ) );
        rays = smoothstep( 0.25, 0.85, rays ) * ( 0.65 + 0.35 * vnoise( vec2( s * 7.0, time * 0.3 ) ) );
        // Height profile: a sharp lower edge, a long fade up.
        float rise = smoothstep( -0.03, 0.03, h ) * exp( -max( h, 0.0 ) * ( 3.2 + 1.5 * fk ) );
        // The fade up is not even either: rays reach to different heights.
        rise *= smoothstep( 0.0, 0.15, 0.25 + 0.6 * rays - h );
        float I = rise * ( 0.25 + 0.75 * rays ) * depth;
        I = pow( I, 1.2 - 0.4 * audioArousal ); // arousal: harder contrast
        vec3 c = mix( edge_col, top_col, smoothstep( 0.03, 0.35, h ) );
        c = mix( c, tip, smoothstep( 0.6, 1.0, rays ) * smoothstep( 0.05, 0.0, abs( h - 0.02 ) ) * audioCentroid );
        col += c * I * gain * 1.1;
    }

    // Beat shimmer + flux brightening (both slew-limited host-side).
    col += vec3( 0.03, 0.05, 0.06 ) * audioBeat * smoothstep( -0.4, 0.3, p.y );
    col *= ( 1.0 + 0.25 * audioFlux );

    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
