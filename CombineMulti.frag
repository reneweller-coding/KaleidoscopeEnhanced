uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float copies;
uniform int rot;

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


vec2 rotate( vec2 p, float amount )
{
    // a rotation
    vec2 cst = vec2( cos(amount), sin(amount) );
    mat2 rot = mat2(cst.x,-cst.y,cst.y,cst.x);
    return rot*p;
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
	
	p.y = p.y * copies;
	p.x = p.x * copies;
	
	
	if( rot > 0 )
		p = rotate( p, 3.14159265359 / 4.0 );
	
	p = clampQuadratic( p );
	
	//GL_MIRRORED_REPEAT in Software to get uniform tiles
		
    gl_FragColor = interpolation * texture2D(tex0,p) + (1.0-interpolation)*texture2D(tex1, p);
}