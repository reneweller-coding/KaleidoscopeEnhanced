#version 330 core
out vec4 fragColor;
/**
 * @file BuffaloFractalThunderstorm.frag
 * @brief BUFFALO FRACTAL THUNDERSTORM: Deep plunge into the non-holomorphic Buffalo
 * fractal z -> (|Re(z)| + i|Im(z)|)^2 - |Re(z)| + c with pointed horn cusps,
 * high-voltage lightning discharges running along boundary ridges, and thunderous flares.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous deep zoom into Buffalo horn boundaries
 *   audioKick    -> flashes lightning discharge arcs & explodes thunder core
 *   audioCentroid-> sharpens spiky fractal horn edge contours
 *   audioSubBass -> expands horn cavity breathing amplitude
 *   audioChromaHue-> steers the electric indigo / violet / golden lightning palette
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

// Per-activation variety
uniform float speedP;
uniform float zoomP;
uniform float lightningP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float zm = (zoomP > 0.01) ? zoomP : 1.0;
    float lgt = (lightningP > 0.01) ? lightningP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.26 * spd;

    // Center on prominent Buffalo horn cusp. The old center (-0.5, 0.2)
    // escapes this map cleanly within ~4 iterations and is NOT actually on
    // the boundary -- a numeric sweep confirmed iteration-count variance
    // across the visible neighborhood collapses to a single constant value
    // by roughly 50x-200x zoom (of the ~2x-540x range this shader cycles
    // through), so most of the zoom animation showed a smooth, textureless
    // wash with no escape-boundary detail left to shade. (-0.43, -0.99) sits
    // on an actual filament/cusp: the same sweep keeps 20-40 distinct
    // iteration counts all the way out to 500x zoom, preserving fractal
    // detail throughout the animation.
    vec2 cCenter = vec2(-0.43, -0.99);
    // Sub-bass swells the horn cavity by tightening the visible c-window. It
    // multiplies the zoom OUTSIDE the exp(), so the running zoom phase itself
    // is never rescaled.
    float zoomLevel = exp(mod(t * 0.65, 5.5)) * (2.2 * zm) * (1.0 + 0.35 * audioSubBass);
    vec2 c = cCenter + uv / zoomLevel;

    vec2 z = c;
    float iterCount = 0.0;
    float trap = 1e5;

    // Buffalo iteration loop: z = (|Re(z)| + i|Im(z)|)^2 - |Re(z)| + c
    for (int i = 0; i < 46; i++) {
        vec2 zAbs = abs(z);
        z = vec2(zAbs.x * zAbs.x - zAbs.y * zAbs.y - zAbs.x, 2.0 * zAbs.x * zAbs.y) + c;

        float r2 = dot(z, z);
        trap = min(trap, abs(z.y) + abs(z.x * 0.5));

        if (r2 > 16.0) {
            iterCount = float(i) - log2(max(1.0, log2(r2)));
            break;
        }
    }

    if (iterCount == 0.0) iterCount = 46.0;

    // Lightning discharge branching along escape boundary
    float lightningArc = abs(sin(iterCount * 1.5 + t * 4.0));
    float lightningGlow = smoothstep(0.85, 1.0, lightningArc) * lgt * (1.0 + 3.0 * audioKick);

    // Sample distorted background photo
    vec2 sampleUV = fract(z * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);

    // Electric thunderstorm palette
    vec3 palA = imgPalette(iterCount * 0.05 + trap * 0.15);
    vec3 palB = imgPalette(iterCount * 0.05 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(iterCount * 0.7 + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing horn edges & lightning arcs. Neither term was capped at
    // all in the first pass. trap (the running min of |z.y|+|z.x*0.5| over
    // 46 iterations) sits near zero across broad swaths of the boundary, not
    // just a thin filament, so edgeGlow's exp decay was saturating over wide
    // regions; lightningGlow was fully uncapped (lgt * up to 4x kick, times
    // a 2.0-peak tint channel = up to 8) and lightningArc depends only on
    // iterCount/t so it lit whole iso-bands at once -- together this is why
    // the frame read as a uniform bright wash instead of filigree over dark
    // sky. Sharpen the decay and cap both final tinted terms hard.
    float edgeGlow = exp(-trap * (30.0 + 14.0 * audioCentroid)) * glw;
    vec3 hornTint = vec3(1.2, 1.1, 1.8) * min(edgeGlow * (1.0 + 2.0 * audioKick), 0.6);
    vec3 lightTint = vec3(1.7, 1.6, 2.0) * min(lightningGlow, 0.4);

    col += hornTint + lightTint;

    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.9 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
