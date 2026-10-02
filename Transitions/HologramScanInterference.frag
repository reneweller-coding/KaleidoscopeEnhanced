#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HologramScanInterference.frag
 * @brief TRANSITION HOLOGRAM SCAN INTERFERENCE: Volumetric laser holographic scanline
 * transition. Laser interference fringes and horizontal spatial-light-modulator
 * scanlines reconstruct the incoming scene with chromatic hologram diffraction.
 *   interpolation -> sweeps holographic phase modulation & reconstruction
 *   audioKick     -> flashes laser interference fringe lines
 *   audioSwell    -> sharpens the scanline edge (slow)
 *
 * Per-activation variety:
 *   scanP  float scanline density & line frequency (0.5..2.2)
 *   holoP  float holographic depth displacement   (0.5..2.0)
 *   speedP float scan velocity multiplier          (0.5..2.0)
 *   hueP   float hologram laser hue offset         (0..6.28)
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

uniform float scanP;
uniform float holoP;
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
    float scn = (scanP  > 0.0) ? scanP  : 1.0;
    float hlo = (holoP  > 0.0) ? holoP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.0523 * spd;   // clock rate measured down to about 1.2/255 of change per frame (PresetEditor --transprofile); it spun many times that and read as frantic
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Holographic horizontal scanlines.  audioHigh sharpens the scanline
    // resolution by narrowing the smoothstep window on the line profile (the
    // spatial/temporal phase is untouched, so no aliasing race and no
    // audio-driven scroll rate).  midTransition restores the base 0.8 window at
    // both fade endpoints, where scanIntense is added through midTransition
    // anyway.
    float scanline = sin(uv.y * 240.0 * scn - t * 12.0);
    float scanEdge = 0.8 / (1.0 + audioSwell * 0.9 * midTransition);
    float scanIntense = smoothstep(0.0, scanEdge, scanline);

    // Laser phase shift displacement
    float phaseShift = sin(uv.y * 30.0 + t * 4.0) * 0.03 * midTransition * hlo;
    vec2 warpUV = uv + vec2(phaseShift, 0.0);

    // Chromatic hologram RGB split
    vec2 rUV = warpUV - vec2(0.01 * midTransition, 0.0);
    vec2 bUV = warpUV + vec2(0.01 * midTransition, 0.0);

    float r1 = texture(tex1, fract(rUV)).r;
    float g1 = texture(tex1, fract(warpUV)).g;
    float b1 = texture(tex1, fract(bUV)).b;
    vec3 c1 = vec3(r1, g1, b1);

    float r0 = texture(tex0, fract(rUV)).r;
    float g0 = texture(tex0, fract(warpUV)).g;
    float b0 = texture(tex0, fract(bUV)).b;
    vec3 c0 = vec3(r0, g0, b0);

    vec3 col = mix(c1, c0, tProg);

    // Hologram laser glow (electric cyan / neon violet)
    vec3 holoColor = mix(vec3(0.1, 0.9, 1.0), vec3(0.8, 0.2, 1.0), sin(uv.y * 10.0 + t) * 0.5 + 0.5);
    col += scanIntense * holoColor * 0.3 * midTransition;
    col += phaseShift * vec3(1.0, 0.98, 0.9) * (2.0 + audioKick * 1.0);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue * midTransition);
    if (hue > 0.001) col = hueRot(col, hue * midTransition);

    fragColor = vec4(col, 1.0);
}
