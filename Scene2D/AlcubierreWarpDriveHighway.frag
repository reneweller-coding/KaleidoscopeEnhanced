#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file AlcubierreWarpDriveHighway.frag
 * @brief ALCUBIERRE WARP DRIVE HIGHWAY: Faster-than-light warp bubble flight in curved
 * spacetime based on the Alcubierre metric. Spacetime compression ahead (blueshift gleam),
 * expansion behind (redshift), and glowing negative-energy exotic matter containment rings.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives extreme relativistic warp drive forward progression
 *   audioKick    -> flashes exotic matter warp bubble nodes & spacetime compression burst
 *   audioCentroid-> sharpens radial warp ring resolution & Doppler color shift
 *   audioSubBass -> expands warp bubble diameter breathing
 *   audioChromaHue-> steers the extreme Doppler blueshift / redshift spectrum
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
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

// Per-activation variety
uniform float speedP;   ///< Speed knob, 0..1.
uniform float warpFactorP;
uniform float ringCountP;
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float wFactor = (warpFactorP > 0.01) ? warpFactorP : 1.2;
    float nRings = (ringCountP > 1.0) ? ringCountP : 6.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.270 * spd + audioAdvance * 0.270 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Alcubierre shaping function: f(r_s) = (tanh(sigma*(r_s + R)) - tanh(sigma*(r_s - R))) / (2*tanh(sigma*R))
    float sigma = 6.0;
    float R_warp = 0.55 * (1.0 + 0.15 * sin(audioSwell * 2.0) + 0.1 * audioSubBass);
    float fWarp = (tanh(sigma * (r + R_warp)) - tanh(sigma * (r - R_warp))) / (2.0 * tanh(sigma * R_warp));

    // Relativistic forward coordinate distortion
    vec2 uvWarp = uv * (1.0 + fWarp * 2.5 * wFactor);

    // Exotic matter warp ring containment pulses
    // Brightness raises the RADIAL frequency only; the t-coefficient stays fixed
    // so the travelling phase is never remapped mid-flight.
    float ringPhase = r * (12.0 * (nRings / 6.0)) * (1.0 + 0.4 * audioCentroid) - t * 6.0;
    float ringGlow = smoothstep(0.8 + 0.12 * audioCentroid, 1.0, abs(sin(ringPhase))) * glw;

    // Radial hyper-speed star streaks
    float streaks = abs(sin(a * 20.0 + sin(r * 15.0) * 2.0));
    float streakGlow = smoothstep(0.88, 1.0, streaks) * (0.8 + 1.2 * audioHigh);

    // Sample distorted background photo
    vec2 sampleUV = fract(uvWarp * 0.4 + vec2(t * 0.1, 0.0) + 0.5);
    vec3 texCol = img(sampleUV);

    // Doppler shift: center blueshift (hot cyan/white), edge redshift (magenta/amber)
    vec3 blueshiftCol = vec3(0.3, 1.4, 2.0);
    vec3 redshiftCol  = vec3(1.8, 0.4, 0.6);
    vec3 dopplerCol = mix(blueshiftCol, redshiftCol, clamp(r / R_warp - 0.3 * audioCentroid, 0.0, 1.0));

    vec3 palBase = imgPalette(r * 0.8 + 0.2);
    vec3 col = mix(texCol, palBase, 0.45) * dopplerCol;

    // Add glowing exotic matter rings & star streaks
    vec3 ringTint = vec3(1.4, 1.1, 1.8) * ringGlow * (1.0 + 2.5 * audioKick);
    vec3 streakTint = vec3(1.6, 1.6, 2.0) * streakGlow * (1.0 + 2.0 * audioKick);
    col += ringTint + streakTint;

    // Forward warp singularity apex flare
    float apexFlare = exp(-r * 10.0) * (1.5 + 3.5 * audioKick);
    col += vec3(1.8, 1.8, 2.0) * apexFlare;

    col = pow(col, vec3(0.88));
    col *= 0.79;   // measured luma 0.636: knee, not a linear trim
    col /= 1.0 + 0.45 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
