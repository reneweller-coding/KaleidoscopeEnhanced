#version 330 core
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform int positive;// = 0; //positive or negative display
uniform float posX;
uniform float posY;
uniform float posZ;
uniform float divisor;
uniform float fiOffset;//original = 0.1
//uniform float timefactor;
uniform float audioAdvance;   // integrated drift: the inkblot morphs with the music (jump-free)
uniform float audioKick;      // kick throb on the blot intensity
uniform float audioLevel;     // louder music = denser ink


const float speed = 0.5;
//const float divisor = 0.01;//original=50; //Je kleiner desto mehr Bewegung, aber auch schneller //sollte in Abh�ngigkeit von timefactor gesetzt werden
const float factor = 0.2;//original = 1.0
const float potence = 70.0;//70.0;//original = 30.0 //zoom
//const float timefactor = 0.1; //Geschwindigkeit, sollte in Abh�ngigkeit von divisor gesetzt werden
const float diminishing = 1.0;//original = 1.0;//speed
const float distancefactor = 500.0;//200old original 1.0 blur //Gr�sse der Kugeln
//const float posX = 0.2;//original = 0.5,0.9,0.75
//const float posY = 0.7;
//const float posZ = 0.9;
const float fiFactor = 0.1;//original = 0.1
//const int positive = 0; //positive or negative display

void main(void)
{
	//vec2 uv = gl_FragCoord.xy / resolution.xy - 0.5;
	vec2 uv = gl_FragCoord.xy / resolution.x;
	uv.x -= 0.5;
	uv.y -= 0.5 * (resolution.y / resolution.x);
	
	
	float timefactor = 5.0*divisor;//rwrwtodo
	
	if( uv.x > 0.0 )
		uv.x = -uv.x;
	
	float d = 0.0;
	for (int i=0; i<124; i++)//actually, the higher the better
	{
		float fi = float(i);
		fi *= diminishing;
		float offset = sin(fiOffset+fi/divisor);
		float offset2 = speed*cos(fi/divisor);
		
		//vec3 pos = offset2*sin( timefactor*time*offset*vec3(posX,posY,posZ)+0.1*fi );
		vec3 pos = offset2*sin( timefactor*time*offset*vec3(posX,posY,posZ)+0.1*fi+0.25*audioAdvance );

		//d += distancefactor*pow(clamp((1.0-abs(distance(vec3(uv.x,uv.y,uv.x+uv.y), pos))),0.0,1.0),potence);
		d += distancefactor*pow(clamp((1.0-abs(distance(vec3(uv.x,uv.y,uv.x+uv.y), pos))),0.0,1.0),potence);
	}
	
	//d = clamp(d,0.0,0.0125)*80.0;
	d *= 1.0 + 0.25*audioLevel + 0.35*audioKick;
	
	float noise = 1.0;//0.2*sin(uv.y*1800.0)+1.0-2.0*abs(uv.x);	
	//float noise = 0.2*sin(uv.y*1800.0)+1.0-2.0*abs(uv.x);	
	
	
	//vec4 col = vec4(1.75,1.75,1.75,1.0)*d*noise;
	float colorfactor = 0.25;//original 1.75
	vec4 col = vec4(colorfactor,colorfactor,colorfactor,1.0)*d*noise;
	if (positive > 0 )
		col = 1.0-col;
	fragColor = col;
}