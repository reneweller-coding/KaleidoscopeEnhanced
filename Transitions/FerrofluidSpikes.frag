#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file FerrofluidSpikes.frag
 * @brief TRANSITION FERROFLUID SPIKES: Magnetic ferrofluid Rosensweig instability transition.
 * Applied magnetic fields pull the scene into an array of sharp conical spikes,
 * reflecting metallic gloss and dissolving into the incoming scene as spikes relax.
 *   interpolation -> sweeps magnetic field strength & spike eruption/relaxation
 *   audioKick     -> flashes sharp metallic spike apex specular highlights
 *   audioSwell    -> drives magnetic spike height & Rosensweig cone sharpness
 *
 * Per-activation variety:
 *   spikeP float Rosensweig spike hexagonal density (0.5..2.2)
 *   magP   float magnetic pull displacement scale   (0.5..2.0)
 *   speedP float animation speed multiplier         (0.5..2.0)
 *   hueP   float metallic specular hue offset       (0..6.28)
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

uniform float spikeP;
uniform float magP;
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float spk = (spikeP > 0.0) ? spikeP : 1.0;
    float mag = (magP   > 0.0) ? magP   : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd;   // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Hexagonal lattice coordinates for Rosensweig cone spikes
    vec2 hexP = p * 12.0 * spk;
    float h1 = sin(hexP.x + t);
    float h2 = sin(-0.5 * hexP.x + 0.866 * hexP.y - t);
    float h3 = sin(-0.5 * hexP.x - 0.866 * hexP.y - t);
    float spikeField = max(0.0, h1 + h2 + h3);
    float cones = pow(spikeField / 3.0, 3.0);

    // Conical radial pull displacement
    vec2 coneDisp = normalize(p + 1e-4) * cones * 0.06 * midTransition * mag * (1.0 + audioSwell * 0.8);

    vec4 c1 = texture(tex1, fract(uv + coneDisp));
    vec4 c0 = texture(tex0, fract(uv - coneDisp));

    vec4 col = mix(c1, c0, tProg);

    // Specular highlight on spike tips
    float spikeTip = pow(cones, 2.0) * midTransition;
    col.rgb += spikeTip * vec3(0.3, 0.9, 1.0) * (1.2 + audioKick * 1.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
