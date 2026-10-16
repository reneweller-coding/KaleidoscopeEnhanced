#version 330 core
out vec4 fragColor; ///< The pixel's colour (output).

in vec3  vWorldPos; ///< World position (from the vertex stage).
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in float vRoadMask;
in float vPylonGlow;
in vec3  vTint;

/**
 * @file NeonHighwayDrive.frag
 * @brief Shades the NeonHighwayDrive heightfield: a dark asphalt road strip lit by a headlight
 * cone that travels with the camera, neon-tinted centre and edge lines, glowing roadside pylons
 * (vPylonGlow, baked per-vertex from the height/kick pulse), and image-palette-tinted terrain
 * either side that dims into distance haze. audioKick brightens the pylon glow and headlight
 * reach; this stage reads no other audio directly, since drive speed/terrain/pylon placement are
 * already baked into vWorldPos/vNormal/vRoadMask by the companion vertex shader.
 */

uniform float audioKick; ///< Kick-drum envelope, 0..1 (fast attack, short decay).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec3  n = normalize( vNormal );
    vec3  light_dir = normalize( vec3( 0.3, 0.9, -0.2 ) );
    float diff = max( dot( n, light_dir ), 0.0 ) * 0.6 + 0.4;

    // Headlight cone: a soft glow centred near the camera's forward view,
    // strongest close and directly ahead, travels WITH the camera since it's
    // defined in view-relative-ish world space (vWorldPos.z is depth ahead).
    float depth = clamp( vWorldPos.z, 0.0, 40.0 );
    float lateral = abs( vWorldPos.x );
    float headlight = exp( -depth * 0.10 ) * exp( -lateral * lateral * 0.03 );
    headlight *= 1.0 + audioKick * 0.5;

    // Road surface: dark asphalt with a neon centre line and edge glow.
    vec3  asphalt = vec3( 0.05, 0.055, 0.07 );
    float centre_line = smoothstep( 0.14, 0.0, abs( vWorldPos.x ) ) * 0.8;
    float edge_line = smoothstep( 0.22, 0.0, abs( abs( vWorldPos.x ) - 2.15 ) ) * 0.9;
    vec3  road_col = asphalt * diff
                     + vTint * centre_line
                     + vTint * edge_line * 1.3
                     + headlight * vec3( 1.0, 0.97, 0.85 ) * 1.4;

    // Terrain either side: image-palette tint, dimmed with distance haze.
    vec3  terrain_col = vTint * ( 0.55 + 0.7 * diff );
    float haze = clamp( vWorldPos.z / 30.0, 0.0, 1.0 );
    terrain_col = mix( terrain_col, vec3( 0.03, 0.03, 0.05 ), haze * 0.6 );

    vec3 col = mix( terrain_col, road_col, vRoadMask );
    col += vTint * vPylonGlow * 1.6;

    vec3 cat_tone = clamp( col, 0.0, 1.0 ) * 0.85;
    cat_tone /= 1.0 + 0.35 * max( cat_tone.r, max( cat_tone.g, cat_tone.b ) );
    fragColor = vec4( cat_tone, 1.0 );
}
