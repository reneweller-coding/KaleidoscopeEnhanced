#version 330 core
/*****************************************************************************\
 *                              SuperconductingVortexLatticeMelting.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  SUPERCONDUCTING VORTEX LATTICE MELTING: 60,000 magnetic flux quanta (Abrikosov vortices) in a high-Tc cuprate
 *  superconductor.
 *
 *  Ordered triangular vortex solid undergoes thermal melting into entangled vortex liquid and vortex glass phases
 *  with photo texturing.
 *
 *    audioAdvance -> accelerates thermal vortex fluctuations & vortex liquid drift velocity
 *    audioKick    -> flashes vortex depinning avalanches & flux-flow voltage spikes
 *    audioSwell   -> expands vortex melting puddle radius & superfluid density
 *    audioCentroid-> shifts vortex core normal-state electronic excitation spectra
 *
 *  Per-activation variety:
 *    pointGainP float point sprite base luminance gain (0.5..1.8)
 *    haloP      float gaussian core halo profile width (0.6..2.2)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vCol;          ///< Colour (from the vertex stage).
in float vMeltingState; ///< Melting state (from the vertex stage).
in float vPointSize;    ///< Point size (from the vertex stage).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;  ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).

uniform float pointGainP; ///< Point gain knob: point sprite base luminance gain (0.5..1.8).
uniform float haloP;      ///< Halo knob: gaussian core halo profile width (0.6..2.2).

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
    vec2  pc = gl_PointCoord - vec2( 0.5 );
    float r2 = dot( pc, pc );
    if ( r2 > 0.25 )
        discard;

    // Smooth gaussian point sprite
    float h_scale = ( haloP > 0.01 ? haloP : 1.2 );
    float core = exp( -r2 * 18.0 / h_scale );

    // Controlled low luminance per point sprite (V8c)
    float base_lum = ( pointGainP > 0.01 ? pointGainP : 0.08 ) * 0.38; // measured luma 0.021: was *0.12

    vec2 photo_uv = fract( gl_PointCoord + vMeltingState * 0.3 );
    vec3 photo = img( photo_uv );

    vec3 col = vCol * ( 0.6 + 0.4 * photo ) * core * base_lum;
    col += mix( vCol, vec3( 0.9, 0.95, 1.0 ), 0.35 ) * core * base_lum * ( 1.0 + 0.6 * audioKick ) * vMeltingState;
    col *= ( 0.85 + 0.35 * audioSwell );
    col += vCol * ( audioKick * 0.03 );

    // Soft knee compression
    col /= 1.0 + 0.35 * max( col.r, max( col.g, col.b ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
