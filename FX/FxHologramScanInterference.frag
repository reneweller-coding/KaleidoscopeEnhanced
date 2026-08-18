#version 330 core
out vec4 fragColor;
/**
 * @file FxHologramScanInterference.frag
 * @brief FX HOLOGRAM SCAN INTERFERENCE: Volumetric laser holographic scanline
 * transition. Laser interference fringes and horizontal spatial-light-modulator
 * scanlines reconstruct the incoming scene with chromatic hologram diffraction.
 *   interpolation -> sweeps holographic phase modulation & reconstruction
 *   audioKick     -> flashes laser interference fringe lines
 *   audioHigh     -> sharpens holographic scanline resolution
 *
 * Per-activation variety:
 *   scanP  float scanline density & line frequency (0.5..2.2)
 *   holoP  float holographic depth displacement   (0.5..2.0)
 *   speedP float scan velocity multiplier          (0.5..2.0)
 *   hueP   float hologram laser hue offset         (0..6.28)
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

uniform float scanP;
uniform float holoP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float scn = (scanP  > 0.0) ? scanP  : 1.0;
    float hlo = (holoP  > 0.0) ? holoP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Holographic horizontal scanlines
    float scanline = sin(uv.y * 240.0 * scn - t * 12.0);
    float scanIntense = smoothstep(0.0, 0.8, scanline);

    // Laser phase shift displacement
    float phaseShift = sin(uv.y * 30.0 + t * 4.0) * 0.03 * midTransition * hlo;
    vec2 warpUV = uv + vec2(phaseShift, 0.0);

    // Chromatic hologram RGB split
    vec2 rUV = warpUV - vec2(0.01 * midTransition, 0.0);
    vec2 bUV = warpUV + vec2(0.01 * midTransition, 0.0);

    float r1 = texture(tex1, fract(rUV)).r;
    float g1 = texture(tex1, fract(warpUV)).g;
    float b1 = texture(tex1, fract(bUV)).b;
    vec3 c1 = vec3(r1, g1, b1);

    float r0 = texture(tex0, fract(rUV)).r;
    float g0 = texture(tex0, fract(warpUV)).g;
    float b0 = texture(tex0, fract(bUV)).b;
    vec3 c0 = vec3(r0, g0, b0);

    vec3 col = mix(c1, c0, tProg);

    // Hologram laser glow (electric cyan / neon violet)
    vec3 holoColor = mix(vec3(0.1, 0.9, 1.0), vec3(0.8, 0.2, 1.0), sin(uv.y * 10.0 + t) * 0.5 + 0.5);
    col += scanIntense * holoColor * 0.3 * midTransition;
    col += phaseShift * vec3(1.0, 0.98, 0.9) * (2.0 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
