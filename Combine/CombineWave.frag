#version 330 core
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

void main(void)
{

	vec2 uv;
    uv.x = gl_FragCoord.x;
    uv.y = gl_FragCoord.y;
	uv.x /= resolution.x;
	uv.y /= resolution.y;


	//vec2 uv = 0.5*gl_FragCoord.xy / resolution.xy;

	//float d = length(uv);
	//vec2 st = uv;// + 0.2*vec2(cos(0.071*time+d),sin(0.073*time-d));
	//vec2 st = uv + 0.02*vec2(cos(0.071*time+d),sin(0.073*time-d));

    //vec3 col = interpolation * texture(tex0, st) + (1.0-interpolation)*texture(tex1, st).xyz;
    //float w = col.x;
	//vec3 col2 = 1.0-(interpolation * texture(tex0, 0.2*offset*uv + 0.1*offset*col.xy) + (1.0-interpolation)*texture(tex1, 0.2*offset*uv + 0.1*offset*col.xy)).xyz;
	//col *= w*2.0;
	
	//col = 0.5*(col+col2);
	//col *= 1.0 + 2.0*d;
	//col *= d;
	//fragColor = vec4(col,1.0);

	float offset = 0.2; //0.1
	float speed = 0.5;
	
	
	
	vec4 col = interpolation * texture(tex0, uv) + (1.0-interpolation)*texture(tex1, uv);  
  
	
	vec2 p = uv;
	
  float len = length(p);
  vec2 uv1 = p + offset * ((p/len)*cos(len*12.0-speed*time*4.0)*0.03);
  vec4 col2 = interpolation * texture(tex0, uv1) + (1.0-interpolation)*texture(tex1, uv1); 
  
  
	col = 0.5*(col+col2);
	fragColor = col;
	
	
}