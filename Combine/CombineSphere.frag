#version 330 core
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float radius;
uniform float nrCopies;
uniform float speed;
uniform int rot;

// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

vec2 clampQuadratic( vec2 p )
{
	vec2 uv = p;
	int vorkomma = int(floor( p.x ));	
	float nachkomma = fract(p.x);
	
	//scale
	nachkomma *= resolution.y/resolution.x;
	nachkomma += 0.5*(resolution.x-resolution.y)/resolution.x;
	
	if( vorkomma - (vorkomma / 2) * 2 == 0 )
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


void main(void)
{

	vec2 uv;
    uv.x = gl_FragCoord.x;
    uv.y = gl_FragCoord.y;
	uv.y /= resolution.y;
	float offset = 2.0;
	

	vec2 p = uv;
	p.x /= resolution.y;
	p *= offset;
	
	
	p.x -= 0.5*offset*resolution.x/resolution.y;
	p.y -= 0.5*offset;
	
  
  float r = dot(p,p);
  if (r > radius )
  {
	uv.x /= resolution.x;
	fragColor = interpolation * texture(tex0, uv) + (1.0-interpolation)*texture(tex1, uv);
  }
  else
  {
	  float f = nrCopies*(1.0-sqrt(1.0-r))/(r);
	  vec2 uv1;
	  uv1.x = p.x*f + speed*time;
	  uv1.y = p.y*f + speed*time;
	    
	  if( rot > 0 )
		uv1 = rotate( uv1, 3.14159265359 / 4.0 );
		
	  uv1 = clampQuadratic( uv1 );
	  
	  fragColor = interpolation * texture(tex0, uv1) + (1.0-interpolation)*texture(tex1, uv1);
	}
}