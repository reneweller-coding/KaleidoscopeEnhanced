#version 330 core
/*****************************************************************************\
 *                              OceanAbyssalBrinePool.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  OCEAN ABYSSAL BRINE POOL: a deep-sea brine basin seen from above, the camera slowly ORBITING the pool;
 *  hypersaline internal waves shimmer in photo-palette colours against the abyssal blue shore.
 *
 *    audioKick -> halocline shimmer    audioBass -> internal waves
 *    audioAdvance -> orbit
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3 vWorldPos; ///< World position (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec2 vTexCoord; ///< Texture coordinate (from the vertex stage).

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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float brineP;     ///< Brine knob, 0.5..2.
uniform float haloclineP; ///< Halocline knob, 0.5..2.
uniform float speedP;     ///< Speed knob, 0..1.
uniform float hueP;       ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float time;       ///< Seconds since this activation, plus a rolled start (see sceneTime).

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Photo texture mapping onto deep-sea water surface
    vec3 photo = img( vTexCoord );

    // Deep abyssal water with the brine pool glowing in photo colours
    vec3 deep_water = vec3( 0.01, 0.1, 0.25 );
    vec3 brine_glow = imgPalette( 0.12 ) * 1.3;
    vec3 halocline_refract = imgPalette( 0.55 ) * 1.2;

    float r = length( vWorldPos.xz );
    float is_brine = smoothstep( 1.8, 0.6, r );

    // Halocline shimmering waves
    float shimmer = pow( abs( sin( vTexCoord.x * 25.0 + vTexCoord.y * 25.0 + time * 3.0 ) ), 6.0 );

    vec3 water_col = mix( deep_water, brine_glow, is_brine );
    vec3 col = mix( photo * 0.8, water_col, 0.5 );
    col += shimmer * halocline_refract * ( 0.8 + audioKick * 0.9 );

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    col /= 1.0 + 0.32 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( col, 1.0 );
}
