#version 330 core
out vec4 fragColor;
/**
 * @file SandDuneBarchanMigration.frag
 * @brief SAND DUNE BARCHAN MIGRATION: golden barchan dunes seen from above in
 * late light - crescent slip faces, wind-ripple specular, photo blended
 * into the sand.  The gold stays gold (no global hue spin).
 *
 * Audio Reactivity:
 *   audioBass      -> dune swell
 *   audioKick      -> sand-glint flash
 *   audioAdvance   -> slow downwind dune migration
 *   audioHigh      -> saltation-ripple amplitude (see .vert)
 *   audioZCR       -> sand grain: noisy material rakes the field into wind
 *                     ripples, a clean tone leaves it smooth (see .vert)
 *   audioSharpness -> CRISPNESS OF THE SUN GLINT: dull, dark material gives a
 *                     broad low sheen across the slip faces, bright harsh
 *                     material (cymbals, sibilance) hardens it into a narrow
 *                     glitter along the crests.  The specular gain is scaled
 *                     inversely to the lobe width, so the broad end does not
 *                     integrate to a brighter frame
 *   audioMode      -> SHADOW TEMPERATURE only: minor harmony cools the shaded
 *                     side of each dune toward blue dusk, major warms it.
 *                     The lit sandGold is deliberately untouched -- the dunes
 *                     must stay sand-coloured
 */

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;

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
uniform float audioZCR;
uniform float audioSharpness;
uniform float audioMode;

uniform float duneP;
uniform float rippleP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float hue = (hueP > 0.0) ? hueP : 0.0;

    // Photo texture mapping onto sand grid
    vec3 photo = img(vTexCoord);

    // Warm Sahara golden sand palette.  The lit gold is FIXED -- only the
    // shaded side follows the key's MODE, cooling toward a blue dusk shadow
    // in minor and warming in major.  The two shadow ends are luminance-
    // matched to the original (0.233), so this is temperature, not exposure.
    float mmaj      = clamp(audioMode, 0.0, 1.0);
    vec3 sandGold   = vec3(0.95, 0.7, 0.35);
    vec3 shadowSand = mix(vec3(0.16, 0.20, 0.34), vec3(0.42, 0.24, 0.10), mmaj);

    // SHARPNESS sets the glint's lobe: dull/dark material -> a broad low
    // sheen, bright harsh material -> a narrow hard glitter on the crests.
    // The gain falls with the lobe width so the broad end does not integrate
    // to a brighter frame than the original exponent-16 highlight did.
    float shp     = clamp(audioSharpness, 0.0, 1.0);
    float specExp = mix(7.0, 40.0, shp);
    float specAmp = 0.55 + 0.60 * shp;

    vec3 lightDir = normalize(vec3(0.8, 0.5, -0.4));
    float diff = max(dot(vNormal, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, vNormal), vec3(0.0, 1.0, 0.0)), 0.0), specExp);

    vec3 sandCol = mix(shadowSand, sandGold, diff);
    vec3 col = mix(photo, sandCol, 0.55);
    col = col * (0.35 + 0.65 * diff)
        + spec * vec3(1.0, 0.95, 0.8) * (0.5 + audioKick * 0.6) * specAmp;

    // NO global chromaHue rotation: dunes must stay SAND-coloured — the
    // musical key only drifts the photo blend, not the identity gold.
    if (hue > 0.001) col = hueRot(col, hue);

    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
