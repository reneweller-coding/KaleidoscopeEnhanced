#version 330 core
/**
 * @file KineticMirrorHexagonArray.vert
 * @brief 3,000 quads (geom="quads") forming a suspended kinetic mirror sculpture.
 * Mirror plates ripple and tilt in 3D space, reflecting photo textures
 * with specular glints and audio wave kinematics.
 */

layout( location = 0 ) in vec4 attrA; ///< xy = quad UV [0,1], w = quad ID [0..2999]
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

uniform float waveP;  ///< Wave knob.
uniform float tiltP;  ///< Tilt knob, 0..1.
uniform float speedP; ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

uniform sampler2D tex0;          ///< The current photo.
uniform sampler2D tex1;          ///< The next photo (cross-faded in by interpolation).
uniform float     interpolation; ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
out vec3          vNormal;       ///< Surface normal (from the vertex stage).
out vec2          vTexCoord;     ///< Texture coordinate (from the vertex stage).
out vec4          vColor;

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img( vec2 uv )
{
    return ( interpolation * texture( tex0, uv ) + ( 1.0 - interpolation ) * texture( tex1, uv ) ).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette( float t )
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin( audioAdvance * 0.013 );
    vec3  pc = img( clamp( vec2( 0.5 ) + rad * vec2( cos( ang ), sin( ang ) ), 0.0, 1.0 ) );
    float pg = dot( pc, vec3( 0.333 ) );
    return mix( vec3( pg ), pc, 0.55 + 0.45 * audioValence );
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float wav = ( waveP > 0.0 ) ? waveP : 1.0;
    float tlt = ( tiltP > 0.0 ) ? tiltP : 1.0;
    float spd = ( speedP > 0.0 ) ? speedP : 1.0;

    float id = attrA.w;
    vec2  local_uv = attrA.xy - vec2( 0.5 );
    vTexCoord = attrA.xy;

    float t = time * 0.35 * spd + audioAdvance * 0.2;

    // Hexagonal ring lattice placement
    float total_quads = 3000.0;
    float ring_id = floor( sqrt( id * 0.5 ) );
    float angle_in_ring = ( id - 2.0 * ring_id * ring_id ) * ( 6.2831853 / max( ring_id * 4.0, 1.0 ) );
    float ring_radius = ring_id * 0.12 * ( 1.0 + 0.2 * audioSwell );

    vec3 center_pos = vec3(
        cos( angle_in_ring ) * ring_radius,
        sin( angle_in_ring ) * ring_radius,
        0.0 );

    // Dynamic wave elevation traveling through kinetic array
    float wave_dist = length( center_pos.xy );
    float height_wave = sin( wave_dist * 4.0 - t * 3.0 + audioPhase ) * ( 0.4 + 0.4 * audioBass ) * wav;
    center_pos.z += height_wave;

    // Kinetic mirror tilt angle (mechanical wave machine)
    float tilt_angle_x = cos( wave_dist * 3.0 - t * 2.5 ) * 0.6 * tlt;
    float tilt_angle_y = sin( wave_dist * 3.0 - t * 2.5 ) * 0.6 * tlt;

    // 180° snap flip on kick
    float snap_flip = smoothstep( 0.7, 1.0, sin( wave_dist * 2.0 - time * 6.0 ) ) * 3.14159 * audioKick;
    tilt_angle_x += snap_flip;

    // Quad facet vertices
    float quad_size = 0.09;
    vec3  quad_offset = vec3( local_uv.x * quad_size, local_uv.y * quad_size, 0.0 );

    // Rotate quad offset by tilt angles
    float cx = cos( tilt_angle_x ), sx = sin( tilt_angle_x );
    float cy = cos( tilt_angle_y ), sy = sin( tilt_angle_y );
    quad_offset.yz = vec2( quad_offset.y * cx - quad_offset.z * sx, quad_offset.y * sx + quad_offset.z * cx );
    quad_offset.xz = vec2( quad_offset.x * cy - quad_offset.z * sy, quad_offset.x * sy + quad_offset.z * cy );

    vec3 pos = center_pos + quad_offset;

    // Surface normal calculation
    vec3 local_normal = vec3( 0.0, 0.0, 1.0 );
    local_normal.yz = vec2( local_normal.y * cx - local_normal.z * sx, local_normal.y * sx + local_normal.z * cx );
    local_normal.xz = vec2( local_normal.x * cy - local_normal.z * sy, local_normal.x * sy + local_normal.z * cy );
    vNormal = normalize( local_normal );

    // Rim lighting & mirror chrome color
    vec3 chrome = vec3( 0.8, 0.9, 1.0 );
    vec3 neon_edge = imgPalette( ( ring_id * 0.3 + audioPhase ) * 0.159 );
    vColor = vec4( mix( chrome, neon_edge, 0.3 ), 1.0 );

    // Stereo 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;
    gl_Position = projM * vec4( vp.x, vp.y, -vp.z, 1.0 );
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
