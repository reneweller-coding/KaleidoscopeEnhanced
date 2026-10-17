#version 330 core
/*****************************************************************************\
 *                              GasGiantCloudCity.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  GAS GIANT CLOUD CITY: Floating, sleek megastructures drifting deep within the incredibly thick, turbulent
 *  atmosphere of a gas giant.
 *
 *  Massive lightning storms illuminate the dense clouds from within, syncing to the beat.
 *
 *    audioAdvance -> flight speed through the heavy clouds
 *    audioKick    -> massive lightning flashes in the clouds
 *    audioSwell   -> ambient glow of the floating city structures
 *    audioChromaHue-> palette offset for the gas giant clouds
 *
 *  Per-activation variety:
 *    cloudP float turbulence and thickness of the clouds (0.5..1.5)
 *    cityP float density/brightness of the floating structures (0.5..2.0)
 *    hueP float palette offset (0..6.28)
 *
 *  @author René Weller
 */
out vec4 fragColor; ///< The pixel's colour (output).

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since this activation, plus a rolled start (see sceneTime).
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

uniform float cloudP; ///< Cloud knob: turbulence and thickness of the clouds (0.5..1.5).
uniform float cityP;  ///< City knob: density/brightness of the floating structures (0.5..2.0).
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
    float cp = ( cloudP > 0.01 ? cloudP : 1.0 );
    float cy = ( cityP > 0.01 ? cityP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // We are flying through a thick atmosphere (no stars, just clouds)
    // Map uv to a perspective view facing forwards
    // The distance flown is the coordinate the noise field is sampled at --
    // it MUST start at 0 with every entrance.  With `time` it stood at 7200
    // here after an hour, and `sin(n * 12.9898)` has no resolution left for
    // neighbouring cells at such arguments: the noise turns constant and the
    // picture flat or black.  The music's push stays; it, too, just counts
    // from the entrance.
    float drift = sceneTime * 2.0 + sceneAdvance * 5.0;

    // Y is up/down in the atmosphere, X is sideways, Z is forwards
    // The clouds are organized in massive horizontal bands

    vec3 col = vec3( 0.0 );
    // Brightness floor: on dark photos the plain palette was black and the
    // whole scene stayed black with it ("stays black").
    vec3 cloud_color = max( imgPalette( 0.3 ), vec3( 0.14, 0.11, 0.08 ) );
    vec3 lightning_color = max( imgPalette( 0.8 + audioCentroid * 0.1 ), vec3( 0.65, 0.6, 0.5 ) );
    vec3 city_color = max( imgPalette( 0.5 ), vec3( 0.30, 0.24, 0.14 ) );

    // 1. Thick Volumetric Clouds
    // We use a simplified raymarch/layering for speed

    float total_density = 0.0;
    vec3  atmos_col = vec3( 0.0 );

    for ( int i = 0; i < 5; ++i )
    {
        float z = 1.0 + float( i ) * 0.5; // distance of layer
        vec2  p_uv = uv * z;
        p_uv.y += sin( time * 0.1 ) * 0.1; // slow bobbing

        // Parallax movement
        float layer_drift = drift / z;

        // Massive cloud bands
        vec3  p3 = vec3( p_uv.x, p_uv.y * 5.0 * cp, layer_drift );
        float clouds = fbm( p3 );

        // Add turbulent swirls
        clouds = fbm( p3 + fbm( p3 * 2.0 ) );

        float density = smoothstep( 0.3, 0.7, clouds );

        // Lightning deep in the clouds
        // Triggers randomly but heavily influenced by audioKick
        float flash_trigger = step( 0.9, hash11( floor( p3.x * 2.0 ) + floor( p3.z * 0.5 ) + floor( time * 4.00 ) ) );
        float flash = flash_trigger * audioKick * 5.0 * density;

        // Add color
        float alpha = density * 0.4;
        vec3  layer_col = mix( cloud_color * ( 0.4 + audioSwell * 0.35 ), lightning_color, flash );

        atmos_col += layer_col * alpha * ( 1.0 - total_density );
        total_density += alpha;

        if ( total_density > 0.95 )
            break;
    }

    col = atmos_col;

    // 2. Floating City Structures
    // Sleek, dark geometric shapes floating in the foreground and midground
    // They pass by occasionally

    float struct_drift = drift * 1.5;
    vec2  struct_uv = uv * 2.0;

    // Grid for placing structures
    float grid_x = floor( struct_uv.x * 2.0 + struct_drift * 0.5 );
    float grid_z = floor( struct_drift ); // using time as depth progression

    float struct_hash = hash11( grid_x * 12.3 + grid_z * 45.6 );

    if ( struct_hash > ( 1.0 - 0.2 * cy ) )
    { // Probability of a structure
        // Local coordinates within the cell
        vec2 local_uv = fract( vec2( struct_uv.x * 2.0 + struct_drift * 0.5, struct_uv.y + struct_hash ) );
        local_uv = local_uv * 2.0 - 1.0;

        // Shape of the floating structure (aerodynamic/sleek)
        float d = length( vec2( local_uv.x, local_uv.y * 5.0 ) ); // stretched vertically

        if ( d < 0.3 )
        {
            vec3 s_col = vec3( 0.05 ); // dark hull

            // Neon strips/windows
            float windows = step( 0.8, sin( local_uv.y * 100.0 ) );
            float edge_light = smoothstep( 0.25, 0.3, d );

            s_col = mix( s_col, city_color * ( 1.0 + audioSwell ), windows * ( 1.0 - edge_light ) * cy );

            // Atmospheric fog over the structure based on its "depth"
            // The structure is in front, so minimal fog, but edges fade into clouds
            float fog = smoothstep( 0.2, 0.3, d );

            col = mix( s_col, col, fog );
        }
    }

    // 3. Fast passing wisps of gas (very close to camera)
    float wisps = fbm( vec3( uv * 10.0, drift * 3.0 ) );
    col = mix( col, cloud_color * ( 0.7 + audioSwell ), smoothstep( 0.35, 0.75, wisps ) * 0.55 );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
