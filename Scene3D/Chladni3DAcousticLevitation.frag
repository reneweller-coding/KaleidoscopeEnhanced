#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file Chladni3DAcousticLevitation.frag
 * @brief CHLADNI 3D ACOUSTIC LEVITATION: 3D acoustic levitation in a multi-emitter ultrasound
 * standing wave array. Thousands of levitating microparticle clusters fill the whole working
 * volume of the chamber, trapped on the 3D Chladni acoustic Gor'kov radiation force nodal
 * surfaces, with ultrasonic field glows and photo texturing.
 *   audioAdvance -> navigates 3D acoustic trap focal shifting & particle rotation
 *   audioKick    -> flashes ultrasonic standing wave acoustic pressure antinode bursts
 *   audioSwell   -> enriches acoustic radiation force field strength & particle glow
 *   audioCentroid-> shifts ultrasonic Gor'kov potential color spectra
 *
 * Per-activation variety:
 *   particleSizeP float microparticle cluster cube size      (0.03..0.12)
 *   specularP     float particle facet specular highlight    (0.8..2.5)
 */

in vec3  vNormal; ///< Surface normal (from the vertex stage).
in vec3  vCol;    ///< Colour (from the vertex stage).
in float vAcousticNode;
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
    vec3  light_dir = normalize( vec3( 0.5, 0.6, 0.7 ) );
    float diff = max( 0.0, dot( vNormal, light_dir ) );
    float spec = pow( max( 0.0, dot( reflect( -light_dir, vNormal ), vec3( 0.0, 0.0, 1.0 ) ) ), 24.0 )
                 * ( specularP > 0.01 ? specularP : 1.2 );

    vec3  a_pos = abs( vLocalPos );
    float edge_glow = smoothstep( 0.42, 0.5, max( max( a_pos.x, a_pos.y ), a_pos.z ) );

    vec2 photo_uv = fract( vLocalPos.xy * 2.0 + 0.5 );
    vec3 photo = img( photo_uv );

    vec3 col = vCol * ( 0.6 + 0.4 * photo ) * ( 0.4 + 0.6 * diff );
    col += vec3( 0.95, 0.95, 1.0 ) * spec * ( 1.0 + 3.0 * audioKick );
    col += vCol * edge_glow * 1.5;
    col *= ( 0.85 + 0.35 * audioSwell );
    col += vCol * ( audioKick * 0.3 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    col *= 3.06; // measured-dark lift (visual pass)
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
