#version 330 core
/*****************************************************************************\
 *                              LiquidMetal.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Screen-space fluid rendering of 64k cohesive metal particles as drops of molten, reflective metal.
 *
 *  texMetal's density, compute-splatted by CfxMetalStep, is saturated into a coverage and averaged over a disc into
 *  a height with a liquid rim; the slope of that height gives the surface normal used for specular highlights, a
 *  dark outline, a shadow and a mirrored, magnified photo reflection with a chrome horizon, so the metal mirrors
 *  the room it sits in.  audioKick and audioHigh intensify the specular highlight, audioBeat adds a light overall
 *  pulse, and the highlight/reflection tint comes from an imgPalette arc sampled from the photo, rotated by
 *  audioChromaHue and audioAdvance with audioValence setting its saturation.
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).
// LiquidMetal.frag — screen-space fluid rendering.  Engine/CfxMetalStep.comp
// splats 64k cohesive particles into a DENSITY field (alpha channel, with
// mipmaps); the surface is reconstructed here from a smoothed coverage of that
// density, and the slope of its height is the normal.

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D texMetal;      ///< <- requests the liquid-metal sim
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioBeat;      ///< Beat envelope, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float     shineP;       ///< Shine knob, 0.4..0.9.
uniform float     thickP;       ///< Thick knob, 0.3..0.8.
uniform sampler2D tex1;         ///< The next photo (cross-faded in by interpolation).
uniform float     audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                ///< backwards).
uniform float audioValence;     ///< Mood valence: 0 dark .. 1 bright.

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

/**  How much metal covers a point: the splat density pre-averaged over about six canvas pixels (mipmap level 2.5),
 *   in units of the inside of a drop (where the particles' discs add up to about 12), clamped to 1.
 *
 * @param uv  The coordinate. (in)
 *
 * @return
 *   The coverage, 0..1, a smooth ramp across the rim.
 **/
float cover( vec2 uv )
{
    return clamp( textureLod( texMetal, uv, 2.5 ).a / 12.0, 0.0, 1.0 );
}

/**  The metal's height: its coverage averaged over a disc of about 12 canvas pixels (17 taps on two rings), shaped
 *   by a square root -- a liquid rim, steep at the edge and flat on top of a large drop.
 *
 *   It replaced the raw density (17.10.2026), whose gradient was the particles' grain: every pixel's normal pointed
 *   elsewhere and the metal read as a rippled sheet of noise.
 *
 * @param uv  The coordinate. (in)
 * @param tx  One canvas pixel in uv. (in)
 *
 * @return
 *   The height, 0..1.
 **/
float height( vec2 uv, vec2 tx )
{
    float h = 2.0 * cover( uv );
    for ( int k = 0; k < 8; ++k )
    {
        float a = float( k ) * 0.7853982;
        vec2  o = vec2( cos( a ), sin( a ) ) * tx;
        h += cover( uv + o * 5.0 ) + cover( uv + vec2( -o.y, o.x ) * 0.7071 * 11.0 + o * 0.7071 * 11.0 );
    }
    return sqrt( h / 18.0 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 tx = 1.0 / vec2( textureSize( texMetal, 0 ) );

    float hc = height( uv, tx );
    // The silhouette from the sharper density (level 1), so the rim stays crisp.
    float surf = smoothstep( 2.0, 6.0, textureLod( texMetal, uv, 1.0 ).a ) * smoothstep( 0.2, 0.45, hc );

    // Normal from the height's slope -- the drop's rounded rim.
    float dx = height( uv + vec2( tx.x * 2.0, 0.0 ), tx ) - height( uv - vec2( tx.x * 2.0, 0.0 ), tx );
    float dy = height( uv + vec2( 0.0, tx.y * 2.0 ), tx ) - height( uv - vec2( 0.0, tx.y * 2.0 ), tx );
    vec3  n = normalize( vec3( -dx * ( 3.0 + 3.0 * thickP ), -dy * ( 3.0 + 3.0 * thickP ), 1.0 ) );

    vec3 V = vec3( 0.0, 0.0, 1.0 );
    vec3 L = normalize( vec3( 0.5 * sin( time * 0.13 ), 0.5 * cos( time * 0.10 ), 0.85 ) );
    vec3 hv = normalize( L + V );

    float spec = pow( max( dot( n, hv ), 0.0 ), 45.0 + 90.0 * shineP );
    float fres = pow( 1.0 - max( dot( n, V ), 0.0 ), 2.5 );

    // The room the metal reflects: the photo mirrored and magnified about the middle, bent by the normal -- a flat
    // drop top shows a turned copy of the room, not a hole cut into the background photo.
    vec3 R = reflect( -V, n );
    vec3 refl = img( clamp( vec2( 0.5 ) - ( uv - 0.5 ) * 0.55 + R.xy * 0.35, 0.0, 1.0 ) );
    // A chrome horizon: the light from above, the dark floor below, so even a flat top has a gradient.
    float sky = smoothstep( -0.6, 0.9, R.y - ( uv.y - 0.5 ) * 0.6 );
    vec3  tint = imgPalette( 0.0 );
    vec3  env = refl * ( 0.45 + 0.55 * sky ) + tint * 0.18 * sky;

    vec3 metal = vec3( 0.02 ) + env * ( 0.55 + 0.75 * fres )
                 + tint * 1.35 * spec * ( 1.2 + 1.2 * audioKick + 0.5 * audioHigh );
    // The rim darkens where the surface turns away: the drop's outline.
    metal *= 0.55 + 0.45 * smoothstep( 0.0, 0.5, n.z );

    // Background: the photo, dimmed, so the drops read as sitting in a room.
    vec3 bg = texture( tex0, uv ).rgb;
    bg = mix( vec3( dot( bg, vec3( 0.33 ) ) ), bg, 0.5 ) * 0.16;
    // The drop's shadow, a little below it.
    bg *= 1.0 - 0.5 * smoothstep( 0.2, 0.7, height( uv + vec2( 0.0, tx.y * 8.0 ), tx ) );

    vec3 col = mix( bg, metal, surf );
    col *= 1.0 + 0.15 * audioBeat;

    col = col / ( 1.0 + col * 0.28 );
    fragColor = vec4( col, interpolation );
}
