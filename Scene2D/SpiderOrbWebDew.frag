#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SpiderOrbWebDew.frag
 * @brief SPIDER ORB WEB WITH DEW: an orb web at dawn, strung with dew.
 * The web is built over the scene arc the way a spider builds it -- radii
 * first, then the spiral from the hub outward; each radius belongs to a
 * spectrum band and glows with it; the dew drops (round, on the spiral)
 * sparkle with the treble; the sun rises behind on the swell; the photo
 * is the garden out of focus.  Camera still.
 *
 * Audio Reactivity:
 *   sceneProgress     -> web construction (the arc)
 *   audioSpectrum[32] -> radius glow by band (light)
 *   audioHigh         -> dew sparkle (light)
 *   audioSwell        -> sunrise (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: radiiP, dewP, hueP.
 */
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;      ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;         ///< Seconds since this scene was activated.
uniform float sceneProgress;     ///< Progress through this scene's solo time, 0..1.
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.

uniform float radiiP; ///< Radii knob, 0..1.
uniform float dewP;   ///< Dew knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float n_radii = floor( 18.0 + 14.0 * clamp( radiiP, 0.0, 1.0 ) ); // once per activation
    float dew_amt = 0.5 + 0.5 * clamp( dewP, 0.0, 1.0 );
    float prog = clamp( sceneProgress, 0.0, 1.0 );
    float sun = clamp( audioSwell, 0.0, 1.0 );
    float hi = clamp( audioHigh * 2.0, 0.0, 1.0 );

    vec2  hub = vec2( 0.05, 0.02 );
    vec2  q = p - hub;
    float r = length( q );
    float a = atan( q.y, q.x );

    // The garden: the photo out of focus, dawn-lit; the sun low right.
    vec3 col = ( interpolation * textureLod( tex0, gl_FragCoord.xy / resolution, 4.0 )
                 + ( 1.0 - interpolation ) * textureLod( tex1, gl_FragCoord.xy / resolution, 4.0 ) )
                   .rgb;
    col = mix( col, col * imgPalette( hue * 0.159 + 0.55 ) * 1.5, 0.3 ) * ( 0.35 + 0.5 * sun );
    vec3 sun_col = vec3( 1.0, 0.8, 0.55 );
    col += sun_col * exp( -length( p - vec2( 0.5, -0.05 + 0.25 * sun ) ) * 3.0 ) * ( 0.3 + 0.9 * sun );
    // Round bokeh highlights in the garden.
    vec2 bu = p * 9.0;
    vec2 bc = floor( bu );
    vec2 bf = fract( bu ) - 0.5;
    vec2 bo = vec2( hash21( bc + 1.3 ), hash21( bc + 5.9 ) ) - 0.5;
    col += sun_col * smoothstep( 0.22, 0.18, length( bf - bo * 0.5 ) ) * step( 0.88, hash21( bc ) ) * 0.2 * sun;

    // Radii: built first (prog 0..0.35); radius i glows with its band.
    float radii_done = smoothstep( 0.0, 0.35, prog );
    float sector = 6.2831853 / n_radii;
    float ai = mod( a + 3.14159, sector ) - sector * 0.5;
    float rad_idx = floor( ( a + 3.14159 ) / sector );
    float dist_rad = abs( sin( ai ) ) * r;
    float rad_len = 0.75 * radii_done * ( 0.9 + 0.2 * hash11( rad_idx * 3.3 ) );
    float radius = smoothstep( 0.0025, 0.0008, dist_rad ) * step( r, rad_len ) * step( 0.02, r );
    int   band = int( mod( rad_idx * 5.0, 32.0 ) );
    float e = clamp( audioSpectrum[band] * 1.6, 0.0, 1.0 );
    // The spiral: laid after the radii, from the hub outward with the arc;
    // the capture spiral r = k * theta with a per-turn wobble.
    float spiral_done = smoothstep( 0.3, 0.95, prog );
    float pitch = 0.028;
    float turns = ( a + 3.14159 ) / 6.2831853;
    float r_turn = fract( ( r / pitch ) - turns ); // position between spiral threads
    float spiral_r = r;
    float spiral = smoothstep( 0.12, 0.03, min( r_turn, 1.0 - r_turn ) ) * step( 0.05, r )
                   * step( r, 0.72 * spiral_done ) * step( r, rad_len + 0.02 );
    // The web silk: pale, catching the sun; radii lit by their band.
    vec3 silk = mix( vec3( 0.9, 0.9, 0.85 ), sun_col, 0.3 * sun );
    col = mix( col, silk * ( 0.5 + 0.5 * sun ), spiral * 0.75 );
    col = mix( col, silk * ( 0.6 + 0.6 * sun ), radius * 0.85 );
    col += imgPalette( hue * 0.159 + float( band ) / 32.0 ) * radius * e * 1.2;
    // Dew: round drops on the spiral threads at hashed positions, sparkling.
    float thread_idx = floor( r / pitch - turns );
    vec2  dew_cell = vec2( thread_idx, floor( ( a + 3.14159 ) * 9.0 ) );
    float has_dew = step( 1.0 - dew_amt * 0.6, hash21( dew_cell ) );
    float along = fract( ( a + 3.14159 ) * 9.0 ) - 0.5;
    float dew_d = length( vec2( along * r * 0.7, ( r_turn - 0.5 ) * pitch ) );
    float dew = smoothstep( 0.009, 0.004, dew_d ) * has_dew * step( r, 0.72 * spiral_done ) * step( 0.06, r );
    vec3  dew_col = mix( vec3( 0.95, 0.98, 1.0 ), imgPalette( hue * 0.159 + 0.6 ), 0.2 );
    col = mix( col, dew_col * ( 0.7 + 0.5 * sun ), dew );
    col += dew_col * dew * hi * 1.2
           + dew_col * exp( -dew_d * 200.0 ) * has_dew * hi * 0.4 * step( r, 0.72 * spiral_done );
    // The hub and the spider.
    col = mix( col, vec3( 0.1, 0.08, 0.06 ), smoothstep( 0.03, 0.02, r ) * 0.9 );
    col *= 0.75 + 0.5 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
