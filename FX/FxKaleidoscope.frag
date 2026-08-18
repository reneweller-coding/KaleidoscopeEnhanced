#version 330 core
out vec4 fragColor;
/**
 * @file FxKaleidoscope.frag
 * @brief FX KALEIDOSCOPE: classic radial mirror-fold -- the polar angle is
 * wrapped and mirrored into "sides" repeating wedges, slowly rotating.
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float speed;
uniform int sides;


void main() {

    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.y;
	p.y /= resolution.y;
	p.x -= 0.5*resolution.x/resolution.y;
	p.y -= 0.5;
    
    p = 4.0 * p;

    // cartesian to polar coordinates
    float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sidesK = .5*float(sides);
    float tau = 1. * 1.047;
    a = mod(a, tau/sidesK);
    a = abs(a - tau/sidesK/2.);
    a += time*speed; // rotate

    // polar to cartesian coordinates
    p = r * vec2(cos(a), sin(a));
	
    fragColor = interpolation * texture(tex0,p+0.5) + (1.0-interpolation)*texture(tex1, p + 0.5);
}