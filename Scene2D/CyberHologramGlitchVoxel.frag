#version 330 core
/*****************************************************************************\
 *                              CyberHologramGlitchVoxel.frag
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  CYBER HOLOGRAM GLITCH VOXEL: 100% viewport-filling volumetric 3D laser holographic scan.
 *
 *  The 2D photo is converted into a floating 3D voxel pointcloud via luminance depth extrusion, with scanning laser
 *  sheets, chromatic optical aberration, CRT scanlines, and audio data-mosh glitches.
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
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioMid;       ///< Mid band level, 0..1.
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioFlux;      ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float depthP;  ///< Depth knob, 0..1.
uniform float glitchP; ///< Glitch knob, 0.5..2.2.
uniform float speedP;  ///< Speed knob, 0..1.
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

/**  Pseudo-random number 0..1 from a 2D point.
 *
 * @param p  The point. (in)
 *
 * @return
 *   A pseudo-random number 0..1.
 **/
float hash21( vec2 p )
{
    p = fract( p * vec2( 123.34, 345.45 ) );
    p += dot( p, p + 34.345 );
    return fract( p.x * p.y );
}

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float dpt = ( depthP > 0.0 ) ? depthP : 1.0;
    float glt = ( glitchP > 0.0 ) ? glitchP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;
    float hue = ( hueP > 0.0 ) ? hueP : 0.0;

    vec2 uv = ( gl_FragCoord.xy - 0.5 * resolution ) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.2;

    // Digital glitch / data-mosh horizontal slice shift
    float slice_block = floor( gl_FragCoord.y / 16.0 );
    float slice_hash = hash21( vec2( slice_block, floor( time * 4.00 ) ) );
    float glitch_shift = ( slice_hash - 0.5 ) * 0.08 * step( 0.82, slice_hash ) * ( 1.0 + 3.0 * audioKick ) * glt;

    vec2 scan_uv = uv + vec2( glitch_shift, 0.0 );

    // 3D Parallax camera rotation around hologram
    float cam_yaw = sin( t * 0.4 ) * 0.35;
    float cam_pitch = cos( t * 0.3 ) * 0.25;
    scan_uv = vec2(
        scan_uv.x * cos( cam_yaw ) - scan_uv.y * sin( cam_yaw ),
        scan_uv.x * sin( cam_yaw ) + scan_uv.y * cos( cam_yaw ) );

    // Sample photo with chromatic aberration
    vec2  photo_center = scan_uv * 0.65 + vec2( 0.5 );
    float disp_amt = ( 0.01 + 0.02 * audioKick ) * glt;

    vec3 photo_r = img( fract( photo_center + vec2( disp_amt, 0.0 ) ) );
    vec3 photo_g = img( fract( photo_center ) );
    vec3 photo_b = img( fract( photo_center - vec2( disp_amt, 0.0 ) ) );
    vec3 photo_base = vec3( photo_r.r, photo_g.g, photo_b.b );

    // Depth extrusion from luminance
    float lum = dot( photo_base, vec3( 0.299, 0.587, 0.114 ) );
    float hologram_depth = ( lum * 1.8 + 0.6 * audioBass ) * dpt;

    // Volumetric 3D laser scan beam sweep
    float scan_pos = mod( time * 0.6, 1.4 ) - 0.7;
    float laser_beam = exp( -abs( scan_uv.y - scan_pos ) * 35.0 ) * ( 1.5 + 2.5 * audioHigh );

    // CRT hologram scanlines & dot matrix
    float scanline = sin( gl_FragCoord.y * 1.5 ) * 0.25 + 0.75;
    float dot_matrix = sin( gl_FragCoord.x * 1.2 ) * sin( gl_FragCoord.y * 1.2 ) * 0.2 + 0.8;

    // Holographic quantum interference emitter rings
    float emitter_r = length( scan_uv );
    float emitter_ring = sin( emitter_r * 40.0 - time * 12.0 ) * 0.5 + 0.5;
    emitter_ring = pow( emitter_ring, 6.0 ) * 0.6;

    // Cyberpunk hologram colors: Cyan / Blue with Neon Orange Laser Highlights
    vec3 holo_cyan = vec3( 0.0, 0.85, 1.0 );
    vec3 holo_orange = vec3( 1.0, 0.45, 0.1 );
    vec3 holo_violet = vec3( 0.7, 0.15, 1.0 );

    vec3 holo_color = mix( holo_cyan, holo_violet, lum );
    holo_color = mix( holo_color, holo_orange, laser_beam );

    vec3 col = photo_base * holo_color * ( 1.2 + hologram_depth * 0.5 ) * scanline * dot_matrix;
    col += holo_orange * laser_beam * 2.0;
    col += holo_cyan * emitter_ring * ( 0.8 + 1.2 * audioMid );

    // Background cyber grid floor reflection
    if ( uv.y < -0.2 )
    {
        float floor_z = 1.0 / abs( uv.y + 0.2 );
        vec2  floor_uv = vec2( uv.x * floor_z * 0.5, floor_z + t * 2.0 );
        vec2  f_grid = abs( fract( floor_uv ) - 0.5 );
        float grid_line = smoothstep( 0.48, 0.50, max( f_grid.x, f_grid.y ) );
        col += holo_cyan * grid_line * exp( -floor_z * 0.2 ) * 0.6;
    }

    col = hueRot( col, audioChromaHue + hue );
    col = pow( col, vec3( 0.88 ) );

    fragColor = vec4( col, 1.0 );
}
