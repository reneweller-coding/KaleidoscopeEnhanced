#version 330 core
/**
 * @file HypercubeLatticePillars.vert
 * @brief 4,900 cubes (geom="cubes") arranged into monolithic architectural towers
 * rising in concentric rings with sci-fi neon edge lighting and dynamic
 * audio-reactive height extrusions.
 */

layout( location = 0 ) in vec4 attrA; ///< xyz = local cube vertex [-0.5, 0.5], w = cube ID [0..4899]
layout( location = 1 ) in vec4 attrB; ///< seeds

uniform mat4  projM;  ///< Projection matrix.
uniform float eyeOff; ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

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

uniform float heightP; ///< Height knob, 0..1.
uniform float twistP;  ///< Twist knob, 0..1.
uniform float speedP;  ///< Speed knob, 0..1.
uniform float hueP;    ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

out vec3  vNormal;   ///< Surface normal (from the vertex stage).
out vec2  vTexCoord; ///< Texture coordinate (from the vertex stage).
out vec4  vColor;    ///< Color (from the vertex stage).
out float vHeight;   ///< Height (from the vertex stage).

/// Normals of the six cube faces.
const vec3 CubeNormals[6] = vec3[6](
    vec3( 0.0, 0.0, 1.0 ),
    vec3( 0.0, 0.0, -1.0 ),
    vec3( 1.0, 0.0, 0.0 ),
    vec3( -1.0, 0.0, 0.0 ),
    vec3( 0.0, 1.0, 0.0 ),
    vec3( 0.0, -1.0, 0.0 ) );

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    float hgt = ( heightP > 0.0 ) ? heightP : 1.0;
    float tws = ( twistP > 0.0 ) ? twistP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;

    float id = attrA.w;
    vec3  local_pos = attrA.xyz;

    float t = time * 0.35 * spd + audioAdvance * 0.2;

    // 70x70 grid layout
    float grid_dim = 70.0;
    float gx = mod( id, grid_dim ) - grid_dim * 0.5;
    float gy = floor( id / grid_dim ) - grid_dim * 0.5;
    vec2  grid_pos = vec2( gx, gy ) * 0.12;

    float dist_from_center = length( grid_pos );
    float angle = atan( grid_pos.y, grid_pos.x );

    // Monolithic tower height displacement (concentric cyber rings)
    float ring_wave = sin( dist_from_center * 5.0 - t * 3.0 + audioPhase );
    float pillar_height = ( 0.3 + 0.9 * max( ring_wave, 0.0 ) + 0.6 * audioBass ) * hgt;

    // Kick height surge
    pillar_height += exp( -dist_from_center * 2.0 ) * audioKick * 1.5;
    vHeight = pillar_height;

    // Scale cube into rectangular monolithic tower
    vec3 tower_scale = vec3( 0.09, 0.09, pillar_height );
    vec3 pos_in_tower = local_pos * tower_scale;

    // Pillar twisting along Z
    float twist_angle = pos_in_tower.z * 0.8 * tws + angle * 0.2;
    float ct = cos( twist_angle ), st = sin( twist_angle );
    pos_in_tower.xy = vec2( pos_in_tower.x * ct - pos_in_tower.y * st, pos_in_tower.x * st + pos_in_tower.y * ct );

    vec3 pos = vec3( grid_pos.x + pos_in_tower.x, grid_pos.y + pos_in_tower.y, pos_in_tower.z - 0.5 );

    // Cube normal lookup from vertex ID
    int  face_idx = ( gl_VertexID % 36 ) / 6;
    vec3 n = CubeNormals[face_idx];
    n.xy = vec2( n.x * ct - n.y * st, n.x * st + n.y * ct );
    vNormal = normalize( n );

    vTexCoord = local_pos.xy + vec2( 0.5 );

    // Cyberpunk neon colors: Cyan, Magenta, Amber
    vec3 neon_cyan = vec3( 0.0, 0.9, 1.0 );
    vec3 neon_magenta = vec3( 1.0, 0.05, 0.6 );
    vec3 neon_amber = vec3( 1.0, 0.7, 0.1 );

    vec3 col = mix( neon_cyan, neon_magenta, sin( dist_from_center * 3.0 + t ) * 0.5 + 0.5 );
    col = mix( col, neon_amber, smoothstep( 1.0, 2.0, pillar_height ) );
    vColor = vec4( col, 1.0 );

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
