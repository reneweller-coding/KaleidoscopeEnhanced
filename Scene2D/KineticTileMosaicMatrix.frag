#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).
/**
 * @file KineticTileMosaicMatrix.frag
 * @brief KINETIC TILE MOSAIC MATRIX: 100% viewport-filling architectural facade
 * of thousands of mechanical kinetic tiles that elevate, flip, and rotate
 * in 3D relief, physically reconstructing the loaded photo with specular
 * bevel highlights, cast ambient shadows, and audio-reactive wave cascades.
 */

uniform vec2      resolution;    ///< Size of the render target in pixels.
uniform float     time;          ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;        ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;      ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                                 ///< backwards).
uniform float audioSwell;        ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;        ///< Overall loudness, 0..1.
uniform float audioKick;         ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;     ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;      ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;      ///< Sub-bass band level, 0..1.
uniform float audioBass;         ///< Bass band level, 0..1.
uniform float audioMid;          ///< Mid band level, 0..1.
uniform float audioHigh;         ///< High band level, 0..1.
uniform float audioFlux;         ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;    ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSpectrum[32]; ///< Spectrum bands, 0..1.

uniform float densityP; ///< Density knob, 0..1.
uniform float depthP;   ///< Depth knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;     ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot( vec3 c, float a )
{
    vec3  k = vec3( 0.57735026919 );
    float cs = cos( a ), sn = sin( a );
    return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float den = ( densityP > 0.0 ) ? densityP : 1.0;
    float dpt = ( depthP > 0.0 ) ? depthP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Tile grid setup (50x50 to 80x80 matrix)
    vec2 grid_uv = uv * 28.0 * den;
    vec2 tile_id = floor( grid_uv );
    vec2 local_uv = fract( grid_uv ) - vec2( 0.5 );

    // Sample photo at the tile center
    vec2  photo_uv = ( tile_id / ( 28.0 * den ) ) * 0.5 + vec2( 0.5 );
    vec3  tile_photo = img( fract( photo_uv ) );
    float tile_lum = dot( tile_photo, vec3( 0.299, 0.587, 0.114 ) );

    // Spectrum band elevation per tile column
    float tile_hash = hash21( tile_id );
    int   spec_band = int( clamp( tile_hash * 31.0, 0.0, 31.0 ) );
    float band_val = audioSpectrum[spec_band];

    // Audio-driven kinetic tile height displacement (3D relief)
    float wave_x = sin( tile_id.x * 0.3 + t * 3.0 );
    float wave_y = cos( tile_id.y * 0.3 - t * 2.5 );
    float height = ( tile_lum * 1.5 + band_val * 2.0 + ( wave_x + wave_y ) * 0.4 ) * dpt * ( 0.8 + 0.6 * audioBass );

    // Mechanical tile flip / tilt angle
    float flip_wave = sin( dot( tile_id, vec2( 0.5, 0.8 ) ) * 0.4 - time * 6.0 );
    float flip_angle = ( height * 0.4 + smoothstep( 0.7, 1.0, flip_wave ) * 1.2 * audioKick );

    // Tile border & beveled face
    vec2  beveled = abs( local_uv ) * 2.0;
    float tile_border = max( beveled.x, beveled.y );
    float face_mask = smoothstep( 0.95, 0.85, tile_border ); // 1 on face, 0 at gap
    float bevel_glint = smoothstep( 0.75, 0.90, tile_border ) * face_mask;

    // 3D Tile surface normal with tilt
    vec3 tile_normal = normalize( vec3(
        sin( flip_angle ) * ( local_uv.x > 0.0 ? 1.0 : -1.0 ),
        cos( flip_angle ) * ( local_uv.y > 0.0 ? 1.0 : -1.0 ),
        1.0 ) );

    // Dynamic lighting (sunlight from top-right)
    vec3 light_dir = normalize( vec3( 0.5, 0.8, 1.2 ) );
    vec3 view_dir = vec3( 0.0, 0.0, 1.0 );
    vec3 half_vec = normalize( light_dir + view_dir );

    float diff = max( dot( tile_normal, light_dir ), 0.0 );
    float spec = pow( max( dot( tile_normal, half_vec ), 0.0 ), 32.0 );

    // Ambient occlusion / cast shadow between elevated tiles
    float shadow = clamp( 1.0 - ( 1.0 - height * 0.3 ) * ( 1.0 - face_mask ) * 1.5, 0.1, 1.0 );

    // Mosaic coloring
    vec3 tile_col = tile_photo * ( diff * 0.7 + 0.3 ) * ( 0.8 + 0.4 * audioLevel );
    tile_col += vec3( 1.0, 0.95, 0.85 ) * spec * ( 0.8 + 1.5 * audioHigh );
    tile_col += vec3( 1.0, 0.8, 0.4 ) * bevel_glint * ( 0.6 + 1.2 * audioMid ); // Golden bevel shine

    vec3 col = tile_col * face_mask * shadow;

    // Dark chassis background in tile gaps
    col += vec3( 0.02, 0.03, 0.05 ) * ( 1.0 - face_mask );

    // Laser scan beam traveling across mosaic
    float scan_line = exp( -abs( uv.y - sin( time * 2.0 ) * 0.5 ) * 25.0 ) * ( 0.4 + 1.2 * audioKick );
    col += vec3( 0.1, 0.8, 1.0 ) * scan_line;

    col = hueRot( col, audioChromaHue + hue );
    col = pow( col, vec3( 0.9 ) );

    fragColor = vec4( col, 1.0 );
}
