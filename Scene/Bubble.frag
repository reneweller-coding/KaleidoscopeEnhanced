uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float speed;// = 2.0; //1.0
uniform float speedColor;// = 1.0; //1.0
uniform int negative;
uniform int vigneting;

//void main() {

    // normalize to the center
//	vec2 p;
  //  p.x = gl_FragCoord.x;
  //  p.y = gl_FragCoord.y;
//	p.x /= resolution.x;
//	p.y /= resolution.y;
		
  //  gl_FragColor = interpolation * texture2D(tex0,p) + (1.0-interpolation)*texture2D(tex1, p);

//}


// Created by inigo quilez - iq/2013 : https://www.shadertoy.com/view/4dl3zn
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// Messed up by Weyland

const int nrBubbles = 32; //64


void main(void)
{
	vec2 uv = -1.0 + 2.0*gl_FragCoord.xy / resolution.xy;
	uv.x *=  resolution.x / resolution.y;

    // background	 
	vec3 color = vec3(0.9 + 0.2*uv.y);
	//vec3 color = vec3(1.0);

    // bubbles	
	for( int i=0; i<nrBubbles; i++ )
	{
        // bubble seeds
		float pha =      sin(float(i)*546.13+1.0)*0.5 + 0.5;
		float siz = pow( sin(float(i)*651.74+5.0)*0.5 + 0.5, 4.0 );
		float pox =      sin(float(i)*321.55+4.1) * resolution.x / resolution.y;

        // buble size, position and color
		float rad = 0.1 + 0.5*siz+sin(speed*time/60.+pha*500.+siz)/20.;
		vec2  pos = vec2( pox+sin(speed*time/40.+pha+siz), -1.0-rad + (2.0+2.0*rad)
						 *mod(pha+0.1*(speed*time/5.)*(0.2+0.8*siz),1.0));
		float dis = length( uv - pos );
		vec3  col = mix( vec3(0.194*sin(speedColor*time/6.0),0.3,0.0), 
						vec3(1.1*sin(speedColor*time/9.0),0.4,0.8), 
						0.5+0.5*sin(float(i)*1.2+1.9));
		      //col+= 8.0*smoothstep( rad*0.95, rad, dis );
		
        // render
		float f = length(uv-pos)/rad;
		f = sqrt(clamp(1.0-f*f,0.0,1.0));
		color -= col.zyx *(1.0-smoothstep( rad*0.95, rad, dis )) * f;
	}

    // vigneting	
	if( vigneting == 1 )
		color *= sqrt(1.5-0.5*length(uv));

    if( negative == 1 )
		color = 1.0-color;
    
	gl_FragColor = vec4(color,1.0);
}