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


void main() {

    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.x;
	p.y /= resolution.y;
		
    vec3 colres = (interpolation * texture(tex0,p) + (1.0-interpolation)*texture(tex1, p)).xyz;
    float gray = dot( vec3( colres[0], colres[1], colres[2] ), vec3(0.3, 0.59, 0.11) );
    fragColor = vec4( gray, gray, gray, 1.0 );

}