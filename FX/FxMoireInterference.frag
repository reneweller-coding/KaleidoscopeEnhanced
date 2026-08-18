#version 330 core
out vec4 fragColor;
/**
 * @file FxMoireInterference.frag
 * @brief FX MOIRE INTERFERENCE: Optical Moiré superlattice interference fringes
 * bridging the transition between scenes. Overlapping rotating line gratings
 * produce dynamic macroscopic interference waves that carry the cross-fade.
 *   interpolation -> controls grating rotation angle & interference phase
 *   audioKick     -> flashes Moiré constructive interference maxima
 *   audioBass     -> undulates grating spatial frequency
 *
 * Per-activation variety:
 *   freqP  float grating spatial frequency (0.5..2.2)
 *   angleP float relative grating twist     (0.5..2.0)
 *   speedP float animation speed multiplier (0.5..2.0)
 *   hueP   float interference fringe hue    (0..6.28)
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

uniform float freqP;
uniform float angleP;
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
    float frq = (freqP  > 0.0) ? freqP  : 1.0;
    float ang = (angleP > 0.0) ? angleP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Grating 1 and Grating 2 with relative twist angle
    float rot1 = tProg * 0.8 * ang + t * 0.1;
    float rot2 = -tProg * 0.8 * ang - t * 0.1;

    vec2 p1 = rot2D(rot1) * p;
    vec2 p2 = rot2D(rot2) * p;

    float g1 = sin(p1.x * 60.0 * frq + t * 2.0);
    float g2 = sin(p2.x * 60.0 * frq - t * 2.0);

    // Moiré superlattice product: cos(k1 - k2)
    float moireWave = g1 * g2;
    float moireMask = smoothstep(-0.5, 0.5, moireWave);

    // Coordinate displacement along Moiré gradient
    vec2 disp = vec2(g1, g2) * 0.025 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + disp));
    vec4 c0 = texture(tex0, fract(uv - disp));

    // Staggered blend modulated by Moiré fringe
    float blend = clamp(tProg * 1.5 - (1.0 - moireMask) * 0.5, 0.0, 1.0);
    vec4 col = mix(c1, c0, blend);

    // Glowing interference fringe highlights
    float fringeGlow = pow(max(0.0, moireWave), 4.0) * midTransition;
    col.rgb += fringeGlow * vec3(0.2, 0.9, 1.0) * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
