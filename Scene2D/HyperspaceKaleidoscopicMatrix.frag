#version 330 core
out vec4 fragColor;
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

uniform vec2  resolution;
uniform float time;
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

// Per-activation variety
uniform float speedP;
uniform float densityP;
uniform float foldsP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// Procedural digital glyph cell rendering
float glyph(vec2 p, float seed) {
    vec2 grid = fract(p) - 0.5;
    float d = max(abs(grid.x), abs(grid.y));
    // Brightness widens the seed->frequency spread, so neighbouring cells draw
    // more dissimilar symbols: that spread IS the glyph alphabet's entropy.
    float ent = 6.0 + 6.0 * audioCentroid;
    float glyphChar = sin(grid.x * (12.0 + sin(seed) * ent)) * cos(grid.y * (12.0 + cos(seed) * ent));
    return smoothstep(0.4, 0.1, d) * step(0.0, glyphChar);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float dens = (densityP > 0.01) ? densityP : 1.0;
    float nFolds = (foldsP > 1.0) ? foldsP : 8.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.38 * spd;

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
