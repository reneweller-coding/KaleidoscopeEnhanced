#version 330 core
out vec4 fragColor;
// CombineSmokeTurbulenceDrift.frag
// -----------------------------------------------------------------------
// COMBINE SMOKE TURBULENCE DRIFT: Atmospheric smoke and turbulent vapor transition.
// Volumetric smoke plumes billow across the viewport, catching soft light
// scattering and dissolving the outgoing scene into the incoming one.
//   interpolation -> drives smoke density buildup & atmospheric dissipation
//   audioKick     -> flashes forward light scattering through the smoke
//   audioBass     -> drives turbulent smoke eddy swirl radius
//
// Per-activation variety:
//   smokeP float smoke density & curl turbulence scale (0.5..2.2)
//   driftP float upward buoyancy drift speed            (0.5..2.0)
//   speedP float animation speed multiplier             (0.5..2.0)
//   hueP   float smoke atmospheric tint hue offset      (0..6.28)
// -----------------------------------------------------------------------

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

uniform float smokeP;
uniform float driftP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(523.34, 825.21));
    p += dot(p, p + 41.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; ++i) {
        v += a * noise(p);
        p = p * 2.0 + vec2(100.0);
        a *= 0.5;
    }
    return v;
}

void main() {
    float smk = (smokeP > 0.0) ? smokeP : 1.0;
    float drf = (driftP > 0.0) ? driftP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.35 * spd + audioAdvance * 0.18;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Multi-layered billowing smoke fBM
    vec2 smokeUV = p * 4.0 * smk + vec2(0.0, -t * 1.2 * drf);
    float smoke1 = fbm(smokeUV);
    float smoke2 = fbm(smokeUV * 2.0 + vec2(smoke1, -t * 0.8));
    float smokeDensity = smoke2 * midTransition;

    // Fluid smoke displacement
    vec2 smokeDisp = vec2(smoke1 - 0.5, smoke2 - 0.5) * 0.05 * midTransition * (1.0 + audioBass * 0.6);

    vec4 c1 = texture(tex1, fract(uv + smokeDisp));
    vec4 c0 = texture(tex0, fract(uv - smokeDisp));

    vec4 col = mix(c1, c0, tProg);

    // Forward light scattering through smoke plumes
    vec3 smokeGlow = mix(vec3(0.3, 0.4, 0.6), vec3(0.9, 0.85, 0.8), smokeDensity);
    col.rgb += smokeDensity * smokeGlow * 0.6 * (1.0 + audioKick * 2.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
