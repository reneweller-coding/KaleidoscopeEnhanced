#version 330 core
out vec4 fragColor;
/**
 * @file TunnelAcceleration.frag
 * @brief A variant of the mirrored-segment kaleidoscope tunnel with its own,
 *        independently tunable forward scroll speed (`speedTunnelAccel`),
 *        used to make the tunnel appear to accelerate relative to the plain
 *        Tunnel.frag pass.
 *
 * Audio Reactivity:
 *  - audioPhase     -> adds to the wedge rotation on top of the base time*speed spin
 *                      (integrated, jump-free)
 *  - audioAdvance   -> adds to the forward scroll (integrated, jump-free)
 *  - audioKick      -> subtle brightness pulse on kicks
 *  - audioBuildUp   -> THROAT TIGHTENING: as an EDM build-up climbs, the radial term's
 *                      weight grows and perspective compresses the tunnel into a
 *                      steep, deep throat -- the punch-in that answers rising tension.
 *                      It scales only the radial term, which is ADDED to the scroll;
 *                      'time' keeps its own untouched coefficient
 *  - audioDownbeat  -> BAR ACCENT: a musically placed brightness accent on the bar's
 *                      "1", stronger and rarer than the per-kick pulse
 *  - audioUpperMid  -> METALLIC FRINGE: 2-6 kHz industrial edge splits the red and
 *                      blue channels apart along the scroll axis, giving the walls a
 *                      chromatic-aberration sheen on scraping, metallic material
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
uniform float speedTunnelAccel;
uniform float audioPhase;     // integrated audio rotation phase (radians, jump-free)
uniform float audioAdvance;   // integrated audio tunnel advance (jump-free)
uniform float audioKick;      // subtle brightness pulse on kicks
uniform float audioBuildUp;   // 0..1 EDM tension rising toward a climax -> throat tightening
uniform float audioDownbeat;  // decaying accent on the bar's "1" -> musical brightness accent
uniform float audioUpperMid;  // 2k-6k Hz metallic/industrial edge -> chromatic fringe

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
    a += time*speed + audioPhase; // base rotation + jump-free audio rotation

    // A build-up TIGHTENS the throat: the radial term's weight grows, so
    // perspective compresses the tunnel into a steep, deep shaft as the tension
    // climbs -- the punch-in that answers a rising EDM build.  Scales only the
    // radial term, which is ADDED to the scroll; 'time' keeps its own
    // coefficient, so no accumulated phase can be remapped.
    float throat = 0.10 * (1.0 + 0.38*clamp(audioBuildUp, 0.0, 1.0));

	vec2 uv;
    uv.x = (speedTunnelAccel*time + audioAdvance + throat/r);
    uv.y = (a/M_PI);

    vec4 col = interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);

    // The 2-6 kHz metallic band splits red and blue apart along the scroll axis:
    // scraping, industrial material puts a chromatic-aberration sheen on the
    // walls.  A per-channel resample of the SAME image, so nothing is added.
    float fringe = 0.006 * clamp(audioUpperMid, 0.0, 1.0);
    if (fringe > 0.0001)
    {
        vec2 uvR = vec2(uv.x + fringe, uv.y);
        vec2 uvB = vec2(uv.x - fringe, uv.y);
        col.r = interpolation * texture(tex0,uvR).r + (1.0-interpolation)*texture(tex1,uvR).r;
        col.b = interpolation * texture(tex0,uvB).b + (1.0-interpolation)*texture(tex1,uvB).b;
    }

    // Kicks pulse, and the bar's "1" lands a stronger, musically placed accent.
    col.rgb *= 1.0 + 0.10*audioKick + 0.16*clamp(audioDownbeat, 0.0, 1.0);
    fragColor = col;
}