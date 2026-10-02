#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FxGrey.frag
 * @brief Flat greyscale desaturation of the blended scene -- no motion, no params.
 */
uniform vec2 resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioBeat;    ///< beats let a whisper of colour through
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).


/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {

    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.x;
	p.y /= resolution.y;
		
    vec3 colres = (interpolation * texture(tex0,p) + (1.0-interpolation)*texture(tex1, p)).xyz;
    float gray = dot( vec3( colres[0], colres[1], colres[2] ), vec3(0.3, 0.59, 0.11) );
    vec3 res = mix( vec3(gray), colres, 0.30*audioBeat + 0.12*audioSwell );
    fragColor = vec4( res, 1.0 );

}