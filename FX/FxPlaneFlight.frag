#version 330 core
out vec4 fragColor;
/**
 * @file FxPlaneFlight.frag
 * @brief FX PLANE FLIGHT: forward-flight perspective warp that projects the
 * scene as if streaming past on either side of a travelling flight path,
 * brightened toward the horizon line.
 *
 * The view direction rotates slowly over time and the sampled UV scrolls
 * forward, giving an endless "flying alongside a wall of texture" look.
 * This effect declares no audio-reactive uniforms.
 *   interpolation -> linearly cross-fades tex0 over tex1 in the warped UV space
 */
// FxPlaneFlight.frag (Inigo Quilez, iq/2013)
// FX PLANE FLIGHT: a forward-flight perspective warp -- the scene is
// projected as if streaming past on either side of a travelling flight
// path, brightened near the horizon line.
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioPhase;   // music banks the view
uniform float audioAdvance;

// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

void main(void)
{
    vec2 p = -1.0+2.0*gl_FragCoord.xy/resolution.xy;
    
    p*= 2.0;
    
    float an = time*0.1 + 0.06*audioPhase;
    float x = p.x*cos(an)-p.y*sin(an);
    float y = p.x*sin(an)+p.y*cos(an);
     
    vec2 uv = 0.2*vec2(x,1.0)/abs(y);
    uv.xy += 0.20*time + 0.10*audioAdvance;
	
	float w = max(-0.1, 0.6-abs(y) );
	
	vec4 color = interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1, uv);
	
	fragColor = vec4( color.xyz+w, 1.0);
}