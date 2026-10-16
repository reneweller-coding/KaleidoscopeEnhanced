#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file CyberpunkWireframeTerrainFlyover.frag
 * @brief CYBERPUNK WIREFRAME TERRAIN FLYOVER: fast flight over an infinite 80s
 * synthwave neon wireframe plain toward a segmented vector laser sun, stars
 * above.  (A mountain height function used to be computed here and never
 * drawn -- the plane is projected, not marched -- so the header no longer
 * promises mountains it cannot show.)
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous high-velocity forward flight across terrain
 *   audioKick    -> flashes laser sun segments & sends ground grid shockwaves
 *   audioCentroid-> sharpens wireframe anti-aliasing & starfield sparkles
 *   audioChromaHue-> rotates the synthwave neon magenta/cyan/orange palette
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
uniform float speedP; ///< Speed knob, 0..1.
uniform float terrainHeightP;
uniform float gridDensityP;
uniform float glowP; ///< Glow / afterglow knob, 0..1.
uniform float hueP;  ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float g_dens = ( gridDensityP > 0.01 ) ? gridDensityP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    // Steady base rate + musical push. audioAdvance alone barely moves on
    // quiet material -- the reported "the scene stands still, nobody flies".
    float t = time * 0.40 * spd + audioAdvance * 0.35 * spd;

    // Horizon line at y = 0.05
    float horizon = 0.05;

    vec3 final_col = vec3( 0.0 );

    if ( uv.y < horizon )
    {
        // Ground / Mountain terrain ray projection
        float d_y = horizon - uv.y;
        float depth = 1.2 / max( 0.02, d_y );
        // Nearly three times the old ground speed: at t*4 the tiles crawled
        // (reported).  The sun and the stars keep their own slower rates.
        vec2 ground_pos = vec2( uv.x * depth * 0.8, depth + t * 11.0 );

        // Neon wireframe grid calculation
        vec2 grid = fract( ground_pos * ( 0.8 * g_dens ) ) - 0.5;
        // Bright tonal content narrows the smoothstep edge -- crisper wireframe
        // hairlines on shimmer-heavy material, soft wide bands on dark drones.
        float grid_edge = 0.08 * ( 1.0 - 0.35 * audioCentroid );
        float grid_line = smoothstep( grid_edge, 0.0, min( abs( grid.x ), abs( grid.y ) ) );

        // Sample distorted background photo on ground
        vec2 sample_uv = fract( ground_pos * 0.1 + 0.5 );
        vec3 tex_col = img( sample_uv );

        // Wireframe synthwave palette
        vec3 pal_ground = imgPalette( ground_pos.y * 0.05 + 0.1 );
        vec3 base_ground = mix( tex_col * 0.3, pal_ground * 0.4, 0.5 );

        vec3 grid_tint = vec3( 1.6, 0.3, 1.2 ) * grid_line * ( 1.0 + 2.5 * audioKick ) * glw;
        vec3 ground_col = base_ground + grid_tint;

        // Depth fog towards the horizon, into the SKY colour at the line: a
        // palette grey there stood as a flat band under the sun.
        float fog = smoothstep( 0.0, 0.35, d_y );
        vec3  horizon_col = mix( vec3( 0.15, 0.05, 0.25 ), imgPalette( 0.8 ) * 0.4, 0.35 );
        final_col = mix( horizon_col, ground_col, fog );
    }
    else
    {
        // Sky with segmented synthwave laser sun
        vec2  sun_uv = uv - vec2( 0.0, horizon + 0.25 );
        float r_sun = length( sun_uv );

        if ( r_sun < 0.28 )
        {
            // Horizontal blind segments across sun
            float segment = sin( sun_uv.y * 45.0 );
            float sun_mask = smoothstep( -0.2, 0.5, segment );

            // Sun gradient (yellow top to magenta bottom)
            vec3 sun_col = mix( vec3( 1.9, 0.2, 0.8 ), vec3( 1.9, 1.6, 0.2 ),
                                clamp( sun_uv.y / 0.28 + 0.5, 0.0, 1.0 ) );
            final_col = sun_col * sun_mask * ( 1.2 + 1.8 * audioKick );
        }
        else
        {
            // Sky gradient with stars. The comment and the catalog's
            // "starfield sparkles" promise were both here, but no star was
            // ever drawn -- only the plain two-colour gradient below.
            float sky_t = clamp( ( uv.y - horizon ) / 0.8, 0.0, 1.0 );
            vec3  sky_col = mix( vec3( 0.15, 0.05, 0.25 ), vec3( 0.02, 0.01, 0.08 ), sky_t );

            // Static star lattice: one candidate per cell, kept sparse by the
            // hash threshold. Scrolls sideways with the flight (a fixed rate,
            // never audio-scaled), and audioCentroid sharpens each point --
            // a brighter mix resolves finer, harder sparkles. The exponent
            // rides on a 0..1 falloff so this can only narrow the star, and
            // the whole term is capped well below the sun so the sky cannot
            // wash out.
            vec2  star_cell = uv * 26.0 + vec2( t * 0.35, 0.0 );
            vec2  star_id = floor( star_cell );
            float h = fract( sin( dot( star_id, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
            if ( h > 0.90 )
            {
                vec2  star_f = fract( star_cell ) - 0.5;
                float sd = 1.0 - clamp( length( star_f ) * 3.4, 0.0, 1.0 );
                float twink = 0.55 + 0.45 * sin( audioPhase * 2.0 + h * 43.0 );
                float star = pow( sd, 6.0 + 10.0 * audioCentroid ) * twink;
                // Fade the field out toward the horizon haze so stars sit in
                // the deep sky only, matching the gradient underneath them.
                sky_col += vec3( 0.75, 0.80, 1.0 ) * min( star * sky_t, 0.5 );
            }
            final_col = sky_col;
        }

        // Sun corona flare
        float sun_flare = exp( -r_sun * 6.0 ) * ( 0.8 + 1.5 * audioKick );
        final_col += vec3( 1.8, 1.2, 0.6 ) * sun_flare;
    }

    final_col = pow( final_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( final_col, 0.0, 1.0 ), 1.0 );
}
