#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file SpaceElevatorTransit.frag
 * @brief SPACE ELEVATOR TRANSIT: A high-speed ascent up a colossal space elevator
 * tether. The camera looks out from a glass transit pod, watching the glowing
 * planetary surface curve away below while massive orbital structures loom above.
 *   audioAdvance -> ascent speed of the elevator pod
 *   audioKick    -> flashes from passing structural rings and transit lights
 *   audioSwell   -> brightness of the planet's city lights below
 *   audioChromaHue-> palette offset for the elevator's neon lighting
 *
 * Per-activation variety:
 *   speedP float perceived speed of the transit (0.5..2.0)
 *   cityP float density and brightness of the planet below (0.5..1.5)
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

uniform float speedP; ///< Speed knob, 0..1.
uniform float cityP;
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

/// @brief Smooth value noise.
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

/// @brief Fractal noise: octaves of value noise.
float fbm( vec3 p )
{
    float f = 0.0, a = 0.5;
    for ( int i = 0; i < 4; ++i )
    {
        f += a * noise( p );
        p *= 2.0;
        a *= 0.5;
    }
    return f;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float sp = ( speedP > 0.01 ? speedP : 1.0 );
    float cp = ( cityP > 0.01 ? cityP : 1.0 );
    float hue = ( hueP > 0.01 ? hueP : 0.0 );

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    // We are looking downwards towards the planet surface while traveling UP the tether (Z axis)
    // Actually, looking slightly angled: Y is up/down the tether, X is side, Z is out window

    vec3 col = vec3( 0.0 );

    vec3 city_color = imgPalette( 0.8 + audioCentroid * 0.1 ); // Warm city lights
    vec3 struct_color = imgPalette( 0.2 );                     // Cold metal of the elevator
    vec3 neon_color = imgPalette( 0.5 );                       // Elevator interior/exterior lights

    float transit_speed = time * 5.0 * sp + audioAdvance * 10.0 * sp;

    // 1. The Planet Below
    // The planet is a massive sphere taking up the lower portion of the view
    // We approximate it with a large circle, but moving slightly away
    vec2  planet_center = vec2( 0.0, -1.5 );
    float planet_radius = 1.4;
    float dist_to_planet = length( uv - planet_center );

    if ( dist_to_planet < planet_radius )
    {
        // Surface
        vec2 p_uv = ( uv - planet_center ) * 2.0;

        // City light grid
        // We project it onto a sphere-like surface
        float sphere_z = sqrt( max( 0.0, 1.0 - dot( p_uv, p_uv ) ) );
        vec3  sphere_norm = vec3( p_uv, sphere_z );

        // Parallax effect as we move up
        vec3 proj_p = sphere_norm * 5.0;
        proj_p.y -= time * 0.2; // Slow rotation of the planet

        float city_detail = fbm( proj_p * 10.0 );
        float grid = step( 0.8, sin( proj_p.x * 50.0 ) ) * step( 0.8, sin( proj_p.y * 50.0 ) );

        float lights = city_detail * grid * cp;

        // Atmospheric scattering (limb darkening/brightening)
        float atmos = smoothstep( 0.8, 1.0, length( p_uv ) );

        vec3 surface_col = city_color * lights * ( 0.2 + audioSwell * 0.8 );
        surface_col = mix( surface_col, vec3( 0.1, 0.2, 0.5 ) * ( 0.5 + audioSwell ), atmos ); // blueish atmosphere
                                                                                               // edge

        col += surface_col;
    }
    else
    {
        // Atmospheric halo
        float halo = exp( -( dist_to_planet - planet_radius ) * 20.0 );
        col += vec3( 0.1, 0.2, 0.5 ) * halo * ( 0.5 + audioSwell );

        // Deep space background
        // Runde, gejitterte Sterne: ganze floor()-Zellen aufzuhellen ergibt
        // QUADRATE (der wiederholt gemeldete "Riesenpixel"-Fehler).
        vec2  sgrid = uv * 55.0;
        vec2  sid = floor( sgrid );
        vec2  sfr = fract( sgrid ) - 0.5;
        float sh = fract( sin( dot( sid, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        if ( sh > 0.90 )
        {
            vec2  spos = ( vec2( fract( sh * 7.31 ), fract( sh * 13.7 ) ) - 0.5 ) * 0.8;
            float sd2 = dot( sfr - spos, sfr - spos );
            float stw = 0.7 + 0.3 * sin( time * ( 1.0 + 2.0 * fract( sh * 29.0 ) ) + sh * 40.0 );
            col += vec3( 1.0 ) * exp( -sd2 * 250.0 ) * stw * ( 0.40 + audioSwell * 0.3 );
        }
    }

    // 2. The Elevator Tether and passing structures
    // The tether is a massive vertical pillar just outside the window (maybe off to the side)
    float tether_x = -0.68;
    float tether_width = 0.13;
    float dist_to_tether = abs( uv.x - tether_x );

    if ( dist_to_tether < tether_width )
    {
        // We are looking at the central pillar sliding down incredibly fast
        float slide_y = uv.y * 4.0 + transit_speed; // was *10: structure blurred into a smear

        // Horizontal structural rings passing by
        float rings = step( 0.9, fract( slide_y * 0.5 ) );
        float panels = fbm( vec3( uv.x * 50.0, slide_y, 0.0 ) );

        vec3 local_tether = mix( max( struct_color, vec3( 0.22 ) ) * 0.5, max( struct_color, vec3( 0.22 ) ), panels );

        // Cylindrical shading: cos() is symmetric about the tether axis --
        // the old sin() went NEGATIVE on the left half and blacked it out.
        float cylinder_shade = cos( ( uv.x - tether_x ) / tether_width * 1.57 );
        local_tether *= ( 0.40 + 0.60 * max( cylinder_shade, 0.0 ) );
        // Structural rings (computed before, never drawn).
        local_tether = mix( local_tether, max( struct_color, vec3( 0.3 ) ) * 1.5, rings * 0.6 );
        // A passing elevator car: a bright pod sliding along the tether.
        float car_phase = fract( transit_speed * 0.03 );
        float car = exp( -pow( ( uv.y - ( car_phase * 2.4 - 1.2 ) ) * 6.0, 2.0 ) );
        local_tether += neon_color * car * ( 1.2 + audioKick * 1.5 );

        // Neon tracking lights sliding past
        float track_light = step( 0.98, fract( slide_y * 0.1 ) ) * step( tether_width * 0.8, dist_to_tether );
        local_tether += neon_color * track_light * ( 2.0 + audioKick * 5.0 );

        // Add passing support beams overlapping the tether
        float beam = step( 0.95, fract( slide_y * 0.05 ) );
        local_tether = mix( local_tether, struct_color * 0.2, beam );

        col = local_tether;
    }

    // 3. Interior of our transit pod (framing the view)
    // Frame at the top and right
    float frame_top = smoothstep( 0.45, 0.5, uv.y );
    float frame_right = smoothstep( 0.7, 0.8, uv.x );
    float frame_left = smoothstep( -0.8, -0.9, uv.x );
    float frame = max( frame_top, max( frame_right, frame_left ) );

    if ( frame > 0.0 )
    {
        vec3 frame_col = struct_color * 0.1; // dark interior

        // Reflection of neon lights on the glass
        float reflection = step( 0.98, fract( ( uv.y * 10.0 + transit_speed ) * 0.1 ) ) * ( 1.0 - frame );
        col += neon_color * reflection * 0.5 * ( 1.0 + audioKick );

        // Mix frame
        col = mix( col, frame_col, frame );
    }

    // Speed lines (optical illusion of high speed particles/dust outside the window)
    float speed_dust = hash11(
        dot( floor( vec2( uv.x * 50.0, uv.y * 10.0 + transit_speed * 2.0 ) ), vec2( 1.2, 3.4 ) ) );
    if ( speed_dust > 0.99 && frame == 0.0 )
    {
        col += vec3( 1.0 ) * ( 0.5 + audioKick );
    }

    if ( hue > 0.001 )
        col = hueRot( col, 0.2 * sin( hue ) );

    // Soft-knee exposure
    vec3 cat_tone = max( col, 0.0 );
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( clamp( cat_tone, 0.0, 1.0 ), 1.0 );
}
