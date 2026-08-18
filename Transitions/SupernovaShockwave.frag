#version 330 core
out vec4 fragColor;
/**
 * @file SupernovaShockwave.frag
 * @brief TRANSITION SUPERNOVA SHOCKWAVE: Spherical supernova blast wave transition.
 * A hyper-velocity relativistic blast wave detonates at the center, expanding
 * radially outward with glowing shock compression and revealing the new scene.
 *   interpolation -> sweeps the spherical shockwave radius across the viewport
 *   audioKick     -> detonates primary supernova core explosion flash
 *   audioBass     -> drives shockwave displacement amplitude
 *
 * Per-activation variety:
 *   blastP float shockwave expansion velocity multiplier (0.5..2.2)
 *   shockP float shock front compression thickness       (0.5..2.0)
 *   speedP float animation speed multiplier              (0.5..2.0)
 *   hueP   float shockwave ionization hue offset         (0..6.28)
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

uniform float blastP;
uniform float shockP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float bls = (blastP > 0.0) ? blastP : 1.0;
    float shk = (shockP > 0.0) ? shockP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);

    float r = length(p);
    float angle = atan(p.y, p.x);

    // Shockwave expanding radius: r_shock in [0, 1.4]
    float rShock = tProg * 1.35 * bls;
    float distToShock = r - rShock;

    // Shock front compression displacement
    float compression = exp(-abs(distToShock) * 20.0 / shk) * sign(distToShock) * 0.05 * (1.0 + audioBass * 0.7);
    vec2 shockDisp = normalize(p + 1e-4) * compression;

    vec4 c1 = texture(tex1, fract(uv + shockDisp));
    vec4 c0 = texture(tex0, fract(uv - shockDisp));

    float wipeMask = smoothstep(-0.02, 0.02, distToShock);
    vec4 col = mix(c0, c1, wipeMask);

    // Glowing Cherenkov shock front ring
    float shockRing = exp(-abs(distToShock) * 35.0 / shk);
    vec3 shockColor = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.9, 0.3), exp(-r * 3.0));
    col.rgb += shockRing * shockColor * (1.5 + audioKick * 3.5);

    // Central supernova core flash — windowed by the transition envelope:
    // the old (1.0 - tProg) factor left the flash at FULL brightness at the
    // fade's end (tProg=0), a bright dot popping off when the pass stops.
    float midT = sin(tProg * 3.14159265);
    float coreFlash = exp(-r * 15.0) * midT * (2.0 + audioKick * 4.0);
    col.rgb += coreFlash * vec3(1.0, 0.98, 0.92);

    float midTransition = sin(tProg * 3.14159265);
    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
