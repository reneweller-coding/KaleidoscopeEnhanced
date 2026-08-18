#version 330 core
out vec4 fragColor;
/**
 * @file FxBioluminescentSparkle.frag
 * @brief FX BIOLUMINESCENT SPARKLE: Marine dinoflagellate bioluminescence transition.
 * Thousands of sparkling blue-green bioluminescent cellular flashes ignite
 * across fluid wave currents, illuminating and transitioning between scenes.
 *   interpolation -> sweeps bioluminescent sparkling wave front
 *   audioKick     -> triggers full-screen dinoflagellate flash cascade
 *   audioHigh     -> ignites sharp point sparkle glints
 *
 * Per-activation variety:
 *   sparkleP float sparkle flash duration & brightness (0.5..2.2)
 *   densityP float sparkling cellular point density     (0.5..2.0)
 *   speedP   float animation speed multiplier           (0.5..2.0)
 *   hueP     float bioluminescent cyan hue offset       (0..6.28)
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

uniform float sparkleP;
uniform float densityP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(434.34, 735.21));
    p += dot(p, p + 52.32);
    return fract(p.x * p.y);
}

void main() {
    float spk = (sparkleP > 0.0) ? sparkleP : 1.0;
    float den = (densityP > 0.0) ? densityP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Cellular grid of sparkling dinoflagellates
    vec2 cell = floor(p * 35.0 * den);
    float cellRand = hash21(cell);

    // Sparkle pulse timing
    float sparklePhase = sin(cellRand * 6.28 + t * 6.0);
    float sparkleFlash = pow(max(0.0, sparklePhase), 16.0) * midTransition * spk;

    // Fluid wave displacement
    vec2 waveDisp = vec2(sin(p.y * 10.0 + t * 2.0), cos(p.x * 10.0 - t * 2.0)) * 0.025 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + waveDisp));
    vec4 c0 = texture(tex0, fract(uv - waveDisp));

    // Staggered cellular blend
    float blend = clamp((tProg - cellRand * 0.3) / 0.7, 0.0, 1.0);
    vec4 col = mix(c1, c0, blend);

    // Bioluminescent cyan-emerald glow
    vec3 bioCyan = vec3(0.1, 0.95, 0.9);
    col.rgb += sparkleFlash * bioCyan * (1.5 + audioKick * 3.5 + audioHigh * 1.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
