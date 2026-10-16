#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file Datamosh.frag
 * @brief Datamosh glitch: RGB-split, stuttering block-shifted 'corrupted
 * P-frame' look, most intense mid-fade.
 *
 * Scene TRANSITION shader (Transitions/): blends the outgoing scene
 * (tex0) into the incoming one (tex1) over one cross-fade.
 * interpolation: 1 = old scene fully visible .. 0 = new scene.
 * Extracted from the former FxPlain.frag 28-style library.
 */
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.


const float Pi = 3.14159265358979; ///< Pi.

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p2  The input. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hashT( vec2 p2 )
{
    return fract( sin( dot( p2, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2  p = gl_FragCoord.xy / resolution;
    float d = 1.0 - interpolation; // transition progress 0..1
    // No beat surge any more: pushing the progress forward on every beat
    // made the geometry jump in time with the music (speed pass 14.09.2026).
    float mid = sin( Pi * d ); // 0 at both ends, 1 mid-transition
    // mid follows the progress only: a rotation, zoom or push that breathes with
    // the music is what the no-shake rule forbids, however slow the envelope.

    // Stutter clock: block offsets HOLD for a few frames, then jump - a
    // continuous animation would read as a wave, not a corrupted codec.
    // Everything is gated by `mid` (0 at both ends) so identity holds
    // exactly at d=0/d=1 regardless of the (time-based) stutter phase.
    float glitch_t = floor( time * 8.0 );
    float row_h = 1.0 / ( 18.0 + 14.0 * hashT( vec2( glitch_t, 0.7 ) ) );
    float row = floor( p.y / row_h );
    float rn = hashT( vec2( row, glitch_t ) );

    // `active` is a RESERVED word in the GLSL spec, like `half` -- NVIDIA
    // accepts it as an identifier, a conformant compiler need not.
    float on_row = step( 0.55, rn ) * mid;
    float shift = ( hashT( vec2( row, glitch_t + 3.1 ) ) - 0.5 ) * 0.12 * on_row;

    vec2 pr = clamp( vec2( p.x + shift, p.y ), 0.0, 1.0 );
    vec2 pg = clamp( vec2( p.x + shift * 0.4, p.y ), 0.0, 1.0 );
    vec2 pb = clamp( vec2( p.x - shift * 0.7, p.y ), 0.0, 1.0 );

    // A handful of blocks briefly "stick" on the old frame even as the
    // fade progresses - the classic moshed P-frame smear.
    float stuck = step( 0.93, hashT( vec2( row, glitch_t + 7.0 ) ) ) * mid;
    float w_local = mix( d, d * 0.15, stuck );

    float r_c = mix( texture( tex0, pr ).r, texture( tex1, pr ).r, w_local );
    float g_c = mix( texture( tex0, pg ).g, texture( tex1, pg ).g, w_local );
    float b_c = mix( texture( tex0, pb ).b, texture( tex1, pb ).b, w_local );
    fragColor = vec4( r_c, g_c, b_c, 1.0 );
}
