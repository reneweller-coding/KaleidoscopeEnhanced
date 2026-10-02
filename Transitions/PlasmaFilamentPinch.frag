#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PlasmaFilamentPinch.frag
 * @brief TRANSITION PLASMA FILAMENT PINCH: Magnetohydrodynamic Z-pinch plasma transition.
 * Axial electric currents generate azimuthal magnetic fields, compressing
 * plasma into ultra-dense filaments that develop sausage and kink instabilities
 * before bursting into the incoming scene.
 *   interpolation -> sweeps magnetic Bennett pinch compression & burst
 *   audioKick     -> triggers full-pinch thermonuclear radiation flash
 *   audioSwell    -> drives radial Lorentz force compression amplitude
 *
 * Per-activation variety:
 *   pinchP float Z-pinch compression ratio & filament thickness (0.5..2.2)
 *   kinkP  float m=1 kink instability helical twist             (0.5..2.0)
 *   speedP float animation speed multiplier                     (0.5..2.0)
 *   hueP   float plasma emission hue offset                     (0..6.28)
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

uniform float pinchP;
uniform float kinkP;
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
    float pnc = (pinchP > 0.0) ? pinchP : 1.0;
    float knk = (kinkP  > 0.0) ? kinkP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.5 * spd;   // clock only: audioAdvance integrates transients and sped the motion up on every surge
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Multiple parallel Z-pinch filaments with m=1 kink helical oscillation
    float filamentX = sin(p.y * 12.0 * knk + t * 4.0) * 0.06 * midTransition;
    float distToFilament = abs(p.x - filamentX);

    // Magnetic compression factor
    float pinchRadius = 0.15 / (1.0 + midTransition * 4.0 * pnc);
    float pinchCore = exp(-distToFilament * distToFilament / (pinchRadius * pinchRadius));

    // Lorentz force radial pull displacement
    float pinchDispX = -sign(p.x - filamentX) * pinchCore * 0.05 * midTransition * (1.0 + audioSwell * 0.8);
    vec2 warpUV = uv + vec2(pinchDispX, 0.0);

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    vec4 col = mix(c1, c0, tProg);

    // Glowing high-temperature plasma core
    vec3 plasmaColor = mix(vec3(0.95, 0.3, 0.1), vec3(0.3, 0.85, 1.0), pinchCore);
    col.rgb += pinchCore * plasmaColor * midTransition * (1.6 + audioKick * 1.17);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
