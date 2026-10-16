#version 330 core
/*****************************************************************************\
 *                              E8LieAlgebraRootLattice.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  E8 LIE ALGEBRA ROOT LATTICE: 240 root vectors of the exceptional 8D Lie group E8, projected into 3D as rotatable
 *  faceted Gosset polytope cube clusters with sharp Bragg reflections, edge bevel glows, and dynamic photo-palette
 *  mapping.
 *
 *    audioAdvance -> rotates 8D Lie algebra projection planes
 *    audioKick    -> flashes root lattice Bragg diffraction resonance peaks
 *    audioSwell   -> widens polytope cluster radius & facet luminance
 *    audioCentroid-> shifts root vector weight shell colors
 *
 *  Per-activation variety:
 *    rootScaleP float 8D polytope projection radius          (0.8..2.2)
 *    cubeSizeP  float root vertex cubelet facet size         (0.04..0.16)
 *    specularP  float faceted cube specular reflection gain  (0.8..2.5)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in vec3  vCol;      ///< Colour (from the vertex stage).
in float vWeight;   ///< Weight (from the vertex stage).
in vec3  vLocalPos; ///< Object-space position (from the vertex stage).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;  ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).

uniform float specularP; ///< Specular knob, 0..1.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec3  light_dir = normalize( vec3( 0.5, 0.7, 0.6 ) );
    float diff = max( 0.0, dot( vNormal, light_dir ) );
    float spec = pow( max( 0.0, dot( reflect( -light_dir, vNormal ), vec3( 0.0, 0.0, 1.0 ) ) ), 32.0 )
                 * ( specularP > 0.01 ? specularP : 1.2 );

    // Cubelet edge bevel glow
    vec3  a_pos = abs( vLocalPos );
    float edge_dist = max( max( a_pos.x, a_pos.y ), a_pos.z );
    float edge_glow = smoothstep( 0.42, 0.5, edge_dist );

    vec2 photo_uv = fract( vLocalPos.xy * 2.0 + 0.5 );
    vec3 photo = img( photo_uv );

    vec3 col = vCol * ( 0.6 + 0.4 * photo ) * ( 0.4 + 0.6 * diff );
    col += vec3( 0.95, 0.95, 1.0 ) * spec * ( 1.0 + 3.0 * audioKick );
    col += vCol * edge_glow * 1.5;
    col *= ( 0.85 + 0.35 * audioSwell );
    col += vCol * ( audioKick * 0.3 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
