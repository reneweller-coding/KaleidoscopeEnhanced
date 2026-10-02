#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SolitonWaveCollision.frag
 * @brief TRANSITION SOLITON WAVE COLLISION: Non-linear Korteweg-de Vries (KdV) soliton transition.
 * Two non-linear solitary waves (sech^2 solitons) propagate toward each other,
 * collide with non-linear phase shifts without dispersing, and leave the incoming scene behind.
 *   interpolation -> sweeps soliton wave collision trajectory across viewport
 *   audioKick     -> flashes maximum non-linear wave crest superposition peak
 *   audioSwell    -> drives soliton wave amplitude & non-linear steepness
 *
 * Per-activation variety:
 *   solitonP float soliton amplitude & velocity ratio    (0.5..2.2)
 *   widthP   float solitary wave sech^2 spatial width   (0.5..2.0)
 *   speedP   float animation speed multiplier           (0.5..2.0)
 *   hueP     float soliton wave crest hue offset        (0..6.28)
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

uniform float solitonP;
uniform float widthP;   ///< Width knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float cosh(float x) {
    return 0.5 * (exp(x) + exp(-x));
}

float sech(float x) {
    return 1.0 / cosh(clamp(x, -15.0, 15.0));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float slt = (solitonP > 0.0) ? solitonP : 1.0;
    float wdt = (widthP   > 0.0) ? widthP   : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd;   // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Soliton 1 (traveling right) & Soliton 2 (traveling left)
    float x1 = (p.x - mix(-1.2, 1.2, tProg)) * 8.0 / wdt;
    float x2 = (p.x - mix(1.2, -1.2, tProg)) * 8.0 / wdt;

    float s1 = sech(x1);
    float s2 = sech(x2);
    float wave = (s1 * s1 + s2 * s2) * slt;

    // Non-linear coordinate displacement
    vec2 solDisp = vec2(wave * 0.04 * midTransition * (1.0 + audioSwell * 0.7), 0.0);

    vec4 c1 = texture(tex1, fract(uv + solDisp));
    vec4 c0 = texture(tex0, fract(uv - solDisp));

    float wipeMask = smoothstep(-0.5, 0.5, x1);
    vec4 col = mix(c0, c1, wipeMask);

    // Glowing soliton wave crests
    float crestGlow = pow(wave, 2.0) * midTransition;
    col.rgb += crestGlow * vec3(0.2, 0.9, 1.0) * (1.5 + audioKick * 1.17);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
