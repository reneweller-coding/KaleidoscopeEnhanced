#version 330 core
out vec4 fragColor;
/**
 * @file Tunnel.frag
 * @brief The classic forward-scrolling mirrored-segment kaleidoscope tunnel:
 *        polar coordinates from the frame centre are folded into `sides`
 *        mirrored wedges, then mapped to a UV that scrolls inward over time.
 *
 * Several audio uniforms (audioLevel, audioCentroid, audioFlux, audioValence,
 * audioFlip) are still declared here but are no longer read in main() -- the
 * mood-tint/brightness logic they once drove was moved to the global present
 * pass so every effect reacts consistently.
 *
 * Audio Reactivity:
 *  - audioPhase     -> adds to the wedge rotation on top of the base time*speed spin
 *                      (integrated, jump-free)
 *  - audioAdvance   -> adds to the forward scroll (integrated, jump-free)
 *  - audioBeat      -> a very subtle radial zoom/breath toward a zoomed resample
 *  - audioSpread    -> THROAT DEPTH: the radial term's weight, i.e. how strongly
 *                      perspective compresses the wall toward the vanishing point.
 *                      A narrow spectrum stretches the tunnel long and shallow, a
 *                      wide one compresses it into a deep, steep throat. Added
 *                      alongside the scroll term, never multiplied into it
 *  - audioRoughness -> WALL RIPPLE: dissonance ripples the wall's angular coordinate
 *                      along the radius, so consonant passages give clean straight
 *                      wedges and rough clusters buckle them
 *  - audioRolloff   -> WALL COLOUR TEMPERATURE: bass-bound music tints the tunnel
 *                      cold blue, energy reaching into the highs warms it amber
 */
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
uniform float audioSpread;     // 0=narrow spectrum .. 1=wide -> throat depth compression
uniform float audioRoughness;  // 0=consonant .. 1=dissonant -> wall ripple
uniform float audioRolloff;    // 0=bass-bound .. 1=reaching into the highs -> wall colour

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

    // power was never registered in any preset (always 0, GL's unset-uniform
    // default) -- 1.0/(2.0*power) divided by zero, sending r to infinity for
    // every pixel. 1.0 reproduces the plain Euclidean length() case.
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

    // Spectral spread sets how steeply perspective compresses the wall toward
    // the vanishing point: a narrow spectrum stretches the tunnel long and
    // shallow, a wide one packs it into a deep throat.  This scales only the
    // radial term, which is ADDED to the scroll -- 'time' keeps its own,
    // untouched coefficient, so no accumulated phase is ever remapped.
    float throat = 0.10 * (0.80 + 0.40*clamp(audioSpread, 0.0, 1.0));

	vec2 uv;
    uv.x = (speedTunnel*time + audioAdvance + throat/r);
    // Dissonance buckles the wall: a purely radial ripple on the angular
    // coordinate, so consonant passages keep the wedges dead straight.
    uv.y = (a/M_PI) + 0.030*clamp(audioRoughness, 0.0, 1.0)*sin(r*7.5);

    vec4 col = interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);

    // --- Beat: a VERY subtle radial breath only ---
    // The strong beat zoom/brightness flash was tiring on the eyes; the rhythmic
    // accent now lives in the gentle corner spotlights of the final present pass.
    float zoom    = 1.0 + audioBeat * 0.06;
    vec2 uvZoomed = (uv - 0.5) / zoom + 0.5;
    vec4 colZoomed = interpolation * texture(tex0,uvZoomed) + (1.0-interpolation)*texture(tex1,uvZoomed);
    col = mix(col, colZoomed, audioBeat * 0.18);

    // --- Spectral Centroid: colour temperature tint ---
    // Low centroid (dark drone) → cool blue-violet tint, reduced brightness
    // High centroid (bright air) → warm golden-white glow
    // Blend is very subtle so it enhances mood without overriding image colour.
    // Mood colour / saturation / loudness-brightness / flux-shimmer are now applied
    // GLOBALLY in the final present pass, so every effect reacts consistently.
    // No per-effect brightness flash here (moved to the present-pass spotlights).

    // ...but the tunnel's own WALL still takes a colour temperature from the
    // spectral rolloff: bass-bound music makes it a cold blue shaft, energy
    // reaching into the highs warms it to amber.  Luminance-matched, so this
    // recolours without changing the exposure the present pass then grades.
    col.rgb *= mix(vec3(0.86, 0.94, 1.14), vec3(1.12, 1.00, 0.86),
                   clamp(audioRolloff, 0.0, 1.0));

    fragColor = clamp(col, 0.0, 1.0);
}