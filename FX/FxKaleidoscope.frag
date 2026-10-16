#version 330 core
/*****************************************************************************\
 *                              FxKaleidoscope.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  FX KALEIDOSCOPE: classic radial mirror-fold -- the polar angle is wrapped and mirrored into "sides" repeating
 *  wedges, slowly rotating.
 *
 *  @author René Weller
 */
out vec4          fragColor;     ///< The pixel's colour (output).
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float     speed;         ///< Speed of the motion.
uniform int       sides;         ///< Number of mirror sides.
uniform float     audioPhase;    ///< music advances the fold rotation
uniform float     audioSwell;    ///< Slow loudness envelope, 0..1 (seconds).


/** Entry point of this shader stage (the file description says what it draws). */
void main()
{

    // normalize to the center
    vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
    p.x /= resolution.y;
    p.y /= resolution.y;
    p.x -= 0.5 * resolution.x / resolution.y;
    p.y -= 0.5;

    p = 4.0 * ( 1.0 - 0.08 * audioSwell ) * p;

    // cartesian to polar coordinates
    float r = length( p );
    float a = atan( p.y, p.x );

    // kaleidoscope
    float sides_k = .5 * float( sides );
    float tau = 1. * 1.047;
    a = mod( a, tau / sides_k );
    a = abs( a - tau / sides_k / 2. );
    a += time * speed + 0.15 * audioPhase; // rotate, music adds spin

    // polar to cartesian coordinates
    p = r * vec2( cos( a ), sin( a ) );

    fragColor = interpolation * texture( tex0, p + 0.5 ) + ( 1.0 - interpolation ) * texture( tex1, p + 0.5 );
}
