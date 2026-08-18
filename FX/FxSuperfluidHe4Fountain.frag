#version 330 core
out vec4 fragColor;
/**
 * @file FxSuperfluidHe4Fountain.frag
 * @brief FX SUPERFLUID HE4 FOUNTAIN: Cryogenic Helium-II thermomechanical fountain.
 * Below the Lambda point (2.17 K), zero-viscosity superfluid Helium-4 surges
 * through a porous plug in a towering fountain geyser, wetting surfaces with
 * quantum creep films and transitioning cleanly between scenes.
 *   interpolation -> sweeps thermomechanical fountain geyser pressure & height
 *   audioKick     -> flashes cryogenic quantum vortex cavitation bubbles
 *   audioBass     -> drives fountain geyser upward surge velocity
 *
 * Per-activation variety:
 *   fountP float fountain geyser jet width & force    (0.5..2.2)
 *   creepP float Rollin film creeping thickness       (0.5..2.0)
 *   speedP float animation speed multiplier           (0.5..2.0)
 *   hueP   float cryogenic superfluid hue offset      (0..6.28)
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

uniform float fountP;
uniform float creepP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float fnt = (fountP > 0.0) ? fountP : 1.0;
    float crp = (creepP > 0.0) ? creepP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Central fountain geyser column: x close to 0, rising along y
    float jetWidth = 0.25 * fnt;
    float jetDist = abs(p.x) / jetWidth;
    float jetHeight = mix(-0.8, 0.9, tProg);

    float fountainFlow = exp(-jetDist * jetDist * 3.0) * smoothstep(jetHeight - 0.2, jetHeight, p.y);

    // Zero-viscosity Rollin film waves
    float filmWaves = sin(p.y * 25.0 - t * 8.0) * exp(-abs(p.x) * 4.0) * crp;

    // Fluid fountain displacement
    vec2 fountDisp = vec2(sin(p.y * 15.0), cos(p.x * 15.0 - t * 4.0)) * 0.035 * midTransition * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + fountDisp));
    vec4 c0 = texture(tex0, fract(uv - fountDisp));

    float fountainMask = smoothstep(jetHeight - 0.1, jetHeight + 0.1, p.y);
    vec4 col = mix(c0, c1, fountainMask);

    // Cryogenic diamond-blue quantum droplets
    float dropletGlow = pow(max(0.0, filmWaves), 4.0) * midTransition;
    vec3 cryoBlue = vec3(0.3, 0.85, 1.0);
    col.rgb += (dropletGlow + fountainFlow * 0.6) * cryoBlue * (1.4 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
