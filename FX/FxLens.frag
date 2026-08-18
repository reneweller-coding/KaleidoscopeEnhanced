#version 330 core
out vec4 fragColor;
/**
 * @file FxLens.frag
 * @brief FX LENS: four orbiting refractive lens bubbles bend the scene through
 * a spherical-cap refraction model, like magnifying glasses drifting
 * around the frame in a slow circle.
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;


//vec2 getModifiedUV(vec2 actualUV, vec2 pointUV, float radius, float strength)
//{
//	vec2 vecToPoint = pointUV - actualUV;
//	float distToPoint = length(vecToPoint);
	
//	float mag = (1.0 - (distToPoint / radius)) * strength;
//	mag *= step(distToPoint, radius);
	
//	if( mag != 0 )//rwrwtest
//	return (0,0);//rwrwtest
	
//	return actualUV + (mag * vecToPoint);
//}

#define pi 3.141592653589793238462643383279

float atan2(float y, float x){
	if(x>0.) return atan(y/x);
	if(y>=0. && x<0.) return atan(y/x) + pi; 
	if(y<0. && x<0.) return atan(y/x) - pi; 
	if(y>0. && x==0.) return pi/2.;
	if(y<0. && x==0.) return -pi/2.;
	if(y==0. && x==0.) return pi/2.; // undefined usually
	return pi/2.;
}

vec2 uv_polar(vec2 uv, vec2 center){
	vec2 c = uv - center;
	float rad = length(c);
	float ang = atan2(c.x,c.y);
	return vec2(ang, rad);
}

vec2 getModifiedUV(vec2 uv, vec2 position, float radius, float refractivity){
	vec2 polar = uv_polar(uv, position);
	float cone = clamp(1.-polar.y/radius, 0., 1.);
	float halfsphere = sqrt(1.-pow(cone-1.,2.));
	float w = atan2(1.-cone, halfsphere);
	float refrac_w = w-asin(sin(w)/refractivity);
	float refrac_d = 1.-cone - sin(refrac_w)*halfsphere/cos(refrac_w);
	vec2 refrac_uv = position + vec2(sin(polar.x),cos(polar.x))*refrac_d*radius;
	return mix(uv, refrac_uv, float(length(uv-position)<radius));
}

void main(void)
{
	const float radius = 0.15;
	float strength = 115.9;
	
	float minRes = min(resolution.x, resolution.y); 
	vec2 uv1 = gl_FragCoord.xy / resolution.xy;
	
	float offset = 0.3;
	
	float speed = 0.4;
	vec2 cst = vec2( cos(speed*time), sin(speed*time) );
    mat2 rot = mat2(cst.x,-cst.y,cst.y,cst.x);
    
    vec2 pos1 = vec2( 0.0, offset );
    pos1 = rot*pos1;
	pos1 += vec2(0.5, 0.5);
	vec2 modifiedUV1 = getModifiedUV(
		uv1,
		pos1,
		radius,
		strength );
	
	vec2 pos2 = vec2( 0.0, -offset );
    pos2 = rot*pos2;
	pos2 += vec2(0.5, 0.5);
	
	vec2 modifiedUV2 = getModifiedUV(
		uv1,
		pos2,
		radius,
		strength );
		
		
	vec2 pos3 = vec2( offset, 0.0 );
    pos3 = rot*pos3;
	pos3 += vec2(0.5, 0.5);
	
	vec2 modifiedUV3 = getModifiedUV(
		uv1,
		pos3,
		radius,
		strength );
		
	vec2 pos4 = vec2( -offset, 0.0 );
    pos4 = rot*pos4;
	pos4 += vec2(0.5, 0.5);
	
	vec2 modifiedUV4 = getModifiedUV(
		uv1,
		pos4,
		radius,
		strength );
	
	vec2 uv = 0.25*(modifiedUV1 + modifiedUV2+modifiedUV3 + modifiedUV4 );	

    fragColor = interpolation * texture(tex0, uv) + (1.0-interpolation)*texture(tex1, uv);
}