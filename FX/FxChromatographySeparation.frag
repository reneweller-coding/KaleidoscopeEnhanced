#version 330 core
out vec4 fragColor;
// FxChromatographySeparation.frag
// -----------------------------------------------------------------------
// FX CHROMATOGRAPHY SEPARATION: Paper chromatography capillary transition.
// A liquid solvent front climbs capillary paper fibers, separating the scene's
// pigments into distinct chromatic bands based on chemical retention factors (Rf),
// resolving into the incoming scene.
//   interpolation -> drives solvent front capillary migration across the frame
//   audioKick     -> flashes sharp chromatographic pigment separation bands
//   audioBass     -> undulates capillary paper fiber texture
//
// Per-activation variety:
//   solventP float solvent front migration velocity (0.5..2.2)
//   retardP  float retention factor (Rf) split width (0.5..2.0)
//   speedP   float animation speed multiplier        (0.5..2.0)
//   hueP     float pigment spectral hue offset       (0..6.28)
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

uniform float solventP;
uniform float retardP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float slv = (solventP > 0.0) ? solventP : 1.0;
    float rtd = (retardP  > 0.0) ? retardP  : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Solvent front moving upward
    float solventFront = mix(-1.2, 1.2, tProg) * slv;
    float distToSolvent = p.y - solventFront;

    // Different Rf factors for R, G, B channels
    float rf_R = 0.9 * rtd;
    float rf_G = 0.65 * rtd;
    float rf_B = 0.4 * rtd;

    float rDisp = max(0.0, solventFront * rf_R - p.y) * 0.04 * midTransition;
    float gDisp = max(0.0, solventFront * rf_G - p.y) * 0.04 * midTransition;
    float bDisp = max(0.0, solventFront * rf_B - p.y) * 0.04 * midTransition;

    float r1 = texture(tex1, fract(uv + vec2(0.0, rDisp))).r;
    float g1 = texture(tex1, fract(uv + vec2(0.0, gDisp))).g;
    float b1 = texture(tex1, fract(uv + vec2(0.0, bDisp))).b;
    vec3 c1 = vec3(r1, g1, b1);

    float r0 = texture(tex0, fract(uv - vec2(0.0, rDisp))).r;
    float g0 = texture(tex0, fract(uv - vec2(0.0, gDisp))).g;
    float b0 = texture(tex0, fract(uv - vec2(0.0, bDisp))).b;
    vec3 c0 = vec3(r0, g0, b0);

    float wipeMask = smoothstep(-0.05, 0.05, distToSolvent);
    vec3 col = mix(c0, c1, wipeMask);

    // Solvent meniscus line glow
    float meniscus = exp(-abs(distToSolvent) * 25.0) * midTransition;
    col += meniscus * vec3(0.3, 0.85, 1.0) * (1.3 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
