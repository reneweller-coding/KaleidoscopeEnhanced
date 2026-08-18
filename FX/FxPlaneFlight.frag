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
    vec2 p = -1.0+2.0*gl_FragCoord.xy/resolution.xy;
    
    p*= 2.0;
    
    float an = time*0.1;
    float x = p.x*cos(an)-p.y*sin(an);
    float y = p.x*sin(an)+p.y*cos(an);
     
    vec2 uv = 0.2*vec2(x,1.0)/abs(y);
    uv.xy += 0.20*time;
	
	float w = max(-0.1, 0.6-abs(y) );
	
	vec4 color = interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1, uv);
	
	fragColor = vec4( color.xyz+w, 1.0);
}