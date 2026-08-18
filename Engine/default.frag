#version 330 core
/**
 * @file default.frag
 * @brief Fallback/placeholder fullscreen pass: renders a polar-coordinate kaleidoscope-style warp of tex0.
 *
 * Converts each fragment's centred screen position to polar form (radius r,
 * angle a) and remaps it to a UV where x is driven by 1/r plus a time-scrolled
 * offset and y by the normalised angle, producing a swirling tunnel-like
 * distortion of tex0 sampled at that UV. tex1 and tex2 plus a three-way blend
 * with interpValue are declared and were evidently used by an earlier version
 * of this pass (see the commented-out block below) but are unused in the
 * current main(); only tex0 and time actually affect the output.
 */
out vec4 fragColor;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D tex2;
uniform vec2 resolution;
uniform float interpValue; // interpolation value between original image and edge image

uniform float time;


void main(void)
{
    vec2 p = -1.0 + 2.0 * ( gl_FragCoord.xy / resolution.xy );
    vec2 uv;
   
    float a = atan(p.y,p.x);
    float r = sqrt(dot(p,p));

    uv.x = .75*time+.1/r;
    uv.y = a/3.1416;

    vec3 col =  texture(tex0,uv).xyz;
    
    //float xCoord = gl_FragCoord.x / resolution.x;
    //float yCoord = gl_FragCoord.y / resolution.y;

	//vec3 col =  0.3*texture(tex0, vec2( xCoord, yCoord) ).xyz + 0.3*texture(tex1, vec2( xCoord, yCoord) ).xyz
	// + 0.3*texture(tex2, vec2( xCoord, yCoord) ).xyz;
	

    fragColor = vec4(col,1.0);
 
}


