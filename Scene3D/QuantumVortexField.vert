#version 330 core
/**
 * @file QuantumVortexField.vert
 * @brief Vertex stage companion to QuantumVortexField.frag -- see that file's header for
 * this scene's description.
 */
// QuantumVortexField.vert — Indirect render pass for compute magnetic filaments
in vec4 attrA; ///< xyz = world pos, w = hue
in vec4 attrB; ///< xyz = normal, w = glow

uniform mat4  projM;              ///< Projection matrix.
uniform float eyeOff;             ///< Stereo eye offset (0 in mono).
uniform float time;               ///< Seconds since the program started (never reset; see sceneTime).
uniform float audioAdvance;       ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                  ///< backwards).
uniform float     audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float     hueP;           ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;           ///< The current photo.
uniform sampler2D tex1;           ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation;  ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float     audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4 vCol;    ///< Colour (from the vertex stage).
out vec3 vNormal; ///< Surface normal (from the vertex stage).
out vec3 vWorld;  ///< World position (from the vertex stage).

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
    vec3  world_p = attrA.xyz;
    float hue = attrA.w;
    vec3  norm = attrB.xyz;
    float glow = attrB.w;

    // Orbiting Camera
    float cam_angle = time * 0.15 + audioAdvance * 0.05;
    float cam_dist = 26.0 - audioSwell * 5.0;
    vec3  cam_pos = vec3( sin( cam_angle ) * cam_dist, 14.0 + 3.0 * sin( time * 0.2 ), cos( cam_angle ) * cam_dist );
    vec3  look_target = vec3( 0.0, 0.0, 0.0 );

    vec3 ww = normalize( look_target - cam_pos );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    vec3 rel_p = world_p - cam_pos;
    vec3 view_p = vec3( dot( rel_p, uu ), dot( rel_p, vv ), dot( rel_p, ww ) );

    view_p.x -= eyeOff;
    gl_Position = projM * vec4( view_p.x, view_p.y, -view_p.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Quantum flux ribbon color: Cyan, Violet, Gold
    vec3 flux_col = imgPalette( 0.30 * hue ) * 1.4;
    flux_col = mix( flux_col, vec3( 1.0, 0.8, 0.2 ), 0.28 * ( sin( hue * 6.28 + time ) * 0.5 + 0.5 ) );

    float h = ( hueP > 0.0 ) ? hueP : 0.0;
    if ( h > 0.001 )
        flux_col = hueRot( flux_col, h );

    vCol = vec4( flux_col * glow, 1.0 );
    vNormal = norm;
    vWorld = world_p;
}
