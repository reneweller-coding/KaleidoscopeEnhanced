#version 330 core
out vec4 fragColor;
/**
 * @file HyperWarpTunnel.frag
 * @brief HYPER WARP TUNNEL: Full-screen infinite warp tunnel with dynamic polar
 * coordinates, multi-frequency FBM domain warping, and high-velocity flight.
 * The wall is a photo sample DIVIDED BY THE PHOTO'S OWN MEAN (imgDC), so the
 * picture supplies texture and colour while the tunnel supplies its own light:
 * a dark nebula and a bright portrait now light the same tunnel.
 *   audioAdvance -> continuous high-speed forward progression (wall scroll,
 *                   ring phase, streak dashes -- all integrated, no flicker)
 *   audioKick    -> explosive tunnel expansion & FOV shockwave pulse, ring and
 *                   vanishing-point flare
 *   audioFlux    -> tunnel wall ripple distortion & domain twisting
 *   audioCentroid-> dynamic color temperature mapping
 *   audioSubBass -> deep tunnel wall pulsing
 *   audioMid     -> vanishing-point halo
 *   audioHigh    -> warp-streak brightness & chromatic aberration
 *
 * Per-activation variety (0 = default):
 *   speedP  float flight speed multiplier       (0 -> 1.0; 0.5..1.8)
 *   warpP   float FBM warp intensity multiplier (0 -> 1.0; 0.5..2.0)
 *   twistP  float tunnel twist intensity        (0 -> 1.0; 0.3..1.5)
 *   hueP    float global hue rotation           (0 -> none; 0..6.28)
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

uniform float speedP;
uniform float warpP;
uniform float twistP;
uniform float hueP;
uniform float audioChromaHue;

const vec3 LW = vec3(0.2126, 0.7152, 0.0722);

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// Mean colour of the CURRENT slideshow photo, for free: the slideshow textures
// are uploaded at 1024x1024 with glGenerateMipmap (RenderPipeline.cpp), so
// level 10 is the 1x1 mip == the exact average.  The tunnel wall is a photo
// sample, and the photo library swings from near-black nebulae (mean luma
// ~0.14) to bright portraits (~0.7); without this normalisation the scene's
// whole brightness AND contrast were inherited from whichever picture happened
// to be up, which is why it measured flat and near-black on the dark half of
// the library.
vec3 imgDC() {
    return (interpolation * textureLod(tex0, vec2(0.5), 10.0)
          + (1.0 - interpolation) * textureLod(tex1, vec2(0.5), 10.0)).rgb;
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

// imgPalette normalised to a fixed luminance, so the tunnel's own lights
// (rings, spokes, streaks, vanishing point) keep their brightness even when the
// photo arc happens to land on a black patch of sky.  A nearly-black palette is
// eased toward neutral first: dividing a (0.01,0.0,0.0) sample by its luma
// would otherwise produce a hard, fully saturated primary.
vec3 palNorm(float t) {
    vec3  p  = imgPalette(t);
    float pl = max(dot(p, LW), 1e-4);
    vec3  pn = min(p / pl, vec3(2.5));
    pn = mix(vec3(1.0), pn, clamp(pl * 8.0, 0.25, 1.0));
    return pn * 0.55;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash11(float x) { return fract(sin(x * 41.317) * 43758.5453); }

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
    uv *= 1.0 - 0.08 * audioSwell;

    // Convert to Polar Coordinates (r = radius, a = angle)
    float r = length(uv) + 1e-5;
    float a = atan(uv.y, uv.x);

    // Tunnel depth z.  The radius is CLAMPED before the reciprocal: with a raw
    // 1/r, z ran to 1e5 in the middle of the frame, so every depth-driven term
    // (wall scroll, rings, twist) oscillated far faster than one pixel and
    // aliased into a uniform mid-grey mush exactly where the tunnel throat --
    // the darkest, most important part of the picture -- belongs. Clamping at
    // r = 0.045 (~2.5% of frame height) keeps the perspective everywhere it is
    // resolvable and gives the throat a stable, genuinely dark floor.
    float z = 1.0 / max(r, 0.045);

    // Twist angle along depth
    float twist = z * 0.15 * tws + audioAdvance * 0.2;
    float a0 = a;                       // untwisted angle: the streak fan rides
                                        // on this so it stays dead straight
    a += twist * sin(z * 0.05 + time * 0.5);

    // Dynamic FBM domain warping on tunnel wall
    vec2 tunnelUV = vec2(a / 3.14159265, z * 0.2 + audioAdvance * spd * 0.4);
    float warpPattern = fbm(tunnelUV * 3.0 + vec2(audioFlux * 0.5, time * 0.2)) * wrp;

    // Distort UVs with warp pattern and sub-bass pulse
    tunnelUV += vec2(sin(z * 2.0 + time), cos(a * 4.0)) * 0.05 * warpPattern;
    tunnelUV.y += audioSubBass * 0.08 * sin(a * 6.0);

    // ---- Tunnel wall: the photo, but level-normalised and contrast-expanded ----
    // The wall used to be the raw photo sample, so with the library's dark
    // nebula pictures (mean luma 0.14) the whole frame was a near-black smear:
    // measured luma 0.078 at contrast 0.053, i.e. FLAT. Dividing by the photo's
    // own mean (imgDC) makes the wall's brightness a property of the TUNNEL and
    // only its texture a property of the picture; the S-curve then pushes the
    // wall's own light and dark apart instead of averaging them.
    float dcL  = max(dot(imgDC(), LW), 0.05);
    float gain = clamp(0.52 / dcL, 0.7, 3.2);
    vec3  wallC = img(fract(tunnelUV)) * gain;
    float wexp  = 0.45 + 1.10 * smoothstep(0.10, 0.85, dot(wallC, LW));
    wallC = min(wallC * wexp, vec3(2.2));

    // Depth shading. smoothstep(0.0, 1.5, r) was the reason this scene once
    // measured occ 0.03: r never exceeds ~1.02 on a 16:9 frame, so that ramp
    // multiplied the wall into blackness across almost the whole picture.
    float depthFade = smoothstep(0.015, 0.42, r);
    // Wall relief with REAL GAPS: the FBM is remapped through a smoothstep
    // rather than used as a 0.72..1.30 tint, so the wall alternates between lit
    // bands and dark troughs instead of sitting at one brightness.
    float relief  = smoothstep(0.20, 0.84, warpPattern);
    float wallLit = depthFade * (0.14 + 0.95 * relief);

    vec3 col = wallC * wallLit;

    // Chromatic aberration towards screen edges
    vec2 caOffset = uv * 0.02 * (audioHigh + audioKick);
    col.r = min(img(fract(tunnelUV + caOffset)).r * gain * wexp, 2.2) * wallLit;
    col.b = min(img(fract(tunnelUV - caOffset)).b * gain * wexp, 2.2) * wallLit;

    // ---- The tunnel's own lights (photo palette, photo-level independent) ----
    vec3 glowCol   = palNorm(0.30 * audioCentroid);
    vec3 spokeCol  = palNorm(0.5);
    vec3 streakCol = palNorm(0.15);

    float rings  = pow(0.5 + 0.5 * cos(z * 1.1 - (time * 2.6 * spd + audioAdvance * 4.0)), 9.0);
    float spokes = pow(abs(cos(a * 9.0 + z * 0.4)), 7.0);

    // Warp streaks: a fan of 18 radial light lines with a NARROW BRIGHT CORE and
    // a wide dim tail, each with its own brightness and its own dash racing down
    // the tunnel. The core width is measured in SCREEN units (dS), not in
    // angle, so a streak stays ~13 px wide at 1080p all the way out to the rim
    // instead of thinning to sub-pixel and averaging away in the downscale --
    // and the gaps between them stay black, which is where the contrast is.
    const float NS = 18.0;
    float sa   = a0 * (NS / 6.2831853);
    float sid  = floor(sa);
    float sf   = sa - sid - 0.5;
    float dS   = abs(sf) * (6.2831853 / NS) * r;
    float core = exp(-(dS * dS) / (0.0065 * 0.0065));
    float tail = pow(0.5 + 0.5 * cos(a0 * NS), 3.0);
    float sh   = 0.30 + 0.70 * hash11(sid);
    float dash = 0.30 + 0.70 * pow(0.5 + 0.5 * sin(z * 2.0
                 - (time * 3.0 * spd + audioAdvance * 5.0) + sid * 1.7), 3.0);
    float streak = (core * sh * dash + 0.22 * tail) * depthFade;

    // Vanishing point: a COMPACT core (sigma ~32 px at 1080p) plus a small halo,
    // instead of the old frame-wide 1/r gradient -- a smooth gradient just
    // becomes the frame's modal bucket and buys no structure at all.
    float throat = exp(-(r * r) / (0.030 * 0.030));
    float halo   = 0.10 / (r + 0.20);

    col += glowCol   * rings  * (0.20 + 0.80 * depthFade) * (0.9 + 0.8 * audioKick);
    col += spokeCol  * spokes * (0.25 + 0.75 * depthFade) * 0.40;
    col += streakCol * streak * (0.55 + 0.55 * audioHigh);
    col += glowCol   * (throat * (0.85 + 0.55 * audioKick) + halo * (0.25 + 0.35 * audioMid));

    col = min(col, vec3(1.6));

    // Apply hue rotation if configured
    if (hueP > 0.0) {
        col = hueRot(col, hueP);
    }

    // Border vignette
    float vig = smoothstep(1.4, 0.5, length(gl_FragCoord.xy / resolution - 0.5));
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = clamp(col * 0.56, 0.0, 1.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
