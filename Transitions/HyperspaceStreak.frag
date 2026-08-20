#version 330 core
out vec4 fragColor;
/**
 * @file HyperspaceStreak.frag
 * @brief TRANSITION HYPERSPACE STREAK: Relativistic warp speed streak transition.
 * As the warp drive engages, the outgoing scene stretches into radial light
 * streaks with intense Lorentz contraction, arriving cleanly into the incoming scene.
 *   interpolation -> sweeps sub-light to warp factor 9.9 and decelerates
 *   audioKick     -> flashes warp drive entry/exit relativistic burst
 *   audioHigh     -> sharpens hyperspace star streak lines
 *
 * Per-activation variety:
 *   warpP   float warp speed stretch magnitude   (0.5..2.2)
 *   streakP float radial star streak ray density (0.5..2.0)
 *   speedP  float animation speed multiplier     (0.5..2.0)
 *   hueP    float Cherenkov warp hue offset      (0..6.28)
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

uniform float warpP;
uniform float streakP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float wrp = (warpP   > 0.0) ? warpP   : 1.0;
    float str = (streakP > 0.0) ? streakP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);
    float angle = atan(p.y, p.x);

    // Multi-tap radial warp stretch
    float stretchFactor = midTransition * 0.35 * wrp * (1.0 + audioBass * 0.7);

    vec3 c1Acc = vec3(0.0);
    vec3 c0Acc = vec3(0.0);

    for (int i = 0; i < 8; ++i) {
        float fi = float(i) / 8.0;
        vec2 sampleP = p * (1.0 - fi * stretchFactor);
        vec2 sampleUV = (sampleP * resolution.y + 0.5 * resolution) / resolution;

        c1Acc += texture(tex1, fract(sampleUV)).rgb;
        c0Acc += texture(tex0, fract(sampleUV)).rgb;
    }

    vec3 c1 = c1Acc / 8.0;
    vec3 c0 = c0Acc / 8.0;

    vec3 col = mix(c1, c0, tProg);

    // Radial hyperspace star streaks -- calibrated so the scene stays
    // readable underneath (the old 1.5+kick*3.5 gain whited it out) and
    // anchored to the scene's own brightness so streaks read as ITS light
    // being stretched, not a foreign overlay.
    // audioHigh sharpens the streak lines by raising the ray exponent: a pure
    // profile change (thinner, crisper rays), never a brightness boost, and the
    // t phase inside the sine is left alone.  midTransition returns the
    // exponent to exactly 12.0 at both fade endpoints.
    float streakSharp = 12.0 * (1.0 + audioHigh * 0.9 * midTransition);
    float rayStreak = pow(max(0.0, sin(angle * 40.0 * str + t * 4.0)), streakSharp) * midTransition;
    vec3 streakCyan = vec3(0.3, 0.9, 1.0);
    float sceneLum = dot(col, vec3(0.333));
    col += rayStreak * streakCyan * (0.2 + 0.5 * sceneLum) * (0.6 + audioKick * 0.6);

    // Center arrival flash on kick
    float centerFlash = exp(-r * 8.0) * midTransition * (0.25 + audioKick * 0.35);
    col += centerFlash * vec3(1.0, 0.98, 0.9);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue * midTransition);
    if (hue > 0.001) col = hueRot(col, hue * midTransition);

    fragColor = vec4(col, 1.0);
}
