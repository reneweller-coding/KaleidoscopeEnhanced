#version 330 core
out vec4 fragColor;
/**
 * @file TunnelAcceleration.frag
 * @brief A variant of the mirrored-segment kaleidoscope tunnel with its own,
 *        independently tunable forward scroll speed (`speedTunnelAccel`),
 *        used to make the tunnel appear to accelerate relative to the plain
 *        Tunnel.frag pass.
 *
 * audioPhase (integrated, jump-free) adds to the wedge rotation on top of
 * the base time*speed spin, audioAdvance adds to the forward scroll speed,
 * and audioKick gives the final image a subtle brightness pulse on kicks.
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

	vec2 uv;
    uv.x = (speedTunnelAccel*time + audioAdvance + .1/r);
    uv.y = (a/M_PI);

    fragColor =  interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);
    fragColor.rgb *= 1.0 + 0.10*audioKick;
}