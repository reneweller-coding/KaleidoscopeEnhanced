#version 330 core
out vec4 fragColor;
/**
 * @file TunnelReverse.frag
 * @brief Two mirrored-segment kaleidoscope tunnels blended 50/50: a forward
 *        layer (same construction as Tunnel.frag) and a second layer whose
 *        rotation and radial mapping run in the opposite sense, so the two
 *        tunnels shear against each other rather than simply co-scrolling.
 *
 * Audio Reactivity:
 *  - audioPhase     -> adds to the wedge rotation of BOTH layers (integrated, jump-free)
 *  - audioAdvance   -> adds to the forward layer's scroll but is SUBTRACTED (opposite
 *                      sign, half weight) from the reverse layer's, so the reverse
 *                      tunnel visibly recedes on energetic passages
 *  - audioKick      -> subtle brightness pulse on the combined result
 *  - audioBuildUp   -> LAYER TAKEOVER: as tension climbs the 50/50 blend tips toward
 *                      the RECEDING layer, so a build-up visibly pulls the image
 *                      backwards against the forward tunnel before the release
 *  - audioSpread    -> DEPTH MISMATCH: the reverse layer's radial term gets its own
 *                      spread-driven weight, so a wide spectrum pushes the two
 *                      tunnels' perspectives apart and the shear becomes obvious.
 *                      It scales only the radial term, which is ADDED to the scroll;
 *                      'time' keeps its own untouched coefficient
 *  - audioRoughness -> GRIND: dissonance ripples the reverse layer's angular
 *                      coordinate along the radius (the forward layer stays
 *                      straight), so the two tunnels visibly grate against each other
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
uniform float speedTunnelReverse;
uniform int   rotate;   // <bool> in the config -> uploaded with glUniform1i
uniform float audioPhase;     // integrated audio rotation phase (radians, jump-free)
uniform float audioAdvance;   // integrated audio tunnel advance (jump-free)
uniform float audioKick;      // subtle brightness pulse on kicks
uniform float audioBuildUp;   // 0..1 EDM tension -> blend tips toward the receding layer
uniform float audioSpread;    // 0=narrow spectrum .. 1=wide -> depth mismatch between the layers
uniform float audioRoughness; // 0=consonant .. 1=dissonant -> the reverse layer grinds

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
    
    vec2 porg = p;
    
    
    float angle = 0.0; 
    if( rotate > 0 )
       angle = M_PI*0.25;
    
    // a rotation
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

	vec2 uv;
    uv.x = (speedTunnel*time + audioAdvance + .1/r);
    uv.y = (a/3.1416);
    
    vec4 color1 = interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);
    
    
    //Tunnel Backward
    p.x = porg.x;
    p.y = porg.y;
    
    cst =  vec2( cos(interpolationRotation), sin(interpolationRotation) );
    rot = mat2(cst.x,cst.y,-cst.y,cst.x);
    p = rot*p;

    
    // cartesian to polar coordinates
    //r = length(p);
    r = pow( pow(p.x*p.x,powV) + pow(p.y*p.y,powV), 1.0/(2.0*powV) );
    a = atan(p.y, p.x);

    // kaleidoscope
    float sidesT2 = 0.5 * float(sides);
    a = mod(a, tau/sidesT2);
    a = abs(a - tau/sidesT2/2.);
    a += time*speed + audioPhase; // base rotation + jump-free audio rotation

    // the reverse layer RECEDES with the music (opposite sign), so the two
    // tunnels shear against each other on energetic passages.  Spectral spread
    // additionally pushes the two layers' PERSPECTIVES apart: only the reverse
    // layer's radial weight moves, so a wide, rich spectrum makes the depth
    // mismatch -- and with it the shear -- unmistakable.  The radial term is
    // ADDED to the scroll; 'time' keeps its own untouched coefficient.
    float throat2 = 0.10 * (0.78 + 0.44*clamp(audioSpread, 0.0, 1.0));
    uv.x = (speedTunnelReverse*time - 0.5*audioAdvance + throat2/r);
    // Dissonance makes the two tunnels GRATE: only the reverse layer's angular
    // coordinate ripples (radially, no time term), so the layers grind visibly.
    uv.y = (a/M_PI) + 0.035*clamp(audioRoughness, 0.0, 1.0)*sin(r*6.5);

    vec4 color2 =  interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);

    //Combine Plain and Reverse.  A build-up tips the 50/50 blend toward the
    //RECEDING layer, so rising tension visibly pulls the image backwards.
    float mixRev = 0.5 + 0.22*clamp(audioBuildUp, 0.0, 1.0);
    fragColor = mix(color1, color2, mixRev) * (1.0 + 0.10*audioKick);
}