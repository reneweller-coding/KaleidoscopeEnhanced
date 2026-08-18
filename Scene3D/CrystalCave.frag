#version 330 core
out vec4 fragColor;
// CrystalCave.frag — dark facets, luminous crystal edges (depth-tested).
in vec4 vCol;
in vec3 vCorner;

/**
 * @file CrystalCave.frag
 * @brief Lighting for a flight through a cave lined with glowing crystal
 * shards: dark faceted cube faces with luminous edges where three faces meet,
 * depth-tested so nearer crystals occlude the ones behind.
 *
 * The colour and brightness of each shard (vCol) already carry the scene's
 * audio reactivity from CrystalCave.vert -- audioKick flares crystals just
 * ahead of the camera, audioSnare sparkles a hashed subset, audioSwell
 * breathes the ambient glow, audioDrop flashes the whole cave, and
 * audioChromaHue drifts the gem hue with the musical key; this fragment stage
 * only turns that colour into the edge-lit facet look.
 */

void main()
{
    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.82, 0.99, a.x);
    float e2 = smoothstep(0.82, 0.99, a.y);
    float e3 = smoothstep(0.82, 0.99, a.z);
    float edge = clamp(e1 * e2 + e2 * e3 + e1 * e3, 0.0, 1.0);
    vec3 col = vCol.rgb * (0.16 + 1.7 * edge);
    fragColor = vec4(col, 1.0);
}
