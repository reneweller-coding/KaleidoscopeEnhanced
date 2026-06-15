uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float interpolationRotationTunnel;
uniform float interpolationRotationKaleidoscope;
uniform float interpolationInterpolationTunnel;
uniform float speedTunnel;
uniform float speedKaleidoscope;
uniform float speedKaleidoscopeTunnel;
uniform float sidesTunnel;
uniform float sidesKaleidoscope;
uniform float powerKaleidoscope;
uniform float powerTunnel;


void main() {

    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.y;
	p.y /= resolution.y;
	p.x -= 0.5*resolution.x/resolution.y;
	p.y -= 0.5;
	

//rwrwtest
    vec2 porg;
    porg.x = p.x;
    porg.y = p.y;
    
    p = 4.0 * p;
    
    // a rotation
    vec2 cst = vec2( cos(interpolationRotationKaleidoscope), sin(interpolationRotationKaleidoscope) );
    mat2 rot = mat2(cst.x,-cst.y,cst.y,cst.x);
    p = rot*p;
//rwrwtest

    float r = pow( pow(p.x*p.x,powerKaleidoscope) + pow(p.y*p.y,powerKaleidoscope), 1.0/(2*powerKaleidoscope) );

    // cartesian to polar coordinates
    //float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sides = .5*sidesKaleidoscope;
    float tau = 1. * 1.047;
    a = mod(a, tau/sides);
    a = abs(a - tau/sides/2.);
    a += time*speedKaleidoscope; // rotate

    // polar to cartesian coordinates
    p = r * vec2(cos(a), sin(a));
	
    vec4 color1 = interpolation * texture2D(tex0,p+0.5) + (1.0-interpolation)*texture2D(tex1, p + 0.5);

//rwrwtest
    p.x = porg.x;
    p.y = porg.y;
    
    p = 4.0 * p;
    
    cst =  vec2( cos(interpolationRotationTunnel), sin(interpolationRotationTunnel) );
    rot = mat2(cst.x,cst.y,-cst.y,cst.x);
    p = rot*p;

    
    // cartesian to polar coordinates
    //r = length(p);
    r = pow( pow(p.x*p.x,powerTunnel) + pow(p.y*p.y,powerTunnel), 1.0/(2*powerTunnel) );
    a = atan(p.y, p.x);

    // kaleidoscope
    float sidesT = 0.5 * sidesTunnel;
    a = mod(a, tau/sidesT);
    a = abs(a - tau/sidesT/2.);
    a += time*speedKaleidoscopeTunnel; // rotate
    
	vec2 uv;
    uv.x = (speedTunnel*time+.1/r);
    uv.y = (a/3.1416);
    
    vec4 col;
    col =  interpolation * texture2D(tex0,uv) + (1.0-interpolation)*texture2D(tex1,uv);
    vec4 color2 = col;//col*pow(dot(p,p), 0.09);
    //color2.w = 1.0;


    //Combine Plain and Tunnel Effect
    gl_FragColor = interpolationInterpolationTunnel*color1 + (1.0-interpolationInterpolationTunnel)*color2;
    
    //grayscale
    //vec4 colres = interpolationInterpolationTunnel*color1 + (1.0-interpolationInterpolationTunnel)*color2;
    //float gray = dot( vec3( colres[0], colres[1], colres[2] ), vec3(0.3, 0.59, 0.11) );
    //gl_FragColor = vec4( gray, gray, gray, 1.0 );
}