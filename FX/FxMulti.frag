#version 330 core
out vec4 fragColor;
/**
 * @file FxMulti.frag
 * @brief FX MULTI: mirrored tile grid -- the scene repeats into a "copies" x
 * "copies" grid of mirrored tiles, optionally rotated 45 deg.
 *   audioPhase -> per-activation continuous grid spin (spinP)
 *   audioSwell -> the whole grid looms slightly closer on loudness swells
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float copies;
uniform int rot;

uniform float audioPhase;      // slow jump-free rotation of the tile grid
uniform float audioSwell;      // slow loudness swell -> the grid looms closer

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float spinP;           // grid spin speed (0 -> static, like the original)

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


void main() {

    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.y;
	p.y /= resolution.y;
	
	p.x -= 0.5*resolution.x/resolution.y;
	p.y -= 0.5;
	
	// The tile grid looms slightly closer with the slow loudness swell.
	float cop = copies * (1.0 - 0.06 * audioSwell);
	p.y = p.y * cop;
	p.x = p.x * cop;


	if( rot > 0 )
		p = rotate( p, 3.14159265359 / 4.0 );

	// Per-activation: slow continuous jump-free spin of the whole grid.
	if( spinP > 0.001 )
		p = rotate( p, audioPhase * spinP + time * 0.01 * spinP );

	p = clampQuadratic( p );
	
	//GL_MIRRORED_REPEAT in Software to get uniform tiles
		
    fragColor = interpolation * texture(tex0,p) + (1.0-interpolation)*texture(tex1, p);
}