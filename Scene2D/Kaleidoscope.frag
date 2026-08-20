#version 330 core
out vec4 fragColor;
/**
 * @file Kaleidoscope.frag
 * @brief The classic kaleidoscope fold: photo pixels are read back through a polar mirror-and-repeat of `sides` segments, with an optional superellipse warp via the `power` exponent.
 *
 * audioPhase is an integrated, jump-free rotation angle added directly to the segment angle, so the whole pattern spins in step with the music without ever snapping. audioBeat adds a very subtle radial zoom-breath, blended in at low strength by design (an earlier, stronger beat flash was tiring on the eyes). audioLevel, audioFlip, audioCentroid, audioFlux and audioValence are declared and documented here but are not read by this shader's own logic; the mood colour, saturation and loudness brightness they describe are applied globally afterwards, in the final present pass.
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float interpolationRotation;
uniform float speed;
uniform int sides;
uniform float power;
uniform int rotate;
// Audio reactivity
uniform float audioBeat;      // beat pulse decay 0..1
uniform float audioLevel;     // smoothed loudness 0..1
uniform float audioFlip;      // rotation direction: +1 or -1
uniform float audioCentroid;  // tonal brightness 0=dark drone, 1=bright shimmer
uniform float audioFlux;      // spectral flux 0..1
uniform float audioPhase;     // integrated audio rotation phase (radians, jump-free)
uniform float audioValence;   // mood pleasantness 0..1 (low=tense/dark, high=happy)

const float M_PI = 3.141592653589793;

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
    
    
    float angle = 0.0; 
    if( rotate > 0 )
       angle = M_PI*0.25;
    
    // a rotation
    //vec2 cst = vec2( cos(interpolationRotation), sin(interpolationRotation) );
    vec2 cst = vec2( cos(angle), sin(angle) );
    mat2 rot = mat2(cst.x,-cst.y,cst.y,cst.x);
    p = rot*p;
//rwrwtest

    // power was never registered in any preset, so it was always 0 (GL's
    // unset-uniform default) -- 1.0/(2.0*power) is a division by zero,
    // sending r to infinity for every pixel and blanking the whole fold.
    // 1.0 reproduces the plain Euclidean length() case (the commented-out
    // fallback below), the correct "no warp" default.
    float powV = (power > 0.01) ? power : 1.0;
    float r = pow( pow(p.x*p.x,powV) + pow(p.y*p.y,powV), 1.0/(2.0*powV) );

    // cartesian to polar coordinates
    //float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sidesK = .5*float(sides);
    float tau = 1. * 1.047;
    a = mod(a, tau/sidesK);
    a = abs(a - tau/sidesK/2.);
    a += time * speed + audioPhase; // base rotation + jump-free audio rotation

    // polar to cartesian coordinates
    p = r * vec2(cos(a), sin(a));
	
    vec4 col = interpolation * texture(tex0,p+0.5) + (1.0-interpolation)*texture(tex1, p + 0.5);

    // --- Beat: a VERY subtle radial breath only ---
    // The strong beat zoom/brightness flash was tiring on the eyes; the rhythmic
    // accent now lives in the gentle corner spotlights of the final present pass.
    float zoomK  = 1.0 + audioBeat * 0.06;
    vec2 pZoomed = p / zoomK;
    vec4 colZoomed = interpolation * texture(tex0, pZoomed+0.5) + (1.0-interpolation)*texture(tex1, pZoomed+0.5);
    col = mix(col, colZoomed, audioBeat * 0.18);

    // Mood colour / saturation / loudness-brightness are applied GLOBALLY in the
    // final present pass; no per-effect brightness flash here.
    fragColor = clamp(col, 0.0, 1.0);
}