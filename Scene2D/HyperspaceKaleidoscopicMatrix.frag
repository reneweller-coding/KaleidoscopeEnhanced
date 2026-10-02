#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HyperspaceKaleidoscopicMatrix.frag
 * @brief HYPERSPACE KALEIDOSCOPIC MATRIX: Digital cyber code rain streams folded
 * into an 8-fold kaleidoscopic hyper-mandala with high-velocity glyph cascades,
 * iridescent gold/cyan/magenta quantum glyph transitions, and kick flash bursts.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous code rain streaming & mandala rotation
 *   audioKick    -> flashes cyber glyph matrices into intense gold/white bursts
 *   audioCentroid-> modulates code column density & glyph symbol entropy
 *   audioSubBass -> expands radial mandala breathing
 *   audioChromaHue-> rotates the cyber code matrix spectrum
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
uniform float densityP;   ///< Density knob, 0..1.
uniform float foldsP;
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

/// Procedural digital glyph cell rendering
float glyph(vec2 p, float seed) {
    vec2 grid = fract(p) - 0.5;
    float d = max(abs(grid.x), abs(grid.y));
    // Brightness widens the seed->frequency spread, so neighbouring cells draw
    // more dissimilar symbols: that spread IS the glyph alphabet's entropy.
    float ent = 6.0 + 6.0 * audioCentroid;
    float glyphChar = sin(grid.x * (12.0 + sin(seed) * ent)) * cos(grid.y * (12.0 + cos(seed) * ent));
    return smoothstep(0.4, 0.1, d) * step(0.0, glyphChar);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float dens = (densityP > 0.01) ? densityP : 1.0;
    float nFolds = (foldsP > 1.0) ? foldsP : 8.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.228 * spd + audioAdvance * 0.228 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Symmetrical 8-fold radial kaleidoscope fold
    float a = atan(uv.y, uv.x);
    float r = length(uv);

    // Continuous kaleidoscopic rotation
    a += t * 0.2 + 0.1 * sin(audioPhase);

    float seg = 3.14159265 / (nFolds * 0.5);
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);

    // Sub-bass drones push the whole folded mandala outward (radius divided),
    // a slow swell of the figure rather than of its light.
    vec2 pFold = vec2(cos(a), sin(a)) * (r / (1.0 + 0.3 * audioSubBass));

    // Digital matrix rain streaming down the folded coordinates. Only the
    // spatial term carries the density factor; the t*8.0 stream offset below
    // is added afterwards so column density cannot rescale the stream phase.
    vec2 pGrid = pFold * (12.0 * dens * (1.0 + 0.35 * audioCentroid));
    pGrid.y += t * 8.0; // Fast downward streaming velocity

    vec2 cellID = floor(pGrid);
    vec2 cellUV = fract(pGrid);

    // Random column streaming speed and phase
    float colSeed = cellID.x * 13.37;
    float colSpeed = sin(colSeed) * 0.5 + 1.2;
    float charSeed = cellID.y + floor(t * 6.0 * colSpeed) + colSeed;

    // Trail intensity calculation along each column
    float trailPhase = fract((pGrid.y - t * 6.0 * colSpeed) * 0.1);
    float trailIntensity = exp(-trailPhase * 6.0);

    // Render digital glyph inside cell
    float charGlyph = glyph(cellUV, charSeed);
    float glyphBrightness = charGlyph * (trailIntensity * 2.0 + 0.2);

    // Sample distorted background photo
    vec2 sampleUV = fract(pFold * 0.35 + 0.5);
    vec3 texCol = img(sampleUV);

    // Palette mixing for cyber code (cyber cyan/emerald green by default, flashing gold on kicks)
    vec3 palBase = imgPalette(trailPhase * 0.3 + 0.1);
    vec3 codeCol = mix(vec3(0.2, 1.4, 0.8), vec3(1.8, 1.4, 0.3), audioKick);
    codeCol = mix(codeCol, palBase, 0.4);

    vec3 col = mix(texCol * 0.3, codeCol * glyphBrightness * (1.0 + 2.0 * audioKick) * glw, 0.7);

    // Center lotus cyber flare
    float centerFlare = exp(-r * 6.0) * (1.2 + 2.5 * audioKick);
    col += imgPalette(0.85) * centerFlare;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
