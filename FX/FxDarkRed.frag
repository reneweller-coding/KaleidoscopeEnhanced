#version 330 core
out vec4 fragColor;
// FxDarkRed.frag
// Monochrome colour-tint overlay: desaturates the blended scene to
// luminance, then recolours it into a single channel (red/blue/green,
// picked by uniform) -- a stark, flat colour wash.
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform int red;
uniform int blue;


void main() {

    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.x;
	p.y /= resolution.y;
		
    vec3 colres = (interpolation * texture(tex0,p) + (1.0-interpolation)*texture(tex1, p)).xyz;
    float gray = dot( vec3( colres[0], colres[1], colres[2] ), vec3(0.3, 0.59, 0.11) );
    
    vec3 g = vec3( gray, gray, gray );
    vec3 colorMul = vec3( 0.0, 0.0, 0.0 );
    if( red > 0 )
		colorMul.x = 1.0;
	else if( blue > 0 )
		colorMul.y = 1.0;
	else
		colorMul.z = 1.0;
		
	vec3 res = colorMul * g;
    
    fragColor = vec4( res.x, res.y, res.z, 1.0 );

}