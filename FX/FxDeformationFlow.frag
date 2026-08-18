#version 330 core
out vec4 fragColor;
// FxDeformationFlow.frag
// Polar radial-flow warp (Inigo Quilez, iq/2013): unwraps the scene into
// polar coordinates around a moving point pair and scrolls it, tiled into
// "copies" mirrored repeats; an optional grid overlay shows the seams.
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float copies;
uniform int displayGrid;
uniform float speed;
uniform int directionPositive;
uniform int leftRight;

//void main() {

    // normalize to the center
//	vec2 p;
  //  p.x = gl_FragCoord.x;
  //  p.y = gl_FragCoord.y;
  //	p.x /= resolution.x;
  //	p.y /= resolution.y;
		
  //  fragColor = ;

//}


// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.


const float scaletexture = 2.0;//2.0

void main(void)
{
  vec2 p = gl_FragCoord.xy;
  p.x /= resolution.x;
  p.y /= resolution.y;
  //p.x -= 0.5*resolution.x/resolution.y;
  //p.y -= 0.5;
  p*=scaletexture;
  p -= 1.0;
 
 float speedl = speed;
 
 if( directionPositive > 0 )
	speedl = -speedl;
 
  
  vec2 center;
  center.x = gl_FragCoord.x;
  center.y = gl_FragCoord.y;
  center.x /= resolution.x;
  center.y /= resolution.y;
  //center.x -= 0.5;//*resolution.x/resolution.y;
  //center.y -= 0.5;
  
  float yPos = 0.0;
  if( leftRight > 0 )
	yPos = 1.0;
  
  
  vec2 mouse = vec2( 0.0, yPos );//center;
  //vec2 mouse = vec2( 0.15, 0.15 );//center;
  
  
  //vec2 m = -1.0 + scaletexture * mouse.xy;// / resolution.xy;
  vec2 m = -1.0 + scaletexture * mouse.xy;// / resolution.xy;


  //mouse = vec2( 0.0, 0.0 );
  //p = -1.0 + 2.0 * gl_FragCoord.xy / iResolution.xy;
  //m = -1.0 + 2.0 * iMouse.xy / iResolution.xy;
  

  float a1 = atan(p.y-m.y,p.x-m.x);
  float r1 = sqrt(dot(p-m,p-m));
  float a2 = atan(p.y+m.y,p.x+m.x);
  float r2 = sqrt(dot(p+m,p+m));

  vec2 uv;
  uv.x = speedl*time + (r1-r2)*0.25;
  uv.y = asin(sin(a1-a2))/3.1416;


  vec2 uv1;
	  uv1.x = copies*uv.x;
	  uv1.y = copies*uv.y;
	  
	  
		int vorkomma = int(floor( uv1.x ));
		
		float nachkomma = fract(uv1.x);
		
		//scale
		nachkomma *= resolution.y/resolution.x;
		nachkomma += 0.5*(resolution.x-resolution.y)/resolution.x;
		
		if( vorkomma - (vorkomma / 2) * 2 == 0 )
			uv1.x = 1.0-nachkomma;
		else
			uv1.x = nachkomma;
				
	

  //vec3 col = texture( iChannel0, 0.125*uv ).zyx;

  //uv.x *= resolution.x/resolution.y;
  vec3 col = (interpolation * texture(tex0,uv1) + (1.0-interpolation)*texture(tex1, uv1)).xyz;

  float w = exp(-15.0*r1*r1) + exp(-15.0*r2*r2);

  if( displayGrid > 0 )
  {
	w += 0.25*smoothstep( 0.93,1.0,sin(32.0*uv.x*copies));
	w += 0.25*smoothstep( 0.93,1.0,sin(32.0*uv.y*copies));
  }

  fragColor = vec4(col+w,1.0);
}