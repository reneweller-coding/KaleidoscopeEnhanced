#version 330 core
out vec4 fragColor;
/**
 * @file VolcanicLightningPlume.frag
 * @brief VOLCANIC LIGHTNING PLUME: Volumetric explosive volcanic ash column rising
 * into the night sky with glowing basalt magma fountains, turbulent curl-noise
 * smoke billowing, and branched electrostatic volcanic lightning discharges.
 *   audioKick    -> triggers explosive volcanic eruption burst & branched lightning
 *   audioSubBass -> rumbles seismic ground tremors and lava fountain height
 *   audioHigh    -> sparks electrostatic lightning branches and crackles
 *   audioSwell   -> billows ash column into the upper atmosphere
 *
 * Per-activation variety:
 *   eruptionP float lava fountain height & power           (0.5..2.0)
 *   smokeP    float ash density and billow turbulence      (0.5..1.8)
 *   boltP     float electrostatic lightning intensity      (0.5..2.2)
 *   hueP      float magma and lightning hue rotation       (0..6.28)
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

uniform float eruptionP;
uniform float smokeP;
uniform float boltP;
uniform float hueP;
uniform float audioChromaHue;

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

float hash21(vec2 p) {
    p = fract(p * vec2(324.65, 156.34));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; ++i) {
        v += a * noise(p);
        p = rot * p * 2.0 + vec2(100.0);
        a *= 0.5;
    }
    return v;
}

void main() {
    float erp = (eruptionP > 0.0) ? eruptionP : 1.0;
    float smk = (smokeP    > 0.0) ? smokeP    : 1.0;
    float blt = (boltP     > 0.0) ? boltP     : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 + audioAdvance * 0.2;

    // Volcano caldera ground profile at bottom
    float calderaY = -0.38 - 0.15 * abs(uv.x);
    float isGround = step(uv.y, calderaY);

    // Eruption plume coordinate system (billowing upwards from caldera center)
    vec2 plumeCoord = vec2(uv.x, uv.y - calderaY);
    float plumeRadius = (0.08 + 0.35 * max(plumeCoord.y, 0.0)) * smk;

    // Upward turbulence
    vec2 billowUV = vec2(plumeCoord.x * 3.0, plumeCoord.y * 2.0 - t * 1.5);
    float billow = fbm(billowUV + fbm(billowUV * 2.0));

    // Ash plume density
    float plumeDist = abs(plumeCoord.x) / max(plumeRadius, 0.01);
    float ashDensity = smoothstep(1.2, 0.2, plumeDist) * smoothstep(0.0, 0.2, plumeCoord.y) * billow;

    // Lava fountain at the vent mouth
    float fountainHeight = (0.25 + 0.35 * audioSubBass + 0.2 * audioKick) * erp;
    float lavaDist = length(vec2(plumeCoord.x * 3.0, max(plumeCoord.y - fountainHeight * 0.5, 0.0)));
    float lavaGlow = (0.015 / (lavaDist * lavaDist + 0.005)) * (1.0 + audioKick * 3.0);
    vec3 lavaCol = palTint(mix(vec3(1.0, 0.2, 0.0), vec3(1.0, 0.9, 0.3), clamp(lavaGlow * 0.3, 0.0, 1.0)), 0.06, 0.18) * lavaGlow;

    // Branched Volcanic Lightning discharges inside the ash plume
    float lightningFlash = 0.0;
    if (audioHigh > 0.35 || audioKick > 0.5) {
        // Lightning is a large bright structure: treat as full-frame,
        // 3 Hz. 12 re-rolls a second read as flicker, not weather.
        float boltSeed = floor(time * 3.00);
        float boltPath = (noise(vec2(plumeCoord.y * 15.0, boltSeed)) - 0.5) * 0.3;
        float boltDist = abs(plumeCoord.x - boltPath);
        float bolt = (0.0015 * blt) / (boltDist * boltDist + 0.0001);
        bolt *= step(0.05, plumeCoord.y) * step(plumeCoord.y, 0.85);
        lightningFlash = bolt * (audioHigh + audioKick * 2.0);
    }
    vec3 lightningCol = vec3(0.5, 0.8, 1.0) * lightningFlash * 2.0;

    // Dark ash smoke with internal orange fire scattering
    vec3 ashCol = mix(vec3(0.04, 0.03, 0.03), vec3(0.8, 0.25, 0.05), ashDensity * exp(-plumeCoord.y * 1.5));
    ashCol *= ashDensity;

    // Background sky and photo blending
    vec3 bgPhoto = img(st);
    vec3 skyCol = vec3(0.01, 0.02, 0.05) + bgPhoto * 0.2;

    // Ground basalt silhouette
    vec3 groundCol = vec3(0.02, 0.02, 0.03);
    if (isGround > 0.5) {
        // Glowing lava fissures on the volcano slope
        float fissure = smoothstep(0.7, 0.95, noise(uv * 20.0));
        groundCol += vec3(1.0, 0.3, 0.05) * fissure * (0.8 + 0.4 * audioBass);
    }

    vec3 col = mix(skyCol, ashCol, clamp(ashDensity * 1.5, 0.0, 1.0));
    col += lavaCol + lightningCol;
    col = mix(col, groundCol, isGround);

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
