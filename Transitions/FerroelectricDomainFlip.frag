#version 330 core
out vec4 fragColor;
/**
 * @file FerroelectricDomainFlip.frag
 * @brief TRANSITION FERROELECTRIC DOMAIN FLIP: Perovskite crystal domain wall transition.
 * Spontaneous electric polarization domains (180° and 90° domain walls)
 * nucleate and propagate across crystal grains, flipping polarization and scenes.
 *   interpolation -> sweeps coercive electric field & polarization reversal
 *   audioKick     -> flashes domain wall Barkhausen jump pulses
 *   audioBass     -> undulates piezoelectric crystal lattice strain
 *
 * Per-activation variety:
 *   domainP float ferroelectric domain grain density  (0.5..2.2)
 *   wallP   float domain wall boundary sharpness      (0.5..2.0)
 *   speedP  float animation speed multiplier          (0.5..2.0)
 *   hueP    float polarization domain hue offset      (0..6.28)
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

uniform float domainP;
uniform float wallP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float dom = (domainP > 0.0) ? domainP : 1.0;
    float wal = (wallP   > 0.0) ? wallP   : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // 90-degree and 180-degree domain stripe patterns
    vec2 q = p * 18.0 * dom;
    float domainPattern = sin(q.x + sin(q.y * 1.5)) * cos(q.y + sin(q.x * 1.5));

    // Coercive electric field sweep
    float eField = mix(-1.2, 1.2, tProg);
    float polarization = domainPattern - eField;

    // Piezoelectric shear strain displacement
    float signP = sign(polarization);
    vec2 piezDisp = vec2(signP * 0.02, -signP * 0.02) * midTransition * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + piezDisp));
    vec4 c0 = texture(tex0, fract(uv - piezDisp));

    float domainWipe = smoothstep(-0.1 / wal, 0.1 / wal, polarization);
    vec4 col = mix(c0, c1, domainWipe);

    // Glowing ferroelectric domain walls (bound charge accumulation)
    float wallGlow = exp(-abs(polarization) * 20.0 * wal) * midTransition;
    col.rgb += wallGlow * vec3(1.0, 0.4, 0.85) * (1.4 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
