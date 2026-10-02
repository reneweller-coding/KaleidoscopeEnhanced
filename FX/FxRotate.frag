#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FxRotate.frag
 * @brief FX ROTATE: plain continuous rotation of the scene around its centre,
 * direction and speed set per activation.
 */
uniform vec2 resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float speed;
uniform int direction;
uniform float audioPhase;   ///< integrated music phase: modulates spin RATE, never jitters
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

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


/// @brief Entry point of this shader stage (the file description says what it draws).
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
	
	float spd = (direction > 0) ? -speed : speed;   // never write to a uniform

	float ang = spd*time + sign(spd)*0.25*audioPhase;
	p *= 1.0 - 0.06*audioSwell;                      // gentle zoom breath
	vec2 cst = vec2( cos(ang), sin(ang) );
    mat2 rot = mat2(cst.x*resolution.y/resolution.x,-cst.y,cst.y*resolution.y/resolution.x,cst.x);
    
    
    //p = clampQuadratic(p);
    
    p = rot*p;
    
    
    //p.x += 0.5*resolution.y/resolution.x;
    //p.y += 0.5;
    
    p.x += 0.5;
	p.y += 0.5;
	
	//p.x += 0.5*(resolution.x-resolution.y)/resolution.x;
    
    //p = clampQuadratic(p);
    	
    fragColor = interpolation * texture(tex0,p) + (1.0-interpolation)*texture(tex1, p);

}