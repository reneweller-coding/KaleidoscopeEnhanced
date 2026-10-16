#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file NeonCyberVoxelFlight.frag
 * @brief NEON CYBER VOXEL FLIGHT: High-speed 3D low-altitude flight through an
 * endless cyberpunk voxel megalopolis with audio-reactive skyscraper heights,
 * glowing matrix window grids, holographic sky billboards, and laser searchlights.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight between voxel towers
 *   audioKick    -> flashes skyscraper neon roof beacons & billboard shockwaves
 *   audioBass    -> elevates skyscraper equalizer heights
 *   audioCentroid-> sharpens window voxel grid anti-aliasing
 *   audioChromaHue-> rotates the cyberpunk neon cyan/magenta/amber palette
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
uniform float cityDensityP;
uniform float heightP; ///< Height knob, 0..1.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
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
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/**  Procedural skyscraper building height function
 *
 * @param cellID  The cell. (in)
 * @param hMod    Height knob. (in)
 *
 * @return
 *   The height.
 **/
float buildingHeight( vec2 cellID, float hMod )
{
    float n = sin( cellID.x * 12.9898 + cellID.y * 78.233 );
    float rand_h = fract( sin( n ) * 43758.5453 );
    return ( 0.8 + 2.5 * rand_h ) * ( 1.0 + 1.2 * audioBass ) * hMod;
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution.xy ) / min( resolution.x, resolution.y );

    float spd = ( speedP > 0.01 ) ? speedP : 1.0;
    float c_dens = ( cityDensityP > 0.01 ) ? cityDensityP : 1.0;
    float hMod = ( heightP > 0.01 ) ? heightP : 1.0;
    float glw = ( glowP > 0.01 ) ? glowP : 1.0;

    float t = time * 0.252 * spd + audioAdvance * 0.252 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Flight camera weaving between city skyscrapers
    vec3 ro = vec3( sin( t * 0.3 ) * 1.5, 1.9 + 0.25 * sin( t * 0.4 ), t * 3.5 ); // was y = 1.8 +
                                                                                  // 0.3*sin(audioSwell*2): the camera
                                                                                  // height jittered with the envelope
    vec3 rd = normalize( vec3( uv.x, uv.y - 0.1, 1.25 ) );

    // Raymarching through voxel city
    float tot_dist = 0.0;
    vec3  hit_col = vec3( 0.0 );
    vec3  hit_pos = vec3( 0.0 );
    bool  hit_building = false;

    for ( int i = 0; i < 54; ++i )
    {
        vec3 p = ro + rd * tot_dist;
        vec2 cellID = floor( p.xz * ( 0.5 * c_dens ) );
        vec2 cell_uv = fract( p.xz * ( 0.5 * c_dens ) ) - 0.5;

        float h = buildingHeight( cellID, hMod );

        // Open flight corridor: cap tower heights along the camera's sine
        // path (x = 1.5*sin(z*0.3/3.5), the exact ro trajectory) so the
        // flight lane stays a street canyon instead of ramming a facade
        // every few seconds. Towers beyond the lane keep full height.
        vec2  cell_world = ( cellID + 0.5 ) / ( 0.5 * c_dens );
        float lane = abs( cell_world.x - 1.5 * sin( cell_world.y * 0.0857143 ) );
        h = min( h, mix( 0.55, 60.0, smoothstep( 1.3, 3.6, lane ) ) );

        // Distance to box tower: |x| < 0.35, |z| < 0.35, y < h
        vec2  d_box_2d = abs( cell_uv ) - vec2( 0.35 );
        float d_wall = max( d_box_2d.x, d_box_2d.y );
        float d_roof = p.y - h;

        float d = max( d_wall, d_roof );

        if ( d < 0.01 || tot_dist > 25.0 )
        {
            if ( tot_dist <= 25.0 )
            {
                hit_building = true;
                hit_pos = p;
            }
            break;
        }

        tot_dist += max( 0.03, d * 0.65 );
    }

    if ( hit_building )
    {
        // Compute glowing window grid on building facade
        vec2  win_grid = fract( hit_pos.xy * vec2( 8.0, 4.0 ) ) - 0.5;
        float win_dist = max( abs( win_grid.x ), abs( win_grid.y ) );
        // Tonal brightness crisps the window edges: raising the inner stop
        // narrows the smoothstep band, so bright material gives hard-edged
        // voxel windows and dark material leaves them soft/blurred.
        float win_mask = smoothstep( 0.4, 0.25 + 0.11 * audioCentroid, win_dist );

        // Random window light on/off pattern
        float win_rand = fract( sin( dot( floor( hit_pos.xy * vec2( 8.0, 4.0 ) ), vec2( 12.3, 45.6 ) ) ) * 43758.5453 );
        float is_lit = step( 0.45, win_rand );

        // Sample texture on facade
        vec2 sample_uv = fract( hit_pos.xz * 0.2 + hit_pos.y * 0.1 );
        vec3 tex_col = img( sample_uv );
        vec3 pal_col = imgPalette( hit_pos.y * 0.2 + 0.1 );

        vec3 bldg_base = mix( tex_col, pal_col, 0.3 ) * 0.4;
        vec3 win_col = vec3( 1.5, 1.3, 0.4 ) * win_mask * is_lit * ( 1.0 + 2.0 * audioKick ) * glw;

        hit_col = bldg_base + win_col;

        // Rooftop laser beacons
        float roof_beacon = smoothstep(
            0.1, 0.0, abs( hit_pos.y - buildingHeight( floor( hit_pos.xz * ( 0.5 * c_dens ) ), hMod ) ) );
        hit_col += vec3( 1.8, 0.3, 0.9 ) * roof_beacon * ( 1.0 + 2.5 * audioKick );
    }
    else
    {
        // Sky with cyberpunk laser grid
        float sky_grid = abs( sin( rd.x * 25.0 / max( 0.05, rd.y + 0.2 ) ) )
                         * abs( cos( 1.0 / max( 0.05, rd.y + 0.2 ) * 10.0 - t * 2.0 ) );
        hit_col = imgPalette( 0.8 ) * smoothstep( 0.88, 1.0, sky_grid ) * 0.3 * audioHigh;
        hit_col += mix( imgPalette( 0.2 ) * 0.15, imgPalette( 0.7 ) * 0.5, clamp( rd.y + 0.2, 0.0, 1.0 ) );
    }

    // Atmospheric depth haze
    float depth_fog = 1.0 - exp( -tot_dist * 0.08 );
    hit_col = mix( hit_col, imgPalette( 0.75 ) * 0.4, depth_fog );

    hit_col = pow( hit_col, vec3( 0.88 ) );
    fragColor = vec4( clamp( hit_col, 0.0, 1.0 ), 1.0 );
}
