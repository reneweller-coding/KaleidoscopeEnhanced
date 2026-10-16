#version 330 core
/*****************************************************************************\
 *                              GeomagneticDynamoCore.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  GEOMAGNETIC DYNAMO CORE: the flux-tube strings of a planetary dynamo - gold and teal filament ropes coiling in
 *  four concentric shells around the core's vertical rotation axis, camera orbiting close with a slow pitch, the
 *  whole thing suspended in a faint fog of dissolved field.
 *
 *    audioKick -> field-line surge    audioAdvance -> orbit + convection + fog drift
 *    audioBass/audioHigh -> flux-blob girth   audioSwell -> fog brightness
 *    (opaque sprite strings, source-level gains)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vWorldPos;    ///< World position (from the vertex stage).
in float vDynamoPhase; ///< Dynamo phase (from the vertex stage).
in float vHaze;        ///< Haze (from the vertex stage).
in vec2  vQuadUV;      ///< Quad UV (from the vertex stage).

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

uniform float dynamoP;   ///< Dynamo knob, 0.5..2.
uniform float coriolisP; ///< Coriolis knob, 0.5..2.
uniform float speedP;    ///< Speed knob, 0..1.
uniform float hueP;      ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Sprite profile
    vec2  pt = vQuadUV; // quad-local [-1,1]; see .vert
    float r2 = dot( pt, pt );
    if ( r2 > 1.0 )
        discard;
    // These sprites are OPAQUE (geom="indirect" draws depth-tested, unblended),
    // so a steep falloff does not add up into a glow -- it just leaves a dark
    // occluding rim.  A gentle profile keeps each blob a solid speck.
    float glow = exp( -r2 * 2.0 );

    // Photo texture mapping from world coords
    vec2 photo_uv = fract( vWorldPos.xy * 0.25 + 0.5 );
    vec3 photo = img( photo_uv );

    // Molten iron dynamo gold & electric magnetic cyan palette
    vec3 iron_gold = vec3( 1.0, 0.75, 0.2 );
    vec3 field_cyan = vec3( 0.1, 0.9, 1.0 );
    vec3 core_color = mix( iron_gold, field_cyan, sin( vDynamoPhase * 12.56 + audioPhase ) * 0.5 + 0.5 );

    vec3 col;
    if ( vHaze > 0.5 )
    {
        // Dissolved field: the same palette, far dimmer, no hot core -- a
        // background layer that carries the empty corners without lifting the
        // picture toward grey.
        photo_uv = fract( vWorldPos.xy / max( vWorldPos.z, 1.0 ) * 0.7 + 0.5 );
        photo = img( photo_uv );
        col = mix( core_color, photo, 0.35 ) * glow
              * ( 0.075 + 0.055 * audioSwell + 0.045 * audioKick );
    }
    else
    {
        col = mix( photo, core_color, 0.6 ) * glow;
        // Hot core TINTED by the palette (the white additive term drowned the
        // gold/cyan; metric scan: saturation 0.00).
        col += glow * mix( core_color, vec3( 1.0, 0.98, 0.85 ), 0.35 )
               * min( 0.35 + audioKick * 0.55, 1.0 );
    }

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    // Soft-knee exposure — hot audio compresses instead of clipping the whole
    // frame to white.  The old (col * 0.9) * 0.55 pre-gain was a leftover from
    // an earlier exposure pass: it halved an already sparse picture and was
    // most of why this scene measured at luma 0.013.
    vec3 cat_tone = col;
    cat_tone /= 1.0 + 0.42 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
