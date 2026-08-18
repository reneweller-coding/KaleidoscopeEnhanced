#version 330 core
out vec4 fragColor;
// HyperWarpTunnel.frag
// -----------------------------------------------------------------------
// HYPER WARP TUNNEL: Full-screen infinite warp tunnel with dynamic polar
// coordinates, multi-frequency FBM domain warping, and high-velocity flight.
//   audioAdvance -> continuous high-speed forward progression
//   audioKick    -> explosive tunnel expansion & FOV shockwave pulse
//   audioFlux    -> tunnel wall ripple distortion & domain twisting
//   audioCentroid-> dynamic color temperature mapping
//   audioSubBass -> deep tunnel wall pulsing
//
// Per-activation variety (0 = default):
//   speedP  float flight speed multiplier       (0 -> 1.0; 0.5..1.8)
//   warpP   float FBM warp intensity multiplier (0 -> 1.0; 0.5..2.0)
//   twistP  float tunnel twist intensity        (0 -> 1.0; 0.3..1.5)
//   hueP    float global hue rotation           (0 -> none; 0..6.28)
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

uniform float speedP;
uniform float warpP;
uniform float twistP;
uniform float hueP;
uniform float audioChromaHue;

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

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = rot * p * 2.0 + vec2(100.0);
        a *= 0.5;
    }
    return v;
}

void main() {
    float spd   = (speedP > 0.0) ? speedP : 1.0;
    float wrp   = (warpP  > 0.0) ? warpP  : 1.0;
    float tws   = (twistP > 0.0) ? twistP : 1.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Camera FOV breathing on kicks
    uv *= 1.0 - 0.18 * audioKick - 0.08 * audioSwell;

    // Convert to Polar Coordinates (r = radius, a = angle)
    float r = length(uv) + 1e-5;
    float a = atan(uv.y, uv.x);

    // Tunnel depth z with infinite perspective warping
    float z = 1.0 / r;

    // Twist angle along depth
    float twist = z * 0.15 * tws + audioAdvance * 0.2;
    a += twist * sin(z * 0.05 + time * 0.5);

    // Dynamic FBM domain warping on tunnel wall
    vec2 tunnelUV = vec2(a / 3.14159265, z * 0.2 + audioAdvance * spd * 0.4);
    float warpPattern = fbm(tunnelUV * 3.0 + vec2(audioFlux * 0.5, time * 0.2)) * wrp;

    // Distort UVs with warp pattern and sub-bass pulse
    tunnelUV += vec2(sin(z * 2.0 + time), cos(a * 4.0)) * 0.05 * warpPattern;
    tunnelUV.y += audioSubBass * 0.08 * sin(a * 6.0);

    // Sample source image along warp coordinates
    vec3 col = img(fract(tunnelUV));

    // Dynamic lighting and depth shading (light at tunnel horizon)
    float depthFade = smoothstep(0.0, 1.5, r);
    float centerGlow = 0.13 / (r + 0.16) * (1.0 + audioKick * 0.6);
    float rings  = pow(0.5 + 0.5 * cos(z * 1.1 - (time * 2.6 * spd + audioAdvance * 4.0)), 6.0);
    float spokes = pow(abs(cos(a * 9.0 + z * 0.4)), 5.0);
    vec3 glowCol = imgPalette(0.30 * audioCentroid) * 1.4;

    col = col * depthFade + glowCol * centerGlow * (0.4 + 0.6 * audioMid);

    // Chromatic aberration towards screen edges
    vec2 caOffset = uv * 0.02 * (audioHigh + audioKick);
    col.r = img(fract(tunnelUV + caOffset)).r * depthFade + centerGlow * glowCol.r;
    col.b = img(fract(tunnelUV - caOffset)).b * depthFade + centerGlow * glowCol.b;

    // The tunnel itself: racing depth rings + spokes (added after the CA
    // block — that block rebuilds col.r/col.b and would eat them).
    col += glowCol * rings * (0.25 + 0.75 * depthFade) * (0.9 + 0.8 * audioKick);
    col += imgPalette(0.5) * spokes * (0.25 + 0.75 * depthFade) * 0.35;

    // Apply hue rotation if configured
    if (hueP > 0.0) {
        col = hueRot(col, hueP);
    }

    // Border vignette
    float vig = smoothstep(1.4, 0.5, length(gl_FragCoord.xy / resolution - 0.5));
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
