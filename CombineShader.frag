uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;


void main()
{
    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.x;
	p.y /= resolution.y;
    
	gl_FragColor = interpolation * texture2D(tex0,p) + (1.0-interpolation)*texture2D(tex1, p);    
}