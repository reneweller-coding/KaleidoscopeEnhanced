#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file HyperlaneJunction.frag
 * @brief HYPERLANE JUNCTION: A massive cosmic traffic hub for FTL travel.
 * Neon-lit super-highways of light intersect in the void. Glowing pulses
 * (ships) zip past along these lanes at incredible speeds.
 *   audioAdvance -> camera flight speed through the junction
 *   audioKick    -> flashes from ships entering/exiting FTL
 *   audioSwell   -> brightness of the hyperlanes
 *   audioChromaHue-> palette offset for the neon lanes
 *
 * Per-activation variety:
 *   trafficP float density of the FTL traffic (0.5..1.5)
 *   laneP float complexity of the hyperlane grid (0.5..2.0)
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

uniform float trafficP;
uniform float laneP;
uniform float hueP; ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/// @brief Pseudo-random number 0..1 from a float.
float hash11( float n )
{
    return fract( sin( n * 127.1 ) * 43758.5453 );
}
/// @brief Pseudo-random number 0..1 from a 3D point.
float hash31( vec3 p )
{
    return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float tp = ( trafficP > 0.01 ? trafficP : 1.0 );
    float lp = ( laneP > 0.01 ? laneP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float drift = time * 3.0 + audioAdvance * 10.0;

    vec3 ro = vec3( 0.0, 0.0, drift );

    // Slow camera wandering
    ro.x += sin( time * 0.2 ) * 2.0;
    ro.y += cos( time * 0.3 ) * 2.0;

    vec3 ta = ro + vec3( sin( time * 0.1 ), cos( time * 0.1 ), 1.0 );

    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross( ww, vec3( 0.0, 1.0, 0.0 ) ) );
    vec3 vv = cross( uu, ww );

    float roll = 0.1 * sin( time * 0.2 ) + audioPhase * 0.1;
    vec2  ruv = mat2( cos( roll ), -sin( roll ), sin( roll ), cos( roll ) ) * uv;
    vec3  rd = normalize( ruv.x * uu + ruv.y * vv + 1.2 * ww );

    vec3 col = vec3( 0.0 );

    vec3 lane_color = imgPalette( 0.3 );
    vec3 ship_color = imgPalette( 0.8 + audioKick * 0.2 );

    // Grid raymarching for hyperlanes (using 3D grid intersection approach)
    // We'll simulate glowing lines on a 3D grid.

    vec3  p = ro;
    float d = 0.0;

    for ( int i = 0; i < 60; ++i )
    {
        vec3 q = ro + rd * d;

        // Grid coordinates
        vec3 grid_p = fract( q * lp ) - 0.5;
        vec3 id = floor( q * lp );

        // Distance to nearest grid lines
        vec3  dist_to_line = abs( grid_p );
        float d_line_x = max( dist_to_line.y, dist_to_line.z ); // Line along X
        float d_line_y = max( dist_to_line.x, dist_to_line.z ); // Line along Y
        float d_line_z = max( dist_to_line.x, dist_to_line.y ); // Line along Z

        // Minimum distance to any line
        float dl = min( min( d_line_x, d_line_y ), d_line_z );

        // Smooth line rendering (volumetric accumulation)
        float line_thickness = 0.055 + 0.04 * audioSwell; // floor so the lanes exist on quiet material
        if ( dl < line_thickness )
        {
            // Check if this grid cell actually has a lane
            float h = hash31( id );
            if ( h > 0.5 )
            {
                float alpha = smoothstep( line_thickness, 0.0, dl );

                // Traffic pulses along the lines
                float speed = 5.0 + hash11( h ) * 10.0;
                float dir = ( hash11( h + 1.0 ) > 0.5 ) ? 1.0 : -1.0;

                // Determine which axis we are on to animate the pulse correctly
                float axis_pos;
                if ( dl == d_line_x )
                    axis_pos = q.x;
                else if ( dl == d_line_y )
                    axis_pos = q.y;
                else
                    axis_pos = q.z;

                float pulse = step( 0.95, fract( axis_pos * 2.0 - time * speed * dir ) );

                // Kick flashes at intersections
                float intersection = step( 0.9, hash31( id + floor( time * 4.00 ) ) );
                float flash = intersection * audioKick * 5.0;

                vec3 local_col = lane_color * alpha * ( 0.75 + audioSwell * 0.5 );
                local_col += ship_color * pulse * alpha * ( 2.0 + audioKick * 2.0 ) * tp;
                local_col += vec3( 1.0 ) * flash * alpha;

                col += local_col * exp( -d * 0.05 );
            }
        }

        // Step forward. Since we use fract, we can step safely by distance to cell boundary
        vec3  dist_to_bound = ( sign( rd ) * 0.5 - grid_p ) / rd;
        float step_size = min( min( dist_to_bound.x, dist_to_bound.y ), dist_to_bound.z );
        d += max( 0.01, step_size / lp + 0.01 );

        if ( d > 40.0 )
            break;
    }

    // Background glow
    col += lane_color * 0.14 * ( 1.0 + audioSwell );

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
