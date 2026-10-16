#version 330 core
/*****************************************************************************\
 *                              HarmonicChangeLightning.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  HARMONIC CHANGE LIGHTNING: a still night over a dark sea.
 *
 *  Nothing moves but the clouds' slow drift -- until the harmony changes: then a bolt strikes, and its branching is
 *  the chroma vector, twelve limbs whose lengths are the twelve pitch classes, so every chord change draws a
 *  different tree of light.  The bolt lights the clouds from within and mirrors in the water.  All light, no
 *  motion; the camera never moves.
 *
 *  Audio Reactivity:
 *    audioHarmChange -> the strike (envelope, light)
 *    audioChroma[12] -> the branching of the bolt
 *    audioKick       -> distant sheet lightning in the clouds (light)
 *    audioSwell      -> cloud glow (slow)
 *    sceneAdvance    -> cloud drift, the strike point wanders slowly
 *
 *  Per-activation variety: heightP (cloud base), seaP (sea brightness), hueP.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneAdvance;    ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;       ///< Seconds since this scene was activated.
uniform float audioAdvance;    ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                               ///< backwards).
uniform float audioHarmChange; ///< Harmonic change (chord change) envelope, 0..1.
uniform float audioChroma[12]; ///< Pitch-class energies (12 values).
uniform float audioKick;       ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;      ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;      ///< Overall loudness, 0..1.
uniform float audioChromaHue;  ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;    ///< Mood valence: 0 dark .. 1 bright.

uniform float heightP; ///< Height knob, 0..1.
uniform float seaP;    ///< Sea knob: sea brightness, 0..1.
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
/**  Smooth 2D value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise2( vec2 p )
{
    vec2 i = floor( p ), f = fract( p );
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
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        v += a * noise2( p );
        p = p * 2.03 + 9.0;
        a *= 0.5;
    }
    return v;
}

/**  Distance from p to a jagged segment a->b (jitter along its length).
 *
 * @param p     The point. (in)
 * @param a     Start of the segment. (in)
 * @param b     Its end. (in)
 * @param seed  Seed of the jitter. (in)
 *
 * @return
 *   The distance.
 **/
float segDist( vec2 p, vec2 a, vec2 b, float seed )
{
    vec2  ab = b - a;
    float t = clamp( dot( p - a, ab ) / max( dot( ab, ab ), 1e-6 ), 0.0, 1.0 );
    // Jag: a noise displacement perpendicular to the segment.
    vec2  nrm = normalize( vec2( -ab.y, ab.x ) + 1e-5 );
    float jag = ( noise2( vec2( t * 9.0 + seed * 13.0, seed ) ) - 0.5 ) * 0.06 * length( ab );
    vec2  q = a + ab * t + nrm * jag;
    return length( p - q );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2  p = ( gl_FragCoord.xy / resolution - 0.5 ) * vec2( aspect, 1.0 );

    float       hue = ( hueP > 0.001 ) ? hueP : 0.0;
    float       cloud_base = 0.15 + 0.2 * clamp( heightP, 0.0, 1.0 );
    float       sea_bright = 0.4 + 0.6 * clamp( seaP, 0.0, 1.0 );
    float       strike = clamp( audioHarmChange * 1.6, 0.0, 1.0 );
    const float horizon = -0.12;

    // The bolt: from a cloud point down to the sea, then twelve limbs whose
    // lengths follow the chroma classes.  The strike point wanders slowly.
    vec2  top = vec2( 0.35 * sin( sceneAdvance * 0.11 ), 0.42 );
    vec2  bottom = vec2( top.x + 0.1 * sin( sceneAdvance * 0.07 + 1.0 ), horizon );
    float d_bolt = 1e9;
    d_bolt = min( d_bolt, segDist( p, top, bottom, 1.0 ) );
    for ( int k = 0; k < 12; ++k )
    {
        float fk = float( k );
        float e = clamp( audioChroma[k], 0.0, 1.0 );
        float s = 0.15 + 0.85 * fk / 11.0; // where on the trunk the limb leaves
        vec2  a = mix( top, bottom, s );
        float ang = ( hash11( fk * 3.7 ) - 0.5 ) * 2.4 + ( mod( fk, 2.0 ) < 0.5 ? 0.6 : -0.6 );
        vec2  b = a + vec2( sin( ang ), -abs( cos( ang ) ) * 0.6 ) * ( 0.05 + 0.35 * e );
        d_bolt = min( d_bolt, segDist( p, a, b, fk + 2.0 ) + 0.002 * ( 1.0 - e ) );
    }
    float core = exp( -d_bolt * d_bolt * 12000.0 );
    float glow = exp( -d_bolt * 18.0 );
    vec3  bolt_col = mix( vec3( 0.85, 0.9, 1.0 ), imgPalette( hue * 0.159 + 0.6 ), 0.3 );

    vec3  col;
    float clouds = fbm( vec2( p.x * 2.0 + sceneAdvance * 0.02, p.y * 4.0 ) );
    if ( p.y > horizon )
    {
        // Night sky: cloud deck lit from within by the strike and by distant
        // sheet lightning on the kick; stars above the deck.
        float deck = smoothstep( cloud_base, cloud_base + 0.25, clouds + ( p.y - horizon ) * 0.4 );
        vec3  sky = imgPalette( hue * 0.159 + 0.62 ) * 0.05;
        vec2  cell = floor( p * 80.0 );
        vec2  f = fract( p * 80.0 ) - 0.5;
        sky += vec3( step( 0.985, hash21( cell ) ) * exp( -dot( f, f ) * 9.0 ) ) * 0.5 * ( 1.0 - deck );
        vec3  cloud_col = imgPalette( hue * 0.159 + 0.55 ) * ( 0.08 + 0.15 * clamp( audioSwell, 0.0, 1.0 ) );
        float lit = strike * exp( -length( p - top ) * 2.5 ) * 1.2 + audioKick * 0.35 * clouds;
        cloud_col += vec3( 0.8, 0.85, 1.0 ) * lit * clouds;
        col = mix( sky, cloud_col, deck );
        col += bolt_col * ( core * 5.0 + glow * 1.0 ) * strike;
    }
    else
    {
        // Sea: the sky mirrored, broken by waves; the bolt mirrored too.
        vec2  pm = vec2( p.x, horizon - ( p.y - horizon ) );
        float wave = noise2( vec2( p.x * 30.0, p.y * 90.0 - sceneTime * 0.5 ) ) * 0.02;
        float d_ref = 1e9;
        d_ref = min( d_ref, segDist( pm + vec2( wave, 0.0 ), top, bottom, 1.0 ) );
        float core_r = exp( -d_ref * d_ref * 4000.0 );
        float glow_r = exp( -d_ref * 12.0 );
        vec3  sea = imgPalette( hue * 0.159 + 0.6 ) * 0.06 * sea_bright;
        sea += img( fract( vec2( p.x * 0.5 + 0.5, ( p.y - horizon ) * 2.0 ) ) ) * 0.05 * sea_bright;
        sea += bolt_col * ( core_r * 1.2 + glow_r * 0.4 ) * strike * sea_bright;
        sea += vec3( 0.8, 0.85, 1.0 ) * audioKick * 0.08 * sea_bright;
        // Darker toward the camera (the sea foreground).
        col = sea * ( 1.0 - 0.6 * smoothstep( horizon, -0.6, p.y ) );
    }
    col *= 0.85 + 0.3 * audioLevel;

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
