#version 330 core
out vec4 fragColor;
/**
 * @file GoldenNautilus.frag
 * @brief TRANSITION GOLDEN NAUTILUS: Fibonacci golden spiral nautilus chamber sweep.
 * Logarithmic chambers unfurl across the screen in golden ratio proportions
 * (phi = 1.618), sweeping the old scene away and breathing in the new one.
 *   interpolation -> sweeps the golden spiral chamber wipe across the screen
 *   audioKick     -> flashes golden spiral septum chamber walls
 *   audioBass     -> pulses chamber expansion rate
 *
 * Per-activation variety:
 *   phiP   float golden ratio curvature scale (0.5..2.2)
 *   sweepP float chamber sweep sharpness      (0.5..2.0)
 *   speedP float animation speed multiplier   (0.5..2.0)
 *   hueP   float nautilus glow hue offset     (0..6.28)
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

uniform float phiP;
uniform float sweepP;
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
    float phi = (phiP   > 0.0) ? phiP   : 1.0;
    float swp = (sweepP > 0.0) ? sweepP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);
    float angle = atan(p.y, p.x);

    // Golden spiral equation: theta = log(r / a) / b
    float b = 0.3063489 * phi; // Golden spiral pitch
    float spiralTheta = (log(max(r, 0.001) / 0.1) / b) - angle;

    // Chamber septa (compartment walls).  audioBass pulses the chamber
    // expansion rate — the septa SPACING, deliberately not the spiral pitch b,
    // which sets spiralTheta and with it the sweep front.  midTransition gates
    // it back to the plain 2*pi period at both fade endpoints, where the septa
    // glow is zero anyway.
    float chamberRate = 6.2831853 / (1.0 + audioBass * 0.45 * midTransition);
    float chamber = fract(spiralTheta / chamberRate);
    float wallDist = min(chamber, 1.0 - chamber);

    // Sweep boundary moving outward along the spiral.  spiralTheta spans
    // roughly [-15, +11] over the visible frame (log(r) blows up toward the
    // centre), so the front must START above the max and END below the min —
    // the old 0..8 sweep left outer regions showing the new scene at tProg=1
    // and the centre still showing the old one at tProg=0.
    //
    // Those two bounds are only correct at phi == 1. spiralTheta is
    // log(r/0.1)/b - angle with b proportional to phi, so derive the range
    // instead of hard-coding it: over the visible frame r spans the 0.001 clamp
    // to the corner radius (~1.02), giving a log term in [-4.61, +2.33], and
    // the -angle contributes a further +-pi that does NOT scale with phi.
    // Scaling the whole bound by 1/phi therefore over-corrects at the top of
    // the range (measured 9.4/255 at phiP=2.2), just as the fixed constants
    // under-covered at the bottom (49/255 at phiP=0.5). Computing both ends
    // exactly, with a margin past the smoothstep half-width, holds for every phiP.
    float thetaMax =  2.33 / b + 3.1416;
    float thetaMin = -4.61 / b - 3.1416;
    float sweepFront = mix(thetaMax + 1.0, thetaMin - 1.0, 1.0 - tProg);
    float sweepMask = smoothstep(sweepFront - 0.5, sweepFront + 0.5, spiralTheta);

    // Subtle coordinate warp
    vec2 warpUV = uv + vec2(sin(spiralTheta), cos(spiralTheta)) * 0.02 * midTransition * (1.0 + audioBass * 0.6);

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    vec4 col = mix(c0, c1, sweepMask);

    // Glowing chamber septum walls
    float wallGlow = exp(-wallDist * 30.0) * midTransition;
    col.rgb += wallGlow * vec3(1.0, 0.9, 0.4) * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
