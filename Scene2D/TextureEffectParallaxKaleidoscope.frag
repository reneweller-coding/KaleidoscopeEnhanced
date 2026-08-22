#version 330 core
out vec4 fragColor;
/**
 * @file TextureEffectParallaxKaleidoscope.frag
 * @brief A mirrored-segment kaleidoscope viewed through a 32-layer retro
 *        pixel-parallax: each depth layer is a coarsely pixellated sample of
 *        the kaleidoscope-warped photo, offset by its own orbiting parallax
 *        drift, composited front layer over back until a luma test decides
 *        the ray has "hit" something.
 *
 * Audio Reactivity:
 *  - audioAdvance  -> adds to the parallax orbit angle (integrated, jump-free), on
 *                     top of the base speedMovement*time drift
 *  - audioPhase    -> adds to the mirrored-segment rotation angle inside the
 *                     per-layer kaleidoscope sample (integrated, jump-free)
 *  - audioSwell    -> widens the orbit radius (`extend`) on slow energy swells
 *  - audioZCR      -> RETRO PIXEL GRAIN: broadband noisiness coarsens the parallax
 *                     quantisation grid, so a harsh mix breaks the image into fat
 *                     lo-fi blocks and a pure tone keeps it fine. The grid step is
 *                     divided out again when the layer UV is rebuilt, so the framing
 *                     and orbit radius are untouched -- only the blockiness moves
 *  - audioFlatness -> PARALLAX DEPTH: a tonal spectrum makes the ray "hit" early, so
 *                     few layers composite and the mosaic reads crisp and near; a
 *                     noise-like one lets it fall deep into the stack, hazing out
 *  - audioMode     -> HAZE COLOUR: the depth fog the deep layers fade into is a cold
 *                     blue-grey in minor keys and a warm sand-grey in major ones
 */
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float interpolationRotation;
uniform float speed;
uniform int sides;
uniform float power;
uniform int rotate;
uniform float speedMovement;// = 5.0;
uniform	float extend;// = 4000;
uniform int direction;
uniform float audioPhase;     // integrated audio rotation phase (radians, jump-free)
uniform float audioAdvance;   // integrated parallax-orbit drift (jump-free)
uniform float audioSwell;     // slow energy envelope widens the orbit
uniform float audioZCR;       // 0=pure tone .. 1=broadband noise -> retro pixel grain
uniform float audioFlatness;  // 0=tonal .. 1=noise-like -> how deep the parallax stack reads
uniform float audioMode;      // 0=minor/cold .. 1=major/warm -> depth-haze colour


const float M_PI = 3.141592653589793;

vec3 getKaleidoscopeColor( vec2 coord )
{

	coord *= resolution;
    // normalize to the center
	vec2 p;
    p.x = coord.x;
    p.y = coord.y;
	p.x /= resolution.y;
	p.y /= resolution.y;
	p.x -= 0.5*resolution.x/resolution.y;
	p.y -= 0.5;

    p = 4.0 * p;


    float angle = 0.0;
    if( rotate > 0 )
       angle = M_PI*0.25;

    // a rotation
    //vec2 cst = vec2( cos(interpolationRotation), sin(interpolationRotation) );
    vec2 cst = vec2( cos(angle), sin(angle) );
    mat2 rot = mat2(cst.x,-cst.y,cst.y,cst.x);
    p = rot*p;
//rwrwtest

    // power was never registered in any preset (always 0, GL's unset-uniform
    // default) -- 1.0/(2.0*power) divided by zero, sending r to infinity for
    // every pixel. 1.0 reproduces the plain Euclidean length() case.
    float powV = (power > 0.01) ? power : 1.0;
    float r = pow( pow(p.x*p.x,powV) + pow(p.y*p.y,powV), 1.0/(2.0*powV) );

    // cartesian to polar coordinates
    //float r = length(p);
    float a = atan(p.y, p.x);

    // kaleidoscope
    float sidesK = .5*float(sides);
    float tau = 1. * 1.047;
    a = mod(a, tau/sidesK);
    a = abs(a - tau/sidesK/2.);
    a += time*speed + 0.3*audioPhase; // base rotation + jump-free audio rotation

    // polar to cartesian coordinates
    p = r * vec2(cos(a), sin(a));

    return (interpolation * texture(tex0,p+0.5) + (1.0-interpolation)*texture(tex1, p + 0.5)).rgb;
    //return interpolation * texture(tex0,uv) + (1.0-interpolation)*texture(tex1,uv);
}


void main(void)
{

	vec2 pixel;// = clampQuadratic( gl_FragCoord );
	pixel.x = gl_FragCoord.x - resolution.x*.5;
	//pixel.y = gl_FragCoord.y - (resolution.y/resolution.x)*resolution.x*.5;
	pixel.y = gl_FragCoord.y - resolution.y*.5;


	//float speedMovement = 5.0;
	//float extend = 4000;

	// pixellate.  audioZCR coarsens the quantisation STEP: noisy, broadband
	// material breaks the parallax into fat lo-fi blocks, a pure tone keeps it
	// fine.  The same step is divided back out when the layer UV is rebuilt
	// below (and the orbit offset is expressed in the same grid units), so the
	// framing, zoom and orbit radius are all unchanged -- only the block size
	// moves.  A plain per-frame grid parameter; it never scales a time term.
	const float pixelSize = 0.25;
	float quant = pixelSize * (1.0 + 0.70*clamp(audioZCR, 0.0, 1.0));
	pixel = floor(pixel/quant);



	float rotDir = 1.0;
	if( direction > 0 )
		rotDir = -1.0;

	//vec2 offset = vec2(time*3000.0,pow(max(-sin(time*.2),.0),2.0)*16000.0)/pixelSize;
	//vec2 offset = vec2(pow(cos(time*.2),2.0)*16000.0,pow(sin(time*.2),2.0)*16000.0)/pixelSize;
	float orbit = speedMovement*time*.2 + 0.15*audioAdvance;      // jump-free audio drift
	float ext   = extend*(1.0 + 0.12*audioSwell);                 // orbit widens on swells
	vec2 offset = vec2(cos(orbit)*ext,sin(rotDir*orbit)*ext)/quant;
	//vec2 offset = vec2(cos(speedMovement*.2)*extend,sin(speedMovement*.2)*extend)/pixelSize;

	//resolution.y/resolution.x*

	// Spectral flatness decides how DEEP the ray falls into the 32-layer stack
	// before it counts as a hit: a tonal, single-band spectrum hits early (crisp,
	// near mosaic), a noise-like one sinks deep and hazes out.
	// (centred on the original 1.0; the `i == 31` guard below keeps the last
	// layer always hitting, which the fixed threshold used to do implicitly.)
	float hitScale = 1.15 - 0.30*clamp(audioFlatness, 0.0, 1.0);
	// ...and the musical mode colours the depth fog those deep layers fade into.
	vec3 haze = mix( vec3(0.42,0.46,0.58), vec3(0.58,0.52,0.42),
	                 clamp(audioMode, 0.0, 1.0) );

	vec3 col = vec3(0.0);
	for ( int i=0; i < 32; i++ )
	{
		// parallax position, whole pixels for retro feel
		//float depth = 20.0+float(i);
		float depth = 37.5+float(i);
		vec2 uv = pixel + floor(offset/depth);

		uv /= resolution.xy;
		uv *= depth/40.0;
		//uv *= 0.4*pixelSize;
		uv *= 0.8*quant;

		col = getKaleidoscopeColor( uv+.5 );//interpolation * texture(tex0,uv+.5) + (1.0-interpolation)*texture(tex1, uv+.5);
//texture( iChannel0, uv+.5 ).rgb;

		if ( 1.0-col.y < float(i+1)/32.0 * hitScale || i == 31 )
		{
			//col = mix( vec3(.4,.6,.7), col, exp2(-float(i)*.1) );
			col = mix( haze, col, exp2(-float(i)*.1) );
			break;
		}
	}

	col /= 1.0 + 0.55 * max(col.r, max(col.g, col.b));   // over-bright tail (final review)
	fragColor = vec4(col,1.0);//vec4( getKaleidoscopeColor( pixel+.5 ), 1.0 );//vec4(col,1.0);
}