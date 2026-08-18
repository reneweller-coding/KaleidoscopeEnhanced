#version 330 core
out vec4 fragColor;
// FxReactionDiffusionTuring.frag
// -----------------------------------------------------------------------
// FX REACTION DIFFUSION TURING: Morphogenetic Turing pattern transition.
// Chemical activator-inhibitor reaction-diffusion spots and labyrinthine stripes
// spontaneously organize across the frame, carrying the cross-fade between scenes.
//   interpolation -> sweeps chemical reaction equilibrium & pattern growth
//   audioKick     -> flashes Turing chemical reaction boundary fronts
//   audioBass     -> undulates morphogenesis spot/stripe scale
//
// Per-activation variety:
//   turingP float reaction-diffusion pattern complexity (0.5..2.2)
//   scaleP  float Turing spot/labyrinth spatial scale   (0.5..2.0)
//   speedP  float animation speed multiplier            (0.5..2.0)
//   hueP    float chemical pigment hue offset           (0..6.28)
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

uniform float turingP;
uniform float scaleP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float trn = (turingP > 0.0) ? turingP : 1.0;
    float scl = (scaleP  > 0.0) ? scaleP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Multi-scale harmonic approximation of Turing reaction-diffusion
    vec2 q = p * 15.0 * scl;
    float f1 = sin(q.x + sin(q.y * 1.5 + t));
    float f2 = sin(q.y + sin(q.x * 1.5 - t));
    float f3 = sin((q.x + q.y) * 0.707 * trn + t * 1.5);
    float turingPattern = (f1 + f2 + f3) / 3.0;

    // Morphogenetic boundary mask
    float mask = smoothstep(-0.2, 0.2, turingPattern + (tProg - 0.5) * 2.0);

    // Chemical displacement
    vec2 chemDisp = vec2(f1 - f2, f3) * 0.02 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + chemDisp));
    vec4 c0 = texture(tex0, fract(uv - chemDisp));

    vec4 col = mix(c1, c0, mask);

    // Glowing reaction boundary lines
    float boundary = exp(-abs(turingPattern) * 15.0) * midTransition;
    vec3 chemColor = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + turingPattern * 5.0 + audioPhase);
    col.rgb += boundary * chemColor * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
