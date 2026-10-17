#version 330 core
/*****************************************************************************\
 *                              RadiolarianSilicaLattice.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to RadiolarianSilicaLattice.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */
// RadiolarianSilicaLattice.vert — 3,000 transparent icosahedral silica skeleton
// cards floating in deep-sea suspension with crystalline glass refractions.
//   attrA.xy = corner u/v (0..1), attrA.w = quad index
//   attrB    = per-quad seeds

in vec4 attrA; ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an
               ///< index).
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since this activation, plus a rolled start (see sceneTime).

uniform float audioAdvance;  ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                             ///< backwards).
uniform float audioKick;     ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;     ///< Bass band level, 0..1.
uniform float audioCentroid; ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;     ///< High band level, 0..1.

uniform float     latticeP;       ///< Lattice knob, 0.5..2.
uniform float     scatterP;       ///< Scatter knob, 0.5..2.
uniform float     glowP;          ///< Glow / afterglow knob, 0..1.
uniform float     hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4 vCol;      ///< Colour (from the vertex stage).
out vec2 vUV;       ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vWorldPos; ///< World position (from the vertex stage).

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


/**  House tint: bend a colour toward the photo palette while keeping its luminance -- the identity look survives,
 * only the hue follows the photos.
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
    float qi = attrA.w;
    vec2  corner = attrA.xy - 0.5; // -0.5..0.5
    vec4  seeds = attrB;

    float ltc = ( latticeP > 0.0 ) ? latticeP : 1.0;
    float sct = ( scatterP > 0.0 ) ? scatterP : 1.0;
    float glw = ( glowP > 0.0 ) ? glowP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    // Concentric spherical shells of radiolarian micro-skeletons
    float shell_idx = floor( qi / 300.0 ); // 10 shells
    float slot_idx = mod( qi, 300.0 );

    // Golden spiral on sphere
    float phi = slot_idx * 2.3999632;
    float cos_theta = 1.0 - ( slot_idx / 300.0 ) * 2.0;
    float sin_theta = sqrt( max( 0.0, 1.0 - cos_theta * cos_theta ) );
    vec3  sphere_dir = vec3( cos( phi ) * sin_theta, sin( phi ) * sin_theta, cos_theta );

    float shell_radius = ( 2.5 + shell_idx * 1.4 ) * ltc + audioSwell * 1.2;
    float rot_speed = ( 0.8 / ( 1.0 + shell_idx * 0.3 ) ) * ( ( mod( shell_idx, 2.0 ) > 0.5 ) ? 1.0 : -1.0 );
    float angle = time * rot_speed * 0.4 + audioAdvance * 0.1;

    mat3 rot_y = mat3( cos( angle ), 0.0, sin( angle ), 0.0, 1.0, 0.0, -sin( angle ), 0.0, cos( angle ) );
    vec3 center_pos = rot_y * ( sphere_dir * shell_radius );

    // Dynamic kick burst
    center_pos += normalize( center_pos ) * audioSwell * 0.9;

    // Card orientation: facing outwards + tumbling
    vec3 normal = rot_y * sphere_dir;
    vec3 tangent = normalize( cross( normal, vec3( 0.0, 1.0, 0.0 ) ) );
    if ( length( tangent ) < 0.1 )
        tangent = vec3( 1.0, 0.0, 0.0 );
    vec3 bitangent = cross( normal, tangent );

    vec3 card_size = vec3( 0.75, 0.75, 0.0 );
    vec3 local_pos = tangent * ( corner.x * card_size.x ) + bitangent * ( corner.y * card_size.y );
    vec3 world_p = center_pos + local_pos;

    // Camera space
    // Camera pulled back: the outer shell (r~15 + swell + kick) must NEVER
    // reach the eye (user saw shells colliding with the camera).
    vec3 cam_pos = vec3( 0.0, 0.0, -23.0 );
    vec3 rel_p = world_p - cam_pos;
    rel_p.x -= eyeOff;

    gl_Position = projM * vec4( rel_p.x, rel_p.y, -rel_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = attrA.xy;
    vNormal = normal;
    vWorldPos = world_p;

    // Transparent silica glass palette (pale aqua, crystal amethyst, sunlight gold)
    vec3 col = palTint( mix( vec3( 0.2, 0.9, 1.0 ), vec3( 0.8, 0.4, 1.0 ), shell_idx / 10.0 ), 0.30 * shell_idx / 10.0,
                        0.55 );
    col = mix( col, vec3( 1.0, 0.95, 0.6 ), seeds.w );

    if ( hue > 0.001 )
        col = hueRot( col, hue );

    vCol = vec4( col, 1.0 );
}
