#version 330 core
out vec4 fragColor;
/**
 * @file QuantumTachyonWarpTunnel.frag
 * @brief QUANTUM TACHYON WARP TUNNEL: Superluminal tachyon warp tunnel with Cherenkov
 * radiation shock cones, relativistic optical headlight beaming, hyper-speed star streaks,
 * and high-energy spacetime compression pulses.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives extreme superluminal warp flight progression
 *   audioKick    -> flashes Cherenkov shockwave cones & hyperdrive burst
 *   audioCentroid-> sharpens radial tachyon streak resolution & color temperature
 *   audioSubBass -> expands warp tunnel diameter breathing
 *   audioChromaHue-> steers the Cherenkov blue-to-hyperviolet spectrum
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
uniform float warpP;
uniform float streaksP;
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

// Overall level of the photo currently on the texture units, from a fixed
// 5-tap grid. The tunnel wall is the photo itself, so a bright photo left the
// Cherenkov rings, the streaks and the singularity flare no headroom at all.
// The probe rides the tex0/tex1 crossfade, so the gain it feeds can never pop,
// and being one number for the whole frame it rescales exposure without
// touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float wrp = (warpP > 0.01) ? warpP : 1.2;
    float strk = (streaksP > 0.01) ? streaksP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.45 * spd;

    float r = max(0.01, length(uv));
    float a = atan(uv.y, uv.x);

    // Relativistic headlight compression towards center: r -> r^(1/gamma)
    float gamma = 1.6 + 0.5 * audioLevel;
    // Sub-bass widens the tunnel throat by dilating the radial coordinate the
    // cylindrical mapping is built from -- the -t*4.0 flight term stays
    // untouched so the accumulated warp phase is never remapped.
    float rTun = max(0.01, r / (1.0 + 0.35 * audioSubBass));
    float rRel = pow(rTun, 1.0 / gamma);

    // Warp tunnel cylindrical coordinates: (angle a, depth z = 1/r)
    float zTunnel = (1.0 / rRel) * wrp - t * 4.0;

    // Cherenkov radiation shock cone rings
    float cherenkovCone = abs(sin(zTunnel * 1.5 + t * 2.0));
    float coneGlow = exp(-cherenkovCone * 8.0) * glw;

    // High-speed radial tachyon light streaks
    // Tonal brightness raises the angular streak count and narrows the
    // smoothstep band, so bright material resolves into many thin filaments
    // while dark material leaves a few soft ones.
    float streaks = abs(sin(a * (24.0 * strk) * (1.0 + 0.4 * audioCentroid) + sin(zTunnel * 0.5) * 3.0));
    float streakGlow = smoothstep(0.85 + 0.1 * audioCentroid, 1.0, streaks) * (1.0 + 2.0 * audioHigh);

    // Sample distorted background photo
    vec2 sampleUV = fract(vec2(a / 6.2831853 + 0.5, zTunnel * 0.15));
    vec3 texCol = img(sampleUV);

    // Cherenkov electric-blue / violet / magenta palette
    vec3 palBase = imgPalette(zTunnel * 0.1 + 0.2);
    // Hold the tunnel wall back to a fixed dark base -- Cherenkov light only
    // reads against dark spacetime, and with a bright photo the wall alone
    // already sat near 1.0 so every glow below was clipped away on top of it.
    float expGain = clamp(0.22 / max(0.05, photoLevel()), 0.22, 2.4);
    vec3 col = mix(texCol, palBase, 0.45) * expGain;

    // Add glowing Cherenkov shock rings & tachyon streaks
    // The tint constants exceed 1.0 per channel, so the TINTED vectors carry
    // the caps -- bounding only the scalar glows left vec3(0.2,1.3,1.9) * it
    // free to reach 6.7 on a kick.
    vec3 cherenkovTint = min(vec3(0.2, 1.3, 1.9) * coneGlow * (1.0 + 2.5 * audioKick), vec3(1.0));
    // Colour temperature follows the same brightness cue: dark lows tint the
    // streaks amber, bright highs push them to cold hyperviolet. Both ends
    // stay at or below the original tint peaks, so no extra light is added.
    vec3 streakTemp = mix(vec3(1.6, 1.3, 1.0), vec3(1.2, 1.4, 1.9), audioCentroid);
    vec3 streakTint = min(streakTemp * streakGlow * (0.8 + 1.5 * audioKick), vec3(0.95));

    col += cherenkovTint + streakTint;

    // Center hyperdrive singularity flare. It stays the brightest thing on
    // screen, but bounded: 2.0 + 4.0 * kick on a tint peaking at 2.0 put this
    // single term at 12.0 per channel over the whole tunnel throat.
    float centerFlare = exp(-r * 12.0) * (2.0 + 4.0 * audioKick);
    col += min(vec3(1.6, 1.7, 2.0) * centerFlare, vec3(1.35));

    // Vignette & gamma
    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
