#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SandDuneBarchanMigration.frag
 * @brief SAND DUNE BARCHAN MIGRATION: golden barchan dunes seen from above in
 * late light - crescent slip faces, wind-ripple specular, photo blended
 * into the sand.  The gold stays gold (no global hue spin).
 *
 * The field is a perspective carpet that runs to the horizon (see the .vert),
 * so the dune sea fills the frame; distance is carried by a dark dusk haze
 * whose temperature follows the same audioMode as the shadows.
 *
 * Audio Reactivity:
 *   audioBass      -> dune swell
 *   audioKick      -> sand-glint flash
 *   audioSwell     -> lift of the far dusk haze (distance breathes with the
 *                     music's overall energy)
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

in vec3 vWorldPos;   ///< World position (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioZCR;
uniform float audioSharpness;
uniform float audioMode;   ///< Mode of the music: 0 minor .. 1 major.

uniform float duneP;
uniform float rippleP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
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

    // AERIAL PERSPECTIVE.  The field now runs all the way to the horizon, and
    // without haze the far rows read as one flat sheet of gold with the
    // sampling grain crawling through it.  The haze air is deliberately DARK
    // (a dusk desert, not a white-out) and follows the same mode temperature
    // as the shadows, so the distance recedes instead of glowing.
    vec3  duskAir = mix(vec3(0.10, 0.10, 0.15), vec3(0.17, 0.12, 0.07), mmaj);
    float aer = clamp(vWorldPos.z / 34.0, 0.0, 1.0);
    col = mix(col, duskAir * (0.85 + 0.4 * audioSwell), aer * 0.72);

    // NO global chromaHue rotation: dunes must stay SAND-coloured — the
    // musical key only drifts the photo blend, not the identity gold.
    if (hue > 0.001) col = hueRot(col, hue);

    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
