#version 330 core
/*****************************************************************************\
 *                              FluidSim.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  GPU "ink" simulation step: an RGB dye field is advected semi-Lagrangian along the CURL of a noise potential.
 *
 *  A curl field is divergence-free by construction, so the dye flows like an incompressible fluid (smoke / ink in
 *  water) WITHOUT a pressure solve — one texture, one pass, runs on any iGPU.  The source image is continuously
 *  injected as fresh dye, so the picture itself becomes the ink that swirls, folds and dissolves.
 *
 *  Driven by FilterShader::stepFluid():
 *    flowPhase = integrated (time + audioAdvance) -> jump-free evolution
 *    impulse   = slew-limited bass/beat -> stronger swirl on heavy passages
 *    injectAmt = dye refresh rate (onsets pour in extra ink)
 *    seedMode 1 -> first frame: initialise the dye with the image
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform sampler2D texPrev;       ///< dye state (RGB)
uniform sampler2D tex0;          ///< source images
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform vec2      resolution;    ///< sim grid size
uniform float     seedMode;      ///< How the simulation is seeded (pattern of the start state).
uniform float     flowPhase;     ///< Phase of the flow field (integrated).
uniform float     impulse;       ///< Strength of the injected impulse.
uniform float     injectAmt;     ///< How much dye is injected.
uniform float     stepScale;     ///< The step's length in 120-Hz frames (1 at 120 Hz, 2 on a 60-Hz panel).
uniform float     fluidDepth;    ///< The photo's depth as a landscape for the flow, 0..1 (0: off, the old step).
uniform vec2      photoDepthAmt; ///< x: the photo in tex0 carries a depth map in its alpha, y: the one in tex1.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv )
             + ( 1.0 - interpolation ) * texture( tex1, uv ) )
        .rgb;
}

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
}
/**  Smooth value noise, 0..1.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float vnoise( vec2 p )
{
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i ), b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) ), d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

/**  Noise potential (2 octaves, drifting with the integrated flow phase).
 *
 * @param p  The point. (in)
 *
 * @return
 *   The potential's value.
 **/
float psi( vec2 p )
{
    return vnoise( p * 3.0 + vec2( 0.0, flowPhase ) )
           + 0.5 * vnoise( p * 6.0 + vec2( 3.7, -flowPhase * 0.7 ) );
}

/**  The photos' relief at a coordinate: nearness (1 = near, 0 = far) from the photos' alpha, cross-faded like the
 * colour and weighted per slot by photoDepthAmt -- 0 for a photo without a map, so its slot adds nothing and a
 * photo change fades the landscape instead of switching it.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The weighted nearness, 0..1.
 *
 * A coarse mip level: the map is 8 bit and 512 wide.
 **/
float relief( vec2 uv )
{
    return interpolation * photoDepthAmt.x * textureLod( tex0, uv, 3.0 ).a
           + ( 1.0 - interpolation ) * photoDepthAmt.y * textureLod( tex1, uv, 3.0 ).a;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    if ( seedMode > 0.5 )
    {
        fragColor = vec4( img( uv ), 1.0 );
        return;
    }

    // Velocity = curl of the potential (finite differences): rotate the
    // gradient 90 degrees -> divergence-free swirl field.
    float e = 2.0 / resolution.x;
    float dx = psi( uv + vec2( e, 0.0 ) ) - psi( uv - vec2( e, 0.0 ) );
    float dy = psi( uv + vec2( 0.0, e ) ) - psi( uv - vec2( 0.0, e ) );
    vec2  vel = vec2( dy, -dx ) / ( 2.0 * e );

    // The photo's depth as a landscape (plan 27.11. P7; fluidDepth 0 or no map: nothing of this runs).  mapW is how
    // much of the cross-faded picture has a map at all, nearW the weighted nearness here, grad points uphill = towards
    // the near.
    float mapW = interpolation * photoDepthAmt.x + ( 1.0 - interpolation ) * photoDepthAmt.y;
    bool  land = fluidDepth > 0.0 && mapW > 0.0;
    float nearW = 0.0;
    if ( land )
    {
        float r1 = 4.0 / resolution.x, r2 = 9.0 / resolution.x;
        nearW = relief( uv );
        vec2  grad = 0.5
                     * ( vec2( relief( uv + vec2( r1, 0.0 ) ) - relief( uv - vec2( r1, 0.0 ) ),
                               relief( uv + vec2( 0.0, r1 ) ) - relief( uv - vec2( 0.0, r1 ) ) )
                             / ( 2.0 * r1 )
                         + vec2( relief( uv + vec2( r2, 0.0 ) ) - relief( uv - vec2( r2, 0.0 ) ),
                                 relief( uv + vec2( 0.0, r2 ) ) - relief( uv - vec2( 0.0, r2 ) ) )
                               / ( 2.0 * r2 ) );
        float slope = length( grad );
        vec2  up = grad / max( slope, 1e-4 );
        float wall = smoothstep( 0.25, 3.0, slope );
        // Deflection: the part of the flow that runs uphill, into the near thing, is taken out -- the flow follows
        // the contour lines around it.  Downhill passes.
        vel -= fluidDepth * wall * max( dot( vel, up ), 0.0 ) * up;
        // The near is a soft obstacle: the flow slows down there (never to a stop).
        vel *= 1.0 - 0.7 * fluidDepth * smoothstep( 0.45, 0.95, nearW );
        // A slope carries the dye downhill, towards the far.
        vel -= 1.2 * fluidDepth * wall * up;
    }

    // Semi-Lagrangian advection: fetch the dye from where it came from.
    // (Magnitude capped so noise-gradient spikes can't teleport the ink.)
    float mag = min( length( vel ), 3.0 );
    vec2  vdir = vel / max( length( vel ), 1e-4 );
    vec2  disp = vdir * mag * ( 0.0012 + 0.0016 * impulse ) * stepScale;
    vec3  dye = texture( texPrev, uv - disp ).rgb;

    // Slow fade + continuous image injection: the picture is the ink source,
    // so the field stays recognisably image-coloured while it swirls.
    // Fade and injection per 120-Hz frame, compounded over the step's length.
    if ( land )
    {
        // The dye collects in the far: it fades more slowly there and the photo refreshes it less, so the old ink
        // stays and swirls; the near is refreshed faster and stays the picture.  Both stay convex mixes of the old
        // dye and the photo -- nothing can grow.
        float farW = mapW - nearW;
        vec3  src = img( uv );
        float inj = clamp( injectAmt, 0.0, 0.2 ) * clamp( 1.0 + fluidDepth * ( 1.5 * nearW - 0.6 * farW ), 0.0, 3.0 );
        dye *= pow( mix( 0.996, 0.9988, fluidDepth * farW ), stepScale );
        dye = mix( dye, src, 1.0 - pow( 1.0 - min( inj, 0.5 ), stepScale ) );
    }
    else
    {
        dye *= pow( 0.996, stepScale );
        dye = mix( dye, img( uv ), 1.0 - pow( 1.0 - clamp( injectAmt, 0.0, 0.2 ), stepScale ) );
    }

    fragColor = vec4( dye, 1.0 );
}
