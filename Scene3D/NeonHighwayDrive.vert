#version 330 core
/**
 * @file NeonHighwayDrive.vert
 * @brief A genuine ground-plane "driving" effect -- undulating terrain either side of a flattened
 * road strip, with roadside pylons periodically spiking out of the heightfield -- rather than the
 * tube/tunnel raymarch flythroughs already in the catalogue. The camera itself stays put; the
 * height and pylon functions are phase-scrolled by the integrated drive distance instead (the
 * same "treadmill" trick a scrolling texture uses), so the road reads as endless and the pylons
 * as rushing past, without ever having to translate or recycle the mesh itself.
 *   audioAdvance -> forward drive speed (integrated, jump-free)
 *   audioBass    -> terrain undulation depth
 *   audioKick    -> pylon flash + brief height pulse
 *   audioHigh    -> road-surface shimmer ripple
 */

in vec4 attrA; ///< .xy = cell UV [0,1] for geom=grid
in vec4 attrB; ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs
                              ///< backwards).
uniform float audioBass;      ///< Bass band level, 0..1.
uniform float audioKick;      ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioHigh;      ///< High band level, 0..1.
uniform float audioSwell;     ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue; ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

uniform float     speedP;        ///< drive speed multiplier (0 -> 1.0; 0.6..1.7)
uniform float     pylonP;        ///< pylon height multiplier (0 -> 1.0; 0.6..1.6)
uniform float     terrainP;      ///< terrain undulation depth (0 -> 1.0; 0.5..1.5)
uniform float     hueP;          ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

out vec3  vWorldPos; ///< World position (from the vertex stage).
out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out float vRoadMask;
out float vPylonGlow;
out vec3  vTint;

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

/**  IMG-PALETTE (house standard): see Tools/SHADER_AUTHORING.md V8b.
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

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float speed_v = ( speedP <= 0.01 ) ? 1.0 : speedP;
    float pylon_v = ( pylonP <= 0.01 ) ? 1.0 : pylonP;
    float terrain_v = ( terrainP <= 0.01 ) ? 1.0 : terrainP;

    // Scene3DShader supplies attrA.xy in [0,1] for geom="grid"; remap to a
    // centred domain (Tools/SHADER_AUTHORING.md V2).
    vec2 grid_uv = attrA.xy * 2.0 - 1.0;

    float world_x = grid_uv.x * 9.0;
    float world_z = grid_uv.y * 15.0;

    // Integrated forward drive: the mesh itself never moves, but the height
    // and pylon functions are scrolled by it, so the road reads as endless.
    float drive = time * 1.1 * speed_v + audioAdvance * 1.6 * speed_v;
    float scrolled_z = world_z + drive;

    // Flattened road strip either side of x=0.
    float road_half_w = 2.4;
    float road_mask = 1.0 - smoothstep( road_half_w * 0.55, road_half_w, abs( world_x ) );

    // Rolling terrain either side of the road.
    float terrain = sin( world_x * 0.35 + scrolled_z * 0.08 ) * 0.9
                    + sin( world_x * 0.9 - scrolled_z * 0.14 ) * 0.35;
    terrain *= terrain_v * ( 1.0 + 0.35 * audioBass );

    // Road-surface shimmer (subtle, so it still reads as a road not dunes).
    float shimmer = sin( world_x * 6.0 + scrolled_z * 2.5 ) * 0.02 * ( 1.0 + audioHigh * 1.5 );

    // Roadside pylon lane: a periodic sharp spike along Z, only near the
    // lane band either side of the road -- rushes past as scrolled_z advances.
    float pylon_offset_x = road_half_w + 1.0;
    float lane_dist = abs( abs( world_x ) - pylon_offset_x );
    float lane_mask = smoothstep( 0.5, 0.0, lane_dist );
    float pylon_spacing = 5.5;
    float z_phase = mod( scrolled_z, pylon_spacing ) / pylon_spacing; // 0..1
    float pylon_shape = pow( max( 0.0, cos( z_phase * 6.2831853 ) ), 10.0 );
    float kick_pulse = 1.0 + audioKick * 0.6;
    float pylon_height = lane_mask * pylon_shape * 5.0 * pylon_v * kick_pulse;

    float height = mix( terrain, 0.0, road_mask ) + shimmer + pylon_height;

    vec3 pos = vec3( world_x, height - 1.0, world_z );
    vWorldPos = pos;

    // Normal from the analytic slope (finite-difference-free, matches the
    // terrain/pylon height function's own gradient direction).
    float d_hdx = ( mix( cos( world_x * 0.35 + scrolled_z * 0.08 ) * 0.315
                             + cos( world_x * 0.9 - scrolled_z * 0.14 ) * 0.315,
                         0.0, road_mask ) )
                  * terrain_v;
    vNormal = normalize( vec3( -d_hdx, 1.0, -0.15 ) );

    // Camera: low, close to the road surface, looking forward with a
    // shallow downward tilt -- a driving view, not a bird's-eye dune view.
    vec3 vp = pos;
    vp.y -= 0.55;
    float cam_tilt = -0.16;
    float cos_t = cos( cam_tilt ), sin_t = sin( cam_tilt );
    vp = vec3( vp.x, vp.y * cos_t - vp.z * sin_t, vp.y * sin_t + vp.z * cos_t );
    vp.z += 9.5 - audioSwell * 1.2;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vRoadMask = road_mask;
    vPylonGlow = clamp( pylon_height * 0.3 + audioKick * lane_mask * 0.5, 0.0, 1.5 );

    vec3 tint = imgPalette( 0.5 + 0.5 * sin( world_x * 0.2 + scrolled_z * 0.05 ) ) * 1.2;
    if ( hueP > 0.001 )
        tint = hueRot( tint, hueP );
    vTint = tint;
}
