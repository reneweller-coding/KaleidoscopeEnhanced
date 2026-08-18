#version 330 core
in vec3 vPos;
in vec2 vUV;
in float vRingIdx;
in float vLaserRelay;

out vec4 fragColor;

/**
 * @file DysonSwarmSolarHarvester.frag
 * @brief Lighting for a Dyson-swarm solar-collector panel: discards outside
 * a hexagonal boundary, blends a reflected slideshow photo with a gold/blue
 * photovoltaic-cell colour that varies by ring (vRingIdx), adds a bright
 * hexagon-edge rim, and overlays a high-energy laser relay pulse
 * (vLaserRelay).
 *
 * audioSwell brightens the photovoltaic colour mix, relayP scales the laser
 * relay's intensity, and hueP rotates the final hue; the photovoltaic colour
 * itself is tinted toward the house photo palette (palTint/imgPalette),
 * which tracks the musical key via audioChromaHue/audioAdvance.
 */

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

uniform float glowP;
uniform float relayP;
uniform float hueP;
uniform float audioChromaHue;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float rlp = (relayP > 0.0) ? relayP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Geometric collector hexagonal boundary
    vec2 p = abs(vUV - vec2(0.5));
    float hex = max(p.x * 0.866025 + p.y * 0.5, p.y);
    if (hex > 0.46) discard;

    float edge = smoothstep(0.40, 0.46, hex);

    // Reflected photo mapped on mirror facets
    vec3 photo = img(vUV);

    // Solar collector gold & electric blue photovoltaic cells
    vec3 pvColor = palTint(mix(vec3(0.05, 0.2, 0.5), vec3(1.0, 0.8, 0.2), vRingIdx), 0.30 * vRingIdx, 0.22);

    // High energy laser beam relay pulses
    vec3 relayLaser = vec3(0.2, 0.9, 1.0) * vLaserRelay * rlp;

    vec3 col = mix(pvColor, photo, 0.4) * (0.8 + 0.4 * audioSwell) + edge * vec3(1.0, 0.9, 0.5) * 1.5 + relayLaser;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * glw, 0.95);
}
