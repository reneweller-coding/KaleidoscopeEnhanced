#version 330 core
out vec4 fragColor;
/**
 * @file MyceliumNetworkSprout.frag
 * @brief TRANSITION MYCELIUM NETWORK SPROUT: Branching fungal hyphae network transition.
 * Organic fungal mycelial threads sprout and branch across the screen, conducting
 * bioluminescent action-potential pulses that bridge and cross-fade the scenes.
 *   interpolation -> sweeps mycelial growth front from center to boundaries
 *   audioKick     -> flashes action potential electrical pulses along hyphae cords
 *   audioBass     -> widens mycelial thread network thickness
 *
 * Per-activation variety:
 *   hyphaeP float mycelial network branch density (0.5..2.2)
 *   branchP float tip branching angle divergence  (0.5..2.0)
 *   speedP  float growth velocity multiplier      (0.5..2.0)
 *   hueP    float bioluminescent hyphae hue offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float hyphaeP;
uniform float branchP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(534.34, 835.21));
    p += dot(p, p + 62.32);
    return fract(p.x * p.y);
}

void main() {
    float hyp = (hyphaeP > 0.0) ? hyphaeP : 1.0;
    float brn = (branchP > 0.0) ? branchP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);
    float angle = atan(p.y, p.x);

    // Multi-angle branching hyphae lines.  audioBass widens the mycelial thread
    // network by softening the perpendicular falloff (peak unchanged, cords get
    // thicker).  midTransition gates the widening back to the base thickness at
    // both fade endpoints, where hyphaePattern's only consumers -- the cord
    // displacement and the bioluminescent glow -- are multiplied out anyway.
    float threadWidth = 1.0 + audioBass * 0.7 * midTransition;

    float hyphaePattern = 0.0;
    for (int i = 0; i < 6; ++i) {
        float theta = float(i) * 1.0471975 + sin(float(i) * 3.7 + t * 0.5) * 0.2 * brn;
        vec2 dir = vec2(cos(theta), sin(theta));
        float proj = dot(p, dir);
        float perp = abs(dot(p, vec2(-dir.y, dir.x)));

        float branch = exp(-perp * 45.0 * hyp / threadWidth) * smoothstep(0.0, 0.1, proj);
        hyphaePattern = max(hyphaePattern, branch);
    }

    // Growth front moving outward
    float growthRadius = tProg * 1.3;
    float growthMask = smoothstep(growthRadius - 0.1, growthRadius + 0.1, r);

    // Coordinate displacement along hyphae cords
    vec2 hyphaeDisp = vec2(sin(r * 20.0 + t), cos(angle * 6.0)) * 0.02 * hyphaePattern * midTransition;

    vec4 c1 = texture(tex1, fract(uv + hyphaeDisp));
    vec4 c0 = texture(tex0, fract(uv - hyphaeDisp));

    vec4 col = mix(c0, c1, growthMask);

    // Bioluminescent action-potential pulses along hyphae
    float pulse = sin(r * 30.0 - t * 8.0) * 0.5 + 0.5;
    vec3 bioGreen = vec3(0.2, 1.0, 0.5);
    col.rgb += hyphaePattern * pulse * bioGreen * midTransition * (1.5 + audioKick * 3.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
