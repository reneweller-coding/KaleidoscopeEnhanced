#version 330 core
out vec4 fragColor;
/**
 * @file TunnelPlain.frag
 * @brief A stripped-down mirrored-segment kaleidoscope tunnel: no base
 *        rotation/tilt, just the polar fold into `sides` wedges mapped onto a
 *        forward-scrolling UV. Includes an unused `clampQuadratic` helper
 *        (its call site is commented out) left over from an aspect-correction
 *        experiment.
 *
 * audioFlip is declared but not read in main().
 *
 * Audio Reactivity:
 *  - audioAdvance  -> adds to the forward scroll (integrated, jump-free)
 *  - audioBeat     -> brightens the final colour
 *  - audioLevel    -> brightens the final colour
 *  - audioFlatness -> WEDGE SHAPE: scales the superellipse exponent of the radial
 *                      metric, so a tonal, single-band spectrum keeps the fold's
 *                      cross-section taut and structured while a noise-like one
 *                      rounds it into a soft, organic bore
 *  - audioHat      -> RIM SHIMMER: hi-hats and cymbals brighten only the outer rim of
 *                      the tunnel mouth, leaving the deep centre untouched, so the
 *                      shimmer reads as light catching the near edge
 *  - audioLowMid   -> WARMTH: 150-500 Hz harmonic body tints the walls from cool
 *                      steel toward warm amber (luminance-matched, no exposure change)
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float speed;
uniform int sides;
uniform float power;
uniform float audioBeat;
uniform float audioLevel;
uniform float audioFlip;
uniform float audioAdvance;    // integrated, jump-free audio tunnel advance
uniform float audioFlatness;   // 0=tonal .. 1=noise-like -> superellipse wedge shape
uniform float audioHat;        // hi-hat/cymbal onset envelope -> rim shimmer
uniform float audioLowMid;     // 150-500 Hz harmonic warmth -> wall colour


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


void main() {

    // normalize to the center
	vec2 p;
    p.x = gl_FragCoord.x;
    p.y = gl_FragCoord.y;
	p.x /= resolution.y;
	p.y /= resolution.y;
	p.x -= 0.5*resolution.x/resolution.y;
	p.y -= 0.5;

//Tunnel foreward    
    p = 3.0 * p;
    

    // Spectral flatness reshapes the radial metric: a tonal, single-band
    // spectrum keeps the bore's cross-section taut and structured, a noise-like
    // one rounds it out into a soft, organic shape.  A pure per-frame SHAPE
    // parameter -- it never touches 'time', so no phase can be remapped.
    // (Multiplicative on purpose: if 'power' is unset the behaviour is exactly
    // as before, no new division-by-zero case is introduced or removed.)
    float powV = power * (0.80 + 0.40*clamp(audioFlatness, 0.0, 1.0));
    float r = pow( pow(p.x*p.x,powV) + pow(p.y*p.y,powV), 1.0/(2.0*powV) );

    // cartesian to polar coordinates
    //float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sidesK = .5*float(sides);
    float tau = 1. * 1.047;
    a = mod(a, tau/sidesK);
    a = abs(a - tau/sidesK/2.);
 
	vec2 uv;
    uv.x = (speed * time + audioAdvance + .1/r);
    uv.y = (a/3.1416);
 
    //uv = clampQuadratic( uv );  
    
    vec4 col = interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);
    col.rgb *= (1.0 + audioBeat * 0.2 + audioLevel * 0.2);

    // Hats catch only the RIM of the tunnel mouth (large r), never the deep
    // centre, so the shimmer reads as light glancing off the near edge rather
    // than as a full-frame flash.
    col.rgb *= 1.0 + 0.28*clamp(audioHat, 0.0, 1.0)*smoothstep(0.35, 1.30, r);

    // Low-mid harmonic body warms the walls from cool steel toward amber.
    col.rgb *= mix(vec3(0.90, 0.96, 1.10), vec3(1.10, 1.00, 0.90),
                   clamp(audioLowMid, 0.0, 1.0));

    fragColor = clamp(col, 0.0, 1.0);
}