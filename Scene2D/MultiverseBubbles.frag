#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file MultiverseBubbles.frag
 * @brief MULTIVERSE BUBBLES: Floating in the higher-dimensional 'bulk', we see
 * countless other universes drifting like massive, glowing bubbles. When they
 * collide, catastrophic flashes of energy bridge the voids between them, syncing
 * to the audio kicks.
 *   audioAdvance -> slow drift through the bulk
 *   audioKick    -> flashes when universes bump into each other
 *   audioSwell   -> ambient brightness of the multiverse
 *   audioChromaHue-> palette offset for the bulk space
 *
 * Per-activation variety:
 *   bubbleP float density and number of universes (0.5..1.5)
 *   bulkP float brightness of the higher-dimensional space (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float bubbleP;
uniform float bulkP;
uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float bp = ( bubbleP > 0.01 ? bubbleP : 1.0 );
    float bkp = ( bulkP > 0.01 ? bulkP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float drift = time * 0.1 + audioAdvance * 0.2;
    vec3  ro = vec3( drift, 0.0, drift );

    // Smooth camera rotation
    float rot = sin( time * 0.1 ) * 0.2;
    mat2  rot_m = mat2( cos( rot ), -sin( rot ), sin( rot ), cos( rot ) );
    vec2  ruv = rot_m * uv;
    vec3  rd = normalize( vec3( ruv, 1.0 ) );

    vec3 col = vec3( 0.0 );

    vec3 bulk_color = imgPalette( 0.1 );                         // Deep, weird color for the bulk
    vec3 bubble_color = imgPalette( 0.8 + audioCentroid * 0.1 ); // Bright edge of universes

    // Background bulk (higher dimensional fluid/fog)
    float bulk_fog = fbm( vec3( uv * 2.0, drift * 0.5 ) );
    col += bulk_color * bulk_fog * 0.5 * bkp * ( 1.0 + audioSwell );

    // Raymarching spheres (Universes)
    float d = 0.0;
    vec3  p;
    float density_accum = 0.0;

    // Domain repetition for bubbles
    float cell_size = 3.0 / bp;

    for ( int i = 0; i < 40; ++i )
    {
        p = ro + rd * d;

        vec3 cell_p = p / cell_size;
        vec3 i_cell = floor( cell_p );
        vec3 f_cell = fract( cell_p ) - 0.5; // -0.5 to 0.5

        // Direkter fract(sin(dot))-Hash: hash11 mit Riesenargument kollabiert
        // auf der GPU (Praezision), das Blasenfeld war entartet.
        float cell_hash = fract( sin( dot( i_cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );

        // Randomize bubble position within cell
        vec3 offset = vec3(
                          hash11( cell_hash ) - 0.5,
                          hash11( cell_hash + 1.0 ) - 0.5,
                          hash11( cell_hash + 2.0 ) - 0.5 )
                      * 0.5;

        // Random radius
        float radius = 0.2 + 0.3 * hash11( cell_hash + 3.0 );

        // Calculate distance to this sphere
        vec3  local_p = f_cell - offset;
        float dist_to_center = length( local_p );
        float dist_to_sphere = dist_to_center - radius;

        // We only render the *surface* of the bubble (the membrane)
        float membrane = abs( dist_to_sphere );

        if ( membrane < 0.09 )
        {
            float alpha = smoothstep( 0.09, 0.0, membrane ) * 0.28;

            // Inside the bubble is another universe (different fbm pattern)
            float inside = fbm( p * 5.0 + cell_hash * 100.0 );

            // The membrane glows
            vec3 local_col = bubble_color * ( 0.5 + inside * 0.5 );

            // Universes bumping into each other causing flashes
            // We use cell_hash to trigger random flashes
            // Sanftes Aufglimmen statt 5-Hz-Strobo.
            float collision = pow( 0.5 + 0.5 * sin( time * ( 0.6 + cell_hash * 1.5 ) + cell_hash * 40.0 ), 8.0 );
            local_col += bubble_color * collision * ( 0.5 + audioKick * 2.0 ) * bkp;

            // Fresnel effect for the bubble (brighter on edges)
            // We approximate normal based on local_p
            vec3  normal = normalize( local_p );
            float fresnel = 1.0 - max( 0.0, dot( normal, -rd ) );
            fresnel = pow( fresnel, 3.0 );

            local_col += vec3( 1.0 ) * fresnel * ( 1.0 + audioSwell );

            col += local_col * alpha * ( 1.0 - density_accum );
            density_accum += alpha;

            if ( density_accum > 0.95 )
                break;
        }

        // Advance ray
        // Safe step size to not miss thin membranes
        d += max( 0.02, abs( dist_to_sphere ) * 0.5 );
        if ( d > 15.0 )
            break;
    }

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
