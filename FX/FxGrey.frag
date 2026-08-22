#version 330 core
out vec4 fragColor;
/**
 * @file FxGrey.frag
 * @brief Flat greyscale desaturation of the blended scene -- no motion, no params.
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioBeat;    // beats let a whisper of colour through
uniform float audioSwell;


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