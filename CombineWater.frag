uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;




const float PI = 3.1415926535897932;

// play with these parameters to custimize the effect
// ===================================================

//speed
const float speed = 0.1;//0.2;
const float speed_x = 0.01;//0.3;
const float speed_y = 0.01;//0.3;

// refraction
const float emboss = 0.50;
const float intensity = 2.4;
const int steps = 4;//8;
const float frequency = 6.0;
const int angle = 7; // better when a prime

// reflection
const float delta = 120;//60.;
const float intence = 120;//700.;

const float reflectionCutOff = 0.012;
const float reflectionIntence = 200000.;

// ===================================================


  float col(vec2 coord)
  {
    float delta_theta = 2.0 * PI / float(angle);
    float col = 0.0;
    float theta = 0.0;
    for (int i = 0; i < steps; i++)
    {
      vec2 adjc = coord;
      theta = delta_theta*float(i);
      adjc.x += cos(theta)*time*speed + time * speed_x;
      adjc.y -= sin(theta)*time*speed - time * speed_y;
      col = col + cos( (adjc.x*cos(theta) - adjc.y*sin(theta))*frequency)*intensity;
    }

    return cos(col);
  }

//---------- main

void main(void)
{
vec2 p = (gl_FragCoord.xy) / resolution.xy, c1 = p, c2 = p;
float cc1 = col(c1);

c2.x += resolution.x/delta;
float dx = emboss*(cc1-col(c2))/delta;

c2.x = p.x;
c2.y += resolution.y/delta;
float dy = emboss*(cc1-col(c2))/delta;

c1.x += dx*2.;
c1.y = -(c1.y+dy*2.);

float alpha = 1.+dot(dx,dy)*intence;
	
float ddx = dx - reflectionCutOff;
float ddy = dy - reflectionCutOff;
if (ddx > 0. && ddy > 0.)
	alpha = pow(alpha, ddx*ddy*reflectionIntence);

vec4 col = interpolation * texture2D(tex0, c1) + (1.0-interpolation)*texture2D(tex1, c1); 
col *= alpha;	
//vec4 col = texture2D(iChannel0,c1)*(alpha);
gl_FragColor = col;
}









