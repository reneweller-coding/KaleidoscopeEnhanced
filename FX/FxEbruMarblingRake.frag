#version 330 core
out vec4 fragColor;
/**
 * @file FxEbruMarblingRake.frag
 * @brief FX EBRU MARBLING RAKE: Turkish paper marbling (Ebru) rake transition.
 * Fine comb teeth sweep through floating pigments in alternating directions,
 * drawing elegant capillary plumes and chevron folds that reveal the next scene.
 *   interpolation -> drives rake comb sweep across the liquid surface
 *   audioKick     -> flashes sharp pigment boundary swirls
 *   audioBass     -> undulates comb teeth displacement depth
 *
 * Per-activation variety:
 *   rakeP  float comb teeth frequency & density (0.5..2.2)
 *   swirlP float capillary vortex curl intensity (0.5..2.0)
 *   speedP float animation speed multiplier      (0.5..2.0)
 *   hueP   float pigment color hue offset        (0..6.28)
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

uniform float rakeP;
uniform float swirlP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float rak = (rakeP  > 0.0) ? rakeP  : 1.0;
    float swr = (swirlP > 0.0) ? swirlP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Comb teeth rake displacement along X axis: y-displacement alternating sign per tooth
    float toothPhase = p.x * 20.0 * rak;
    float toothSign = sin(toothPhase);
    float rakeDisp = toothSign * 0.08 * midTransition * swr * (1.0 + audioBass * 0.6);

    // Capillary swirl curls
    float curl = sin(p.y * 15.0 + t * 3.0) * cos(p.x * 15.0 - t * 2.0) * 0.03 * midTransition;

    vec2 warpUV = uv + vec2(curl, rakeDisp);

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    vec4 col = mix(c1, c0, tProg);

    // Pigment gold vein lines
    float vein = exp(-abs(toothSign) * 15.0) * midTransition;
    col.rgb += vein * vec3(1.0, 0.85, 0.4) * (1.0 + audioKick * 2.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
