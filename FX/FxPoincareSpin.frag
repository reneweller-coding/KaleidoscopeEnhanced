#version 330 core
out vec4 fragColor;
/**
 * @file FxPoincareSpin.frag
 * @brief FX POINCARE SPIN: Conformal hyperbolic Poincaré disk inversion and
 * continuous Möbius transformation. The outgoing scene turns inside out
 * through hyperbolic circle inversions while the incoming scene expands
 * smoothly from the non-Euclidean horizon.
 *   interpolation -> sweeps hyperbolic Möbius translation from 0 to 1
 *   audioKick     -> flashes hyperbolic geodesic boundaries
 *   audioBass     -> pulses Poincaré metric radius
 *
 * Per-activation variety:
 *   diskP  float Poincaré disk metric curvature (0.5..2.2)
 *   spinP  float hyperbolic rotation velocity   (0.5..2.0)
 *   speedP float animation speed multiplier      (0.5..2.0)
 *   hueP   float geodesic rim hue offset        (0..6.28)
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

uniform float diskP;
uniform float spinP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), sn = sin(a);
    return mat2(c, -sn, sn, c);
}

void main() {
    float dsk = (diskP  > 0.0) ? diskP  : 1.0;
    float spn = (spinP  > 0.0) ? spinP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 z = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y * (1.8 * dsk);

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Hyperbolic rotation & translation: z' = (z - a) / (1 - conj(a)*z)
    float rotAngle = (tProg * 3.14159265 + t * 0.5) * spn;
    z = rot2D(rotAngle) * z;

    // Möbius parameter a moving across the disk
    vec2 a = vec2(sin(tProg * 3.14159265) * 0.65, 0.0);

    // Complex division: (z - a) / (1 - a*z)
    vec2 num = z - a;
    vec2 den = vec2(1.0 - (a.x * z.x + a.y * z.y), -(a.x * z.y - a.y * z.x));
    float denMag2 = dot(den, den);
    vec2 zPrime = vec2(dot(num, den), num.y * den.x - num.x * den.y) / max(denMag2, 1e-4);

    // Conformal sampling UVs
    vec2 uvWarped = zPrime * 0.5 + 0.5;

    vec4 c1 = texture(tex1, fract(mix(uv, uvWarped, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(uvWarped, uv, 1.0 - midTransition)));

    vec4 col = mix(c1, c0, tProg);

    // Glowing geodesic circle rim
    float r = length(zPrime);
    float rim = exp(-abs(r - 1.0) * 15.0) * midTransition;
    col.rgb += rim * vec3(0.1, 0.9, 1.0) * (1.5 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
