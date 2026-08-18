#version 330 core
out vec4 fragColor;
/**
 * @file MajoranaZeroModeBraid.frag
 * @brief MAJORANA ZERO MODE BRAID: 1D topological superconductor nanowire array
 * executing non-abelian Majorana zero-mode braiding operations. Spacetime
 * worldline braids, non-local qubit state encoding, topological phase
 * protection, and continuous photo texture reflections.
 *   audioAdvance -> executes non-abelian Majorana braiding exchanges
 *   audioKick    -> flashes topological quantum gate phase flips & qubit readout
 *   audioBass    -> undulates superconducting proximity gap and wire width
 *   audioChromaHue-> shifts non-abelian topological phase color grading
 *
 * Per-activation variety:
 *   braidP    float Majorana braiding frequency & twist  (0.5..2.2)
 *   junctionP float nanowire junction cross spacing      (0.5..2.0)
 *   speedP    float braiding operation velocity          (0.5..2.0)
 *   hueP      float quantum state chromatic hue offset   (0..6.28)
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

uniform float braidP;
uniform float junctionP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float brd = (braidP    > 0.0) ? braidP    : 1.0;
    float jnc = (junctionP > 0.0) ? junctionP : 1.0;
    float spd = (speedP    > 0.0) ? speedP    : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Nanowire junction grid coordinates (T-junctions & Y-junctions)
    vec2 p = uv * 6.0 * jnc;

    // Majorana braiding worldlines weaving across each other
    float wire1 = abs(p.y - sin(p.x * 1.5 * brd + t * 3.0) * 0.8);
    float wire2 = abs(p.y - cos(p.x * 1.5 * brd - t * 3.0) * 0.8);
    float wire3 = abs(p.x - sin(p.y * 1.5 * brd + t * 2.5) * 0.8);

    float wireGlow1 = exp(-wire1 * 25.0);
    float wireGlow2 = exp(-wire2 * 25.0);
    float wireGlow3 = exp(-wire3 * 25.0);
    float allWires = wireGlow1 + wireGlow2 + wireGlow3;

    // Majorana bound zero-mode endpoints (solitons at wire ends & crossings)
    float zeroModeCross = wireGlow1 * wireGlow2 * 4.0 + wireGlow1 * wireGlow3 * 4.0;
    float majoranaFlash = zeroModeCross * (1.0 + audioKick * 3.5);

    // Topological phase accumulation in the loop
    float loopPhase = sin(p.x * 3.0 + p.y * 3.0 + t * 2.0);
    vec3 phaseColor = imgPalette((loopPhase + audioPhase) * 0.159);

    // Photo texture mapping into the topological nanowire junctions
    vec2 photoUV = st + vec2(wireGlow1 - wireGlow2, wireGlow3) * 0.04 * (1.0 + audioKick);
    vec3 photo = img(fract(photoUV));

    // Combine visualizer
    vec3 col = mix(photo * 0.8, phaseColor, 0.4 + 0.25 * audioSwell);
    col += allWires * vec3(0.1, 0.9, 1.0) * (1.0 + audioHigh * 1.2);
    col += majoranaFlash * vec3(1.0, 0.95, 0.4) * 2.0;

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, length(uv));
    col *= vig;

    fragColor = vec4(col, 1.0);
}
