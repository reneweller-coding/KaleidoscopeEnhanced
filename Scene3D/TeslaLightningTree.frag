#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TeslaLightningTree.frag
 * @brief TESLA LIGHTNING TREE: a branching discharge tree grown fresh every
 * frame, camera ORBITING the trunk; plasma tinted by a bounded hue wobble
 * (never a full rainbow spin), photo colours in the corona.
 *
 * Three families come out of the generator, told apart by their per-segment
 * gain (attrB.x): the main bolts striking a wide ground disc, the Lichtenberg
 * SURFACE CREEP running outward from each strike, and a sparse CORONA of
 * ionised streamers hanging in the dielectric around the tree.  The latter two
 * are deliberately far dimmer -- they exist to carry the frame's outer tiles,
 * which the bare bolt column left black.
 *
 * Audio Reactivity:
 *   audioKick      -> branch flash (heat + thickness, .comp generator)
 *   audioHigh      -> arc jitter (.comp generator)
 *   audioAdvance   -> camera orbit around the trunk
 *   audioChromaHue -> bounded plasma tint (never a full rainbow spin)
 *   audioSnare     -> return stroke: snares/claps flare the tree and drive
 *                     its ionisation heat (see .vert)
 *   audioTrebRel   -> stepped-leader wander, self-normalising per mix (.vert)
 *   audioSharpness -> CORONA vs CORE: dull dark material keeps the discharge
 *                     a broad violet/cyan corona, bright harsh material
 *                     (cymbals, crackle) collapses it into a hard white
 *                     ionised core with the corona pushed to the edges.
 *                     Only the core threshold and its width move -- the
 *                     existing tonemap below is untouched
 */

in vec3 vPos;   ///< Position (from the vertex stage).
in float vHeat;
in float vBoltID;
in float vGain;

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioSharpness;

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float arcP;
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
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float arc = (arcP  > 0.0) ? arcP  : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Ionized gas plasma colors
    vec3 coreHot = vec3(1.0, 0.95, 1.0);  // Ultra-hot white core
    vec3 coronaCyan = vec3(0.1, 0.7, 1.0); // High-voltage cyan corona
    vec3 coronaViolet = vec3(0.7, 0.1, 1.0); // Nitrogen ionization violet

    vec3 plasmaCol = mix(coronaViolet, coronaCyan, fract(vBoltID * 0.15 + time * 0.5));

    // CORONA vs CORE: sharp, harsh material collapses the discharge into a
    // hard white ionised core; dull dark material leaves it a broad violet /
    // cyan corona.  Neutral sharpness (0.5) reproduces the original
    // clamp(vHeat - 0.5, 0, 1) curve exactly.
    float shp   = clamp(audioSharpness, 0.0, 1.0);
    float coreT = clamp((vHeat - (0.58 - 0.16 * shp)) / (1.30 - 0.60 * shp),
                        0.0, 1.0);
    plasmaCol = mix(plasmaCol, coreHot, coreT);

    // Photo reflection modulation
    vec2 photoUV = vPos.xy * 0.2 + 0.5;
    vec3 photoCol = img(fract(photoUV));

    // vGain separates the families: main strokes at full strength, the ground
    // creep and the corona streamers well behind them, so the added fill never
    // competes with the discharge itself.
    vec3 col = (plasmaCol * 1.1 + photoCol * 0.3) * (0.55 + 0.7 * vHeat)
             * vGain * arc * glw;
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));

    col = hueRot(col, sin(audioChromaHue) * 0.25 + hue);   // bounded tint, no full rainbow spin
    fragColor = vec4(col, 1.0);
}
