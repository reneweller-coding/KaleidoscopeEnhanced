#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file AccretionDiskToroidVortex.frag
 * @brief ACCRETION DISK TOROID VORTEX: a glowing accretion torus seen from ABOVE,
 * the camera slowly orbiting the central hole while spiral density waves
 * wind around the ISCO rim (the golden ring where matter takes its last
 * stable lap before plunging in).
 *
 * Audio Reactivity:
 *   audioAdvance  -> orbit + spiral wind-up (pre-integrated, jump-free)
 *   audioKick     -> ISCO rim flare
 *   audioBass     -> disk thickness / undulation
 *   audioHigh     -> extra rim incandescence
 *   audioBassRel  -> mix-independent low-end punch on the torus thickness
 *   audioRoughness-> dissonance churns the spiral density waves into turbulence
 *   audioRolloff  -> Doppler colour temperature (bass-heavy = ruby, bright = blue)
 *   audioSharpness-> crispness/tightness of the ISCO rim edge
 */

in vec3 vWorldPos;   ///< World position (from the vertex stage).
in vec3 vNormal;   ///< Surface normal (from the vertex stage).
in vec2 vTexCoord;   ///< Texture coordinate (from the vertex stage).
in float vDoppler;

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
uniform float audioRolloff;
uniform float audioSharpness;

uniform float toroidP;
uniform float iscoP;
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

    // Photo texture mapping onto accretion grid
    vec3 photo = img(vTexCoord);

    // Relativistic Doppler beaming palette (approaching = intense cyan-white, receding = deep ruby redshift)
    vec3 blueShift = vec3(0.3, 0.9, 1.0) * 1.5;
    vec3 redShift  = vec3(0.9, 0.15, 0.05) * 0.6;
    // Spectral rolloff sets the beaming COLOUR TEMPERATURE: when the energy
    // sits low the whole ring cools toward ruby redshift, when it reaches up
    // into the highs the approaching limb burns cyan-white.
    float dopTemp = clamp(vDoppler * 0.5 + 0.5 + (audioRolloff - 0.45) * 0.55, 0.0, 1.0);
    vec3 dopplerColor = mix(redShift, blueShift, dopTemp);

    // Accretion disk incandescent glow — a rim around the ISCO edge, not a
    // frame-filling flood (old gain washed everything white).
    float r = length(vWorldPos.xz);
    // Zwicker sharpness tightens the rim: dull material leaves a soft halo,
    // cymbal-bright material draws it down to a hard incandescent wire.
    // (Tightening only ever REMOVES energy, so exposure stays put.)
    float rimTight = 2.2 * (1.0 + 0.75 * audioSharpness);
    float innerGlow = exp(-abs(r - 1.1) * rimTight) * (0.7 + audioKick * 0.7 + audioHigh * 0.4);

    // Lighting
    vec3 lightDir = normalize(vec3(0.0, 1.0, 0.0));
    float diff = max(dot(vNormal, lightDir), 0.0);

    vec3 col = mix(photo, dopplerColor, 0.55);
    col = col * (0.4 + 0.6 * diff) + innerGlow * vec3(1.0, 0.95, 0.7) * 1.1;

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.55;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
