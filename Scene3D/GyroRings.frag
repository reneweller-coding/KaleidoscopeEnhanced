#version 330 core
out vec4 fragColor;
// GyroRings.frag — dark faces, luminous edges (depth-tested).
in vec4 vCol;
in vec3 vCorner;

/**
 * @file GyroRings.frag
 * @brief Shades a gyroscopic ring segment as a dark face with luminous,
 * machined edges: distance from each cube corner (vCorner) picks out the
 * beveled edge lines and brightens them against a dim body.
 *
 * Audio Reactivity:
 *   audioSharpness -> MACHINED-EDGE CRISPNESS: dull, dark material leaves the
 *                     bevels a wide soft sheen; bright harsh material
 *                     (cymbals, metallic transients) hones them down to a
 *                     hairline brighter highlight, so the clockwork reads as
 *                     freshly machined.  The edge gain rises as the band
 *                     narrows, keeping the integrated energy near the
 *                     original 0.21-wide / 1.6-gain bevel
 *   audioBarPhase / audioBass / audioSwell / audioChromaHue / audioSpread /
 *   audioDownbeat  -> baked into vCol by GyroRings.vert; see that file.
 */

uniform float audioSharpness;

void main()
{
    // Bevel band width follows SHARPNESS: dull -> a wide soft sheen along the
    // edges, harsh/bright -> a honed hairline.  The gain rises as the band
    // narrows so the two ends stay close in total emitted energy.
    float shp = clamp(audioSharpness, 0.0, 1.0);
    float lo  = 0.99 - (0.30 - 0.20 * shp);
    float gain = 1.35 + 0.50 * shp;

    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(lo, 0.99, a.x);
    float e2 = smoothstep(lo, 0.99, a.y);
    float e3 = smoothstep(lo, 0.99, a.z);
    float edge = clamp(e1 * e2 + e2 * e3 + e1 * e3, 0.0, 1.0);
    vec3 col = vCol.rgb * (0.20 + gain * edge);
    fragColor = vec4(col, 1.0);
}
