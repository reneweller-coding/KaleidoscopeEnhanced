#version 330 core
/*****************************************************************************\
 *                              BismuthFerriteMultiferroicDomains.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to BismuthFerriteMultiferroicDomains.frag -- see that file's header for this scene's
 *  description.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< xy = corner UV [0,1], z = 0, w = quad index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2  vUV;         ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNormal;     ///< Surface normal (from the vertex stage).
out vec3  vCol;        ///< Colour (from the vertex stage).
out float vDomainType; ///< Domain type (from the vertex stage).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float domainScaleP; ///< Domain scale knob, 0.12..0.35.
uniform float stepHeightP;  ///< Step height knob, 0.04..0.18.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    // Remap quad corner UV [0,1] to centered [-1,1] domain
    vec2 local_corner = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    float q_index = attrA.w;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Multiferroic domain grid arrangement (71, 109, 180 degree ferroelectric domains)
    float grid_dim = 16.0;
    float ix = mod( q_index, grid_dim );
    float iy = floor( q_index / grid_dim );

    // Domain type classification (0, 1, 2)
    float domain_type = mod( ix + iy * 2.0 + floor( t * 0.2 ), 3.0 );
    vDomainType = domain_type;

    // Domain terrace step heights
    float step_h = ( stepHeightP > 0.001 ? stepHeightP : 0.08 ) * ( 1.0 + 0.5 * audioSwell );
    float z_step = ( domain_type * step_h ) + sin( ix * 0.5 + t ) * 0.04;

    float scale = ( domainScaleP > 0.01 ? domainScaleP : 0.22 );
    vec2  center_pos = ( vec2( ix, iy ) - grid_dim * 0.5 ) * scale;

    // Quad orientation based on ferroelectric polarization direction
    float pol_angle = domain_type * 1.2566 + audioPhase * 0.3;
    float cp = cos( pol_angle ), sp = sin( pol_angle );
    vec2  rot_corner = vec2( local_corner.x * cp - local_corner.y * sp, local_corner.x * sp + local_corner.y * cp )
                       * ( scale * 0.48 );

    vec3 world_pos = vec3( center_pos + rot_corner, z_step );

    vNormal = normalize( vec3( sp * 0.3, cp * 0.3, 1.0 ) );
    vCol = imgPalette( fract( domain_type * 0.33 + q_index * 0.01 + audioCentroid ) );

    // Camera Transform (V3)
    vec3 vp = world_pos;
    vp.z += 4.5;
    vp.x -= eyeOff;

    // Isometric tilt
    float tilt = 0.65;
    float c = cos( tilt ), s = sin( tilt );
    vp = vec3( vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c );

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
