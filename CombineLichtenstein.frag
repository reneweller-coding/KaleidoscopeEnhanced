uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float size;


// Size of the quad in pixels
//const float size = 12.0;

// Radius of the circle
//const float radius = size * 0.5 * 0.75;

void main(void)
{
	// normalize to the center
	//vec2 p;
    //p.x = gl_FragCoord.x;
    //p.y = gl_FragCoord.y;
	//p.x /= resolution.x;
	//p.y /= resolution.y;	

	float radius = size * 0.5 * 0.75;

	// Current quad in pixels
	vec2 quadPos = floor(gl_FragCoord.xy / size) * size;
	// Normalized quad position
	vec2 quad = quadPos/resolution.xy;
	// Center of the quad
	vec2 quadCenter = (quadPos + size/2.0);
	// Distance to quad center	
	float dist = length(quadCenter - gl_FragCoord.xy);
	
	vec4 texel =  interpolation * texture2D(tex0,quad) + (1.0-interpolation)*texture2D(tex1, quad);
	if (dist > radius)
	{
		gl_FragColor = vec4(0.25);
	}
	else
	{
		gl_FragColor = texel;
	}
}