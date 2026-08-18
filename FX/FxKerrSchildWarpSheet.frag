#version 330 core
out vec4 fragColor;
/**
 * @file FxKerrSchildWarpSheet.frag
 * @brief FX KERR SCHILD WARP SHEET: Exact Kerr-Schild spacetime metric transition.
 * Spacetime geometry deforms continuously along null vector congruences
 * (g_ab = eta_ab + 2 H k_a k_b), stretching and shearing light rays to bridge the scenes.
 *   interpolation -> sweeps Kerr-Schild gravitational profile scalar H(r)
 *   audioKick     -> flashes null geodesic caustic focus lines
 *   audioBass     -> drives Kerr-Schild metric distortion amplitude
 *
 * Per-activation variety:
 *   warpP  float Kerr-Schild metric scalar scale  (0.5..2.2)
 *   nullP  float null vector k_a shear direction  (0.5..2.0)
 *   speedP float animation speed multiplier       (0.5..2.0)
 *   hueP   float spacetime caustic hue offset     (0..6.28)
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

uniform float warpP;
uniform float nullP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float wrp = (warpP  > 0.0) ? warpP  : 1.0;
    float nll = (nullP  > 0.0) ? nullP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);
    float theta = atan(p.y, p.x);

    // Kerr-Schild scalar H(r) = M r^3 / (r^4 + a^2 z^2)
    float H = (0.2 * wrp) / max(r * r + 0.04, 0.01) * midTransition;

    // Null vector congruence k_a
    float kAngle = theta + t * 0.5 * nll;
    vec2 kVec = vec2(cos(kAngle), sin(kAngle));

    // Kerr-Schild coordinate geodesic displacement
    vec2 metricDisp = 2.0 * H * dot(p, kVec) * kVec * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + metricDisp));
    vec4 c0 = texture(tex0, fract(uv - metricDisp));

    vec4 col = mix(c1, c0, tProg);

    // Spacetime null geodesic caustic lines
    float caustic = exp(-abs(sin(kAngle * 6.0 - r * 15.0)) * 12.0) * midTransition;
    col.rgb += caustic * vec3(0.3, 0.85, 1.0) * (1.4 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
