#version 330 core
in vec3 vPos;   ///< Position (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vFluorescence;

out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CoralReefFluorescence.frag
 * @brief CORAL REEF FLUORESCENCE: a reef ridge under UV night light - the coral
 * tips fluoresce in colours drawn from the photo-palette arc (GFP/RFP
 * style), deep-ocean blue ambient below.
 *   audioKick -> fluorescence pulse    audioSwell -> polyp sway
 *   glowP/fluorP -> emission strength
 */

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float fluorP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}


/// House tint: bend a colour toward the photo palette while keeping its
/// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float flr = (fluorP > 0.0) ? fluorP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Diffuse lighting in deep ocean
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.6 + 0.4;

    // Base photo texture
    vec3 photo = img(vUV);

    // Fluorescent Green/Pink/Orange protein emission colors (GFP / RFP)
    // Fluorescence colours come from the PHOTO palette arc (house
    // standard) — the old neon green/magenta pair read as rainbow.
    vec3 gfpColor = mix(imgPalette(0.12), imgPalette(0.55),
                        sin(vUV.x * 10.0 + vUV.y * 8.0) * 0.5 + 0.5) * 1.35;
    vec3 fluorGlow = gfpColor * max(vFluorescence, 0.0) * flr;

    // Deep ocean blue ambient
    vec3 oceanAmbient = vec3(0.02, 0.06, 0.18);

    vec3 col = mix(oceanAmbient, photo, 0.35) * diff + fluorGlow * 1.5;

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col * glw) * 0.6;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
