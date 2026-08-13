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
uniform int rotate;
uniform float speedMovement;// = 5.0;
uniform	float extend;// = 4000;
uniform int direction;


const float M_PI = 3.141592653589793;

vec3 getKaleidoscopeColor( vec2 coord )
{

	coord *= resolution;
    // normalize to the center
	vec2 p;
    p.x = coord.x;
    p.y = coord.y;
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

    float r = pow( pow(p.x*p.x,power) + pow(p.y*p.y,power), 1.0/(2.0*power) );

    // cartesian to polar coordinates
    //float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sidesK = .5*float(sides);
    float tau = 1. * 1.047;
    a = mod(a, tau/sidesK);
    a = abs(a - tau/sidesK/2.);
    a += time*speed; // rotate

    // polar to cartesian coordinates
    p = r * vec2(cos(a), sin(a));
	
    return (interpolation * texture(tex0,p+0.5) + (1.0-interpolation)*texture(tex1, p + 0.5)).rgb;    
    //return interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);
}


void main(void)
{

	vec2 pixel;// = clampQuadratic( gl_FragCoord );
	pixel.x = gl_FragCoord.x - resolution.x*.5;
	//pixel.y = gl_FragCoord.y - (resolution.y/resolution.x)*resolution.x*.5;
	pixel.y = gl_FragCoord.y - resolution.y*.5;


	//float speedMovement = 5.0;
	//float extend = 4000;
	
	// pixellate
	const float pixelSize = 0.25;
	pixel = floor(pixel/pixelSize);
	
	
	
	float rotDir = 1.0;
	if( direction > 0 )
		rotDir = -1.0;
		
	//vec2 offset = vec2(time*3000.0,pow(max(-sin(time*.2),.0),2.0)*16000.0)/pixelSize;
	//vec2 offset = vec2(pow(cos(time*.2),2.0)*16000.0,pow(sin(time*.2),2.0)*16000.0)/pixelSize;
	vec2 offset = vec2(cos(speedMovement*time*.2)*extend,sin(rotDir*speedMovement*time*.2)*extend)/pixelSize;
	//vec2 offset = vec2(cos(speedMovement*.2)*extend,sin(speedMovement*.2)*extend)/pixelSize;
	
	//resolution.y/resolution.x*
	
	vec3 col = vec3(0.0);
	for ( int i=0; i < 32; i++ )
	{
		// parallax position, whole pixels for retro feel
		//float depth = 20.0+float(i);
		float depth = 37.5+float(i);
		vec2 uv = pixel + floor(offset/depth);
		
		uv /= resolution.xy;
		uv *= depth/40.0;
		//uv *= 0.4*pixelSize;
		uv *= 0.8*pixelSize;
		
		col = getKaleidoscopeColor( uv+.5 );//interpolation * texture(tex0,uv+.5) + (1.0-interpolation)*texture(tex1, uv+.5);
//texture( iChannel0, uv+.5 ).rgb;
		
		if ( 1.0-col.y < float(i+1)/32.0 )
		{
			//col = mix( vec3(.4,.6,.7), col, exp2(-float(i)*.1) );
			col = mix( vec3(.5,.5,.5), col, exp2(-float(i)*.1) );
			break;
		}
	}
	
	fragColor = vec4(col,1.0);//vec4( getKaleidoscopeColor( pixel+.5 ), 1.0 );//vec4(col,1.0);
}