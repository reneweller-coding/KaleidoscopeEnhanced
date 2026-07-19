uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float speed;
uniform int sides;
uniform float power;
uniform float audioBeat;
uniform float audioLevel;
uniform float audioFlip;
uniform float audioAdvance;    // integrated, jump-free audio tunnel advance


vec2 clampQuadratic( vec2 p )
{
	vec2 uv = p;
	int vorkomma = int(floor( p.x ));	
	float nachkomma = fract(p.x);
	
	//scale
	nachkomma *= resolution.y/resolution.x;
	nachkomma += 0.5*(resolution.x-resolution.y)/resolution.x;
	
	if( (vorkomma % 2)==0 )
		uv.x = 1.0-nachkomma;
	else
		uv.x = nachkomma;


	return uv;
}


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
    p = 3.0 * p;
    

    float r = pow( pow(p.x*p.x,power) + pow(p.y*p.y,power), 1.0/(2.0*power) );

    // cartesian to polar coordinates
    //float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sidesK = .5*float(sides);
    float tau = 1. * 1.047;
    a = mod(a, tau/sidesK);
    a = abs(a - tau/sidesK/2.);
 
	vec2 uv;
    uv.x = (speed * time + audioAdvance + .1/r);
    uv.y = (a/3.1416);
 
    //uv = clampQuadratic( uv );  
    
    vec4 col = interpolation * texture2D(tex0,uv) + (1.0-interpolation)*texture2D(tex1,uv);
    col.rgb *= (1.0 + audioBeat * 0.2 + audioLevel * 0.2);
    gl_FragColor = clamp(col, 0.0, 1.0);
}