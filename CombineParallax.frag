uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

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

void main(void)
{

	vec2 pixel;// = clampQuadratic( gl_FragCoord );
	pixel.x = gl_FragCoord.x - resolution.x*.5;
	//pixel.y = gl_FragCoord.y - (resolution.y/resolution.x)*resolution.x*.5;
	pixel.y = gl_FragCoord.y - resolution.y*.5;


	float speed = 5.0;
	float extend = 4000;
	
	// pixellate
	const float pixelSize = 0.25;
	pixel = floor(pixel/pixelSize);
	
	//vec2 offset = vec2(time*3000.0,pow(max(-sin(time*.2),.0),2.0)*16000.0)/pixelSize;
	//vec2 offset = vec2(pow(cos(time*.2),2.0)*16000.0,pow(sin(time*.2),2.0)*16000.0)/pixelSize;
	vec2 offset = vec2(cos(speed*time*.2)*extend,sin(speed*time*.2)*extend)/pixelSize;
	
	//resolution.y/resolution.x*
	
	vec3 col;
	for ( int i=0; i < 32; i++ )
	{
		// parallax position, whole pixels for retro feel
		//float depth = 20.0+float(i);
		float depth = 37.5+float(i);
		vec2 uv = pixel + floor(offset/depth);
		
		uv /= resolution.xy;
		uv *= depth/40.0;
		//uv *= 0.4*pixelSize;
		uv *= 0.6*pixelSize;
		
		col = interpolation * texture2D(tex0,uv+.5) + (1.0-interpolation)*texture2D(tex1, uv+.5);
//texture2D( iChannel0, uv+.5 ).rgb;
		
		if ( 1.0-col.y < float(i+1)/32.0 )
		{
			//col = mix( vec3(.4,.6,.7), col, exp2(-float(i)*.1) );
			col = mix( vec3(.5,.5,.5), col, exp2(-float(i)*.1) );
			break;
		}
	}
	
	gl_FragColor = vec4(col,1.0);
}