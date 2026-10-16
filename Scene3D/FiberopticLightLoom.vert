#version 330 core
/*****************************************************************************\
 *                              FiberopticLightLoom.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to FiberopticLightLoom.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */
// FiberopticLightLoom.vert — 20 woven fiberoptic ribbons flowing in 3D
// warp-and-weft patterns transmitting high-speed data pulse packets.
//   attrA.x = t along ribbon, attrA.y = side (-1/+1), attrA.w = ribbon index
//   attrB   = per-ribbon seeds

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioHigh;      ///< High band level, 0..1.

uniform float     weaveP;        ///< Weave knob, 0.5..2.
uniform float     densityP;      ///< Density knob, 0..1.
uniform float     widthP;        ///< Width knob, 0..1.
uniform float     hueP;          ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioValence;  ///< Mood valence: 0 dark .. 1 bright.

out vec4  vCol;    ///< Colour (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).
out float vLength; ///< Length (from the vertex stage).

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
    float t = attrA.x;    // 0..1 along ribbon
    float side = attrA.y; // -1..+1
    float ri = attrA.w;   // 0..19

    float wv = ( weaveP > 0.0 ) ? weaveP : 1.0;
    float den = ( densityP > 0.0 ) ? densityP : 1.0;
    float wid = ( widthP > 0.0 ) ? widthP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    const float L = 160.0;
    float       cam_z = time * 7.5 + audioAdvance * 15.0;
    float       z_rel = t * L;
    float       z_abs = z_rel + cam_z;

    // Loom coordinate: ribbons split into warp (horizontal) and weft (vertical)
    float is_warp = ( mod( ri, 2.0 ) < 1.0 ) ? 1.0 : -1.0;
    float lane = ( ri - 10.0 ) * 0.9 * den;

    // Harmonic 3D weave undulation
    float weave_offset = sin( z_abs * 0.08 * wv + lane * 1.5 ) * is_warp * 1.6;
    float kick_undulate = sin( z_abs * 0.12 - time * 6.0 ) * audioKick * 1.4;

    vec3 center_pos = vec3(
        ( is_warp > 0.0 ) ? lane * 1.5 : weave_offset * 1.5,
        ( is_warp < 0.0 ) ? lane * 1.5 : weave_offset * 1.5 + kick_undulate,
        z_rel );

    vec3  tangent_dir = ( is_warp > 0.0 ) ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
    float ribbon_width = ( 0.35 * wid ) * ( 1.0 + 0.3 * audioKick );
    vec3  world_p = center_pos + tangent_dir * ( side * ribbon_width );

    // Camera space
    vec3 cam_pos = vec3( 0.0, 0.0, 0.0 );
    vec3 rel_p = world_p - cam_pos;
    rel_p.x -= eyeOff;

    gl_Position = projM * vec4( rel_p.x, rel_p.y, -rel_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vSide = side;
    vLength = t;

    // Optical pulse packet
    float pulse = fract( z_abs * 0.06 - time * 4.5 - ri * 0.1 );
    float pulse_glow = exp( -pulse * 6.0 ) * 2.5;

    // Fiberoptic cyan, violet, neon gold palette
    vec3 col = imgPalette( ( ri * 0.5 + time ) * 0.159 ) * 1.5;
    col = mix( col, vec3( 1.0, 0.9, 0.2 ), pulse_glow * 0.5 );

    if ( audioChromaHue != 0.0 )
        if ( hue > 0.001 )
            col = hueRot( col, hue );

    vCol = vec4( col * ( 1.0 + pulse_glow + audioHigh * 0.8 ), 1.0 );
}
