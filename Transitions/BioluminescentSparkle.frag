#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file BioluminescentSparkle.frag
 * @brief TRANSITION BIOLUMINESCENT SPARKLE: Marine dinoflagellate bioluminescence transition.
 * Thousands of sparkling blue-green bioluminescent cellular flashes ignite
 * across fluid wave currents, illuminating and transitioning between scenes.
 *   interpolation -> sweeps bioluminescent sparkling wave front
 *   audioKick     -> triggers full-screen dinoflagellate flash cascade
 *   audioHigh     -> ignites sharp point sparkle glints
 *
 * Per-activation variety:
 *   sparkleP float sparkle flash duration & brightness (0.5..2.2)
 *   densityP float sparkling cellular point density     (0.5..2.0)
 *   speedP   float animation speed multiplier           (0.5..2.0)
 *   hueP     float bioluminescent cyan hue offset       (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< slow loudness swell: the only envelope allowed to shape geometry
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioSubBass;   ///< Sub-bass band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioFlux;   ///< Spectral flux (how fast the spectrum changes), 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float sparkleP;
uniform float densityP;   ///< Density knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) {
    p = fract(p * vec2(434.34, 735.21));
    p += dot(p, p + 52.32);
    return fract(p.x * p.y);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float spk = (sparkleP > 0.0) ? sparkleP : 1.0;
    float den = (densityP > 0.0) ? densityP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.0573 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Cellular grid of sparkling dinoflagellates
    vec2 cell = floor(p * 35.0 * den);
    float cellRand = hash21(cell);

    // Sparkle pulse timing
    float sparklePhase = sin(cellRand * 6.28 + t * 6.0);
    float sparkleFlash = pow(max(0.0, sparklePhase), 16.0) * midTransition * spk;

    // Fluid wave displacement
    vec2 waveDisp = vec2(sin(p.y * 10.0 + t * 2.0), cos(p.x * 10.0 - t * 2.0)) * 0.025 * midTransition;

    vec4 c1 = texture(tex1, fract(uv + waveDisp));
    vec4 c0 = texture(tex0, fract(uv - waveDisp));

    // Staggered cellular blend
    float blend = clamp((tProg - cellRand * 0.3) / 0.7, 0.0, 1.0);
    vec4 col = mix(c1, c0, blend);

    // Bioluminescent cyan-emerald glow
    vec3 bioCyan = vec3(0.1, 0.95, 0.9);
    col.rgb += sparkleFlash * bioCyan * (1.5 + audioKick * 1.17 + audioHigh * 1.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
