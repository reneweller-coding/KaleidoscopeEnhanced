uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float interpolationRotation;
uniform float speedTunnel;
uniform float speed;
uniform int sides;
uniform float power;
uniform int rotate;
// Audio reactivity: 0=silence, 1=loud beat.  Decays between beats.
uniform float audioBeat;       // beat pulse decay 0..1
uniform float audioLevel;      // smoothed loudness 0..1
uniform float audioFlip;       // rotation direction: +1 or -1
uniform float audioCentroid;   // tonal brightness 0..1  (0=dark drone, 1=bright shimmer)
uniform float audioFlux;       // spectral flux 0..1     (how fast spectrum changes)
uniform float audioPhase;      // integrated audio rotation phase (radians, jump-free)
uniform float audioAdvance;    // integrated audio tunnel advance (jump-free)
uniform float audioValence;    // mood pleasantness 0..1 (low=tense/dark, high=happy)

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

//Tunnel foreward    
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

    float r = pow( pow(p.x*p.x,power) + pow(p.y*p.y,power), 1.0/(2*power) );

    // cartesian to polar coordinates
    //float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sidesK = .5*float(sides);
    float tau = 1. * 1.047;
    a = mod(a, tau/sidesK);
    a = abs(a - tau/sidesK/2.);
    a += time * speed + audioPhase; // base rotation + jump-free audio rotation

	vec2 uv;
    uv.x = (speedTunnel*time + audioAdvance + .1/r);
    uv.y = (a/M_PI);
    
    vec4 col = interpolation * texture2D(tex0,uv) + (1.0-interpolation)*texture2D(tex1,uv);

    // --- Beat: a VERY subtle radial breath only ---
    // The strong beat zoom/brightness flash was tiring on the eyes; the rhythmic
    // accent now lives in the gentle corner spotlights of the final present pass.
    float zoom    = 1.0 + audioBeat * 0.06;
    vec2 uvZoomed = (uv - 0.5) / zoom + 0.5;
    vec4 colZoomed = interpolation * texture2D(tex0,uvZoomed) + (1.0-interpolation)*texture2D(tex1,uvZoomed);
    col = mix(col, colZoomed, audioBeat * 0.18);

    // --- Spectral Centroid: colour temperature tint ---
    // Low centroid (dark drone) → cool blue-violet tint, reduced brightness
    // High centroid (bright air) → warm golden-white glow
    // Blend is very subtle so it enhances mood without overriding image colour.
    // Mood colour / saturation / loudness-brightness / flux-shimmer are now applied
    // GLOBALLY in the final present pass, so every effect reacts consistently.
    // No per-effect brightness flash here (moved to the present-pass spotlights).
    gl_FragColor = clamp(col, 0.0, 1.0);
}