#version 330 core
out vec4 fragColor;
/**
 * @file FxCausticLiquidWarp.frag
 * @brief FX CAUSTIC LIQUID WARP: Underwater optical caustic refraction transition.
 * Overlapping fluid wave harmonics generate shimmering light caustics and
 * refraction warps that dissolve the outgoing scene into the incoming one.
 *   interpolation -> controls water surface submergence & clearing progress
 *   audioKick     -> flashes sharp caustic refraction focus lines
 *   audioBass     -> undulates water wave height & refraction amplitude
 *
 * Per-activation variety:
 *   causticP float caustic sharpness & intensity (0.5..2.2)
 *   rippleP  float water ripple wave frequency   (0.5..2.0)
 *   speedP   float fluid wave velocity           (0.5..2.0)
 *   hueP     float aquatic caustic hue offset    (0..6.28)
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

uniform float causticP;
uniform float rippleP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float cst = (causticP > 0.0) ? causticP : 1.0;
    float rpl = (rippleP  > 0.0) ? rippleP  : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // 3 harmonic wave trains for optical caustics
    vec2 p1 = p * 15.0 * rpl;
    vec2 p2 = p * 22.0 * rpl + vec2(t * 1.5, -t * 1.2);
    vec2 p3 = p * 30.0 * rpl + vec2(-t * 1.1, t * 1.8);

    float w1 = sin(p1.x + sin(p1.y + t * 2.0));
    float w2 = sin(p2.y + sin(p2.x - t * 2.5));
    float w3 = sin(p3.x + p3.y + t * 3.0);

    float causticField = (w1 + w2 + w3) / 3.0;
    float caustics = pow(max(0.0, 1.0 - abs(causticField)), 8.0) * cst;

    // Refraction offset vector
    vec2 refr = vec2(w1 - w2, w2 - w3) * 0.03 * midTransition * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + refr));
    vec4 c0 = texture(tex0, fract(uv - refr));

    vec4 col = mix(c1, c0, tProg);

    // Shimmering aquatic caustic highlights
    vec3 causticCyan = vec3(0.2, 0.9, 1.0);
    col.rgb += caustics * causticCyan * midTransition * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
