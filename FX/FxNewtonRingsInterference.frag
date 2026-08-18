#version 330 core
out vec4 fragColor;
// FxNewtonRingsInterference.frag
// -----------------------------------------------------------------------
// FX NEWTON RINGS INTERFERENCE: Optical thin-film Newton's rings transition.
// Interference between a spherical lens surface and an optical flat produces
// concentric chromatic interference rings that expand radially to reveal the incoming scene.
//   interpolation -> sweeps air gap thickness & expanding interference fringe radius
//   audioKick     -> flashes constructive interference rainbow rings
//   audioBass     -> undulates lens curvature & ring spacing
//
// Per-activation variety:
//   ringP  float Newton ring radial frequency (0.5..2.2)
//   gapP   float optical air gap depth scale  (0.5..2.0)
//   speedP float animation speed multiplier   (0.5..2.0)
//   hueP   float interference ring hue offset (0..6.28)
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

uniform float ringP;
uniform float gapP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float rng = (ringP  > 0.0) ? ringP  : 1.0;
    float gap = (gapP   > 0.0) ? gapP   : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r2 = dot(p, p);
    // Optical path difference: Delta = r^2 / R + d(t)
    float delta = r2 * 30.0 * rng - tProg * 12.0 * gap;

    // Thin film interference cosine wave
    float fringe = cos(delta * 3.14159265);
    float fringeMask = smoothstep(-0.3, 0.3, fringe);

    // Lens air-gap refraction warp
    vec2 refr = normalize(p + 1e-4) * fringe * 0.025 * midTransition * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + refr));
    vec4 c0 = texture(tex0, fract(uv - refr));

    float blend = clamp(tProg * 1.4 - (1.0 - fringeMask) * 0.4, 0.0, 1.0);
    vec4 col = mix(c1, c0, blend);

    // Spectral rainbow thin-film colors
    vec3 rainbow = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + delta * 2.0 + audioPhase);
    float ringGlow = pow(max(0.0, fringe), 4.0) * midTransition;
    col.rgb += ringGlow * rainbow * (1.4 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
