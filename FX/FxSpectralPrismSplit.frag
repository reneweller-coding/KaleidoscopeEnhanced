#version 330 core
out vec4 fragColor;
// CombineSpectralPrismSplit.frag
// -----------------------------------------------------------------------
// COMBINE SPECTRAL PRISM SPLIT: Optical prism dispersion transition.
// The image splits into red, green, and blue spectral sub-images that
// disperse across the screen with chromatic aberration and recombine
// smoothly into the incoming scene.
//   interpolation -> sweeps dispersion angle & channel separation
//   audioKick     -> flashes spectral rainbow flare streaks
//   audioBass     -> widens chromatic channel separation distance
//
// Per-activation variety:
//   prismP float dispersion intensity & separation width (0.5..2.2)
//   splitP float split angle direction multiplier        (0.5..2.0)
//   speedP float animation speed                         (0.5..2.0)
//   hueP   float spectral hue offset                     (0..6.28)
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

uniform float prismP;
uniform float splitP;
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
    float prs = (prismP > 0.0) ? prismP : 1.0;
    float spl = (splitP > 0.0) ? splitP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Dispersion vector
    vec2 dispDir = vec2(cos(t * 0.5 * spl), sin(t * 0.5 * spl));
    float dispMag = midTransition * 0.06 * prs * (1.0 + audioBass * 0.8 + audioKick * 0.5);

    vec2 uvR = uv - dispDir * dispMag;
    vec2 uvG = uv;
    vec2 uvB = uv + dispDir * dispMag;

    // Sample RGB channels separately for tex1 and tex0
    float r1 = texture(tex1, fract(uvR)).r;
    float g1 = texture(tex1, fract(uvG)).g;
    float b1 = texture(tex1, fract(uvB)).b;
    vec3 c1 = vec3(r1, g1, b1);

    float r0 = texture(tex0, fract(uvR)).r;
    float g0 = texture(tex0, fract(uvG)).g;
    float b0 = texture(tex0, fract(uvB)).b;
    vec3 c0 = vec3(r0, g0, b0);

    vec3 col = mix(c1, c0, tProg);

    // Spectral rainbow flare lines
    float spectralStreak = pow(max(0.0, sin(dot(p, dispDir) * 40.0 - t * 4.0)), 6.0) * midTransition;
    vec3 rainbow = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + dot(p, dispDir) * 10.0 + audioPhase);
    col += spectralStreak * rainbow * (1.5 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
