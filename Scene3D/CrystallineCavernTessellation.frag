#version 430 core
out vec4 fragColor;

in vec3 tePos;
in vec3 teNormal;
in vec2 teUV;
in float teCrystal;

/**
 * @file CrystallineCavernTessellation.frag
 * @brief Lighting for a tessellated amethyst/quartz cavern: a point light at
 * the cavern's centre lights the rock, a projected photo textures the stone
 * substrate, and a per-vertex crystal mask (teCrystal) blooms into emissive,
 * specular-highlighted facets.
 *
 * Audio Reactivity:
 *  - audioKick      -> brightness of the crystal facet emission
 *  - audioChromaHue -> MUSICAL KEY: rotates the final colour, and sets the arc
 *                      imgPalette() reads the gem hue from in the photo
 *  - audioAdvance   -> slow drift of that palette arc (integrated, never jumps)
 *  - audioValence   -> GEM SATURATION: a bleak mix gives near-grey stone, a
 *                      bright one lets the photo's full colour into the crystal
 *
 * Distance from the eye fades everything into cavern fog. This shader
 * follows a tessellation control/evaluation pair
 * (CrystallineCavernTessellation.tesc, CrystallineCavernTessellation.tese)
 * that subdivides the cavern mesh before this stage shades it.
 */

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioAdvance;
uniform float audioValence;

uniform float glowP;
uniform float crystalP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard): the gem hue comes from a rotating arc in the
// CURRENT slideshow photo, so every activation inherits its colour from the
// pictures instead of from two hard-coded candy tones.  The arc follows the
// musical key (audioChromaHue is circular-slewed, so it never jumps), drifts
// with audioAdvance, and valence shapes how saturated it comes out.
vec3 imgPalette(float t) {
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
    float glw = (glowP     > 0.0) ? glowP     : 1.0;
    float cry = (crystalP  > 0.0) ? crystalP  : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec3 n = normalize(teNormal);
    vec3 lightPos = vec3(0.0, 0.0, 0.0); // Lantern in cavern center

    // WHERE THE EYE ACTUALLY IS.  The .tese projects with vp = pos + (0,0,6.5),
    // so the camera sits at object-space z = -6.5, not +6.5. Both the view
    // vector and the fog distance below were built against +6.5 -- the far END
    // of the tunnel -- which put the specular response on the wrong side of
    // every facet and, worse, INVERTED the fog: the nearest, most detailed
    // stretch of cavern was the most heavily washed out while the far end came
    // through clear. That is what flattened the picture (contrast 0.053).
    const vec3 kEye = vec3(0.0, 0.0, -6.5);

    vec3 l = normalize(lightPos - tePos);
    vec3 viewDir = normalize(kEye - tePos);

    float diff = max(dot(n, l), 0.0);
    vec3 ref = reflect(-l, n);
    float spec = pow(max(dot(ref, viewDir), 0.0), 32.0);

    // Amethyst / quartz crystal colouring, pulled onto the house model.  The
    // two gems were vec3(0.6,0.2,0.9) and vec3(0.1,0.8,0.95) -- 0.78 and 0.89
    // saturated -- and the tunnel swept the WHOLE distance between them, so
    // close to a fifth of the picture came back as hard candy-coloured pixels
    // (measured satHi 0.188). The two gems now sit a single step apart around
    // the cavern's own amethyst, and the hue itself is carried by the photo
    // with the musical key rotating the arc: the same stone, catalogue palette.
    vec3 gemA = vec3(0.46, 0.28, 0.62);   // amethyst
    vec3 gemB = vec3(0.30, 0.46, 0.62);   // pale quartz, one neighbour away
    float band = sin(tePos.z * 0.5 + time * 0.6) * 0.5 + 0.5;
    vec3 crystalBase = mix(mix(gemA, gemB, band),
                           imgPalette(band * 0.4 + 0.1) * 1.15, 0.45);

    // Rock substrate photo texturing
    vec3 rockPhoto = img(fract(teUV * 3.0));
    // The substrate was 0.08 x photo, i.e. essentially black, so everything that
    // was not a crystal facet contributed nothing at all to the picture.
    vec3 rockBase = vec3(0.20, 0.16, 0.24) * (0.35 + 0.95 * rockPhoto);

    // Faceted crystal emission & subsurface scattering
    float crystalMask = smoothstep(0.2, 0.8, teCrystal);
    vec3 emission = crystalBase * crystalMask * (1.2 + 2.0 * audioKick) * cry * glw;

    // Specular reflections on crystalline facets
    vec3 col = mix(rockBase, crystalBase * 0.5, crystalMask) * (diff * 0.9 + 0.16);
    col += vec3(1.0) * min(spec * (0.5 + crystalMask * 1.5), 1.2);
    col += emission;

    // Distance depth fog, measured from the eye (see kEye above).
    float dist = length(tePos - kEye);
    col = mix(col, vec3(0.03, 0.02, 0.06), min(1.0 - exp(-dist * 0.075), 0.72));

    col = hueRot(col, audioChromaHue + hue);
    col = min(col, vec3(1.4));
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
