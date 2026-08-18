#version 330 core
out vec4 fragColor;
// FxAnamorphicFlareSweep.frag
// -----------------------------------------------------------------------
// FX ANAMORPHIC FLARE SWEEP: Cinematic anamorphic lens flare transition.
// A horizontal laser streak and luminous cylindrical flare bar sweeps across
// the frame, wiping the outgoing scene and leaving the incoming scene behind.
//   interpolation -> drives the horizontal anamorphic flare position across screen
//   audioKick     -> flashes intense laser core emission and horizontal streaks
//   audioHigh     -> sharpens anamorphic lens flare lines
//
// Per-activation variety:
//   flareP float flare beam width & intensity     (0.5..2.2)
//   sweepP float sweep angle tilt                 (0.5..2.0)
//   speedP float animation speed multiplier       (0.5..2.0)
//   hueP   float anamorphic flare hue offset      (0..6.28)
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

uniform float flareP;
uniform float sweepP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float flr = (flareP > 0.0) ? flareP : 1.0;
    float swp = (sweepP > 0.0) ? sweepP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);

    // Flare sweep front moving left to right
    float sweepX = mix(-0.2, 1.2, tProg);
    float distToFlare = uv.x - sweepX + p.y * 0.15 * (swp - 1.0);

    // Horizontal anamorphic streak: exp(-|y| * scale)
    float horizStreak = exp(-abs(p.y) * 20.0) * exp(-abs(distToFlare) * 8.0);
    float verticalBar  = exp(-abs(distToFlare) * 25.0 / flr);

    // Cylindrical lens distortion near the flare
    float lensDistort = exp(-abs(distToFlare) * 10.0) * sign(distToFlare) * 0.04;
    vec2 warpUV = uv + vec2(lensDistort, 0.0);

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    float wipeMask = smoothstep(-0.05, 0.05, distToFlare);
    vec4 col = mix(c0, c1, wipeMask);

    // Cinematic anamorphic blue flare
    vec3 flareBlue = vec3(0.15, 0.7, 1.0);
    vec3 flareCore = vec3(1.0, 0.98, 0.9);

    float midTransition = sin(tProg * 3.14159265);
    col.rgb += verticalBar * flareBlue * (1.5 + audioKick * 3.0) * midTransition;
    col.rgb += horizStreak * flareCore * (2.0 + audioKick * 4.0) * midTransition;

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
