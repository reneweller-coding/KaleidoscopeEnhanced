#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FxKaleidoscope.frag
 * @brief FX KALEIDOSCOPE: classic radial mirror-fold -- the polar angle is
 * wrapped and mirrored into "sides" repeating wedges, slowly rotating.
 */
uniform vec2 resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float speed;
uniform int sides;
uniform float audioPhase;   ///< music advances the fold rotation
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).


/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {

    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.y;
	p.y /= resolution.y;
	p.x -= 0.5*resolution.x/resolution.y;
	p.y -= 0.5;
    
    p = 4.0 * (1.0 - 0.08*audioSwell) * p;

    // cartesian to polar coordinates
    float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sidesK = .5*float(sides);
    float tau = 1. * 1.047;
    a = mod(a, tau/sidesK);
    a = abs(a - tau/sidesK/2.);
    a += time*speed + 0.15*audioPhase; // rotate, music adds spin

    // polar to cartesian coordinates
    p = r * vec2(cos(a), sin(a));
	
    fragColor = interpolation * texture(tex0,p+0.5) + (1.0-interpolation)*texture(tex1, p + 0.5);
}