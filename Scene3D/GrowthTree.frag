#version 330 core
out vec4 fragColor;
// GrowthTree.frag — bark near the root, sap-lit twigs at the tips, and leaves
// that catch the light from behind.  The depth-along-the-tree value is what
// drives almost everything: a tree looks like a tree because the material
// changes continuously from trunk to leaf.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vDepth;      // 0 = trunk, 1 = tip  (on the ground: 0 = near, 1 = far)
in float vKind;       // 0 = wood, 1 = leaf, 2 = forest floor

/**
 * @file GrowthTree.frag
 * @brief Shades the grown grove with three materials picked by vKind: bark
 * that warms from dark trunk to lighter young wood along vDepth with an
 * inner sap-glow near the tips, leaves lit mainly by backlit translucency,
 * and the forest floor, whose far reaches dissolve into a palette-tinted
 * mist; a cool counter-light keeps the far side of the trunks from going
 * flat black.
 *
 * audioChromaHue picks the sap-glow, leaf and ground-mist hues from the
 * photo-arc palette (imgPalette), audioKick and audioSubBass run a surge of
 * the sap glow up toward the growing tips, audioHigh brightens the leaf's
 * inner glow, audioAmbient lifts leaf backlight translucency AND the ground
 * mist, audioLevel strengthens the sky-reflection rim light, and audioBeat
 * pulses the final brightness.
 */

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform sampler2D tex1;
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

vec3 hue2rgb(float h)
{
    return imgPalette(h) * 1.35;   // photo-arc palette (house standard), was HSV rainbow
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(vec3(0.45, 0.68, -0.58));
    float diff = max(dot(n, L), 0.0);
    float wrap = 0.5 + 0.5 * dot(n, L);

    vec3 col;

    if (vKind > 1.5)
    {
        // --- forest floor: dark needle litter that dissolves into mist ---
        // The far ground lifts toward the palette's own haze instead of
        // falling to black; that ramp is what gives the grove its depth and
        // what keeps the bottom half of the frame from reading as empty.
        vec3 soil = mix(vec3(0.105, 0.115, 0.080), vec3(0.055, 0.070, 0.085), vDepth);
        col = soil * (0.55 + 0.75 * diff + 0.25 * wrap);
        vec3 mist = imgPalette(0.55) * 0.17 * (0.75 + 0.5 * audioAmbient);
        col = mix(col, mist, clamp(vDepth * 1.25, 0.0, 1.0) * 0.85);
    }
    else if (vKind > 0.5)
    {
        // --- leaf: thin, so most of its light comes THROUGH it ---
        float hue = fract(0.26 + 0.10 * sin(audioChromaHue) + 0.05 * vObj.y);
        vec3 leaf = mix(vec3(0.10, 0.28, 0.07), hue2rgb(hue), 0.55);
        col = leaf * (0.25 + 0.7 * diff + 0.4 * wrap * wrap);
        float back = pow(max(dot(-n, L), 0.0), 1.6);
        col += vec3(0.55, 0.95, 0.30) * back * (0.6 + 1.1 * audioAmbient);
        col += leaf * (0.3 + 1.4 * audioHigh) * 0.35;
    }
    else
    {
        // --- wood: dark bark at the base, warming toward the growing tips ---
        vec3 bark = mix(vec3(0.20, 0.15, 0.11), vec3(0.46, 0.34, 0.20), vDepth);
        col = bark * (0.30 + 0.95 * diff + 0.55 * wrap * wrap);
        // Cool counter-light: against a black background one key light leaves
        // half the trunk invisible and the tree reads as a flat cut-out.
        col += bark * vec3(0.45, 0.58, 0.95)
             * max(dot(n, normalize(vec3(-0.65, -0.15, -0.6))), 0.0) * 0.45;

        // Sap glow: the young wood at the tips is lit from inside, and the
        // kick runs a surge of it up the tree.
        float surge = clamp(vDepth * 1.4 - 0.35, 0.0, 1.0);
        vec3 sap = hue2rgb(fract(0.09 + 0.12 * sin(audioChromaHue)));
        col += sap * pow(surge, 2.0) * (0.35 + 1.0 * glowP)
             * (0.45 + 1.4 * audioKick + 0.5 * audioSubBass);
    }

    // Rim against the dark background, plus a hint of the photo as sky light.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    vec3 R = reflect(-V, n);
    // Arc-palette dome instead of a photo-tile environment: the fract()
    // lookup tiled the picture into hard rectangle blocks whenever the
    // reflection vector swept quickly (the glitch squares in the probe).
    vec3 sky = imgPalette(0.15 + 0.25 * clamp(R.y, 0.0, 1.0));
    sky = mix(vec3(dot(sky, vec3(0.333))), sky, 0.5);
    col += sky * fres * 0.32 * (0.6 + 0.6 * audioLevel);

    col *= 1.0 + 0.18 * audioBeat;
    col = col / (1.0 + col * 0.28);
    fragColor = vec4(col, interpolation);
}
