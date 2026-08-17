#version 330 core
out vec4 fragColor;
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
uniform float rotate;
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
    
    vec2 porg = p;
    
    
    float angle = 0.0; 
    if( rotate > 0.0 )
       angle = M_PI*0.25;
    
    // a rotation
    vec2 cst = vec2( cos(angle), sin(angle) );
    mat2 rot = mat2(cst.x,-cst.y,cst.y,cst.x);
    p = rot*p;
//rwrwtest

    float r = pow( pow(p.x*p.x,power) + pow(p.y*p.y,power), 1.0/(2.0*power) );

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
    r = pow( pow(p.x*p.x,power) + pow(p.y*p.y,power), 1.0/(2.0*power) );
    a = atan(p.y, p.x);

    // kaleidoscope
    float sidesT2 = 0.5 * float(sides);
    a = mod(a, tau/sidesT2);
    a = abs(a - tau/sidesT2/2.);
    a += time*speed + audioPhase; // base rotation + jump-free audio rotation

    // the reverse layer RECEDES with the music (opposite sign), so the two
    // tunnels shear against each other on energetic passages
    uv.x = (speedTunnelReverse*time - 0.5*audioAdvance + .1/r);
    uv.y = (a/M_PI);

    vec4 color2 =  interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);

    //Combine Plain and Reverse
    fragColor = (0.5*color1+0.5*color2) * (1.0 + 0.10*audioKick);
}