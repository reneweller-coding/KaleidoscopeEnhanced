#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CyberpunkSynthGridHighwayFly.frag
 * @brief CYBERPUNK SYNTH GRID HIGHWAY FLY: High-velocity 3D flight across an
 * endless neon wireframe synthesizer highway with audio-reactive mountain equalizers,
 * a giant segmented laser horizon sun, and gleaming digital data streams.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives high-speed highway flight progression
 *   audioKick    -> flashes sun horizon flares & highway laser pulse
 *   audioBass/SubBass -> elevates mountain equalizer peaks
 *   audioCentroid-> sharpens wireframe neon grid anti-aliasing
 *   audioChromaHue-> rotates the retrowave magenta/cyan/sunset palette
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

// Per-activation variety
uniform float speedP;       ///< Speed knob, 0..1.
uniform float heightP;      ///< Height knob, 0..1.
uniform float gridDensityP; ///< Grid density knob, 0.8..1.4.
uniform float glowP;        ///< Glow / afterglow knob, 0..1.
uniform float hueP;         ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  Procedural mountain height function reacting to audio bass
 *
 * @param p      Position on the ground. (in)
 * @param t      The scene's time. (in)
 * @param hMult  Height knob. (in)
 *
 * @return
 *   The terrain height.
 **/
float terrainHeight( vec2 p, float t, float hMult )
{
    float h = 0.0;
    // Flat highway in center: |p.x| < 1.0
    float highway_mask = smoothstep( 0.8, 2.5, abs( p.x ) );

    // Mountain ridges on sides
    float n1 = sin( p.x * 0.8 + t * 0.2 ) * cos( p.y * 0.6 );
    float n2 = sin( p.x * 1.6 - p.y * 1.2 ) * 0.5;
    float n3 = abs( sin( p.x * 3.2 + p.y * 2.5 ) ) * 0.25;

    h = ( n1 + n2 + n3 ) * ( 1.2 + 1.5 * audioBass ) * hMult * highway_mask;
    return h;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float h_m = ( heightP > 0.01 ) ? heightP : 1.0;
    float g_dens = ( gridDensityP > 0.01 ) ? gridDensityP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    // Steady base rate + musical push. audioAdvance alone barely moves on
    // quiet material -- the reported "the scene stands still, nobody flies".
    float t = time * 0.40 * spd + audioAdvance * 0.35 * spd;

    // Camera setup: low hovering perspective above cyber highway
    vec3 ro = vec3( sin( t * 0.3 ) * 0.4, 0.8 + 0.2 * sin( audioSwell * 2.0 ), t * 4.0 );
    vec3 rd = normalize( vec3( uv.x, uv.y - 0.15, 1.2 ) );

    vec3 col = vec3( 0.0 );

    // March the terrain for EVERY ray.  Splitting sky and ground at rd.y == 0
    // cut every mountain off flat at the horizon line (reported): a ridge that
    // rises above eye level is seen along an UPWARD ray, and those rays were
    // never asked about the terrain at all.  Now the sky is drawn only where
    // the march misses, so the ridges stand in front of the sun.
    float t_ground = 0.0;
    vec3  p_ground = ro;
    bool  hit_ground = false;
    for ( int i = 0; i < 72; ++i )
    {
        p_ground = ro + rd * t_ground;
        float h = terrainHeight( p_ground.xz, t, h_m );
        float d = p_ground.y - h;
        if ( d < 0.01 * ( 1.0 + t_ground * 0.1 ) )
        {
            hit_ground = true;
            break;
        }
        if ( t_ground > 40.0 )
            break;
        t_ground += max( 0.04, d * 0.55 );
    }

    // Horizon sun and sky rendering, only where no ridge is in the way
    if ( !hit_ground )
    {
        // Giant synth sun on horizon
        vec2  sun_uv = uv - vec2( 0.0, 0.05 );
        float d_sun = length( sun_uv );

        if ( d_sun < 0.45 )
        {
            // Horizontal laser blinds scanlines in sun
            float scanlines = cos( sun_uv.y * 60.0 - t * 4.0 );
            float sun_mask = smoothstep( 0.45, 0.43, d_sun ) * step( 0.0, scanlines + ( sun_uv.y + 0.2 ) * 2.0 );

            // Sun color gradient (yellow to hot magenta)
            vec3 sun_col = mix( vec3( 1.5, 1.2, 0.2 ), vec3( 1.8, 0.2, 0.9 ),
                                clamp( ( sun_uv.y + 0.4 ) / 0.8, 0.0, 1.0 ) );
            col += sun_col * sun_mask * ( 1.0 + 1.5 * audioKick );
        }

        // Sky synth grid
        float sky_grid = abs( sin( rd.x * 20.0 / max( 0.05, rd.y ) ) )
                         * abs( sin( 1.0 / max( 0.05, rd.y ) * 8.0 - t * 2.0 ) );
        col += imgPalette( 0.8 ) * smoothstep( 0.9, 1.0, sky_grid ) * 0.25 * audioHigh;

        // Sky gradient
        col += mix( imgPalette( 0.3 ) * 0.2, imgPalette( 0.75 ) * 0.6, clamp( rd.y * 2.0, 0.0, 1.0 ) );
    }

    // The terrain, wherever the march reached it
    if ( hit_ground )
    {
        // Compute neon wireframe grid lines on terrain
        vec2 grid_coord = p_ground.xz * ( 2.0 * g_dens );
        vec2 grid_fract = abs( fract( grid_coord - 0.5 ) - 0.5 );
        // Bright tonal content pulls the smoothstep edge in, so the neon grid
        // resolves to hard hairlines instead of soft fat bands.
        float line_width = 0.06 * ( 1.0 - 0.35 * audioCentroid ) * ( 1.0 + 0.05 * t_ground );
        float line_dist = min( grid_fract.x, grid_fract.y );
        float grid_line = smoothstep( line_width, 0.0, line_dist );

        // Highway center laser stripes
        float center_stripe = smoothstep( 0.08, 0.0, abs( p_ground.x ) )
                              * smoothstep( 0.3, 0.0, abs( fract( p_ground.z * 0.5 - t * 2.0 ) - 0.5 ) );

        // Sample texture on terrain
        vec2 sample_uv = fract( p_ground.xz * 0.1 );
        vec3 tex_col = img( sample_uv );

        // Cyber grid colors (cyan wireframe, magenta terrain, gold stripes)
        vec3 terrain_base = imgPalette( p_ground.y * 0.3 + 0.1 ) * 0.3;
        vec3 wire_col = vec3( 0.2, 1.4, 1.8 ) * ( 1.0 + 2.0 * audioKick ) * glw;
        vec3 stripe_col = vec3( 1.8, 1.4, 0.2 ) * ( 1.5 + 3.0 * audioKick );

        vec3 ground_col = mix( terrain_base, tex_col, 0.3 );
        ground_col += wire_col * grid_line;
        ground_col += stripe_col * center_stripe;

        // Depth fog on terrain
        float depth_fog = 1.0 - exp( -t_ground * 0.08 );
        ground_col = mix( ground_col, imgPalette( 0.7 ) * 0.5, depth_fog );

        col = ground_col;
    }

    col = pow( col, vec3( 0.88 ) );
    fragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
