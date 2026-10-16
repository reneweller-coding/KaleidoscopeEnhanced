#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file FxDarkRed.frag
 * @brief Monochrome colour-tint overlay: desaturates the blended scene to
 * luminance, then recolours it into a single channel (red/blue/green,
 * picked by uniform) -- a stark, flat colour wash.
 */
uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform int       red;           ///< 1: recolour into red.
uniform float     audioBeat;     ///< beat lifts the wash brightness
uniform float     audioSwell;    ///< slow builds let the real colour bleed through
uniform int       blue;          ///< 1: recolour into blue.


/** Entry point of this shader stage (the file description says what it draws). */
void main()
{

    // normalize to the center
    vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
    p.x /= resolution.x;
    p.y /= resolution.y;

    vec3  colres = ( interpolation * texture( tex0, p ) + ( 1.0 - interpolation ) * texture( tex1, p ) ).xyz;
    float gray = dot( vec3( colres[0], colres[1], colres[2] ), vec3( 0.3, 0.59, 0.11 ) );

    vec3 g = vec3( gray, gray, gray );
    vec3 color_mul = vec3( 0.0, 0.0, 0.0 );
    if ( red > 0 )
        color_mul.x = 1.0;
    else if ( blue > 0 )
        color_mul.y = 1.0;
    else
        color_mul.z = 1.0;

    vec3 res = color_mul * g * ( 1.0 + 0.30 * audioBeat );
    res = mix( res, colres, 0.18 * audioSwell );

    fragColor = vec4( res.x, res.y, res.z, 1.0 );
}
