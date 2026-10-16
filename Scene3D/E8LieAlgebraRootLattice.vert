#version 330 core
/*****************************************************************************\
 *                              E8LieAlgebraRootLattice.vert
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Vertex stage companion to E8LieAlgebraRootLattice.frag -- see that file's header for this scene's description.
 *
 *  @author René Weller
 */

in vec4 attrA; ///< xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec3  vCol;      ///< Colour (from the vertex stage).
out float vWeight;   ///< Weight (from the vertex stage).
out vec3  vLocalPos; ///< Object-space position (from the vertex stage).

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

uniform float rootScaleP; ///< Root scale knob, 0.8..2.2.
uniform float cubeSizeP;  ///< Cube size knob, 0.04..0.16.

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
    vec3  corner = attrA.xyz;
    float c_index = attrA.w;
    vLocalPos = corner;

    float t = time * 0.35 + audioAdvance * 0.3;

    // E8 Lie group 240 root vectors projected into 3D
    // We construct 240 root positions via 8D rotation & projection
    float seed_idx = c_index;
    float phi = seed_idx * 0.1375 + t * 0.2;
    float theta = seed_idx * 0.2618 + audioPhase * 0.2;

    // Projection of 8D Gosset 4_21 polytope vertices
    float r = ( 1.2 + 0.6 * sin( seed_idx * 0.5 + t * 0.4 ) ) * ( rootScaleP > 0.01 ? rootScaleP : 1.0 );
    vec3  root_center = vec3(
        r * sin( theta ) * cos( phi ),
        r * sin( theta ) * sin( phi ),
        r * cos( theta ) );

    // Cube scaling and orientation
    float sz = ( cubeSizeP > 0.001 ? cubeSizeP : 0.08 ) * ( 1.0 + 0.4 * audioKick );
    vec3  cube_pos = root_center + corner * sz;

    vNormal = normalize( corner );
    float weight = sin( seed_idx * 0.3 + t );
    vWeight = weight;

    vCol = imgPalette( fract( c_index * 0.02 + audioCentroid ) );

    // Camera Transform (V3)
    vec3 vp = cube_pos;

    // Smooth 3D rotation
    float c = cos( t * 0.15 ), s = sin( t * 0.15 );
    vp = vec3( vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c );
    vp.z += 5.2;
    vp.x -= eyeOff;

    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
