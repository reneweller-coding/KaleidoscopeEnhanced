#version 330 core
/*****************************************************************************\
 *                              VoidLeviathan.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  VOID LEVIATHAN: Encounter with a colossal, space-dwelling entity in the deep abyss.
 *
 *  The creature's leathery skin is covered in bioluminescent patterns that pulse to the beat, while massive
 *  tentacles drift past.
 *
 *    audioAdvance -> flight speed alongside the leviathan
 *    audioKick    -> bright bioluminescent flashes on the creature's skin
 *    audioSwell   -> ambient visibility (starlight revealing the sheer scale)
 *    audioChromaHue-> palette offset for the bioluminescence
 *
 *  Per-activation variety:
 *    scaleP float apparent scale/distance to the creature (0.5..1.5)
 *    glowP float intensity of the bioluminescent patterns (0.5..2.0)
 *    hueP float palette offset (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance; ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                            ///< backwards).
// Both count from THIS activation instead of from the program start.
uniform float sceneTime;      ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float scaleP; ///< Scale knob.
uniform float glowP;  ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/**  The photo at a coordinate: the cross-fade of tex0 and tex1.
 *
 * @param uv  Coordinate in the photo, 0..1. (in)
 *
 * @return
 *   The cross-faded photo colour (RGB).
 **/
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/**  The house palette: a colour of the photo on an arc that turns with the music's hue.
 *
 * @param t  Position on the palette arc, 0..1 for one turn. (in)
 *
 * @return
 *   The palette colour (RGB).
 **/
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  Rotates a colour's hue by an angle (about the grey axis).
 *
 * @param c  The colour. (in)
 * @param a  The angle in radians. (in)
 *
 * @return
 *   The colour with its hue turned.
 **/
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/**  Pseudo-random number 0..1 from a float.
 *
 * @param n  The input value. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash11( float n )
{
    return fract( sin( n * 127.1 ) * 43758.5453 );
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
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

/**  Smooth value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The noise value, 0..1.
 **/
float noise( vec3 p )
{
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix( mix( hash11( n + 0.0 ), hash11( n + 1.0 ), f.x ),
             mix( hash11( n + 57.0 ), hash11( n + 58.0 ), f.x ), f.y ),
        mix( mix( hash11( n + 113.0 ), hash11( n + 114.0 ), f.x ),
             mix( hash11( n + 170.0 ), hash11( n + 171.0 ), f.x ), f.y ),
        f.z );
}

/**  Fractal noise: octaves of value noise.
 *
 * @param p  The point. (in)
 *
 * @return
 *   The fractal noise value, about 0..1.
 **/
float fbm( vec3 p )
{
    float f = 0.0, a = 0.5;
    for ( int i = 0; i < 5; ++i )
    {
        f += a * noise( p );
        p *= 2.0;
        a *= 0.5;
    }
    return f;
}

/**  Map the leviathan's body and tentacles
 *
 * @param p   The point. (in)
 * @param sp  Scene parameter (see the file). (in)
 *
 * @return
 *   The distance to the nearest surface.
 **/
float map( vec3 p, float sp )
{
    float d = 1e10;

    // Main body (massive, slowly undulating surface)
    float body = p.x + 10.0 * sp;
    body -= fbm( p * 0.1 - vec3( time * 0.5, 0.0, 0.0 ) ) * 3.0 * sp;
    body -= fbm( p * 0.5 ) * 0.5 * sp; // leathery skin texture

    d = min( d, body );

    // Huge tentacles drifting past
    vec3 q = p;
    q.y = mod( q.y, 20.0 ) - 10.0;
    q.z += sin( p.y * 0.1 + time ) * 5.0; // undulating movement
    q.x += cos( p.y * 0.1 + time * 0.8 ) * 3.0;

    float tentacle = length( q.xz ) - 1.5 * sp;
    tentacle -= fbm( p * 1.0 ) * 0.3 * sp; // bumpy skin on tentacles

    d = min( d, tentacle );

    return d;
}

/**  Surface normal of the distance field by central differences.
 *
 * @param p   The surface point. (in)
 * @param sp  Scene parameter passed to the field. (in)
 *
 * @return
 *   The unit normal.
 **/
vec3 calcNormal( vec3 p, float sp )
{
    vec2 e = vec2( 0.1, 0.0 );
    return normalize( vec3(
        map( p + e.xyy, sp ) - map( p - e.xyy, sp ),
        map( p + e.yxy, sp ) - map( p - e.yxy, sp ),
        map( p + e.yyx, sp ) - map( p - e.yyx, sp ) ) );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float sp = ( scaleP > 0.01 ? scaleP : 1.0 );
    float gp = ( glowP > 0.01 ? glowP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // The distance flown is the coordinate the noise field is sampled at --
    // it MUST start at 0 with every entrance.  With `time` it stood at 7200
    // here after an hour, and `sin(n * 12.9898)` has no resolution left for
    // neighbouring cells at such arguments: the noise turns constant and the
    // picture flat or black.  The music's push stays; it, too, just counts
    // from the entrance.
    float drift = sceneTime * 2.0 + sceneAdvance * 5.0;

    // Camera is drifting alongside the massive creature
    vec3 ro = vec3( 0.0, drift, time * 2.0 );
    vec3 ta = ro + vec3( -0.2, 1.0, 0.2 ); // Looking slightly towards the body

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    float roll = 0.05 * sin( time * 0.2 );
    vec2  ruv = mat2( cos( roll ), -sin( roll ), sin( roll ), cos( roll ) ) * uv;
    vec3  rd = normalize( ruv.x * uu + ruv.y * vv + 1.2 * ww );

    float d = 0.0;
    vec3  p;
    int   steps = 0;

    for ( int i = 0; i < 80; ++i )
    {
        p = ro + rd * d;
        float ds = map( p, sp );
        steps = i;
        if ( ds < 0.05 * ( 1.0 + d * 0.05 ) )
            break;
        d += ds * 0.8;
        if ( d > 80.0 )
            break;
    }

    vec3 col = vec3( 0.0 );

    vec3 biolum_color = imgPalette( 0.7 + audioCentroid * 0.2 ); // bioluminescent glow
    vec3 skin_color = vec3( 0.17, 0.23, 0.28 ); // dark, deep sea/void color -- but a body that reads, not a silhouette

    if ( d < 80.0 )
    {
        vec3 n = calcNormal( p, sp );

        // Ambient starlight / very faint distant sun
        vec3  light_dir = normalize( vec3( 1.0, 0.5, 0.5 ) );
        float dif = max( dot( n, light_dir ), 0.0 );

        col = skin_color * ( 0.38 + dif * ( 0.8 + audioSwell * 0.4 ) );

        // Bioluminescent patterns on the skin
        // Create intricate patterns using fbm and sine waves
        float pattern = fbm( p * 2.0 / sp );
        float stripe = sin( p.y * 2.0 + pattern * 10.0 - time * 5.0 );
        stripe = smoothstep( 0.45, 0.9, stripe ); // sharp stripes, but wide enough to actually appear

        // Reaction to kick
        float flash = step( 0.9, hash11( floor( p.y * 0.5 ) + floor( time * 4.00 ) ) );

        col += biolum_color * stripe * gp * ( 1.35 + flash * audioKick * 5.0 );

        // Specular reflection (wet/leathery)
        float spec = pow( max( dot( reflect( -light_dir, n ), -rd ), 0.0 ), 16.0 );
        col += vec3( 0.2 ) * spec * ( 0.1 + audioSwell * 0.2 );

        col *= clamp( 1.0 - float( steps ) * 0.01, 0.1, 1.0 );
    }
    else
    {
        // Deep void background
        col = vec3( 0.02, 0.03, 0.045 ) * ( 1.0 + audioSwell );

        // Sparse stars
        for ( int i = 0; i < 2; ++i )
        {
            float sc = 50.0 + 50.0 * float( i );
            vec3  st = rd * sc;
            vec3  cell = floor( st );
            vec3  f = fract( st ) - 0.5;
            if ( hash11( dot( cell, vec3( 12.3, 45.6, 78.9 ) ) ) > 0.99 )
            {
                col += vec3( 0.5, 0.6, 0.8 ) * exp( -length( f ) * length( f ) * 400.0 );
            }
        }
    }

    // Depth fog (the void is murky). The weight has to GROW with distance:
    // exp(-d*k) is 1.0 AT the camera, so mixing toward black by it erased
    // everything NEAR the viewer -- the leviathan itself -- and kept only
    // the far background. Applied to the hit only; the starfield branch
    // sits at a fixed d=80 and would be fogged to black outright.
    if ( d < 80.0 )
        col = mix( col, vec3( 0.0 ), 1.0 - exp( -d * 0.03 ) );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
