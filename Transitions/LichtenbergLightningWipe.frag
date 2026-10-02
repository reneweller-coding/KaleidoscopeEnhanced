#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file LichtenbergLightningWipe.frag
 * @brief TRANSITION LICHTENBERG LIGHTNING WIPE: High-voltage electrical dielectric breakdown.
 * Luminous fractal Lichtenberg discharge trees branch violently across the
 * glass plate, conducting electrical arcs that ionize and cross-fade between scenes.
 *   interpolation -> sweeps dielectric breakdown wave front across the viewport
 *   audioKick     -> triggers full-screen high-voltage lightning discharge arcs
 *   audioHigh     -> sharpens micro-fractal streamer tip branches
 *
 * Per-activation variety:
 *   branchP  float Lichtenberg fractal branch density   (0.5..2.2)
 *   voltageP float electrical arc ionization intensity  (0.5..2.0)
 *   speedP   float animation speed multiplier           (0.5..2.0)
 *   hueP     float plasma ionization hue offset         (0..6.28)
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

uniform float branchP;   ///< Branching knob, 0..1.
uniform float voltageP;
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
    p = fract(p * vec2(534.34, 835.21));
    p += dot(p, p + 62.32);
    return fract(p.x * p.y);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float brn = (branchP  > 0.0) ? branchP  : 1.0;
    float vlt = (voltageP > 0.0) ? voltageP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.0483 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Fractal lightning tree branching (DLA / Lichtenberg structure)
    float arcPattern = 0.0;
    vec2 curP = p * 4.0 * brn;

    for (int i = 0; i < 4; ++i) {
        float noiseVal = sin(curP.y * 3.0 + t * 4.0) + cos(curP.x * 3.0 - t * 3.0);
        float distToLine = abs(curP.x + noiseVal * 0.3);
        float arc = exp(-distToLine * 30.0);
        arcPattern = max(arcPattern, arc * (1.0 / float(i + 1)));

        curP = curP * 2.0 + vec2(sin(t), cos(t));
    }

    // Breakdown sweep front
    float sweepFront = mix(-1.2, 1.2, tProg);
    float distToSweep = p.x - sweepFront;

    // Ionization plasma displacement
    vec2 plasmaDisp = vec2(arcPattern, sin(p.y * 20.0 + t * 5.0)) * 0.03 * midTransition * (1.0 + audioSwell * 0.6);

    vec4 c1 = texture(tex1, fract(uv + plasmaDisp));
    vec4 c0 = texture(tex0, fract(uv - plasmaDisp));

    float wipeMask = smoothstep(-0.04, 0.04, distToSweep);
    vec4 col = mix(c0, c1, wipeMask);

    // High-voltage ozone blue-violet ionization arc
    vec3 arcColor = mix(vec3(0.2, 0.8, 1.0), vec3(0.8, 0.3, 1.0), sin(p.y * 10.0) * 0.5 + 0.5);
    float dischargeGlow = (arcPattern + exp(-abs(distToSweep) * 20.0)) * midTransition * vlt;
    col.rgb += dischargeGlow * arcColor * (1.6 + audioKick * 1.17 + audioHigh * 1.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
