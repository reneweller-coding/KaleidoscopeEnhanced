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

    // polar to cartesian coordinates
    p = r * vec2(cos(a), sin(a));
	
    vec4 col = interpolation * texture2D(tex0,p+0.5) + (1.0-interpolation)*texture2D(tex1, p + 0.5);

    // --- Beat pulse: outward radial pop ---
    float zoomK  = 1.0 + audioBeat * 0.25;
    vec2 pZoomed = p / zoomK;
    vec4 colZoomed = interpolation * texture2D(tex0, pZoomed+0.5) + (1.0-interpolation)*texture2D(tex1, pZoomed+0.5);
    col = mix(col, colZoomed, audioBeat * 0.7);

    // --- Spectral Centroid: colour temperature ---
    // Dark drone (centroid→0): cool twilight tint, slightly dim
    // Bright shimmer (centroid→1): warm iridescent glow
    vec3 coolTint = vec3(0.70, 0.75, 1.05);  // blue-violet
    vec3 warmTint = vec3(1.15, 1.05, 0.85);  // amber-white
    col.rgb *= mix(coolTint, warmTint, audioCentroid);

    // --- Valence: pleasant/major music is vivid, tense/minor/rough is muted ---
    float lumK = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    col.rgb = mix(vec3(lumK), col.rgb, 0.55 + 0.65 * audioValence);

    // --- Spectral Flux: gentle luminance when new sound layers enter ---
    col.rgb *= (1.0 + audioFlux * 0.15);

    // --- Beat brightness + overall breathing (audioBeat is slew-limited host-side) ---
    col.rgb *= (1.0 + audioBeat * 0.2 + audioLevel * 0.25);

    gl_FragColor = clamp(col, 0.0, 1.0);
}