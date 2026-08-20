#version 330 core
out vec4 fragColor;

in vec3 vPos;
in float vRefract;
in float vSector;

/**
 * @file DendriticSnowCrystal.frag
 * @brief Lighting for growing dendritic snow-crystal facets: mixes an icy-
 * white core with a rainbow-dispersion tint per facet (vRefract), overlays a
 * refracted slideshow photo through the ice, and scatters bright hashed
 * specular sparkle glints across the surface.
 *
 * audioKick intensifies the sparkle glints, and the facet's rainbow tint
 * (imgPalette) follows the musical key through audioChromaHue/audioAdvance
 * with audioValence shaping saturation; hueP applies the final hue rotation.
 */

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float iceP;
uniform float hueP;


uniform float audioAdvance;
uniform float audioValence;

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
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float ice = (iceP  > 0.0) ? iceP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Prismatic ice dispersion colors
    vec3 iceCore = vec3(0.85, 0.95, 1.0); // Crystalline white/cyan
    vec3 rainbowFacet = imgPalette(vRefract + time * 0.159);

    // Photo reflection through ice crystal prism. Multiplying the ice by the photo
    // outright meant a dark slide rendered the whole crystal black; the photo now
    // TINTS light that the ice carries on its own.
    // 0.2 was tuned for a single flake sitting on the origin; with the drift now
    // spread across the whole frustum the same rate tiled the slide a dozen
    // times over and read as noise.
    vec2 photoUV = vPos.xy * 0.035 + 0.5;
    vec3 photoCol = img(fract(photoUV));
    vec3 prism = mix(vec3(1.0), photoCol * 1.7, 0.55);

    // Sparkling specular glints. The hash used to be reseeded by `time * 4.0`
    // INSIDE the sin, so every frame drew a completely different noise field --
    // full-rate white-noise flicker. Quantising the seed to ~2 twinkles/second
    // and anchoring the hash to a fixed spatial cell makes them read as glints
    // on the ice instead of as video noise (well inside the 8 Hz detail budget).
    vec2 cell = floor(vPos.xy * 8.0);
    float twinkle = floor(time * 2.0 + vSector * 0.7);
    float sh = fract(sin(dot(cell, vec2(12.9898, 78.233)) + twinkle * 1.7) * 43758.5453);
    float sparkle = pow(sh, 14.0);
    vec3 glintCol = vec3(1.0) * sparkle * (1.2 + 2.5 * audioKick);

    // Radial shading along the arm so the crystal has bright core / cool tips
    // instead of one uniform tone.
    float radial = 0.45 + 0.75 * (1.0 - vRefract) + 0.35 * pow(vRefract, 3.0);

    vec3 col = (mix(iceCore, rainbowFacet, 0.4) * prism * radial * 0.85 + glintCol)
               * ice * glw;

    // The generator marks the far ice-dust haze with armID 7 (the flakes use
    // sector 0..5).  It is a background layer: it must carry the frame's empty
    // tiles without ever reading as bright as the crystals themselves.
    float dust = step(6.5, vSector);
    col *= mix(1.0, 0.34, dust);

    // Aerial perspective. The drift now runs from just in front of the lens out
    // to ~36 units, and the vert stage adds 6.5 to reach view depth, so
    // D = vPos.z + 6.5. Lit identically, near and far flakes read as one flat
    // sheet of confetti; sinking the far ones back restores the depth of a
    // real snowfall and keeps the many added crystals from summing too bright.
    float viewD = max(vPos.z + 6.5, 1.0);
    col *= clamp(7.0 / viewD, 0.26, 1.0);

    col = min(col, vec3(1.25));

    col = hueRot(col, hue);   // chromaHue handled inside imgPalette
    fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
