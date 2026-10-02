#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FxSphere.frag
 * @brief FX SPHERE: circular lens region that tiles the scene into
 * concentric repeated copies radiating from the centre, drifting over time
 * and optionally rotated; outside the lens the scene passes through
 * unchanged.
 *
 * This effect declares no audio-reactive uniforms.
 *   interpolation -> linearly cross-fades tex0 over tex1, both inside and
 *                    outside the lens
 */
// FxSphere.frag (Inigo Quilez, iq/2013)
// FX SPHERE: a circular lens region tiles the scene into "copies"
// concentric repeats radiating from the centre, drifting and optionally
// rotated; outside the lens the scene passes through unchanged.
uniform vec2 resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float radius;
uniform float nrCopies;
uniform float speed;
uniform int rot;
uniform float audioAdvance; ///< music drives the radial drift
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

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


/// @brief Entry point of this shader stage (the file description says what it draws).
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
	  uv1.x = p.x*f + speed*(time + 0.4*audioAdvance);
	  uv1.y = p.y*f + speed*time;
	    
	  if( rot > 0 )
		uv1 = rotate( uv1, 3.14159265359 / 4.0 );
		
	  uv1 = clampQuadratic( uv1 );
	  
	  fragColor = interpolation * texture(tex0, uv1) + (1.0-interpolation)*texture(tex1, uv1);
	}
}