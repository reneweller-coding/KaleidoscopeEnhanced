#version 330 core
out vec4 fragColor;
/**
 * @file FxGoldenNautilus.frag
 * @brief FX GOLDEN NAUTILUS: Fibonacci golden spiral nautilus chamber sweep.
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

    // Chamber septa (compartment walls)
    float chamber = fract(spiralTheta / 6.2831853);
    float wallDist = min(chamber, 1.0 - chamber);

    // Sweep boundary moving outward along the spiral
    float sweepFront = tProg * 8.0 * swp;
    float sweepMask = smoothstep(sweepFront - 0.5, sweepFront + 0.5, spiralTheta);

    // Subtle coordinate warp
    vec2 warpUV = uv + vec2(sin(spiralTheta), cos(spiralTheta)) * 0.02 * midTransition;

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    vec4 col = mix(c0, c1, sweepMask);

    // Glowing chamber septum walls
    float wallGlow = exp(-wallDist * 30.0) * midTransition;
    col.rgb += wallGlow * vec3(1.0, 0.9, 0.4) * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
