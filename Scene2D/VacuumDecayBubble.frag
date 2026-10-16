#version 330 core
/*****************************************************************************\
 *                              VacuumDecayBubble.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  VACUUM DECAY BUBBLE: a bubble of true vacuum drifts through space and rewrites the physics inside it.
 *
 *  Outside, a starfield and the photo as a nebula; inside the wall the same sky with the constants changed --
 *  colours inverted toward the palette, space refracted, stars split into spectra, the nebula's structure at
 *  another scale.  The wall itself is a thin refracting shell with chromatic dispersion.  The bubble's radius grows
 *  with the build-up (seconds-slow) and eases back after the release; its centre drifts on the scene clock.  Inside
 *  and outside blend across the wall, so nothing ever cuts.  The camera never moves.
 *
 *  Audio Reactivity:
 *    audioBuildUp  -> bubble radius (slow)
 *    sceneAdvance  -> the bubble drifts, the sky turns slowly
 *    audioDrop     -> the wall flashes (light)
 *    audioKick     -> the inside pulses (light)
 *    audioLevel    -> brightness
 *
 *  Per-activation variety: sizeP (base radius), dispP (dispersion), hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioBuildUp;   ///< Build-up toward a drop, 0..1.
uniform float audioDrop;      ///< Drop envelope: high after a detected drop, decaying.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float sizeP; ///< Size knob, 0..1.
uniform float dispP; ///< Disp knob: dispersion, 0..1.
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
    vec3  col = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float g = dot( col, vec3( 0.333 ) );
    return mix( vec3( g ), col, 0.55 + 0.45 * audioValence );
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
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

/**  The sky seen through the current physics: stars (round), nebula (photo).
 *
 * @param q    The point. (in)
 * @param alt  0 outside, 1 inside the bubble. (in)
 * @param hue  Hue. (in)
 *
 * @return
 *   The colour (RGB).
 **/
vec3 sky( vec2 q, float alt, float hue )
{
    // alt = 0 outside, 1 inside: scale and tint of the nebula change.
    vec2  nuv = fract( q * mix( 0.3, 0.55, alt ) + 0.5 + vec2( sceneAdvance * 0.003, 0.0 ) );
    vec3  neb = img( nuv );
    vec3  neb_out = neb * imgPalette( hue * 0.159 + 0.6 ) * 1.4;
    vec3  neb_in = ( 1.0 - neb ) * imgPalette( hue * 0.159 + 0.1 ) * 1.6;
    vec3  col = mix( neb_out, neb_in, alt ) * 0.5;
    vec2  su = q * 60.0;
    vec2  cell = floor( su );
    vec2  f = fract( su ) - 0.5;
    float hs = hash21( cell );
    vec2  off = vec2( hash21( cell + 3.1 ), hash21( cell + 7.7 ) ) - 0.5;
    float star = smoothstep( 0.16, 0.02, length( f - off * 0.6 ) ) * step( 0.972, hs )
                 * ( 0.5 + 0.8 * hash21( cell + 9.9 ) );
    // Inside, stars split into small spectra (dispersion): three offset copies.
    vec3 star_col = vec3( star );
    if ( alt > 0.001 )
    {
        float s_r = smoothstep( 0.16, 0.02, length( f - off * 0.6 - vec2( 0.05, 0.0 ) * alt ) ) * step( 0.972, hs );
        float s_b = smoothstep( 0.16, 0.02, length( f - off * 0.6 + vec2( 0.05, 0.0 ) * alt ) ) * step( 0.972, hs );
        star_col = mix( star_col, vec3( s_r, star, s_b ) * ( 0.5 + 0.8 * hash21( cell + 9.9 ) ), alt );
    }
    return col + star_col;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float disp = 0.02 + 0.04 * clamp( dispP, 0.0, 1.0 );
    // Radius: base plus the build-up (slow), plus a slow breath.
    float R = ( 0.22 + 0.18 * clamp( sizeP, 0.0, 1.0 ) ) * ( 1.0 + 0.9 * clamp( audioBuildUp, 0.0, 1.0 ) )
              + 0.03 * sin( sceneTime * 0.3 );
    vec2  c = vec2( 0.25 * sin( sceneAdvance * 0.06 ), 0.15 * cos( sceneAdvance * 0.045 ) );

    // The sky turns slowly.
    float rot = sceneAdvance * 0.02;
    vec2  q = mat2( cos( rot ), -sin( rot ), sin( rot ), cos( rot ) ) * p;

    float d = length( p - c ) - R;
    float inside = 1.0 - smoothstep( -0.02, 0.02, d );
    // Refraction across the wall: a lens bends the sky near the rim, with
    // dispersion (three channels, three strengths).
    float rim = exp( -abs( d ) * 18.0 );
    vec2  dir = normalize( p - c + 1e-5 );
    vec3  col;
    {
        vec2 q_r = q - dir * rim * disp * 0.7;
        vec2 q_g = q - dir * rim * disp * 1.0;
        vec2 q_b = q - dir * rim * disp * 1.4;
        col = vec3( sky( q_r, inside, hue ).r, sky( q_g, inside, hue ).g, sky( q_b, inside, hue ).b );
    }
    // The wall: a thin bright shell, flashing on the drop; the inside pulses
    // faintly on the kick.
    vec3 wall_col = imgPalette( hue * 0.159 + 0.9 );
    col += wall_col * exp( -abs( d ) * 60.0 ) * ( 0.6 + 2.0 * clamp( audioDrop, 0.0, 1.0 ) );
    col += wall_col * exp( -abs( d ) * 10.0 ) * 0.12;
    col += imgPalette( hue * 0.159 + 0.1 ) * inside * 0.15 * audioKick;
    col *= 0.8 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
