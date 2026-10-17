#version 330 core
/*****************************************************************************\
 *                              DysonSphereCollapse.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  DYSON SPHERE COLLAPSE: A massive metal shell completely encasing a star is suffering a catastrophic structural
 *  failure.
 *
 *  The enraged star's plasma bursts violently through the shattering metal plates, tearing the megastructure apart
 *  in sync with the audio.
 *
 *    audioAdvance -> slow rotation/drift of the crumbling sphere
 *    audioKick    -> massive plasma eruptions blowing off armor plates
 *    audioSwell   -> blinding internal brightness of the trapped star
 *    audioChromaHue-> palette offset for the escaping stellar plasma
 *
 *  Per-activation variety:
 *    damageP float extent of the structural damage (0.5..1.5)
 *    flareP float intensity of the escaping plasma (0.5..2.0)
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

uniform float audioPhase;     ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;     ///< Overall loudness, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;  ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float damageP; ///< Damage knob: extent of the structural damage (0.5..1.5).
uniform float flareP;  ///< Flare knob: intensity of the escaping plasma (0.5..2.0).
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/**  Weight that closes atan's cut: 0 over most of the circle, 1 at a = pi.  A noise of an angle from atan() does
 *   not repeat after a turn and tears along the cut; mixed toward the same noise of a - 2*pi near a = pi it meets,
 *   at the cut, exactly the value on the other side (17.10.2026).
 *
 * @param a  The angle, -pi..pi. (in)
 *
 * @return
 *   The weight, 0..1.
 **/
float seamW( float a )
{
    return smoothstep( 2.5, 3.14159265, a );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dp = ( damageP > 0.01 ? damageP : 1.0 );
    float fp = ( flareP > 0.01 ? flareP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    vec3 col = vec3( 0.0 );

    vec3 metal_col = vec3( 0.30, 0.33, 0.38 ); // armored metal -- bright enough to read as METAL next to the glowing
                                               // breaches, not as black holes
    vec3 plasma_col = imgPalette( 0.8 + audioCentroid * 0.1 ); // Blinding hot star
    // The palette follows the photo -- on a dark photo the star inside the
    // shell rendered BLACK, so every blown-off panel read as an ugly hole
    // ("defekte Normalen"). A star has a floor temperature: keep it hot.
    plasma_col = max( plasma_col, vec3( 0.95, 0.52, 0.22 ) * 0.42 );

    // We render the sphere filling most of the view
    vec2  sphere_center = vec2( 0.0 );
    float sphere_rad = 0.62; // the whole sphere visible, room for the corona
    float dist = length( uv - sphere_center );

    // Slow rotation
    float rot = time * 0.1 + audioAdvance * 0.5;
    mat2  rot_m = mat2( cos( rot ), -sin( rot ), sin( rot ), cos( rot ) );

    if ( dist < sphere_rad )
    {
        // Map 2D to 3D sphere
        float z = sqrt( max( 0.0, sphere_rad * sphere_rad - dist * dist ) );
        vec3  p3 = vec3( uv.x, uv.y, z );

        // Apply rotation
        p3.xz = rot_m * p3.xz;
        p3.yz = mat2( cos( 0.3 ), -sin( 0.3 ), sin( 0.3 ), cos( 0.3 ) ) * p3.yz;

        // 1. The Metal Structure: a LAT/LON panel lattice on the sphere
        // surface. The old cubic floor(p3*8) grid cut the shell into the
        // broken-looking random chips the user reported -- panels must
        // follow the surface to read as a built megastructure.
        vec3  p3n = p3 / sphere_rad;
        float lat = asin( clamp( p3n.y, -1.0, 1.0 ) );
        float lon = atan( p3n.z, p3n.x );
        vec2  grid = vec2( lon * 3.0, lat * 3.0 ); // ~19 x 9 panels
        vec2  g_id = floor( grid );
        vec2  g_f = fract( grid );

        float cell_hash = fract( sin( dot( g_id, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );

        // Panel edges: dark seams between curved plates
        float edges = 1.0
                      - ( smoothstep( 0.0, 0.06, g_f.x ) * smoothstep( 1.0, 0.94, g_f.x )
                          * smoothstep( 0.0, 0.06, g_f.y ) * smoothstep( 1.0, 0.94, g_f.y ) );
        float panels = 1.0 - edges;

        // Add structural ribbing (fbm) + per-panel tonal variation
        float ribbing = fbm( p3 * 20.0 );
        vec3  surface_col = metal_col * ( 0.5 + ribbing * 0.35 + cell_hash * 0.25 );
        surface_col *= 0.35 + 0.65 * panels; // dark seams

        // Lighting on the metal from ambient space
        float light_front = 0.62 + 0.38 * z / sphere_rad;
        surface_col *= light_front;

        // 2. The Catastrophic Damage -- with an actual COLLAPSE ARC: a slow
        // triangle wave sweeps the blow-off threshold, so the shell visibly
        // loses more and more panels, then slowly reknits.
        float collapse = abs( fract( time * 0.02 + audioAdvance * 0.01 ) * 2.0 - 1.0 );
        float fracture = fbm( p3 * 3.0 + time * 0.1 );

        // Probability of a panel being completely blown off
        float blown_off = step( 0.95 - collapse * 0.55 - dp * 0.15, cell_hash + fracture * 0.35 );

        // If a panel is missing or there's a deep fracture, the star shines through
        float hole_mask = max( blown_off, smoothstep( 0.8 - dp * 0.2, 0.9, fracture ) );

        if ( hole_mask > 0.0 )
        {
            // Looking at the star inside
            // Deep plasma noise
            float internal_plasma = fbm( vec3( p3 * 5.0 - vec3( 0.0, time * 2.0, 0.0 ) ) );

            // Brightness spikes with audio kicks
            float kick_spike = step( 0.7, hash11( cell_hash * 100.0 + floor( time * 1.50 ) ) );
            float intensity = 1.0 + ( kick_spike * audioKick * 10.0 * fp );

            // Blinding heat
            surface_col = mix( surface_col,
                               plasma_col * ( 1.0 + internal_plasma ) * intensity * ( 0.7 + audioSwell * 1.1 ),
                               hole_mask ); // was 1.0+swell*2: with the hot plasma floor the sphere washed out to
                                            // near-white

            // The metal edges of the hole are melting/glowing red hot
            float melt_edge = smoothstep( 0.0, 0.1, hole_mask );
            surface_col += plasma_col * melt_edge * 0.5 * ( 1.0 + audioSwell );
        }

        // Limb darkening for the sphere
        float limb = smoothstep( sphere_rad, sphere_rad * 0.7, dist );
        col += surface_col * limb;
    }
    else
    {
        // Deep space outside the sphere
        float bg = hash11( dot( floor( uv * 100.0 ), vec2( 12.3, 45.6 ) ) );
        if ( bg > 0.99 )
            col += vec3( 1.0 ) * ( 0.1 + audioSwell * 0.1 );
    }

    // 3. Erupting Solar Flares escaping through the cracks
    // We project flares outwards from the center, masked by the holes in the sphere
    float angle = atan( uv.y, uv.x );

    // Create a 3D coordinate on the edge of the sphere based on angle to check if there's a hole
    vec3 edge_p3 = vec3( cos( angle ) * sphere_rad, sin( angle ) * sphere_rad, 0.0 );
    edge_p3.xz = rot_m * edge_p3.xz;
    edge_p3.yz = mat2( cos( 0.3 ), -sin( 0.3 ), sin( 0.3 ), cos( 0.3 ) ) * edge_p3.yz;

    float edge_fracture = fbm( edge_p3 * 3.0 + time * 0.1 );
    vec3  edge_i_cell = floor( edge_p3 * 8.0 );
    float edge_cell_hash = hash11( edge_i_cell.x * 12.3 + edge_i_cell.y * 45.6 + edge_i_cell.z * 78.9 );
    float edge_blown_off = step( 0.7 - dp * 0.2, edge_cell_hash + edge_fracture * 0.5 );
    float edge_hole_mask = max( edge_blown_off, smoothstep( 0.8 - dp * 0.2, 0.9, edge_fracture ) );

    if ( dist > sphere_rad - 0.05 && edge_hole_mask > 0.0 )
    {
        // A massive plasma jet escaping this hole
        // Noise for the jet shape
        float flare_noise = mix( fbm( vec3( angle * 5.0, dist * 5.0 - time * 5.0, 0.0 ) ),
                                 fbm( vec3( ( angle - 6.2831853 ) * 5.0, dist * 5.0 - time * 5.0, 0.0 ) ),
                                 seamW( angle ) );

        // The flare gets weaker further out
        float flare_falloff = exp( -( dist - sphere_rad ) * ( 10.0 / fp ) );

        // Flash on kick
        float jet_spike = step( 0.95, mix( hash11( floor( angle * 5.0 ) + floor( time * 4.00 ) ),
                                           hash11( floor( ( angle - 6.2831853 ) * 5.0 ) + floor( time * 4.00 ) ),
                                           seamW( angle ) ) );
        float jet_intensity = 1.0 + ( jet_spike * audioKick * 10.0 * fp );

        float flare = smoothstep( 0.3, 0.8, flare_noise ) * flare_falloff * edge_hole_mask;
        col += plasma_col * flare * jet_intensity * ( 1.0 + audioSwell );
    }

    // Overwhelming glare from the failing containment
    float total_glare = exp( -dist * 1.5 );
    col += plasma_col * total_glare * 0.2 * ( 1.0 + audioSwell * 0.5 ) * fp * dp;

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
