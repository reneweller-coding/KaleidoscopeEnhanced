#version 330 core
out vec4 fragColor;
// Origami.frag — metallic foil paper.  Flat panels with a hard crease between
// them are the whole subject, so the shading has to reward facing: a material
// with a tight specular lobe turns every panel into a different brightness and
// the fold pattern reads instantly.  A soft, diffuse material would render the
// same geometry as a grey rectangle.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in vec3  vWorld;
in float vFold;         // 0 = flat here, 1 = deeply folded here
in float vAcross;       // 0..1 across the sheet

/**
 * @file Origami.frag
 * @brief Shades the folded Miura-ori sheet as tight-specular metallic
 * foil, so each flat panel reads as a distinct brightness against its
 * neighbours.
 *
 * audioLevel lifts the diffuse response, audioHigh sharpens the tight
 * specular highlight, audioKick brightens the rim light along crease
 * silhouettes, audioSubBass and audioBeat add a final overall pulse, and
 * audioChromaHue nudges the foil's hue. The hue itself is drawn from the
 * house imgPalette (a rotating sample arc over the current slideshow
 * photo, tex0/tex1 crossfaded by interpolation) driven by audioAdvance
 * and audioValence; vFold and vAcross (fed from Origami.comp by way of
 * Origami.vert) shift the hue and drive the travelling colour shift along
 * the fold, and audioAmbient lifts the unshadowed base light.
 */

uniform sampler2D tex0;
uniform sampler2DShadow texShadow;
uniform mat4  lightM;
uniform vec3  lightDir;
uniform float shadowPass;
uniform float shadowTexel;
uniform float shadowExtent;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float hueP;
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

float shadowAt(vec3 world, vec3 n, float ndl)
{
    float lift = (2.0 * shadowExtent * shadowTexel) * 2.2 / max(ndl, 0.15);
    vec4 lp = lightM * vec4(world + n * lift, 1.0);
    vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;
    if (proj.z > 1.0)
        return 1.0;
    float bias = 0.0006 + 0.0030 * (1.0 - ndl);
    float s = 0.0;
    float r = shadowTexel * 1.6;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
            s += texture(texShadow,
                         vec3(proj.xy + vec2(float(x), float(y)) * r, proj.z - bias));
    return s / 9.0;
}

void main()
{
    if (shadowPass > 0.5)
    {
        fragColor = vec4(0.0);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    // The sheet is a surface with two sides and the generator does not promise a
    // winding, so the normal is turned toward the eye.  Which side of the paper
    // we are on is worth keeping, though — the back is duller.
    float back = step(dot(n, V), 0.0);
    if (back > 0.5) n = -n;

    vec3 L  = normalize(lightDir);
    vec3 L2 = normalize(vec3(-0.55, 0.35, -0.75));

    float ndl = max(dot(n, L), 0.0);
    // A corrugation shadows itself everywhere, which is the point — but a fully
    // occluded panel still sits in a lit room, and letting the map drive it to
    // black loses the fold pattern exactly where it is deepest.
    float sh = mix(0.38, 1.0, shadowAt(vWorld, n, ndl));

    // Foil: the hue turns with the angle to the light as well as with position,
    // so a fold travelling through the sheet drags a colour shift with it.
    float sheen = 1.0 - clamp(dot(n, V), 0.0, 1.0);
    float hue = fract(0.06 + 0.62 * hueP + 0.30 * vAcross + 0.22 * sheen
                      + 0.10 * vFold + 0.06 * sin(audioChromaHue));
    vec3 foil = mix(hue2rgb(hue), vec3(1.0), 0.16);
    vec3 base = mix(foil * 0.78, foil, 1.0 - 0.45 * back);

    // Wrap the key light rather than clipping it at the terminator.  Panels here
    // turn through ninety degrees at every crease, so a hard N.L sends half of
    // them to zero and the sheet reads as holes rather than folds.
    float wrap = 0.5 + 0.5 * dot(n, L);

    vec3 col = base * (0.26 + 0.10 * audioAmbient);
    col += base * ndl * sh * (0.85 + 0.30 * audioLevel);
    col += base * wrap * wrap * sh * 0.45;
    col += base * max(dot(n, L2), 0.0) * vec3(0.40, 0.52, 0.72) * 0.62;

    // Two speculars: a tight one that picks out single panels, and a broad one
    // that keeps the sheet from going black where it turns away.
    vec3 H  = normalize(L + V);
    vec3 H2 = normalize(L2 + V);
    col += vec3(1.0, 0.97, 0.90) * pow(max(dot(n, H), 0.0), 78.0) * sh
         * (0.5 + 0.9 * audioHigh) * (0.5 + 1.1 * glowP);
    col += foil * pow(max(dot(n, H2), 0.0), 16.0) * 0.30;

    // A rim along the crease silhouettes: grazing panels catch a thin line.
    col += hue2rgb(fract(hue + 0.5)) * pow(sheen, 5.0)
         * (0.30 + 0.8 * glowP) * (0.5 + 1.0 * audioKick);

    col *= 0.80 + 0.13 * audioBeat + 0.10 * audioSubBass;
    col = col / (1.0 + col * 0.55);
    fragColor = vec4(col, interpolation);
}
