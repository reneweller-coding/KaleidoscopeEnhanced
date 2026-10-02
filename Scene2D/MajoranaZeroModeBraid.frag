#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file MajoranaZeroModeBraid.frag
 * @brief MAJORANA ZERO MODE BRAID: 1D topological superconductor nanowire array
 * executing non-abelian Majorana zero-mode braiding operations. Spacetime
 * worldline braids, non-local qubit state encoding, topological phase
 * protection, and continuous photo texture reflections.
 *   audioAdvance -> executes non-abelian Majorana braiding exchanges
 *   audioKick    -> flashes topological quantum gate phase flips & qubit readout
 *   audioBass    -> undulates superconducting proximity gap and wire width
 *   audioChromaHue-> shifts non-abelian topological phase color grading
 *
 * Per-activation variety:
 *   braidP    float Majorana braiding frequency & twist  (0.5..2.2)
 *   junctionP float nanowire junction cross spacing      (0.5..2.0)
 *   speedP    float braiding operation velocity          (0.5..2.0)
 *   hueP      float quantum state chromatic hue offset   (0..6.28)
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

uniform float braidP;
uniform float junctionP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

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

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float brd = (braidP    > 0.0) ? braidP    : 1.0;
    float jnc = (junctionP > 0.0) ? junctionP : 1.0;
    float spd = (speedP    > 0.0) ? speedP    : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Nanowire junction grid coordinates (T-junctions & Y-junctions)
    vec2 p = uv * 6.0 * jnc;

    // Majorana braiding worldlines weaving across each other
    float wire1 = abs(p.y - sin(p.x * 1.5 * brd + t * 3.0) * 0.8);
    float wire2 = abs(p.y - cos(p.x * 1.5 * brd - t * 3.0) * 0.8);
    float wire3 = abs(p.x - sin(p.y * 1.5 * brd + t * 2.5) * 0.8);

    float wireGlow1 = exp(-wire1 * 25.0);
    float wireGlow2 = exp(-wire2 * 25.0);
    float wireGlow3 = exp(-wire3 * 25.0);
    float allWires = wireGlow1 + wireGlow2 + wireGlow3;

    // Majorana bound zero-mode endpoints (solitons at wire ends & crossings)
    float zeroModeCross = wireGlow1 * wireGlow2 * 4.0 + wireGlow1 * wireGlow3 * 4.0;
    float majoranaFlash = zeroModeCross * (1.0 + audioKick * 3.5);

    // Topological phase accumulation in the loop
    float loopPhase = sin(p.x * 3.0 + p.y * 3.0 + t * 2.0);
    vec3 phaseColor = imgPalette((loopPhase + audioPhase) * 0.159);

    // Photo texture mapping into the topological nanowire junctions
    vec2 photoUV = st + vec2(wireGlow1 - wireGlow2, wireGlow3) * 0.04 * (1.0 + audioKick);
    vec3 photo = img(fract(photoUV));

    // Combine visualizer
    vec3 col = mix(photo * 0.8, phaseColor, 0.4 + 0.25 * audioSwell);
    col += allWires * vec3(0.1, 0.9, 1.0) * (1.0 + audioHigh * 1.2);
    col += majoranaFlash * vec3(1.0, 0.95, 0.4) * 2.0;

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, length(uv));
    col *= vig;

    fragColor = vec4(col, 1.0);
}
