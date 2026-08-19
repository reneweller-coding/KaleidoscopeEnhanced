#version 330 core
out vec4 fragColor;
/**
 * @file SPHFluidSplash.frag
 * @brief Shades the SPH fluid's per-particle tetrahedra as water: a cool
 * blue-cyan body, Fresnel-brightened rims, and a sharp specular highlight,
 * with brightness/saturation driven by each particle's local SPH density
 * (compressed regions -- the leading edge of a splash -- read brighter and
 * whiter, like foam). Faces are flat-shaded via screen-space derivatives of
 * the world position (SPHFluidSplash.comp doesn't emit explicit normals for
 * its tetrahedra, since a flat face's normal is exactly its own derivative).
 *
 * audioKick drives the splash impulse itself (in the .comp, not here);
 * audioLevel brightens the whole pool; audioSubBass adds a slow overall
 * pulse; audioChromaHue nudges the water's hue via the house imgPalette.
 */

in vec3  vWorld;
in vec3  vSeed;
in float vDensRatio;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioLevel;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioValence;
uniform float audioAdvance;
uniform float hueP;

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

void main()
{
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 V = normalize(vec3(0.0, 3.0, 10.0) - vWorld);   // roughly toward the orbiting camera
    vec3 L = normalize(vec3(0.4, 0.9, -0.3));

    float ndl = max(dot(n, L), 0.0);
    float fresnel = pow(1.0 - max(dot(n, V), 0.0), 3.0);

    // Base water colour tinted by the house photo palette (a still-water
    // arc, kept desaturated so it reads as water, not a dye).
    vec3 water = mix(vec3(0.05, 0.30, 0.42), imgPalette(vSeed.x * 0.3), 0.35);
    float hue = (hueP > 0.0) ? hueP : 0.0;
    if (hue > 0.001) water = mix(water, imgPalette(hue), 0.4);

    // Compression reads as foam: the denser the local packing, the whiter
    // and brighter the droplet -- exactly the leading edge of a splash.
    float foam = smoothstep(1.0, 2.2, vDensRatio);
    vec3 col = mix(water, vec3(0.85, 0.92, 0.95), foam * 0.7);

    col *= (0.35 + 0.85 * ndl) * (0.8 + 0.5 * audioLevel);
    col += fresnel * vec3(0.55, 0.75, 0.85) * (0.5 + 0.5 * foam);

    vec3 H = normalize(L + V);
    col += vec3(1.0) * pow(max(dot(n, H), 0.0), 48.0) * 0.6;

    col *= 1.0 + 0.10 * audioSubBass;
    col = col / (1.0 + col * 0.22);

    fragColor = vec4(col, 1.0);
}
