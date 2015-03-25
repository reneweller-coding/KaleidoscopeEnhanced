uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float speed;
uniform int direction;

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
	p.x /= resolution.x;
	p.y /= resolution.y;
	
	

	//p = clampQuadratic(p);
	//p.x -= 0.5*(resolution.x-resolution.y)/resolution.x;


	
	p.x -= 0.5;
	p.y -= 0.5;
	
	//p = clampQuadratic(p);
	
	if( direction > 0 )
		speed = -speed;
	
	vec2 cst = vec2( cos(speed*time), sin(speed*time) );
    mat2 rot = mat2(cst.x*resolution.y/resolution.x,-cst.y,cst.y*resolution.y/resolution.x,cst.x);
    
    
    //p = clampQuadratic(p);
    
    p = rot*p;
    
    
    //p.x += 0.5*resolution.y/resolution.x;
    //p.y += 0.5;
    
    p.x += 0.5;
	p.y += 0.5;
	
	//p.x += 0.5*(resolution.x-resolution.y)/resolution.x;
    
    //p = clampQuadratic(p);
    	
    gl_FragColor = interpolation * texture2D(tex0,p) + (1.0-interpolation)*texture2D(tex1, p);

}